// Procedural texture generation — all textures are 64x64 Uint32Array (ABGR)
export const TEX_SIZE = 64;

function rgba(r, g, b, a = 255) {
  return (a << 24) | (b << 16) | (g << 8) | r;
}

function noise(x, y, seed = 0) {
  let n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.1) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const a = noise(ix, iy, seed);
  const b = noise(ix + 1, iy, seed);
  const c = noise(ix, iy + 1, seed);
  const d = noise(ix + 1, iy + 1, seed);
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
}

function makeTex(fn) {
  const buf = new Uint32Array(TEX_SIZE * TEX_SIZE);
  for (let y = 0; y < TEX_SIZE; y++)
    for (let x = 0; x < TEX_SIZE; x++)
      buf[y * TEX_SIZE + x] = fn(x, y);
  return buf;
}

// ── WALLPAPER (iconic backrooms yellow) ──────────────────────────────────────
export const texWallpaper = makeTex((x, y) => {
  const baseR = 220, baseG = 200, baseB = 130;
  const n = smoothNoise(x * 0.15, y * 0.15, 1) * 0.15 +
            smoothNoise(x * 0.4, y * 0.4, 2) * 0.06;
  const s = 1 - n;

  // Diamond / grid wallpaper pattern
  const px = (x / TEX_SIZE) * 4, py = (y / TEX_SIZE) * 4;
  const wave = Math.sin(px * Math.PI) * Math.sin(py * Math.PI);
  const pat = wave > 0.7 ? 0.92 : (wave > 0.5 ? 0.96 : 1.0);

  // Occasional stain
  const stain = smoothNoise(x * 0.08, y * 0.08, 5) > 0.7 ? 0.88 : 1.0;

  const r = Math.min(255, baseR * s * pat * stain);
  const g = Math.min(255, baseG * s * pat * stain);
  const b = Math.min(255, baseB * s * pat * stain);
  return rgba(r, g, b);
});

// ── WALLPAPER DARK (damaged/wet) ─────────────────────────────────────────────
export const texWallpaperDark = makeTex((x, y) => {
  const n = smoothNoise(x * 0.2, y * 0.2, 3) * 0.3 + smoothNoise(x * 0.05, y * 0.05, 9) * 0.4;
  const r = Math.max(40, 160 - n * 80);
  const g = Math.max(35, 140 - n * 80);
  const b = Math.max(20, 80 - n * 40);
  // water streaks
  const streak = Math.abs(Math.sin((x + smoothNoise(x * 0.1, y * 0.1, 7) * 6) * 0.8 + y * 0.02)) < 0.06 ? 0.7 : 1;
  return rgba(r * streak, g * streak, b * streak);
});

// ── WALLPAPER WET ─────────────────────────────────────────────────────────────
export const texWallpaperWet = makeTex((x, y) => {
  const n = smoothNoise(x * 0.15, y * 0.15, 11);
  const r = Math.max(50, 180 * (0.7 + n * 0.3));
  const g = Math.max(45, 165 * (0.7 + n * 0.3));
  const b = Math.max(30, 100 * (0.7 + n * 0.3));
  const sheen = Math.sin(x * 0.5 + y * 0.3 + smoothNoise(x * 0.05, y * 0.05) * 10) * 0.15;
  return rgba(r + sheen * 40, g + sheen * 30, b + sheen * 20);
});

// ── CARPET ────────────────────────────────────────────────────────────────────
export const texCarpet = makeTex((x, y) => {
  const n = smoothNoise(x * 0.5, y * 0.5, 4) * 0.25 + smoothNoise(x * 2, y * 2, 6) * 0.1;
  const stain = smoothNoise(x * 0.12, y * 0.12, 8) > 0.65 ? 0.75 : 1;
  const base = 0.7 + n;
  return rgba(130 * base * stain, 110 * base * stain, 70 * base * stain);
});

// ── CARPET STAINED ────────────────────────────────────────────────────────────
export const texCarpetStained = makeTex((x, y) => {
  const n = smoothNoise(x * 0.3, y * 0.3, 12) * 0.3;
  const dark = smoothNoise(x * 0.08, y * 0.08, 13) * 0.5;
  const r = Math.max(20, 100 * (0.6 + n) * (1 - dark * 0.4));
  const g = Math.max(15, 80 * (0.6 + n) * (1 - dark * 0.4));
  const b = Math.max(5, 40 * (0.6 + n) * (1 - dark * 0.5));
  return rgba(r, g, b);
});

