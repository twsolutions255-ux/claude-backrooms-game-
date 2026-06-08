// Raycaster renderer — DDA algorithm, floor/ceiling casting, sprite rendering
import { T } from './map.js';
import { TEXTURES, TEX_SIZE, sampleTex, SKY_CONFIGS } from './textures.js';

const SCREEN_W = 640;
const SCREEN_H = 360;
const HALF_H = SCREEN_H >> 1;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.canvas.width = SCREEN_W;
    this.canvas.height = SCREEN_H;
    this.ctx = canvas.getContext('2d');
    this.imgData = this.ctx.createImageData(SCREEN_W, SCREEN_H);
    this.buf32 = new Uint32Array(this.imgData.data.buffer);
    this.zbuf = new Float32Array(SCREEN_W); // per-column depth
    this.fogDensity = 0.09;
    this.ambientLight = 0.06;
    this.flashlightOn = true;
    this.flashlightPower = 1.0;
    this.emergencyMode = false; // red tint
    this.cameraShake = { x: 0, y: 0, roll: 0 };
    this.vignette = 0; // 0-1, darkness at edges
    this.brightness = 1.0; // global brightness multiplier
    this.floorTexName = 'carpet';   // per-level floor texture
    this.ceilTexName = 'ceiling';   // per-level ceiling texture
    this.fogColorR = 0;             // fog tint color
    this.fogColorG = 0;
    this.fogColorB = 0;
    this._sprites = [];
    this._skyConfig = null;
    this._SKY_CONFIGS = SKY_CONFIGS;
    this._weaponSwingT = 0;
    this._weaponBobT = 0;
    this._game = null;
    this._time = 0;
    this.themeWallTex = null;
    this.numRays = 320;             // quality: 160=low, 320=medium, 480=high
  }

  // ── SET PIXEL ──────────────────────────────────────────────────────────────
  setPixel(x, y, r, g, b) {
    if (x < 0 || x >= SCREEN_W || y < 0 || y >= SCREEN_H) return;
    this.buf32[y * SCREEN_W + x] = (255 << 24) | (b << 16) | (g << 8) | r;
  }

  // ── APPLY DISTANCE FOG + LIGHTING ─────────────────────────────────────────
  applyFog(r, g, b, dist, light, isEmergency) {
    const fog = Math.min(1, dist * this.fogDensity);
    const brightness = Math.max(0, (1 - fog) * Math.max(this.ambientLight, light) * this.brightness);
    let fr = r * brightness, fg = g * brightness, fb = b * brightness;
    if (isEmergency) {
      fr = fr * 1.2 + 20;
      fg = fg * 0.4;
      fb = fb * 0.4;
    }
    return [Math.min(255, fr), Math.min(255, fg), Math.min(255, fb)];
  }

  // ── FLASHLIGHT CONE ───────────────────────────────────────────────────────
  flashlightBrightness(columnX, wallDist) {
    if (!this.flashlightOn || this.flashlightPower <= 0) return 0;
    const angle = Math.abs((columnX / SCREEN_W) - 0.5) * 2; // 0 at center, 1 at edge
    const coneEffect = Math.max(0, 1 - angle * 1.8); // cone falloff
    const distEffect = Math.max(0, 1 - wallDist * 0.08); // distance falloff
    return coneEffect * distEffect * this.flashlightPower * 0.7;
  }

  // ── MAIN RENDER ───────────────────────────────────────────────────────────
  render(map, player, entities, worldItems, dt = 0) {
    if (dt > 0) this._time += dt;
    this._renderScene(map, player);
    this._renderSprites(map, player, entities, worldItems);
    // Weapon bob + swing update
    if (dt > 0) {
      this._weaponBobT += dt * (player.isMoving ? (player.isSprinting ? 5.5 : 4.0) : 0.5);
      if (this._weaponSwingT > 0) this._weaponSwingT = Math.max(0, this._weaponSwingT - dt * 3);
    }
    this._renderWeapon(this.buf32, player);
    this._renderVignette();
    this._renderEmergencyVignette();
    this.ctx.putImageData(this.imgData, 0, 0);
  }

  _getFloorTexForTile(floorType) {
    switch(floorType) {
      case T.FLOOR_GRASS:    return TEXTURES.grass;
      case T.FLOOR_ROAD:     return TEXTURES.road;
      case T.FLOOR_POOL:     return TEXTURES.poolFloor;
      case T.FLOOR_WET:      return TEXTURES.floorWet;
      case T.FLOOR_WOOD:     return TEXTURES.wood;
      case T.FLOOR_TILE:     return TEXTURES.poolTile;
      case T.FLOOR_PARTY:    return TEXTURES.partyFloor;
      case T.FLOOR_DARK:     return TEXTURES.darkTile;
      case T.FLOOR_CONCRETE: return TEXTURES.concrete;
      default:               return null;
    }
  }

  _renderScene(map, player) {
    const { x: px, y: py, dirX, dirY, planeX, planeY } = player;
    const buf = this.buf32;
    const zbuf = this.zbuf;
    const isWater = (this.floorTexName === 'poolFloor' || this.floorTexName === 'floorWet');

    // ── CEILING + FLOOR CASTING ──────────────────────────────────────────────
    const rayDirX0 = dirX - planeX;
    const rayDirY0 = dirY - planeY;
    const rayDirX1 = dirX + planeX;
    const rayDirY1 = dirY + planeY;

    const defaultFloorTex = TEXTURES[this.floorTexName] || TEXTURES.carpet;
    const ceilTex = TEXTURES[this.ceilTexName] || TEXTURES.ceiling;
    const t = this._time;

    for (let y = HALF_H + 1; y < SCREEN_H; y++) {
      const rowDist = SCREEN_H / (2.0 * y - SCREEN_H);
      const stepX = rowDist * (rayDirX1 - rayDirX0) / SCREEN_W;
      const stepY = rowDist * (rayDirY1 - rayDirY0) / SCREEN_W;
      let floorX = px + rowDist * rayDirX0;
      let floorY = py + rowDist * rayDirY0;

      const fog = Math.min(1, rowDist * this.fogDensity * 1.5);
      const bright = Math.max(0, (1 - fog) * this.ambientLight * this.brightness);

      for (let x = 0; x < SCREEN_W; x++) {
        const mapFX = Math.floor(floorX), mapFY = Math.floor(floorY);
        const floorType = map.floor ? map.floor[mapFX + mapFY * map.w] : 0;
        const tileTex = this._getFloorTexForTile(floorType);
        const floorTex = tileTex || defaultFloorTex;

        let ftx, fty;
        if (isWater && !tileTex) {
          const wave = Math.sin(floorX * 2.5 + t * 2.8) * 1.8 + Math.cos(floorY * 2.2 + t * 2.1) * 1.5;
          ftx = ((((floorX * TEX_SIZE | 0) + (wave | 0)) % TEX_SIZE) + TEX_SIZE) % TEX_SIZE;
          fty = ((((floorY * TEX_SIZE | 0) + ((wave * 0.5) | 0)) % TEX_SIZE) + TEX_SIZE) % TEX_SIZE;
        } else {
          ftx = ((floorX * TEX_SIZE | 0) % TEX_SIZE + TEX_SIZE) % TEX_SIZE;
          fty = ((floorY * TEX_SIZE | 0) % TEX_SIZE + TEX_SIZE) % TEX_SIZE;
        }

        const fp = floorTex[fty * TEX_SIZE + ftx];
        const frBase = (fp & 0xFF) * bright + this.fogColorR * fog * 200;
        const fgBase = ((fp >> 8) & 0xFF) * bright + this.fogColorG * fog * 200;
        const fbBase = ((fp >> 16) & 0xFF) * bright + this.fogColorB * fog * 200;
        buf[y * SCREEN_W + x] = (255 << 24) | ((fbBase | 0) << 16) | ((fgBase | 0) << 8) | (frBase | 0);

        const cy2 = SCREEN_H - y - 1;
        const ceilType = map.ceiling ? (map.ceiling[mapFX + mapFY * map.w] ?? 0) : 0;
        if (ceilType === 2 && this._skyConfig) {
          const skyT = cy2 / HALF_H;
          const sky = this._skyConfig;
          const skr = (sky.topR + (sky.botR - sky.topR) * skyT) | 0;
          const skg = (sky.topG + (sky.botG - sky.topG) * skyT) | 0;
          const skb = (sky.topB + (sky.botB - sky.topB) * skyT) | 0;
          buf[cy2 * SCREEN_W + x] = (255 << 24) | (skb << 16) | (skg << 8) | skr;
        } else {
          const tx2 = ftx, ty2 = fty;
          const cp = ceilTex[ty2 * TEX_SIZE + tx2];
          const crBase = (cp & 0xFF) * bright * 0.85 + this.fogColorR * fog * 160;
          const cgBase = ((cp >> 8) & 0xFF) * bright * 0.85 + this.fogColorG * fog * 160;
          const cbBase = ((cp >> 16) & 0xFF) * bright * 0.85 + this.fogColorB * fog * 160;
          buf[cy2 * SCREEN_W + x] = (255 << 24) | ((cbBase | 0) << 16) | ((cgBase | 0) << 8) | (crBase | 0);
        }

        floorX += stepX;
        floorY += stepY;
      }
    }

    // Horizon line
    for (let x = 0; x < SCREEN_W; x++) buf[HALF_H * SCREEN_W + x] = (255 << 24) | 0x0a0905;

    // ── WALL CASTING ─────────────────────────────────────────────────────────
    const numRays = this.numRays;
    const colStep = SCREEN_W / numRays; // columns per ray (2 for 320 rays, 4 for 160, etc.)
    for (let col = 0; col < numRays; col++) {
      const cameraX = 2 * col / numRays - 1;
      const rayDirX = dirX + planeX * cameraX;
      const rayDirY = dirY + planeY * cameraX;

      let mapX = Math.floor(px), mapY = Math.floor(py);
      const deltaX = Math.abs(rayDirX) < 1e-10 ? 1e10 : Math.abs(1 / rayDirX);
      const deltaY = Math.abs(rayDirY) < 1e-10 ? 1e10 : Math.abs(1 / rayDirY);
      let sideX, sideY, stepX2, stepY2;
      if (rayDirX < 0) { stepX2 = -1; sideX = (px - mapX) * deltaX; }
      else { stepX2 = 1; sideX = (mapX + 1 - px) * deltaX; }
      if (rayDirY < 0) { stepY2 = -1; sideY = (py - mapY) * deltaY; }
      else { stepY2 = 1; sideY = (mapY + 1 - py) * deltaY; }

      let hit = false, side = 0;
      let tile = 0;
      const rayLimit = (map.w > 80) ? 240 : 140;
      for (let i = 0; i < rayLimit && !hit; i++) {
        if (sideX < sideY) { sideX += deltaX; mapX += stepX2; side = 0; }
        else { sideY += deltaY; mapY += stepY2; side = 1; }
        tile = map.get(mapX, mapY);
        if (tile !== T.EMPTY && tile !== T.DOOR_OPEN && tile !== T.VENT) hit = true;
      }

      const perpDist = side === 0 ? sideX - deltaX : sideY - deltaY;
      const lineH = Math.min(SCREEN_H * 3, SCREEN_H / perpDist);
      const drawStart = Math.max(0, Math.floor((SCREEN_H - lineH) / 2));
      const drawEnd = Math.min(SCREEN_H - 1, Math.floor((SCREEN_H + lineH) / 2));

      // Texture selection
      const tex = this._wallTex(tile);
      const wallX = side === 0
        ? py + perpDist * rayDirY - Math.floor(py + perpDist * rayDirY)
        : px + perpDist * rayDirX - Math.floor(px + perpDist * rayDirX);
      const texX = Math.floor(wallX * TEX_SIZE);

      // Light at hit point
      const hitWX = px + perpDist * rayDirX, hitWY = py + perpDist * rayDirY;
      const tileLight = map.getLightAt(hitWX, hitWY);
      const flLight = this.flashlightBrightness(col * colStep, perpDist);
      const totalLight = Math.min(1.0, tileLight + flLight);

      const screenCol0 = col * colStep | 0;
      for (let sc = 0; sc < colStep; sc++) {
        const screenCol = screenCol0 + sc;
        if (screenCol >= SCREEN_W) break;
        zbuf[screenCol] = perpDist;

        const texStep = TEX_SIZE / lineH;
        let texPos = (drawStart - (SCREEN_H - lineH) / 2) * texStep;

        for (let y2 = drawStart; y2 <= drawEnd; y2++) {
          const texY = (texPos | 0) & (TEX_SIZE - 1);
          texPos += texStep;
          const p = tex[texY * TEX_SIZE + texX];
          let r2 = p & 0xFF, g2 = (p >> 8) & 0xFF, b2 = (p >> 16) & 0xFF;

          // Side darkening
          if (side === 1) { r2 >>= 1; g2 >>= 1; b2 >>= 1; }

          // Fog + light — use at least ambientLight so walls visible without flashlight
          const fog = Math.min(1, perpDist * this.fogDensity);
          const bright = Math.max(0, (1 - fog) * Math.max(this.ambientLight, totalLight) * this.brightness);
          const fr2 = r2 * bright, fg2 = g2 * bright, fb2 = b2 * bright;
          buf[y2 * SCREEN_W + screenCol] = (255 << 24) | ((fb2 | 0) << 16) | ((fg2 | 0) << 8) | (fr2 | 0);
        }
      }
    }
  }

  _wallTex(tile) {
    // Per-theme wall override for special levels (hospital, dreamcore, etc.)
    if (this.themeWallTex) {
      if (tile === T.WALL_TILE || tile === T.WALL_PAPER || tile === T.WALL_CONCRETE) {
        return this.themeWallTex;
      }
    }
    switch(tile) {
      case T.WALL_PAPER: return TEXTURES.wallpaper;
      case T.WALL_DARK: return TEXTURES.wallpaperDark;
      case T.WALL_WET: return TEXTURES.wallpaperWet;
      case T.WALL_CONCRETE: return TEXTURES.concrete;
      case T.WALL_METAL: return TEXTURES.metal;
      case T.WALL_BRICK: return TEXTURES.brick;
      case T.WALL_TILE: return TEXTURES.poolTile;
      case T.WALL_SAVE: return TEXTURES.saveRoom;
      case T.WALL_WOOD: return TEXTURES.wood;
      case T.WALL_PIPE: return TEXTURES.pipedWall;
      case T.WALL_BRICK_RED: return TEXTURES.brickRed;
      case T.WALL_PARTY: return TEXTURES.partyWall;
      case T.DOOR_CLOSED: return TEXTURES.door;
      case T.LOCKER_CLOSED: return TEXTURES.locker;
      case T.WINDOW: return TEXTURES.window;
      case 19: return TEXTURES.metal;      // VENDING_MACHINE
      case 20: return TEXTURES.wood;       // TABLE
      case 21: return TEXTURES.metal;      // ARCADE_MACHINE
      case 22: return TEXTURES.hospitalTile; // HOSPITAL_BED — sterile white
      default: return TEXTURES.wallpaper;
    }
  }

  // ── SPRITE RENDERING ──────────────────────────────────────────────────────
  _renderSprites(map, player, entities, worldItems) {
    const sprites = [];

    // Exit portal sprite
    if (map.exitX !== undefined) {
      sprites.push({
        x: map.exitX + 0.5, y: map.exitY + 0.5,
        type: 'exit_portal',
        bobTime: (performance.now() / 1000),
        dist: (map.exitX + 0.5 - player.x) ** 2 + (map.exitY + 0.5 - player.y) ** 2
      });
    }

    // Entity sprites
    for (const e of entities) {
      if (!e.alive) continue;
      sprites.push({
        x: e.x, y: e.y,
        type: 'entity',
        entity: e,
        dist: (e.x - player.x) ** 2 + (e.y - player.y) ** 2
      });
    }

    // World item sprites
    for (const item of worldItems) {
      if (item.collected) continue;
      sprites.push({
        x: item.x, y: item.y,
        type: 'item',
        item,
        dist: (item.x - player.x) ** 2 + (item.y - player.y) ** 2
      });
    }

    // Sort far to near
    sprites.sort((a, b) => b.dist - a.dist);

    const { x: px, y: py, dirX, dirY, planeX, planeY } = player;

    for (const s of sprites) {
      const sprX = s.x - px, sprY = s.y - py;
      const invDet = 1 / (planeX * dirY - dirX * planeY);
      const transX = invDet * (dirY * sprX - dirX * sprY);
      const transY = invDet * (-planeY * sprX + planeX * sprY);

      if (transY <= 0.1) continue;

      const sprScreenX = Math.floor((SCREEN_W / 2) * (1 + transX / transY));
      const sprH = Math.abs(Math.floor(SCREEN_H / transY));
      const sprW = sprH;

      const drawStartY = Math.max(0, Math.floor((SCREEN_H - sprH) / 2));
      const drawEndY = Math.min(SCREEN_H - 1, Math.floor((SCREEN_H + sprH) / 2));
      const drawStartX = Math.max(0, sprScreenX - sprH / 2);
      const drawEndX = Math.min(SCREEN_W - 1, sprScreenX + sprH / 2);

      const light = map.getLightAt(s.x, s.y) + this.flashlightBrightness(sprScreenX / SCREEN_W, Math.sqrt(s.dist));
      const fog = Math.min(1, Math.sqrt(s.dist) * this.fogDensity);
      const bright = Math.max(0, (1 - fog) * Math.min(1, light) * this.brightness);

      for (let sx = drawStartX; sx < drawEndX; sx++) {
        if (transY >= this.zbuf[sx]) continue;
        const texX = Math.floor((sx - (sprScreenX - sprW / 2)) * TEX_SIZE / sprW);

        for (let sy = drawStartY; sy < drawEndY; sy++) {
          const texY = Math.floor((sy - drawStartY) * TEX_SIZE / sprH);
          const color = this._spritePixel(s, texX, texY);
          if ((color >>> 24) < 128) continue; // transparent

          const r3 = (color & 0xFF) * bright;
          const g3 = ((color >> 8) & 0xFF) * bright;
          const b3 = ((color >> 16) & 0xFF) * bright;
          this.buf32[sy * SCREEN_W + sx] = (255 << 24) | ((b3 | 0) << 16) | ((g3 | 0) << 8) | (r3 | 0);
        }
      }
    }
  }

  _spritePixel(sprite, tx, ty) {
    if (sprite.type === 'entity') return this._entityPixel(sprite.entity, tx, ty);
    if (sprite.type === 'item') return this._itemPixel(sprite.item, tx, ty);
    if (sprite.type === 'exit_portal') return this._exitPortalPixel(tx, ty, sprite.bobTime);
    return 0;
  }

  _exitPortalPixel(tx, ty, time) {
    const cx = tx - 32, cy = ty - 32;
    const dist = Math.sqrt(cx * cx + cy * cy);
    const pulse = 0.5 + 0.5 * Math.sin(time * 3);

    // Outer ring — pulsing green
    if (dist > 18 && dist < 24) {
      const fade = 1 - Math.abs(dist - 21) / 3;
      const bright = Math.floor(180 * fade * (0.6 + 0.4 * pulse));
      return (bright << 24) | (0x00 << 16) | (bright << 8) | 0x20;
    }
    // Inner shimmer
    if (dist < 18) {
      const shimmer = Math.sin(cx * 0.5 + time * 4) * Math.cos(cy * 0.5 + time * 3);
      if (shimmer > 0.3) {
        const a = Math.floor(120 * (shimmer - 0.3) / 0.7);
        return (a << 24) | (0x40 << 16) | (0xFF << 8) | 0x80;
      }
    }
    // Center glow dot
    if (dist < 5) {
      return (0xFF << 24) | (0xCC << 16) | (0xFF << 8) | 0xCC;
    }
    // Pillar/door frame
    if (Math.abs(cx) < 3 && ty > 5 && ty < 60 && ty !== 32) return 0xFF204020 | 0xFF000000;
    return 0;
  }

  _entityPixel(entity, tx, ty) {
    const type = entity.type || 'stalker';
    const isChasing = entity.state === 'chase' || entity.state === 'attack';
    const t = this._time;

    // ── SMILER ──────────────────────────────────────────────────────────────
    if (type === 'smiler') {
      const cx = tx - 32;
      // Pulsing wide-apart eyes
      const eyePulse = 0.7 + 0.3 * Math.sin(t * 4 + (isChasing ? 8 : 0));
      const eyeLX = tx - 17, eyeRX = tx - 47;
      if (Math.abs(eyeLX) < 6 && ty >= 14 && ty <= 24) {
        const v = (210 * eyePulse) | 0;
        return (0xFF << 24) | (v << 16) | (v << 8) | v;
      }
      if (Math.abs(eyeRX) < 6 && ty >= 14 && ty <= 24) {
        const v = (210 * eyePulse) | 0;
        return (0xFF << 24) | (v << 16) | (v << 8) | v;
      }
      // Wide toothy grin
      const grinY = 34 + Math.pow(Math.abs(cx) / 18, 2) * 14;
      if (ty >= grinY && ty <= grinY + 6 && tx >= 8 && tx <= 56) {
        const tooth = Math.floor((tx - 8) / 3) % 2;
        if (tooth === 0) return 0xFFFFFFFF; // white tooth
        return (0x80 << 24) | 0x101010; // dark gap between teeth
      }
      // Ghost face outline
      const faceR = Math.sqrt(cx * cx * 0.7 + (ty - 28) * (ty - 28));
      if (faceR > 26 && faceR < 30 && ty < 52) return (0x35 << 24) | 0x181818;
      return 0;
    }

    // ── PARTYGOER ────────────────────────────────────────────────────────────
    if (type === 'partygoer') {
      const cx = tx - 32;
      // Big round head
      const headDist = Math.sqrt(cx * cx * 0.9 + (ty - 10) * (ty - 10));
      if (headDist < 13) {
        const edgeShade = headDist > 10 ? 0x00AABB : 0x00CCDD;
        return (0xFF << 24) | edgeShade; // R=0xDD/0xBB, G=0xCC/0xAA, B=0x00 → yellow-orange
      }
      // Black pit eyes
      if (ty >= 6 && ty <= 10 && (Math.abs(tx - 27) < 3 || Math.abs(tx - 37) < 3)) return 0xFF000000;
      // Carved bloody smile — jagged
      const smileArc = (ty - 16) - Math.abs(cx) * 0.6;
      if (smileArc >= 0 && smileArc <= 2 && Math.abs(cx) < 9) {
        return 0xFF0000AA; // R=0xAA, G=0x00, B=0x00 → dark red
      }
      // Long stringy neck
      if (ty >= 24 && ty <= 32 && Math.abs(cx) < 4) return (0xFF << 24) | 0x00AACC;
      // Distorted tall body
      const bodyW = 8 + (ty - 32) * 0.15;
      if (ty >= 32 && ty <= 56 && Math.abs(cx) < bodyW) {
        const stripe = ((ty / 4 | 0) % 2 === 0) ? 0x009AAA : 0x007788;
        return (0xFF << 24) | stripe;
      }
      // Long dangling arms
      if (ty >= 26 && ty <= 54 && Math.abs(cx) >= 12 && Math.abs(cx) < 26) {
        return (0xFF << 24) | 0x00BBCC;
      }
      // Legs
      if (ty >= 56 && ty <= 64 && (Math.abs(tx - 27) < 5 || Math.abs(tx - 37) < 5)) {
        return (0xFF << 24) | 0x007788;
      }
      return 0;
    }

    // ── HOUND ───────────────────────────────────────────────────────────────
    if (type === 'hound') {
      const cx = tx - 32, cy = ty - 36;
      // Body shadow — low-slung and elongated
      if (Math.abs(cy) < 9 && Math.abs(cx) < 24) {
        const shade = cx > 0 ? 0x060606 : 0x101010;
        return (0xFF << 24) | shade;
      }
      // Head protruding forward
      if (cx >= 16 && cx <= 30 && cy >= -13 && cy <= 3) {
        return (0xFF << 24) | 0x0B0B0B;
      }
      // Snout with visible teeth
      if (cx >= 24 && cx <= 32 && cy >= -7 && cy <= 1) {
        if (cy >= -2) {
          const teeth = (tx % 3 < 2) ? 0xFFFFFFFF : (0xFF << 24 | 0x050505);
          return teeth;
        }
        return (0xFF << 24) | 0x0E0E0E;
      }
      // Red glowing eyes
      if (cx >= 18 && cx <= 28 && cy >= -10 && cy <= -6) {
        if (isChasing) {
          const ep = (0x80 + (Math.sin(t * 8) * 0x50 | 0));
          return (0xFF << 24) | ep; // R component pulses red
        }
        return (0xFF << 24) | 0x202020;
      }
      // 4 chunky legs
      for (const lx of [-14, -6, 6, 14]) {
        if (Math.abs(cx - lx) < 4 && cy >= 8 && cy <= 22) return (0xFF << 24) | 0x090909;
      }
      // Tail (up-curved)
      if (cx < -20 && Math.abs(cy + (cx + 20) * 0.4) < 3) return (0xFF << 24) | 0x0A0A0A;
      return 0;
    }

    // ── FACELING ────────────────────────────────────────────────────────────
    if (type === 'faceling') {
      const cx = tx - 32;
      // Smooth oval head — no features, pale and wrong
      const headD = Math.sqrt(cx * cx * 0.75 + (ty - 9) * (ty - 9));
      if (headD < 11) {
        const shade = headD > 8 ? 0xA0A0B8 : 0xB8B8CC;
        return (0xFF << 24) | (shade << 16) | (shade << 8) | shade;
      }
      // Office suit body
      if (ty >= 20 && ty <= 52 && Math.abs(cx) < 13) {
        const suit = (Math.abs(cx) < 4 && ty > 26) ? 0xEEEEEE : 0x303048;
        return (0xFF << 24) | suit;
      }
      // Arms
      if (ty >= 22 && ty <= 44 && Math.abs(cx) >= 13 && Math.abs(cx) < 22) {
        return (0xFF << 24) | 0x303048;
      }
      // Legs
      if (ty >= 52 && ty <= 64 && (Math.abs(tx - 27) < 5 || Math.abs(tx - 37) < 5)) {
        return (0xFF << 24) | 0x202035;
      }
      // Pale hands (uncanny)
      if (ty >= 42 && ty <= 52 && Math.abs(cx) >= 13 && Math.abs(cx) < 19) {
        return (0xFF << 24) | 0xA8A8C0;
      }
      return 0;
    }

    // ── DEATHMOTH ─────────────────────────────────────────────────────────
    if (type === 'deathmoth') {
      const cx = tx - 32, cy = ty - 32;
      const flapCY = cy - (Math.sin(t * 5) * 4 | 0);
      const lWing = cx < 0 && cx > -30 && Math.abs(flapCY) < (24 - Math.abs(cx) * 0.65);
      const rWing = cx > 0 && cx < 30 && Math.abs(flapCY) < (24 - cx * 0.65);
      if (lWing || rWing) {
        const eyeSpot = Math.abs(cx) > 10 && Math.abs(cx) < 20 && Math.abs(flapCY) < 7;
        if (eyeSpot) return (0xFF << 24) | 0x200040; // deep purple eye spot
        const wPat = (Math.abs(cx) + Math.abs(flapCY)) % 5 < 2;
        return (0xFF << 24) | (wPat ? 0x181828 : 0x282848);
      }
      // Fuzzy body
      if (Math.abs(cx) < 5 && cy > -22 && cy < 22) {
        return (0xFF << 24) | (cy > 0 ? 0x0E0E1E : 0x161626);
      }
      if (Math.abs(cx) < 2 && cy > -30 && cy < -20) return (0xFF << 24) | 0x181828;
      return 0;
    }

    // ── ANIMATIONS (dreamcore entity — flickering static humanoid) ─────────
    if (type === 'animations') {
      const cx = tx - 32;
      const flicker = Math.sin(t * 18 + tx * 0.8 + ty * 0.5) > (isChasing ? -0.3 : 0.2);
      if (!flicker) return 0;
      const alpha = isChasing ? 0xFF : 0xCC;
      const headD = Math.sqrt(cx * cx * 0.9 + (ty - 9) * (ty - 9));
      if (headD < 9) {
        const staticV = (Math.sin(t * 30 + tx * 5 + ty * 3) > 0) ? 0xFFFFFF : 0x888888;
        return (alpha << 24) | staticV;
      }
      if (Math.abs(cx) < 11 && ty >= 18 && ty <= 52) {
        const v = Math.sin(t * 25 + ty * 4) > 0 ? 0xDDDDFF : 0x666688;
        return (alpha << 24) | v;
      }
      if (Math.abs(cx) >= 11 && Math.abs(cx) < 20 && ty >= 20 && ty <= 40) {
        return (alpha << 24) | 0x888899;
      }
      return 0;
    }

    // ── DEFAULT STALKER ──────────────────────────────────────────────────────
    const cx2 = tx - 32;
    // Elongated distorted head
    const headD2 = Math.sqrt(cx2 * cx2 * 0.6 + (ty - 8) * (ty - 8));
    if (headD2 < 9) return (0xFF << 24) | 0x060606;
    // Eyes — only when chasing
    if (ty >= 5 && ty <= 8 && (Math.abs(tx - 24) < 3 || Math.abs(tx - 40) < 3)) {
      return isChasing ? (0xFF << 24 | 0x0000CC) : (0xFF << 24 | 0x101010);
    }
    // Tall lanky body with visible ribs
    if (ty >= 18 && ty <= 54 && Math.abs(cx2) < 14) {
      const rib = (ty % 6 < 2) && Math.abs(cx2) > 8;
      return (0xFF << 24) | (rib ? 0x181818 : 0x080808);
    }
    // Stretched arms
    if (ty >= 20 && ty <= 36 && Math.abs(cx2) >= 14 && Math.abs(cx2) < 26) {
      return (0xFF << 24) | 0x070707;
    }
    // Spindly legs
    if (ty >= 54 && ty <= 64 && (Math.abs(tx - 26) < 5 || Math.abs(tx - 38) < 5)) {
      return (0xFF << 24) | 0x080808;
    }
    return 0;
  }

  _itemPixel(item, tx, ty) {
    const bob = Math.round(Math.sin((item.bobTime || 0) * 1.2) * 3);
    const ay = ty - bob; // bob shifts the whole sprite
    const acx = tx - 32, acy = ay - 44;
    const cx = Math.abs(acx), cy = Math.abs(acy);
    const gDist = Math.sqrt(acx * acx + acy * acy);

    // Per-item glow color (ABGR)
    let glowR = 200, glowG = 200, glowB = 60; // default yellow
    switch(item.type) {
      case 'medkit':         glowR=60;  glowG=80;  glowB=220; break; // blue
      case 'battery':        glowR=40;  glowG=210; glowB=60;  break; // green
      case 'almond_water':   glowR=60;  glowG=210; glowB=220; break; // cyan
      case 'key':            glowR=200; glowG=180; glowB=20;  break; // gold
      case 'compass':        glowR=255; glowG=100; glowB=30;  break; // orange
      case 'map_upgrade':    glowR=220; glowG=220; glowB=255; break; // white-blue
      case 'fire_axe':       glowR=220; glowG=60;  glowB=20;  break; // red
      case 'pipe':           glowR=150; glowG=150; glowB=160; break; // grey
      case 'flash_grenade':  glowR=255; glowG=255; glowB=180; break; // white
      case 'emergency_lantern': glowR=255; glowG=140; glowB=20; break; // amber
      case 'flashlight_heavy':  glowR=180; glowG=220; glowB=255; break; // pale blue
      case 'night_vision_goggles': glowR=40; glowG=255; glowB=100; break;
    }

    // Outer glow halo ring (pulsing)
    const pulseR = 15 + Math.sin((item.bobTime || 0) * 2.5) * 2;
    if (gDist > pulseR - 2 && gDist < pulseR + 2) {
      const fade = 1 - Math.abs(gDist - pulseR) / 2;
      const ga = Math.floor(180 * fade);
      return (ga << 24) | (glowB << 16) | (glowG << 8) | glowR;
    }
    // Inner glow soft fill
    if (gDist < pulseR - 2) {
      const innerFade = Math.max(0, (pulseR - 2 - gDist) / (pulseR - 2)) * 0.18;
      const ga2 = Math.floor(255 * innerFade);
      return (ga2 << 24) | (glowB << 16) | (glowG << 8) | glowR;
    }

    // Item body
    switch(item.type) {
      case 'medkit': {
        if (cx < 12 && cy < 9) {
          // White cross on blue background
          if (cx < 4 && cy < 9) return 0xFF3030AA | 0xFF000000; // side bar cross
          if (cx < 12 && cy < 3) return 0xFF3030AA | 0xFF000000; // top bar cross
          return 0xFF2020CC | 0xFF000000; // box body
        }
        return 0;
      }
      case 'battery': {
        // Cylindrical green battery
        if (cx < 5 && cy < 18) {
          if (cy < 2 && cx < 3) return 0xFF30FF60 | 0xFF000000; // terminal
          return 0xFF20B040 | 0xFF000000;
        }
        return 0;
      }
      case 'almond_water': {
        // Bottle shape
        if (cx < 3 && cy < 4) return 0xFF70E0F0 | 0xFF000000; // neck
        if (cx < 7 && cy >= 4 && cy < 18) return 0xFF40B0D0 | 0xFF000000; // body
        return 0;
      }
      case 'key': {
        // Key shape
        if (cx < 5 && cy < 6) return 0xFFD0C020 | 0xFF000000; // bow
        if (Math.abs(acx) < 2 && cy >= 5 && cy < 16) return 0xFFB8A018 | 0xFF000000; // shaft
        if (cy >= 13 && cy < 16 && acx >= 2 && acx < 5) return 0xFFB8A018 | 0xFF000000; // teeth
        return 0;
      }
      case 'compass': {
        // Compass disc
        if (gDist < 11) {
          const angle = Math.atan2(acy, acx);
          // North needle (red)
          if (gDist < 9 && angle > -0.3 && angle < 0.3) return 0xFF2020CC | 0xFF000000;
          // South needle (white)
          if (gDist < 9 && (angle > 2.8 || angle < -2.8)) return 0xFF808080 | 0xFF000000;
          return 0xFF444444 | 0xFF000000; // disc face
        }
        return 0;
      }
      case 'map_upgrade': {
        // Map/paper shape
        if (cx < 12 && cy < 10) {
          if (cx < 12 && cy === 0) return 0xFFCCCCCC | 0xFF000000;
          if (cx < 12 && cy === 9) return 0xFFCCCCCC | 0xFF000000;
          if (cx === 0 && cy < 10) return 0xFFCCCCCC | 0xFF000000;
          if (cx === 11 && cy < 10) return 0xFFCCCCCC | 0xFF000000;
          // Grid lines suggesting a map
          if (cy === 4 && cx < 10) return 0xFF888888 | 0xFF000000;
          if (cx === 5 && cy < 9) return 0xFF888888 | 0xFF000000;
          return 0xFFAAAAAA | 0xFF000000;
        }
        return 0;
      }
      case 'pipe': {
        if (cx < 4 && cy < 24) {
          if (cx < 1) return 0xFF999999 | 0xFF000000;
          return 0xFF777777 | 0xFF000000;
        }
        return 0;
      }
      case 'fire_axe': {
        if (cx < 3 && cy < 26) return 0xFF604020 | 0xFF000000; // handle
        if (cy < 10 && acx >= 3 && acx < 18) return 0xFFCC4020 | 0xFF000000; // blade
        return 0;
      }
      case 'emergency_lantern': {
        // Lantern shape
        if (cx < 8 && cy < 5) return 0xFFFF8800 | 0xFF000000; // flame
        if (cx < 6 && cy >= 4 && cy < 16) return 0xFF884400 | 0xFF000000; // body
        return 0;
      }
      case 'flash_grenade': {
        if (cx < 5 && cy < 14) {
          if (cy < 3 && cx < 3) return 0xFFCCCCCC | 0xFF000000; // pin
          return 0xFF686830 | 0xFF000000; // body
        }
        return 0;
      }
      case 'flashlight_heavy': {
        if (cx < 4 && cy < 22) {
          if (cy < 4) return 0xFFCCCCCC | 0xFF000000; // lens
          return 0xFF444444 | 0xFF000000; // body
        }
        return 0;
      }
      case 'night_vision_goggles': {
        // Goggles shape — two circles
        if ((Math.abs(acx + 7) < 6 || Math.abs(acx - 7) < 6) && cy < 6) {
          return 0xFF20AA40 | 0xFF000000;
        }
        if (Math.abs(acx) < 2 && cy < 3) return 0xFF204020 | 0xFF000000; // bridge
        return 0;
      }
      default: {
        // Generic glowing orb
        if (gDist < 8) return (0xFF000000) | (glowB << 16) | (glowG << 8) | glowR;
        return 0;
      }
    }
  }

  // ── WEAPON IN HAND ────────────────────────────────────────────────────────
  _renderWeapon(buf, player) {
    const W = SCREEN_W, H = SCREEN_H;
    const bobAmt = player.bobAmt || 0;
    const bobX = Math.sin(this._weaponBobT * 2) * 7 * bobAmt;
    const bobY = Math.abs(Math.cos(this._weaponBobT)) * 10 * bobAmt;
    // Swing animation: weapon swings UP then comes back (1.0 → 0.0)
    const swingOff = this._weaponSwingT > 0 ? -(Math.sin(this._weaponSwingT * Math.PI)) * 50 : 0;
    // Offset weapon to bottom-right (more natural first-person position)
    const baseX = (W * 0.55 - 48 + bobX) | 0;
    const baseY = (H - 100 + bobY + swingOff) | 0;

    const weapon = this._game?.inventory?.equippedWeapon || this._game?.inventory?.getSelected()?.type || 'flashlight';
    this._blitWeapon(buf, weapon, baseX, baseY, W, H);
  }

  _blitWeapon(buf, weapon, bx, by, W, H) {
    for (let wy = 0; wy < 130; wy++) {
      const sy = by + wy;
      if (sy < 0 || sy >= H) continue;
      for (let wx = 0; wx < 96; wx++) {
        const sx = bx + wx;
        if (sx < 0 || sx >= W) continue;
        const col = this._weaponPixel(weapon, wx, wy);
        if ((col >>> 24) < 16) continue;
        buf[sy * W + sx] = col;
      }
    }
  }

  _weaponPixel(weapon, wx, wy) {
    const cx = wx - 48; // center of 96px sprite
    const A = 0xFF000000;

    if (weapon === 'flashlight' || weapon === 'flashlight_heavy') {
      // Big Maglite-style torch — metallic grey cylinder
      const inBody = Math.abs(cx + 4) < 14 && wy >= 5 && wy < 80;
      const inLens = Math.abs(cx + 4) < 18 && wy >= 0 && wy < 12;
      const inGrip = Math.abs(cx + 4) < 10 && wy >= 78 && wy < 130;
      const inRing = Math.abs(cx + 4) < 18 && wy >= 8 && wy < 16 && Math.abs(cx + 4) > 13;
      const inBezel = Math.abs(cx + 4) < 16 && wy >= 0 && wy < 6;
      if (inBezel) {
        // Bright lens glow when on
        const glowT = this._game?.player?.flashlightOn ? 1 : 0.2;
        const lensG = (220 * glowT) | 0, lensB = (180 * glowT) | 0;
        return A | (lensB << 16) | (lensG << 8) | 255; // bright yellow-white
      }
      if (inLens) return A | (0x60 << 16) | (0x80 << 8) | 0xBB; // blue-grey lens
      if (inRing) return A | (0x44 << 16) | (0x44 << 8) | 0x55; // dark ring
      if (inBody) {
        const shade = cx + 4 > 6 ? 0x606060 : (cx + 4 < -6 ? 0x909090 : 0x777777);
        const ridgeX = ((wy / 8) | 0) % 2 === 0 ? 5 : 0;
        return A | (shade << 16) | ((shade + ridgeX) << 8) | (shade + ridgeX * 2);
      }
      if (inGrip) {
        const g = 0x222222;
        return A | (g << 16) | (g << 8) | (g + 0x10);
      }
      return 0;
    }

    if (weapon === 'pipe') {
      const inPipe = Math.abs(cx + 8) < 11 && wy >= 0 && wy < 110;
      const inEnd = Math.abs(cx + 8) < 13 && wy >= 0 && wy < 8;
      if (inEnd) return A | (0x99 << 16) | (0x99 << 8) | 0xAA; // pipe end cap
      if (inPipe) {
        const shade = cx + 8 > 4 ? 0x505060 : (cx + 8 < -4 ? 0x808090 : 0x686878);
        // Rust spots
        const rust = Math.sin((wy * 7.3 + cx * 3.1)) > 0.7 ? 0x201010 : 0;
        return A | ((shade - rust + (0x60 << 16)) | 0);
      }
      return 0;
    }

    if (weapon === 'fire_axe') {
      // Handle (lower)
      const inHandle = Math.abs(cx + 10) < 8 && wy >= 40 && wy < 130;
      // Axe head — blade to the left
      const bx2 = cx + 10;
      const inBlade = bx2 < -8 && bx2 > -42 && wy >= 5 && wy < 45;
      const inSpike = bx2 > 5 && bx2 < 20 && wy >= 15 && wy < 30;
      const inPoll = Math.abs(bx2) < 9 && wy >= 10 && wy < 50;
      if (inBlade) {
        // Metallic red/silver axe blade
        const edgeDist = Math.abs(wy - 25) / 20;
        const bladeR = (180 + edgeDist * 40) | 0;
        return A | (0x30 << 16) | (0x20 << 8) | bladeR;
      }
      if (inSpike) return A | (0x60 << 16) | (0x60 << 8) | 0x90;
      if (inPoll) return A | (0x55 << 16) | (0x55 << 8) | 0x70;
      if (inHandle) {
        const grain = ((wy % 8) < 2) ? 0x442200 : 0x553311;
        return A | grain;
      }
      return 0;
    }

    if (weapon === 'key') {
      // Large gold key — shaft going down, bow at top-left
      const shaftCX = cx + 20;
      const inShaft = Math.abs(shaftCX) < 6 && wy >= 30 && wy < 110;
      const bowDist = Math.sqrt((cx + 30) * (cx + 30) + (wy - 25) * (wy - 25));
      const inBow = bowDist < 22 && bowDist > 12 && wy < 50;
      const inBowFill = bowDist < 12 && wy < 50;
      const inTeeth = shaftCX > 6 && shaftCX < 20 && wy >= 85 && wy < 110 && ((wy / 8 | 0) % 2 === 0);
      if (inBow) return A | (0x10 << 16) | (0xC0 << 8) | 0xFF; // gold
      if (inBowFill) return A | (0x08 << 16) | (0x80 << 8) | 0xCC; // dark gold hole
      if (inShaft) return A | (0x10 << 16) | (0xB8 << 8) | 0xFF;
      if (inTeeth) return A | (0x10 << 16) | (0xC0 << 8) | 0xFF;
      return 0;
    }

    // Default: fist/unarmed
    const fistCX = cx + 5;
    const inFist = Math.abs(fistCX) < 22 && wy >= 15 && wy < 65;
    const inFingers = Math.abs(fistCX) < 20 && wy >= 0 && wy < 20;
    const knuckle = (wy >= 14 && wy <= 18) && Math.abs(fistCX) < 18;
    if (knuckle) return A | (0x70 << 16) | (0x88 << 8) | 0xA8;
    if (inFist) return A | (0x68 << 16) | (0x80 << 8) | 0xA0;
    if (inFingers) return A | (0x68 << 16) | (0x80 << 8) | 0xA0;
    return 0;
  }

  // ── EMERGENCY RED BORDER (replaces full red tint) ─────────────────────────
  _renderEmergencyVignette() {
    if (!this.emergencyMode) return;
    const pulse = 0.55 + 0.45 * Math.sin(this._time * 7);
    const edgeW = 55;
    for (let y2 = 0; y2 < SCREEN_H; y2++) {
      for (let x2 = 0; x2 < SCREEN_W; x2++) {
        const edgeDist = Math.min(x2, SCREEN_W - 1 - x2, y2, SCREEN_H - 1 - y2);
        if (edgeDist >= edgeW) continue;
        const fade = Math.pow(1 - edgeDist / edgeW, 2) * pulse;
        if (fade < 0.01) continue;
        const i = y2 * SCREEN_W + x2;
        const p = this.buf32[i];
        const pr = p & 0xFF;
        const pg = (p >> 8) & 0xFF;
        const pb = (p >> 16) & 0xFF;
        const nr = Math.min(255, pr + 220 * fade);
        const ng = pg * (1 - fade * 0.85);
        const nb = pb * (1 - fade * 0.9);
        this.buf32[i] = (255 << 24) | ((nb | 0) << 16) | ((ng | 0) << 8) | (nr | 0);
      }
    }
  }

  // ── VIGNETTE ──────────────────────────────────────────────────────────────
  _renderVignette() {
    if (this.vignette <= 0.01) return;
    const v = this.vignette;
    for (let y2 = 0; y2 < SCREEN_H; y2++) {
      for (let x2 = 0; x2 < SCREEN_W; x2++) {
        const fx = (x2 / SCREEN_W - 0.5) * 2;
        const fy = (y2 / SCREEN_H - 0.5) * 2;
        const dist2 = Math.sqrt(fx * fx + fy * fy);
        const darkness = Math.min(1, Math.max(0, (dist2 - 0.5) * 1.5) * v);
        if (darkness < 0.01) continue;
        const i = y2 * SCREEN_W + x2;
        const p = this.buf32[i];
        const pr = (p & 0xFF) * (1 - darkness);
        const pg = ((p >> 8) & 0xFF) * (1 - darkness);
        const pb = ((p >> 16) & 0xFF) * (1 - darkness);
        this.buf32[i] = (255 << 24) | ((pb | 0) << 16) | ((pg | 0) << 8) | (pr | 0);
      }
    }
  }

  // ── MINIMAP (renders to a small canvas overlay) ───────────────────────────
  renderMinimap(ctx, map, player, entities, opts = {}) {
    const scale = 4;
    const size = 80;
    const ox = 10, oy = 10;
    const { showExit, showItems, worldItems, compassActive } = opts;
    const now = performance.now() / 1000;

    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#000';
    ctx.fillRect(ox - 1, oy - 1, size + 2, size + 2);
    ctx.strokeStyle = 'rgba(245,230,163,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox - 1, oy - 1, size + 2, size + 2);

    const px = Math.floor(player.x), py = Math.floor(player.y);
    const halfCells = Math.floor(size / scale / 2);

    for (let dy = -halfCells; dy <= halfCells; dy++) {
      for (let dx = -halfCells; dx <= halfCells; dx++) {
        const mx2 = px + dx, my2 = py + dy;
        if (mx2 < 0 || mx2 >= map.w || my2 < 0 || my2 >= map.h) continue;
        const t = map.get(mx2, my2);
        // Check special tiles
        const key = `${mx2},${my2}`;
        const special = map.specialTiles.get(key);
        if (special?.type === 'save_room') ctx.fillStyle = '#448';
        else if (special?.type === 'exit' && showExit) ctx.fillStyle = Math.sin(now * 4) > 0 ? '#0f8' : '#084';
        else if (t === 0) ctx.fillStyle = '#252015';
        else if (t === 10 || t === 11) ctx.fillStyle = '#896';
        else ctx.fillStyle = '#443';
        ctx.fillRect(ox + (dx + halfCells) * scale, oy + (dy + halfCells) * scale, scale - 1, scale - 1);
      }
    }

    // World item dots on minimap
    if (showItems && worldItems) {
      ctx.fillStyle = '#ff8';
      for (const item of worldItems) {
        if (item.collected) continue;
        const idx = Math.floor(item.x) - px + halfCells;
        const idy = Math.floor(item.y) - py + halfCells;
        if (idx < 0 || idx >= size / scale || idy < 0 || idy >= size / scale) continue;
        ctx.fillRect(ox + idx * scale + 1, oy + idy * scale + 1, 2, 2);
      }
    }

    // Player dot
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#ff0';
    const cx3 = ox + halfCells * scale, cy3 = oy + halfCells * scale;
    ctx.fillRect(cx3, cy3, scale, scale);

    // Direction arrow
    ctx.strokeStyle = '#ff0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx3 + scale / 2, cy3 + scale / 2);
    ctx.lineTo(cx3 + scale / 2 + player.dirX * 7, cy3 + scale / 2 + player.dirY * 7);
    ctx.stroke();

    // Entity dots
    ctx.fillStyle = '#f00';
    for (const e of entities) {
      if (!e.alive) continue;
      const ex = ox + (Math.floor(e.x) - px + halfCells) * scale;
      const ey = oy + (Math.floor(e.y) - py + halfCells) * scale;
      if (ex >= ox && ex < ox + size && ey >= oy && ey < oy + size)
        ctx.fillRect(ex, ey, scale, scale);
    }

    // Compass arrow (pointing to exit)
    if (compassActive && map.exitX !== undefined) {
      const edx = map.exitX - player.x, edy = map.exitY - player.y;
      const eDist = Math.sqrt(edx * edx + edy * edy);
      const eNx = edx / eDist, eNy = edy / eDist;
      const cxMid = ox + size / 2, cyMid = oy + size / 2;
      const arrowLen = 32;
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(now * 3);
      ctx.strokeStyle = '#0f8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cxMid, cyMid);
      ctx.lineTo(cxMid + eNx * arrowLen, cyMid + eNy * arrowLen);
      ctx.stroke();
      // Arrow head
      const angle = Math.atan2(eNy, eNx);
      ctx.fillStyle = '#0f8';
      ctx.beginPath();
      ctx.moveTo(cxMid + eNx * arrowLen, cyMid + eNy * arrowLen);
      ctx.lineTo(cxMid + eNx * arrowLen - Math.cos(angle - 0.5) * 6, cyMid + eNy * arrowLen - Math.sin(angle - 0.5) * 6);
      ctx.lineTo(cxMid + eNx * arrowLen - Math.cos(angle + 0.5) * 6, cyMid + eNy * arrowLen - Math.sin(angle + 0.5) * 6);
      ctx.closePath();
      ctx.fill();
      // Distance text
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = '#0f8';
      ctx.font = '8px Courier New';
      ctx.fillText(`${Math.round(eDist)}m`, ox + 2, oy + size - 3);
    }

    ctx.restore();
  }

  get width() { return SCREEN_W; }
  get height() { return SCREEN_H; }
}
