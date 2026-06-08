// Map system — tile grid + collision + lighting + minimap
export const MAP_W = 80;
export const MAP_H = 80;

// Tile IDs
export const T = {
  EMPTY: 0,
  WALL_PAPER: 1,
  WALL_DARK: 2,
  WALL_WET: 3,
  WALL_CONCRETE: 4,
  WALL_METAL: 5,
  WALL_BRICK: 6,
  WALL_TILE: 7,
  WALL_SAVE: 8,
  WALL_WOOD: 9,
  DOOR_CLOSED: 10,
  DOOR_OPEN: 11,
  LOCKER_CLOSED: 12,
  LOCKER_OPEN: 13,
  WINDOW: 14,
  VENT: 15,
  WALL_PIPE: 16,
  WALL_BRICK_RED: 17,
  WALL_PARTY: 18,
  VENDING_MACHINE: 19,
  TABLE: 20,
  ARCADE_MACHINE: 21,
  HOSPITAL_BED: 22,
  // Floor variants (add 100 to distinguish floor from wall, used in floor renderer)
  FLOOR_CARPET: 0,
  FLOOR_TILE: 100,
  FLOOR_WET: 101,
  FLOOR_CONCRETE: 102,
  FLOOR_DARK: 103,
  FLOOR_PARTY: 104,
  FLOOR_POOL: 105,
  FLOOR_GRASS: 106,
  FLOOR_ROAD: 107,
  FLOOR_WOOD: 108,
};

// Each tile is one byte in the tiles array
// Light array: 0-255 per tile (ambient light level)
// Floor array: floor texture per tile
// Ceiling array: ceiling type per tile (0=normal, 1=light, 2=none)

export class GameMap {
  constructor() {
    this.w = MAP_W;
    this.h = MAP_H;
    this.tiles = new Uint8Array(MAP_W * MAP_H);
    this.floor = new Uint8Array(MAP_W * MAP_H);   // floor texture id per cell
    this.ceiling = new Uint8Array(MAP_W * MAP_H); // 0=normal, 1=light panel, 2=broken
    this.light = new Float32Array(MAP_W * MAP_H); // 0.0-1.0 ambient
    this.lightFlicker = new Float32Array(MAP_W * MAP_H); // multiplier 0-1
    this.lightSources = []; // {x, y, radius, intensity, r, g, b, flickerRate}
    this.entities = []; // starting positions and types
    this.items = [];    // world items
    this.specialTiles = new Map(); // tile coord key -> special data
    this.spawnX = 3;
    this.spawnY = 3;
    this.exitX = 0;
    this.exitY = 0;
    this.roomList = []; // {x, y, w, h, type}
    this.ambientBase = 0.06; // per-level ambient light base
    this.theme = 'default';  // level theme name
    this.themeConfig = null; // full theme config object
    // Fill all with solid walls initially
    this.tiles.fill(T.WALL_PAPER);
  }

  idx(x, y) { return y * MAP_W + x; }

  set(x, y, tile) {
    if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return;
    this.tiles[this.idx(x, y)] = tile;
  }

  get(x, y) {
    if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return T.WALL_PAPER;
    return this.tiles[this.idx(x, y)];
  }

  setFloor(x, y, fid) {
    if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return;
    this.floor[this.idx(x, y)] = fid;
  }

  getFloor(x, y) {
    if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return 0;
    return this.floor[this.idx(x, y)];
  }

  setCeiling(x, y, cid) {
    if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return;
    this.ceiling[this.idx(x, y)] = cid;
  }

  getCeiling(x, y) {
    if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return 0;
    return this.ceiling[this.idx(x, y)];
  }

  isWall(x, y) {
    const t = this.get(x, y);
    return t !== T.EMPTY && t !== T.DOOR_OPEN && t !== T.LOCKER_OPEN && t !== T.VENT;
  }

  isPassable(x, y) {
    const t = this.get(x, y);
    return t === T.EMPTY || t === T.DOOR_OPEN || t === T.VENT;
  }

  isSolid(x, y) { return this.isWall(x, y); }

  // Check if a world-space position is blocked (for movement)
  isBlocked(wx, wy, radius = 0.25) {
    const x1 = Math.floor(wx - radius), x2 = Math.floor(wx + radius);
    const y1 = Math.floor(wy - radius), y2 = Math.floor(wy + radius);
    for (let cy = y1; cy <= y2; cy++)
      for (let cx = x1; cx <= x2; cx++)
        if (this.isSolid(cx, cy)) return true;
    return false;
  }