// ── CEILING ───────────────────────────────────────────────────────────────────
export const texCeiling = makeTex((x, y) => {
  const tileX = x % 16, tileY = y % 16;
  const isLine = tileX === 0 || tileY === 0;
  const base = isLine ? 195 : 220;
  const n = smoothNoise(x * 0.3, y * 0.3, 2) * 8;
  return rgba(base + n - 4, base + n - 4, base - 4);
});

// ── CEILING LIGHT ─────────────────────────────────────────────────────────────
export const texCeilingLight = makeTex((x, y) => {
  const cx = Math.abs(x - 32) / 32, cy = Math.abs(y - 32) / 32;
  const dist = Math.sqrt(cx * cx + cy * cy);
  const glow = Math.max(0, 1 - dist * 1.2);
  const r = Math.min(255, 230 + glow * 25);
  const g = Math.min(255, 225 + glow * 25);
  const b = Math.min(255, 195 + glow * 40);
  return rgba(r, g, b);
});

// ── CONCRETE WALL ─────────────────────────────────────────────────────────────
export const texConcrete = makeTex((x, y) => {
  const n = smoothNoise(x * 0.25, y * 0.25, 15) * 0.3;
  const crack = smoothNoise(x * 1.5, y * 0.3, 16) > 0.82 ? 0.6 : 1;
  const base = 100 + n * 60;
  return rgba(base * crack, base * crack, base * crack);
});

// ── METAL WALL ────────────────────────────────────────────────────────────────
export const texMetal = makeTex((x, y) => {
  const streak = Math.sin(y * 0.8 + smoothNoise(x * 0.1, y * 0.1, 17) * 2) * 15;
  const n = smoothNoise(x * 0.5, y * 0.5, 18) * 20;
  const rust = smoothNoise(x * 0.15, y * 0.15, 19) > 0.7 ? 0.7 : 1;
  const base = 130 + streak + n;
  return rgba(base * rust, base * 0.9 * rust, base * 0.7);
});

// ── DOOR ──────────────────────────────────────────────────────────────────────
export const texDoor = makeTex((x, y) => {
  const isFrame = x < 3 || x > 60 || y < 3 || y > 60;
  const isPanel = ((y > 8 && y < 28) || (y > 36 && y < 56)) && x > 6 && x < 58;
  const handle = Math.abs(x - 56) < 3 && Math.abs(y - 32) < 6;
  if (handle) return rgba(180, 160, 80);
  if (isFrame) return rgba(80, 75, 70);
  if (isPanel) {
    const n = smoothNoise(x * 0.3, y * 0.3, 20) * 15;
    return rgba(120 + n, 115 + n, 105 + n);
  }
  const n = smoothNoise(x * 0.2, y * 0.2, 21) * 10;
  return rgba(145 + n, 138 + n, 125 + n);
});

// ── LOCKER ────────────────────────────────────────────────────────────────────
export const texLocker = makeTex((x, y) => {
  const vent = y % 8 < 3 && x > 8 && x < 56;
  const edge = x < 3 || x > 60;
  if (edge) return rgba(50, 55, 60);
  if (vent) return rgba(40, 45, 50);
  const n = smoothNoise(x * 0.4, y * 0.4, 22) * 10;
  const scratch = smoothNoise(x * 2, y * 0.2, 23) > 0.88 ? 0.6 : 1;
  return rgba((100 + n) * scratch, (105 + n) * scratch, (110 + n) * scratch);
});

// ── WINDOW / GLASS ────────────────────────────────────────────────────────────
export const texWindow = makeTex((x, y) => {
  const frame = x < 4 || x > 59 || y < 4 || y > 59 || (Math.abs(x - 32) < 2) || (Math.abs(y - 32) < 2);
  if (frame) return rgba(90, 85, 80);
  const glare = Math.max(0, 1 - Math.sqrt(Math.pow((x - 20) / 10, 2) + Math.pow((y - 15) / 8, 2)));
  return rgba(
    Math.min(255, 150 + glare * 80),
    Math.min(255, 200 + glare * 55),
    Math.min(255, 200 + glare * 50),
    180 + glare * 60
  );
});

