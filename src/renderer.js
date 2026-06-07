// Raycaster renderer — DDA algorithm, floor/ceiling casting, sprite rendering
import { T, MAP_W } from './map.js';
import { TEXTURES, TEX_SIZE, sampleTex } from './textures.js';

const SCREEN_W = 640;
const SCREEN_H = 360;
const HALF_H = SCREEN_H >> 1;
const NUM_RAYS = 320; // cast 320 rays, each covers 2 columns

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
  render(map, player, entities, worldItems) {
    this._renderScene(map, player);
    this._renderSprites(map, player, entities, worldItems);
    this._renderVignette();
    this.ctx.putImageData(this.imgData, 0, 0);
  }

  _renderScene(map, player) {
    const { x: px, y: py, dirX, dirY, planeX, planeY } = player;
    const buf = this.buf32;
    const zbuf = this.zbuf;
    const emergency = this.emergencyMode;

    // ── CEILING + FLOOR CASTING ──────────────────────────────────────────────
    // Pre-compute ray directions
    const rayDirX0 = dirX - planeX;
    const rayDirY0 = dirY - planeY;
    const rayDirX1 = dirX + planeX;
    const rayDirY1 = dirY + planeY;

    const floorTex = TEXTURES[this.floorTexName] || TEXTURES.carpet;
    const ceilTex = TEXTURES[this.ceilTexName] || TEXTURES.ceiling;
    const ceilLightTex = TEXTURES.ceilingLight;

    for (let y = HALF_H + 1; y < SCREEN_H; y++) {
      const rowDist = SCREEN_H / (2.0 * y - SCREEN_H);
      const stepX = rowDist * (rayDirX1 - rayDirX0) / SCREEN_W;
      const stepY = rowDist * (rayDirY1 - rayDirY0) / SCREEN_W;
      let floorX = px + rowDist * rayDirX0;
      let floorY = py + rowDist * rayDirY0;

      const fog = Math.min(1, rowDist * this.fogDensity * 1.5);
      const bright = Math.max(0, (1 - fog) * this.brightness);

      for (let x = 0; x < SCREEN_W; x++) {
        const tx = ((floorX * TEX_SIZE | 0) % TEX_SIZE + TEX_SIZE) % TEX_SIZE;
        const ty = ((floorY * TEX_SIZE | 0) % TEX_SIZE + TEX_SIZE) % TEX_SIZE;

        // Floor pixel with fog color tint
        const fp = floorTex[ty * TEX_SIZE + tx];
        const frBase = (fp & 0xFF) * bright + this.fogColorR * fog * 200;
        const fgBase = ((fp >> 8) & 0xFF) * bright + this.fogColorG * fog * 200;
        const fbBase = ((fp >> 16) & 0xFF) * bright + this.fogColorB * fog * 200;
        let ffr = frBase, ffg = fgBase, ffb = fbBase;
        if (emergency) { ffr = Math.min(255, frBase * 1.2 + 15); ffg = fgBase * 0.3; ffb = fbBase * 0.3; }
        buf[y * SCREEN_W + x] = (255 << 24) | ((ffb | 0) << 16) | ((ffg | 0) << 8) | (ffr | 0);

        // Ceiling pixel (mirrored y)
        const cy2 = SCREEN_H - y - 1;
        const cp = ceilTex[ty * TEX_SIZE + tx];
        const crBase = (cp & 0xFF) * bright * 0.85 + this.fogColorR * fog * 160;
        const cgBase = ((cp >> 8) & 0xFF) * bright * 0.85 + this.fogColorG * fog * 160;
        const cbBase = ((cp >> 16) & 0xFF) * bright * 0.85 + this.fogColorB * fog * 160;
        let fcr = crBase, fcg = cgBase, fcb = cbBase;
        if (emergency) { fcr = Math.min(255, crBase * 1.3 + 20); fcg = cgBase * 0.2; fcb = cbBase * 0.2; }
        buf[cy2 * SCREEN_W + x] = (255 << 24) | ((fcb | 0) << 16) | ((fcg | 0) << 8) | (fcr | 0);

        floorX += stepX;
        floorY += stepY;
      }
    }

    // Draw horizon line (middle row — pure fog)
    const midFog = emergency ? 0x300808 : 0x0a0905;
    for (let x = 0; x < SCREEN_W; x++) buf[HALF_H * SCREEN_W + x] = (255 << 24) | midFog;

    // ── WALL CASTING ─────────────────────────────────────────────────────────
    for (let col = 0; col < NUM_RAYS; col++) {
      const cameraX = 2 * col / NUM_RAYS - 1;
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
      for (let i = 0; i < 80 && !hit; i++) {
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
      const flLight = this.flashlightBrightness(col / NUM_RAYS, perpDist);
      const totalLight = Math.min(1.0, tileLight + flLight);

      const screenCol0 = col * 2;
      for (let sc = 0; sc < 2; sc++) {
        const screenCol = screenCol0 + sc;
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

          // Fog + light
          const fog = Math.min(1, perpDist * this.fogDensity);
          const bright = Math.max(0, (1 - fog) * totalLight * this.brightness);
          let fr2 = r2 * bright, fg2 = g2 * bright, fb2 = b2 * bright;
          if (emergency) { fr2 = Math.min(255, fr2 * 1.3 + 25); fg2 *= 0.2; fb2 *= 0.2; }

          buf[y2 * SCREEN_W + screenCol] = (255 << 24) | ((fb2 | 0) << 16) | ((fg2 | 0) << 8) | (fr2 | 0);
        }
      }
    }
  }

  _wallTex(tile) {
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
      default: return TEXTURES.wallpaper;
    }
  }

  // ── SPRITE RENDERING ──────────────────────────────────────────────────────
  _renderSprites(map, player, entities, worldItems) {
    const sprites = [];

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

          let r3 = (color & 0xFF) * bright;
          let g3 = ((color >> 8) & 0xFF) * bright;
          let b3 = ((color >> 16) & 0xFF) * bright;
          if (this.emergencyMode) { r3 = Math.min(255, r3 * 1.3 + 20); g3 *= 0.3; b3 *= 0.3; }

          this.buf32[sy * SCREEN_W + sx] = (255 << 24) | ((b3 | 0) << 16) | ((g3 | 0) << 8) | (r3 | 0);
        }
      }
    }
  }

  _spritePixel(sprite, tx, ty) {
    if (sprite.type === 'entity') return this._entityPixel(sprite.entity, tx, ty);
    if (sprite.type === 'item') return this._itemPixel(sprite.item, tx, ty);
    return 0;
  }

  _entityPixel(entity, tx, ty) {
    const type = entity.type || 'stalker';

    // ── SMILER: just two glowing eyes + wide grin ──────────────────────────
    if (type === 'smiler') {
      const eyeL = Math.abs(tx - 22) < 4 && ty >= 18 && ty <= 22;
      const eyeR = Math.abs(tx - 42) < 4 && ty >= 18 && ty <= 22;
      if (eyeL || eyeR) return (0xFFFFFFFF); // glowing white eyes
      // Grin — curved smile
      const grinY = 32 + Math.abs(tx - 32) * 0.25;
      if (ty >= grinY && ty <= grinY + 3 && tx > 16 && tx < 48) return (0xFFFFFFFF);
      return 0;
    }

    // ── PARTYGOER: tall yellow figure ─────────────────────────────────────
    if (type === 'partygoer') {
      const cx = Math.abs(tx - 32), cy = ty;
      if (cy < 10 && cx < 12) return 0xFF00DDFF; // yellow head (ABGR)
      // Carved bloody smile
      if (cy >= 5 && cy <= 7 && tx > 20 && tx < 44) return 0xFF2020CC; // red smile
      // Long arms
      if (cy >= 10 && cy <= 28 && cx >= 12 && cx < 28) return 0xFF00DDFF;
      // Body
      if (cy >= 10 && cy <= 50 && cx < 12) return 0xFF00DDFF;
      // Legs
      if (cy >= 50 && cy <= 64 && (Math.abs(tx - 26) < 7 || Math.abs(tx - 38) < 7)) return 0xFF00DDFF;
      return 0;
    }

    // ── DEATHMOTH: large moth wings ───────────────────────────────────────
    if (type === 'deathmoth') {
      const cx = tx - 32, cy = ty - 32;
      // Wings (elliptical shape each side)
      const leftWing = (cx < 0 && cx > -28 && Math.abs(cy) < (20 - Math.abs(cx) * 0.5));
      const rightWing = (cx > 0 && cx < 28 && Math.abs(cy) < (20 - cx * 0.5));
      if (leftWing || rightWing) {
        // Wing pattern
        const wn = Math.abs(cx * cy) % 5 < 1;
        return wn ? 0xFF303050 : 0xFF404060;
      }
      // Body
      if (Math.abs(cx) < 4 && cy > -18 && cy < 18) return 0xFF303030;
      return 0;
    }

    // ── FACELING: featureless humanoid ────────────────────────────────────
    if (type === 'faceling') {
      const cx = Math.abs(tx - 32), cy = ty;
      if (cy < 8 && cx < 10) return 0xFFB8A898; // skin tone head, no features
      if (cy >= 8 && cy <= 48 && cx < 13) return 0xFFC8B8A8;
      if (cy >= 12 && cy <= 35 && cx >= 13 && cx < 20) return 0xFFC8B8A8;
      if (cy >= 48 && cy <= 64 && (Math.abs(tx - 26) < 6 || Math.abs(tx - 38) < 6)) return 0xFFC8B8A8;
      return 0;
    }

    // ── HOUND: dark quadruped ──────────────────────────────────────────────
    if (type === 'hound') {
      const cx = tx - 32, cy = ty - 32;
      // Body (elongated horizontal)
      if (Math.abs(cy) < 8 && Math.abs(cx) < 22) return 0xFF101010;
      // Legs
      const legPos = [-16, -8, 8, 16];
      for (const lx of legPos) {
        if (Math.abs(tx - 32 - lx) < 3 && cy > 5 && cy < 20) return 0xFF101010;
      }
      // Head
      if (cx > 15 && cx < 28 && cy > -10 && cy < 4) return 0xFF101010;
      // Glowing eyes when chasing
      if ((entity.state === 'chase' || entity.state === 'attack') && cx > 18 && cx < 22 && cy > -8 && cy < -5) return 0xFF0000FF;
      return 0;
    }

    // ── DEFAULT: tall dark stalker ─────────────────────────────────────────
    const cx = Math.abs(tx - 32), cy = ty;
    if (cy < 8 && cx < 10) { if (cx < 8 && cy > 2) return 0xFF101010 | 0xFF000000; return 0; }
    if (cy >= 3 && cy <= 5 && (Math.abs(tx - 24) < 3 || Math.abs(tx - 40) < 3)) {
      const isChasing = entity.state === 'chase' || entity.state === 'attack';
      return isChasing ? (0xFF0000FF | 0xFF000000) : (0xFF333333 | 0xFF000000);
    }
    if (cy >= 8 && cy <= 48 && cx < 14) return 0xFF0D0D0D | 0xFF000000;
    if (cy >= 12 && cy <= 36 && cx >= 14 && cx < 22) return 0xFF0D0D0D | 0xFF000000;
    if (cy >= 48 && cy <= 64 && (Math.abs(tx - 26) < 6 || Math.abs(tx - 38) < 6)) return 0xFF0D0D0D | 0xFF000000;
    return 0;
  }

  _itemPixel(item, tx, ty) {
    // Simple geometric item sprites
    const cx = Math.abs(tx - 32), cy = Math.abs(ty - 48); // centered lower
    switch(item.type) {
      case 'medkit': {
        if (cx < 14 && cy < 10) {
          if (cx < 4 || cy < 4) return 0xFF2020C0 | 0xFF000000; // border
          if (cx < 2 || cy < 2) return 0xFF6060FF | 0xFF000000; // cross
          return 0xFF4040E0 | 0xFF000000;
        }
        return 0;
      }
      case 'battery': {
        if (cx < 8 && cy < 18) return 0xFF20A020 | 0xFF000000;
        return 0;
      }
      case 'almond_water': {
        if (cx < 6 && cy < 16) return 0xFF40C0E0 | 0xFF000000;
        return 0;
      }
      case 'key': {
        if (cx < 4 && cy < 10) return 0xFFC0B000 | 0xFF000000;
        return 0;
      }
      case 'pipe': {
        if (cx < 3 && cy < 22) return 0xFF888888 | 0xFF000000;
        return 0;
      }
      case 'fire_axe': {
        if (cx < 4 && cy < 24) return 0xFF604020 | 0xFF000000;
        if (cy < 8 && tx > 32 && tx < 50) return 0xFFC04020 | 0xFF000000; // blade
        return 0;
      }
      default: {
        if (cx < 6 && cy < 6) return 0xFFD0D020 | 0xFF000000;
        return 0;
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
  renderMinimap(ctx, map, player, entities) {
    const scale = 4;
    const size = 80;
    const ox = 10, oy = 10;
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#000';
    ctx.fillRect(ox, oy, size, size);

    const px = Math.floor(player.x), py = Math.floor(player.y);
    const halfCells = Math.floor(size / scale / 2);

    for (let dy = -halfCells; dy <= halfCells; dy++) {
      for (let dx = -halfCells; dx <= halfCells; dx++) {
        const mx2 = px + dx, my2 = py + dy;
        if (mx2 < 0 || mx2 >= MAP_W || my2 < 0 || my2 >= map.h) continue;
        const t = map.get(mx2, my2);
        if (t === 0) ctx.fillStyle = '#2a2510';
        else if (t === 10 || t === 11) ctx.fillStyle = '#8b6';
        else ctx.fillStyle = '#554';
        ctx.fillRect(ox + (dx + halfCells) * scale, oy + (dy + halfCells) * scale, scale - 1, scale - 1);
      }
    }

    // Player dot
    ctx.fillStyle = '#ff0';
    const cx3 = ox + halfCells * scale, cy3 = oy + halfCells * scale;
    ctx.fillRect(cx3, cy3, scale, scale);

    // Direction arrow
    ctx.strokeStyle = '#ff0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx3 + scale/2, cy3 + scale/2);
    ctx.lineTo(cx3 + scale/2 + player.dirX * 6, cy3 + scale/2 + player.dirY * 6);
    ctx.stroke();

    // Entity dots
    ctx.fillStyle = '#f00';
    for (const e of entities) {
      if (!e.alive) continue;
      const ex = ox + (Math.floor(e.x) - px + halfCells) * scale;
      const ey = oy + (Math.floor(e.y) - py + halfCells) * scale;
      ctx.fillRect(ex, ey, scale, scale);
    }

    ctx.restore();
  }

  get width() { return SCREEN_W; }
  get height() { return SCREEN_H; }
}