  // World-space light level at a position
  getLightAt(wx, wy) {
    const x = Math.floor(wx), y = Math.floor(wy);
    let base = this.light[this.idx(x, y)] || 0.08;
    // Dynamic light sources
    for (const src of this.lightSources) {
      const dx = wx - src.x, dy = wy - src.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < src.radius * src.radius) {
        const factor = (1 - Math.sqrt(d2) / src.radius) * src.intensity * (src.flicker || 1);
        base = Math.min(1, base + factor);
      }
    }
    return base;
  }

  // Add a light source
  addLight(x, y, radius, intensity, r = 1, g = 0.95, b = 0.8, flickerRate = 0) {
    this.lightSources.push({ x, y, radius, intensity, r, g, b, flickerRate, flicker: 1, phase: Math.random() * Math.PI * 2 });
  }

  // Update flickering lights
  updateLights(dt) {
    for (const src of this.lightSources) {
      if (src.flickerRate > 0) {
        src.phase += dt * src.flickerRate;
        const base = 0.85 + Math.sin(src.phase) * 0.08 + Math.sin(src.phase * 3.7) * 0.04;
        src.flicker = Math.max(0.1, base + (Math.random() - 0.5) * 0.03);
      }
    }
  }

  // Bake ambient light into light array based on sources and ceiling tiles
  bakeLight() {
    this.light.fill(this.ambientBase); // base ambient (per-level configurable)
    // Ceiling light panels spread light downward
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (this.ceiling[this.idx(x, y)] === 1) {
          this.spreadLight(x, y, 5, 0.75);
        }
      }
    }
  }

  spreadLight(cx, cy, radius, intensity) {
    const r2 = radius * radius;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const tx = cx + dx, ty = cy + dy;
        if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) continue;
        if (this.isSolid(tx, ty)) continue;
        const factor = intensity * (1 - Math.sqrt(d2) / radius);
        const i = this.idx(tx, ty);
        this.light[i] = Math.min(1, this.light[i] + factor);
      }
    }
  }

  // Carve a rectangular room
  carveRoom(x, y, w, h, wallType = T.WALL_PAPER, floorType = 0, ceilType = 0) {
    for (let cy = y; cy < y + h; cy++) {
      for (let cx = x; cx < x + w; cx++) {
        if (cx <= 0 || cx >= MAP_W - 1 || cy <= 0 || cy >= MAP_H - 1) continue;
        if (cy === y || cy === y + h - 1 || cx === x || cx === x + w - 1) {
          this.set(cx, cy, wallType);
        } else {
          this.set(cx, cy, T.EMPTY);
          this.setFloor(cx, cy, floorType);
          this.setCeiling(cx, cy, ceilType);
        }
      }
    }
  }

  // Carve a corridor between two points
  carveCorridor(x1, y1, x2, y2, wallType = T.WALL_PAPER, w = 2) {
    const hw = Math.floor(w / 2);
    // Horizontal then vertical
    const mx = Math.round((x1 + x2) / 2 + (Math.random() - 0.5) * 4);
    // Horizontal segment 1
    for (let x = Math.min(x1, mx); x <= Math.max(x1, mx); x++) {
      for (let dy = -hw; dy <= hw + 1; dy++) {
        const cy = y1 + dy;
        if (cy <= 0 || cy >= MAP_H - 1 || x <= 0 || x >= MAP_W - 1) continue;
        if (dy === -hw || dy === hw + 1) {
          if (!this.isWall(x, cy) || this.get(x, cy) === T.EMPTY) continue;
          this.set(x, cy, wallType);
        } else {
          this.set(x, cy, T.EMPTY);
          this.setFloor(x, cy, 0);
        }
      }
    }
    // Vertical segment
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      for (let dx = -hw; dx <= hw + 1; dx++) {
        const cx = mx + dx;
        if (cx <= 0 || cx >= MAP_W - 1 || y <= 0 || y >= MAP_H - 1) continue;
        if (dx === -hw || dx === hw + 1) {
          if (!this.isWall(cx, y) || this.get(cx, y) === T.EMPTY) continue;
          this.set(cx, y, wallType);
        } else {
          this.set(cx, y, T.EMPTY);
          this.setFloor(cx, y, 0);
        }
      }
    }
    // Horizontal segment 2
    for (let x = Math.min(mx, x2); x <= Math.max(mx, x2); x++) {
      for (let dy = -hw; dy <= hw + 1; dy++) {
        const cy = y2 + dy;
        if (cy <= 0 || cy >= MAP_H - 1 || x <= 0 || x >= MAP_W - 1) continue;
        if (dy === -hw || dy === hw + 1) {
          if (!this.isWall(x, cy) || this.get(x, cy) === T.EMPTY) continue;
          this.set(x, cy, wallType);
        } else {
          this.set(x, cy, T.EMPTY);
          this.setFloor(x, cy, 0);
        }
      }
    }
  }

  carveHallway(x1, y1, x2, y2) {
    // Simple L-shaped corridor
    if (Math.random() < 0.5) {
      for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
        if (x <= 0 || x >= MAP_W - 1) continue;
        this.set(x, y1, T.EMPTY);
        this.set(x, y1 - 1, T.EMPTY);
        this.setFloor(x, y1, 0);
        this.setFloor(x, y1 - 1, 0);
      }
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
        if (y <= 0 || y >= MAP_H - 1) continue;
        this.set(x2, y, T.EMPTY);
        this.set(x2 + 1, y, T.EMPTY);
        this.setFloor(x2, y, 0);
        this.setFloor(x2 + 1, y, 0);
      }
    } else {
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
        if (y <= 0 || y >= MAP_H - 1) continue;
        this.set(x1, y, T.EMPTY);
        this.set(x1 + 1, y, T.EMPTY);
        this.setFloor(x1, y, 0);
        this.setFloor(x1 + 1, y, 0);
      }
      for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
        if (x <= 0 || x >= MAP_W - 1) continue;
        this.set(x, y2, T.EMPTY);
        this.set(x, y2 + 1, T.EMPTY);
        this.setFloor(x, y2, 0);
        this.setFloor(x, y2 + 1, 0);
      }
    }
  }

  // Place a door in a wall between two empty spaces
  placeDoor(x, y) {
    if (this.get(x, y) === T.WALL_PAPER || this.get(x, y) === T.WALL_DARK) {
      this.set(x, y, T.DOOR_CLOSED);
    }
  }

  // A* pathfinding (grid-based)
  findPath(sx, sy, ex, ey, maxSteps = 1200) {
    sx = Math.floor(sx); sy = Math.floor(sy);
    ex = Math.floor(ex); ey = Math.floor(ey);
    if (sx === ex && sy === ey) return [];
    if (this.isSolid(ex, ey)) return [];

    const key = (x, y) => y * MAP_W + x;
    const heur = (x, y) => Math.abs(x - ex) + Math.abs(y - ey);

    const open = new Map();
    const closed = new Set();
    const came = new Map();
    const g = new Map();
    const start = key(sx, sy);
    open.set(start, heur(sx, sy));
    g.set(start, 0);

    const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
    let steps = 0;

    while (open.size > 0 && steps++ < maxSteps) {
      let bestK = null, bestF = Infinity;
      for (const [k, f] of open) {
        if (f < bestF) { bestF = f; bestK = k; }
      }
      if (bestK === null) break;
      const cx = bestK % MAP_W, cy = (bestK / MAP_W) | 0;
      if (cx === ex && cy === ey) {
        // Reconstruct path
        const path = [];
        let cur = bestK;
        while (came.has(cur)) {
          path.unshift({ x: cur % MAP_W + 0.5, y: ((cur / MAP_W) | 0) + 0.5 });
          cur = came.get(cur);
        }
        return path;
      }
      open.delete(bestK);
      closed.add(bestK);
      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) continue;
        if (this.isSolid(nx, ny)) continue;
        const nk = key(nx, ny);
        if (closed.has(nk)) continue;
        const ng = (g.get(bestK) || 0) + 1;
        if (!open.has(nk) || ng < (g.get(nk) || Infinity)) {
          came.set(nk, bestK);
          g.set(nk, ng);
          open.set(nk, ng + heur(nx, ny));
        }
      }
    }
    return [];
  }

  // Ray intersection test (for entity line-of-sight)
  hasLineOfSight(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.1) return true;
    const steps = Math.ceil(dist * 2);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const wx = x1 + dx * t, wy = y1 + dy * t;
      if (this.isSolid(Math.floor(wx), Math.floor(wy))) return false;
    }
    return true;
  }
}