// ── BRICK / MAINTENANCE ───────────────────────────────────────────────────────
export const texBrick = makeTex((x, y) => {
  const row = Math.floor(y / 8);
  const offset = (row % 2) * 16;
  const bx = (x + offset) % 32;
  const isGrout = bx < 2 || (y % 8) < 1;
  if (isGrout) return rgba(60, 55, 50);
  const n = noise(x, y, 24) * 20;
  return rgba(160 + n, 90 + n * 0.5, 70 + n * 0.3);
});

// ── POOLROOM TILE ─────────────────────────────────────────────────────────────
export const texPoolTile = makeTex((x, y) => {
  const grout = (x % 16 < 2) || (y % 16 < 2);
  if (grout) return rgba(200, 200, 195);
  const n = smoothNoise(x * 0.3, y * 0.3, 25) * 10;
  return rgba(220 + n, 235 + n, 240 + n);
});

// ── FLOOR WET / POOL ─────────────────────────────────────────────────────────
export const texFloorWet = makeTex((x, y) => {
  const n = smoothNoise(x * 0.2, y * 0.2, 26);
  const ripple = Math.sin(x * 0.5 + n * 5) * Math.sin(y * 0.4 + n * 4) * 0.1;
  const base = 0.55 + n * 0.2 + ripple;
  return rgba(80 * base, 120 * base, 140 * base);
});

// ── SAVE ROOM WALL ────────────────────────────────────────────────────────────
export const texSaveRoom = makeTex((x, y) => {
  const n = smoothNoise(x * 0.15, y * 0.15, 27) * 0.15;
  const s = 1 - n;
  // Warm, slightly orange-yellow
  return rgba(200 * s, 160 * s, 80 * s);
});

// ── WOOD ──────────────────────────────────────────────────────────────────────
export const texWood = makeTex((x, y) => {
  const grain = smoothNoise(x * 0.05 + smoothNoise(x * 0.02, y * 0.02, 28) * 3, y * 1.5, 28) * 0.3;
  const n = smoothNoise(x * 0.5, y * 0.5, 29) * 0.1;
  return rgba(
    Math.min(255, 160 + grain * 60 + n * 40),
    Math.min(255, 110 + grain * 40 + n * 30),
    Math.min(255, 60 + grain * 20 + n * 10)
  );
});

// ── PIPED WALL (dark concrete with industrial pipe overlay) ───────────────────
export const texPipedWall = makeTex((x, y) => {
  const n = smoothNoise(x * 0.25, y * 0.25, 30) * 0.3;
  const base = 35 + n * 25;
  const pipeH = y % 16 === 7 || y % 16 === 8;
  const pipeV = x % 20 === 9 || x % 20 === 10;
  if (pipeH && pipeV) return rgba(100, 50, 20); // rust at joint
  if (pipeH) { const mn = smoothNoise(x * 0.8, y * 0.1, 31) * 12; return rgba(75 + mn, 68 + mn, 55 + mn); }
  if (pipeV) { const mn = smoothNoise(x * 0.1, y * 0.8, 32) * 12; return rgba(60 + mn, 55 + mn, 45 + mn); }
  const tar = smoothNoise(x * 0.08, y * 0.05, 33) > 0.76;
  if (tar) return rgba(base * 0.35, base * 0.25, base * 0.15);
  return rgba(base, base * 0.88, base * 0.72);
});

// ── DARK RED BRICK (oppressive underground) ───────────────────────────────────
export const texBrickRed = makeTex((x, y) => {
  const row = Math.floor(y / 8);
  const offset = (row % 2) * 16;
  const bx = (x + offset) % 32;
  const isGrout = bx < 2 || (y % 8) < 1;
  if (isGrout) return rgba(18, 12, 9);
  const n = noise(x, y, 35) * 20;
  const dark = smoothNoise(x * 0.06, y * 0.06, 36) * 0.45;
  return rgba(
    Math.max(12, (90 + n) * (1 - dark * 0.65)),
    Math.max(6, (28 + n * 0.3) * (1 - dark * 0.8)),
    Math.max(4, (15 + n * 0.15) * (1 - dark * 0.9))
  );
});

// ── POOL FLOOR (deep blue-teal water with caustic light patterns) ─────────────
export const texPoolFloor = makeTex((x, y) => {
  // Deep water — rich blue-teal with light caustic ripples
  const caustic = smoothNoise(x * 0.18, y * 0.18, 40) * 0.6 + smoothNoise(x * 0.42, y * 0.42, 41) * 0.4;
  const ripple = Math.sin(x * 0.5 + caustic * 4) * Math.cos(y * 0.4 + caustic * 3) * 18;
  const depth = smoothNoise(x * 0.08, y * 0.08, 42);
  return rgba(
    Math.max(0, Math.min(255, 40 + ripple * 0.4 + depth * 15)),   // R: low (deep blue)
    Math.max(0, Math.min(255, 140 + ripple + depth * 25)),          // G: medium
    Math.max(0, Math.min(255, 200 + ripple * 0.8 + depth * 20))    // B: high (water blue)
  );
});

// ── PARTY WALL (pastel with polka dots) ───────────────────────────────────────
export const texPartyWall = makeTex((x, y) => {
  const cellX = Math.floor(x / 16), cellY = Math.floor(y / 16);
  const hue = noise(cellX, cellY, 45);
  let r, g, b;
  if (hue < 0.33) { r = 255; g = 175; b = 195; }
  else if (hue < 0.66) { r = 255; g = 240; b = 150; }
  else { r = 175; g = 225; b = 255; }
  const dotCx = x % 24 - 12, dotCy = y % 24 - 12;
  if (dotCx * dotCx + dotCy * dotCy < 14) return rgba(255, 255, 255);
  const n = smoothNoise(x * 0.4, y * 0.4, 46) * 8;
  return rgba(Math.min(255, r + n), Math.min(255, g + n), Math.min(255, b + n));
});

// ── PARTY FLOOR (bright checkered) ────────────────────────────────────────────
export const texPartyFloor = makeTex((x, y) => {
  const tileX = Math.floor(x / 16) % 2, tileY = Math.floor(y / 16) % 2;
  if ((tileX + tileY) % 2 === 0) return rgba(255, 255, 255);
  const hue = noise(Math.floor(x / 16), Math.floor(y / 16), 47);
  if (hue < 0.33) return rgba(255, 148, 175);
  if (hue < 0.66) return rgba(148, 228, 148);
  return rgba(148, 190, 255);
});

// ── DARK TILE (poolroom death zone — near-black) ──────────────────────────────
export const texDarkTile = makeTex((x, y) => {
  const grout = (x % 16 < 2) || (y % 16 < 2);
  if (grout) return rgba(3, 3, 5);
  const n = smoothNoise(x * 0.3, y * 0.3, 50) * 8;
  return rgba(10 + n, 10 + n, 20 + n);
});

// ── GRASS FLOOR (outdoor) ─────────────────────────────────────────────────────
export const texGrass = makeTex((x, y) => {
  // Rich vibrant dreamcore grass — varying height/density patches
  const base = smoothNoise(x * 0.22, y * 0.22, 60);
  const detail = smoothNoise(x * 0.9, y * 0.9, 61) * 0.3;
  const patch = smoothNoise(x * 0.07, y * 0.07, 62); // large patches darker/lighter
  const blade = noise(x, y, 63) > 0.78; // individual blade lines
  if (blade && base > 0.4) return rgba(20, (95 + patch * 40) | 0, 15); // darker blade
  const g = Math.min(255, (78 + base * 80 + detail * 30 + patch * 25) | 0);
  const r = Math.min(255, (12 + base * 22 + patch * 15) | 0);
  const b = Math.min(255, (8 + base * 14) | 0);
  // Flower dots — white, yellow, pink
  const flowerRng = noise(x, y, 64);
  if (flowerRng > 0.975) return rgba(255, 255, 255); // white
  if (flowerRng > 0.968) return rgba(255, 230, 40);  // yellow
  if (flowerRng > 0.962) return rgba(255, 160, 200); // pink
  return rgba(r, g, b);
});

// ── HOSPITAL TILE (bright sterile white) ─────────────────────────────────────
export const texHospitalTile = makeTex((x, y) => {
  // Classic hospital: pale mint-green tiles with grey grout, stain marks
  const grout = (x % 16 === 0) || (y % 16 === 0) || (x % 16 === 1) || (y % 16 === 1);
  if (grout) return rgba(155, 162, 158);
  const stain = smoothNoise(x * 0.08, y * 0.08, 65) > 0.72 ? 0.88 : 1.0;
  const n = smoothNoise(x * 0.6, y * 0.6, 64) * 8;
  const r = Math.min(255, ((200 + n * 0.3) * stain) | 0);
  const g = Math.min(255, ((218 + n * 0.4) * stain) | 0);
  const b = Math.min(255, ((208 + n * 0.3) * stain) | 0);
  return rgba(r, g, b); // mint-green tint
});

// ── ROAD ASPHALT ──────────────────────────────────────────────────────────────
export const texRoad = makeTex((x, y) => {
  const n = smoothNoise(x * 0.3, y * 0.3, 65) * 14;
  const base = (40 + n) | 0;
  // White center dashes
  if (Math.abs(x - 32) < 2 && (y % 14) < 8) return rgba(210, 210, 210);
  // Yellow edge lines
  if (x < 4 || x > 59) return rgba(180, 160, 20);
  // Small road cracks
  const crack = smoothNoise(x * 2, y * 0.4, 66) > 0.9 ? 0.6 : 1;
  return rgba((base * crack) | 0, (base * crack) | 0, ((base - 5) * crack) | 0);
});

// ── DREAMCORE WALL (pastel wood paneling) ─────────────────────────────────────
export const texDreamcoreWall = makeTex((x, y) => {
  const grain = smoothNoise(x * 0.04 + smoothNoise(x * 0.02, y * 0.02, 67) * 2, y * 1.2, 67) * 0.3;
  const n = smoothNoise(x * 0.4, y * 0.4, 68) * 0.12;
  // Pastel pink-cream
  return rgba(
    Math.min(255, (215 + grain * 30 + n * 20) | 0),
    Math.min(255, (185 + grain * 25 + n * 18) | 0),
    Math.min(255, (165 + grain * 18 + n * 14) | 0)
  );
});

// ── SKY CONFIGS — used by renderer for outdoor ceiling gradient ───────────────
export const SKY_CONFIGS = {
  dreamcore:       { topR: 120, topG: 185, topB: 225, botR: 190, botG: 230, botB: 200 },
  dreamcore_night: { topR: 5,   topG: 5,   topB: 20,  botR: 18,  botG: 12,  botB: 35  },
  suburbs:         { topR: 8,   topG: 8,   topB: 20,  botR: 28,  botG: 22,  botB: 40  },
  city:            { topR: 22,  topG: 28,  topB: 45,  botR: 55,  botG: 50,  botB: 70  },
  poolrooms:       { topR: 95,  topG: 175, topB: 205, botR: 145, botG: 215, botB: 235 },
};

// ── ALL TEXTURES MAP ─────────────────────────────────────────────────────────
export const TEXTURES = {
  wallpaper: texWallpaper,
  wallpaperDark: texWallpaperDark,
  wallpaperWet: texWallpaperWet,
  carpet: texCarpet,
  carpetStained: texCarpetStained,
  ceiling: texCeiling,
  ceilingLight: texCeilingLight,
  concrete: texConcrete,
  metal: texMetal,
  door: texDoor,
  locker: texLocker,
  window: texWindow,
  brick: texBrick,
  poolTile: texPoolTile,
  floorWet: texFloorWet,
  saveRoom: texSaveRoom,
  wood: texWood,
  pipedWall: texPipedWall,
  brickRed: texBrickRed,
  poolFloor: texPoolFloor,
  partyWall: texPartyWall,
  partyFloor: texPartyFloor,
  darkTile: texDarkTile,
  grass: texGrass,
  hospitalTile: texHospitalTile,
  road: texRoad,
  dreamcoreWall: texDreamcoreWall,
};

export function getTexPixel(tex, u, v) {
  const tx = Math.floor(u * TEX_SIZE) & (TEX_SIZE - 1);
  const ty = Math.floor(v * TEX_SIZE) & (TEX_SIZE - 1);
  return tex[ty * TEX_SIZE + tx];
}

export function sampleTex(tex, x, y) {
  const tx = ((x % TEX_SIZE) + TEX_SIZE) % TEX_SIZE | 0;
  const ty = ((y % TEX_SIZE) + TEX_SIZE) % TEX_SIZE | 0;
  return tex[ty * TEX_SIZE + tx];
}
