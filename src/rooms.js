// Procedural level generation with per-level themes
import { GameMap, T, MAP_W, MAP_H } from './map.js';

function rng(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ── LEVEL THEMES ─────────────────────────────────────────────────────────────
const LEVEL_THEMES = {
  lobby: {
    name: 'The Lobby — Level 0',
    wallTypes: [T.WALL_PAPER, T.WALL_PAPER, T.WALL_PAPER, T.WALL_DARK],
    floorType: T.FLOOR_CARPET,
    ambientBase: 0.55,
    fogDensity: 0.04,
    fogColorR: 0.06, fogColorG: 0.05, fogColorB: 0.01,
    entityTypes: [],
    roomPool: ['lobby_standard', 'lobby_standard', 'lobby_corridor', 'lobby_corridor', 'lobby_void', 'lobby_void_corridor'],
    floorTexName: 'carpet',
    ambientProfile: 'lobby',
  },
  warehouse: {
    name: 'Habitable Zone — Level 1',
    wallTypes: [T.WALL_CONCRETE, T.WALL_CONCRETE, T.WALL_METAL, T.WALL_DARK],
    floorType: T.FLOOR_CONCRETE,
    ambientBase: 0.10,
    fogDensity: 0.09,
    fogColorR: 0.02, fogColorG: 0.03, fogColorB: 0.04,
    entityTypes: ['hound', 'faceling', 'faceling'],
    roomPool: ['warehouse_bay', 'warehouse_bay', 'warehouse_corridor', 'warehouse_dark', 'warehouse_pillar_forest', 'warehouse_flooded'],
    floorTexName: 'concrete',
    ambientProfile: 'warehouse',
  },
  pipes: {
    name: 'Pipe Dreams — Level 2',
    wallTypes: [T.WALL_PIPE],
    floorType: T.FLOOR_CONCRETE,
    ambientBase: 0.04,
    fogDensity: 0.14,
    fogColorR: 0.03, fogColorG: 0.01, fogColorB: 0.01,
    entityTypes: ['hound', 'smiler', 'smiler'],
    roomPool: ['pipe_corridor', 'pipe_junction', 'pipe_wide', 'pipe_vent_room'],
    floorTexName: 'concrete',
    ambientProfile: 'pipes',
  },
  electrical: {
    name: 'Electrical Station — Level 3',
    wallTypes: [T.WALL_BRICK_RED, T.WALL_BRICK_RED, T.WALL_BRICK],
    floorType: T.FLOOR_CONCRETE,
    ambientBase: 0.07,
    fogDensity: 0.10,
    fogColorR: 0.05, fogColorG: 0.03, fogColorB: 0.01,
    entityTypes: ['hound', 'deathmoth', 'deathmoth'],
    roomPool: ['electrical_room', 'electrical_corridor', 'electrical_junction', 'electrical_switch_room'],
    floorTexName: 'concrete',
    ambientProfile: 'electrical',
  },
  poolrooms: {
    name: 'The Poolrooms — Sublimity',
    wallTypes: [T.WALL_TILE],
    floorType: T.FLOOR_POOL,
    ambientBase: 0.88,     // VERY BRIGHT — soft indoor daylight
    fogDensity: 0.012,
    fogColorR: 0.04, fogColorG: 0.06, fogColorB: 0.09,
    entityTypes: [],       // healing zone — completely safe
    roomPool: ['pool_chamber', 'pool_chamber', 'pool_corridor', 'pool_dark_room'],
    floorTexName: 'poolFloor',
    ambientProfile: 'poolrooms',
    isHealing: true,
  },
  party: {
    name: 'Level Fun — The Party',
    wallTypes: [T.WALL_PARTY],
    floorType: T.FLOOR_PARTY,
    ambientBase: 0.72,
    fogDensity: 0.018,
    fogColorR: 0.12, fogColorG: 0.04, fogColorB: 0.12,
    entityTypes: ['partygoer', 'partygoer', 'partygoer'],
    roomPool: ['party_main', 'party_main', 'party_corridor', 'party_table_room'],
    floorTexName: 'partyFloor',
    ambientProfile: 'party',
  },
  office: {
    name: 'Level 4 — The Abandoned Office',
    wallTypes: [T.WALL_PAPER, T.WALL_TILE],
    floorType: T.FLOOR_CARPET,
    ambientBase: 0.42,
    fogDensity: 0.05,
    fogColorR: 0.01, fogColorG: 0.01, fogColorB: 0.01,
    entityTypes: ['hound', 'faceling', 'faceling', 'duller'],
    roomPool: ['office_open_plan', 'office_corridor', 'office_open_plan', 'vending_room', 'boardroom', 'break_room'],
    floorTexName: 'carpet',
    ambientProfile: 'office',
  },
  suburbs: {
    name: 'Level 9 — Darkened Suburbs',
    wallTypes: [T.WALL_WOOD, T.WALL_BRICK],
    floorType: T.FLOOR_ROAD,
    ambientBase: 0.03,
    fogDensity: 0.13,
    fogColorR: 0.00, fogColorG: 0.00, fogColorB: 0.02,
    entityTypes: ['hound', 'smiler', 'smiler', 'the_mangled', 'deathmoth', 'wretch'],
    roomPool: ['suburb_road', 'house_interior', 'garage', 'suburb_road', 'cul_de_sac'],
    floorTexName: 'road',
    skyKey: 'suburbs',
    ambientProfile: 'suburbs',
    shrinkingFog: true,
  },
  city: {
    name: 'Level 11 — The Endless City',
    wallTypes: [T.WALL_CONCRETE, T.WALL_BRICK, T.WALL_METAL],
    floorType: T.FLOOR_CONCRETE,
    ambientBase: 0.07,
    fogDensity: 0.09,
    fogColorR: 0.01, fogColorG: 0.01, fogColorB: 0.03,
    entityTypes: ['faceling', 'faceling', 'hound'],
    roomPool: ['city_block', 'city_block', 'skyscraper_lobby', 'apartment_floor', 'shop_interior'],
    floorTexName: 'concrete',
    skyKey: 'city',
    ambientProfile: 'city',
    smogSanityDrain: 0.4,
  },
  mall: {
    name: 'Level 33 — The Infinite Mall',
    wallTypes: [T.WALL_TILE, T.WALL_PAPER],
    floorType: T.FLOOR_TILE,
    ambientBase: 0.38,
    fogDensity: 0.07,
    fogColorR: 0.02, fogColorG: 0.02, fogColorB: 0.03,
    entityTypes: ['partygoer', 'hound', 'smiler'],
    roomPool: ['mall_atrium', 'store_interior', 'food_court', 'flooded_wing', 'arcade_room', 'mall_atrium'],
    floorTexName: 'poolTile',
    ambientProfile: 'mall',
    distanceCorruption: true,
  },
  dreamcore: {
    name: 'Level 94 — Dreamcore Hills',
    wallTypes: [T.WALL_WOOD],
    floorType: T.FLOOR_GRASS,
    ambientBase: 0.78,
    fogDensity: 0.03,
    fogColorR: 0.10, fogColorG: 0.14, fogColorB: 0.18,
    entityTypes: ['animations'],
    roomPool: ['open_hills', 'dreamcore_house', 'van_stop', 'open_hills', 'water_tower', 'castle_approach'],
    floorTexName: 'grass',
    skyKey: 'dreamcore',
    ambientProfile: 'dreamcore',
    dayNightCycle: true,
  },
  hospital: {
    name: 'Level ! — Run For Your Life',
    wallTypes: [T.WALL_TILE],
    floorType: T.FLOOR_TILE,
    ambientBase: 0.12,
    fogDensity: 0.08,
    fogColorR: 0.12, fogColorG: 0.00, fogColorB: 0.00,
    entityTypes: ['smiler', 'partygoer'],
    roomPool: ['hospital_corridor', 'ward', 'nurses_station'],
    floorTexName: 'hospitalTile',
    ambientProfile: 'hospital',
    sprintLevel: true,
  },
};

function getTheme(level) {
  if (level <= 2) return LEVEL_THEMES.lobby;
  if (level <= 4) return LEVEL_THEMES.warehouse;
  if (level === 5) return LEVEL_THEMES.pipes;
  if (level <= 7) return LEVEL_THEMES.electrical;
  if (level <= 9) return LEVEL_THEMES.office;
  if (level <= 11) return LEVEL_THEMES.suburbs;
  if (level <= 13) return LEVEL_THEMES.city;
  if (level <= 15) return LEVEL_THEMES.mall;
  if (level <= 17) return LEVEL_THEMES.poolrooms;
  if (level <= 19) return LEVEL_THEMES.dreamcore;
  if (level === 20) return LEVEL_THEMES.party;
  if (level === 21) return LEVEL_THEMES.hospital;
  return LEVEL_THEMES.party;
}

// ── LOBBY ROOM TEMPLATES ─────────────────────────────────────────────────────
function lobby_standard(map, x, y, w, h, theme) {
  map.carveRoom(x, y, w, h, pick(theme.wallTypes), theme.floorType, theme.ceilType ?? 1);
  // Evenly spaced ceiling lights — some broken for variety
  for (let lx = x + 3; lx < x + w - 2; lx += 5) {
    for (let ly = y + 3; ly < y + h - 2; ly += 5) {
      map.setCeiling(lx, ly, Math.random() < 0.15 ? 2 : 1);
    }
  }
  if (h > 6 && Math.random() < 0.3) map.set(rng(x+1, x+w-2), y+1, T.LOCKER_CLOSED);
  return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) };
}

function lobby_corridor(map, x, y, w, h, theme) {
  map.carveRoom(x, y, w, h, T.WALL_PAPER, theme.floorType, 0);
  const step = rng(5, 8);
  const isHoriz = w > h;
  if (isHoriz) {
    for (let lx = x + step; lx < x + w - 1; lx += step)
      map.setCeiling(lx, y + Math.floor(h/2), Math.random() < 0.2 ? 2 : 1);
  } else {
    for (let ly = y + step; ly < y + h - 1; ly += step)
      map.setCeiling(x + Math.floor(w/2), ly, Math.random() < 0.2 ? 2 : 1);
  }
  return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) };
}

function lobby_void(map, x, y, w, h, theme) {
  map.carveRoom(x, y, w, h, T.WALL_PAPER, theme.floorType, 1);
  for (let i = 0; i < rng(2, 4); i++)
    map.setCeiling(rng(x+2, x+w-3), rng(y+2, y+h-3), Math.random() < 0.3 ? 2 : 1);
  map.specialTiles.set(`${x+Math.floor(w/2)},${y+Math.floor(h/2)}`, { type: 'liminal' });
  return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) };
}

// ── WAREHOUSE ROOM TEMPLATES ─────────────────────────────────────────────────
function warehouse_bay(map, x, y, w, h, theme) {
  map.carveRoom(x, y, w, h, pick(theme.wallTypes), theme.floorType, 0);
  // Concrete pillars in grid pattern
  for (let py = y + 3; py < y + h - 2; py += 4)
    for (let px = x + 3; px < x + w - 2; px += 5)
      map.set(px, py, T.WALL_CONCRETE);
  map.addLight(x + w/2, y + h/2, 10, 0.5, 1.0, 0.88, 0.55, 2.5);
  map.setCeiling(x + 2, y + 2, Math.random() < 0.5 ? 2 : 1);
  return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) };
}

function warehouse_corridor(map, x, y, w, h, theme) {
  map.carveRoom(x, y, w, h, T.WALL_CONCRETE, theme.floorType, 0);
  map.addLight(x + w/2, y + h/2, 7, 0.4, 1.0, 0.88, 0.55, 3.0);
  return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) };
}

function warehouse_dark(map, x, y, w, h, theme) {
  map.carveRoom(x, y, w, h, T.WALL_METAL, theme.floorType, 2);
  // No ceiling lights — just darkness and fear
  return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) };
}

// ── PIPE ROOM TEMPLATES ──────────────────────────────────────────────────────
function pipe_corridor(map, x, y, w, h, theme) {
  map.carveRoom(x, y, w, h, T.WALL_PIPE, theme.floorType, 2);
  const step = rng(8, 14);
  const isHoriz = w > h;
  if (isHoriz) {
    for (let lx = x + step; lx < x + w - 1; lx += step)
      map.addLight(lx, y + Math.floor(h/2), 3, 0.3, 0.7, 0.1, 0.1); // emergency red
  } else {
    for (let ly = y + step; ly < y + h - 1; ly += step)
      map.addLight(x + Math.floor(w/2), ly, 3, 0.3, 0.7, 0.1, 0.1);
  }
  return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) };
}

function pipe_junction(map, x, y, w, h, theme) {
  const cw = Math.max(w, 6), ch = Math.max(h, 6);
  map.carveRoom(x, y, cw, ch, T.WALL_PIPE, theme.floorType, 2);
  map.addLight(x + cw/2, y + ch/2, 4, 0.3, 0.7, 0.1, 0.1);
  return { cx: x + Math.floor(cw/2), cy: y + Math.floor(ch/2) };
}

function pipe_wide(map, x, y, w, h, theme) {
  map.carveRoom(x, y, w, h, T.WALL_PIPE, theme.floorType, 2);
  for (let dy2 = y + 2; dy2 < y + h - 2; dy2 += 4) {
    if (Math.random() < 0.35) map.set(x + 1, dy2, T.WALL_PIPE);
    if (Math.random() < 0.35) map.set(x + w - 2, dy2, T.WALL_PIPE);
  }
  map.addLight(x + w/2, y + h/2, 4, 0.25, 0.7, 0.1, 0.1);
  return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) };
}

// ── ELECTRICAL ROOM TEMPLATES ────────────────────────────────────────────────
function electrical_room(map, x, y, w, h, theme) {
  map.carveRoom(x, y, w, h, pick(theme.wallTypes), theme.floorType, 0);
  map.addLight(x + w/2, y + h/2, 9, 0.6, 1.0, 0.65, 0.18, 1.5);
  if (w > 8 && h > 7) {
    map.set(x + 2, y + 2, T.WALL_METAL);
    map.set(x + 3, y + 2, T.WALL_METAL);
    map.set(x + w - 3, y + h - 3, T.WALL_METAL);
    map.set(x + w - 4, y + h - 3, T.WALL_METAL);
  }
  return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) };
}

function electrical_corridor(map, x, y, w, h, theme) {
  map.carveRoom(x, y, w, h, T.WALL_BRICK_RED, theme.floorType, 0);
  map.addLight(x + w/2, y + h/2, 6, 0.45, 1.0, 0.62, 0.15, 2.0);
  return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) };
}

function electrical_junction(map, x, y, w, h, theme) {
  const mx = x + Math.floor(w/2), my = y + Math.floor(h/2);
  map.carveRoom(mx - 3, my - 3, 6, 6, T.WALL_BRICK_RED, theme.floorType, 0);
  if (mx - x > 3) map.carveRoom(x, my - 1, mx - x - 3, 2, T.WALL_BRICK_RED, theme.floorType, 0);
  if (x + w - mx - 3 > 0) map.carveRoom(mx + 3, my - 1, x + w - mx - 3, 2, T.WALL_BRICK_RED, theme.floorType, 0);
  if (my - y > 3) map.carveRoom(mx - 1, y, 2, my - y - 3, T.WALL_BRICK_RED, theme.floorType, 0);
  if (y + h - my - 3 > 0) map.carveRoom(mx - 1, my + 3, 2, y + h - my - 3, T.WALL_BRICK_RED, theme.floorType, 0);
  map.addLight(mx, my, 10, 0.65, 1.0, 0.58, 0.12, 2.5);
  return { cx: mx, cy: my };
}

// ── POOLROOM TEMPLATES ───────────────────────────────────────────────────────
function pool_chamber(map, x, y, w, h, theme) {
  map.carveRoom(x, y, w, h, T.WALL_TILE, T.FLOOR_POOL, 1);
  for (let cy2 = y + 1; cy2 < y + h - 1; cy2++)
    for (let cx2 = x + 1; cx2 < x + w - 1; cx2++)
      map.setFloor(cx2, cy2, T.FLOOR_POOL);
  map.addLight(x + w/2, y + h/2, 18, 1.0, 1.0, 1.0, 1.0);
  return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) };
}

function pool_corridor(map, x, y, w, h, theme) {
  map.carveRoom(x, y, w, h, T.WALL_TILE, T.FLOOR_POOL, 1);
  for (let cy2 = y + 1; cy2 < y + h - 1; cy2++)
    for (let cx2 = x + 1; cx2 < x + w - 1; cx2++)
      map.setFloor(cx2, cy2, T.FLOOR_POOL);
  map.addLight(x + w/2, y + h/2, 12, 0.9, 1.0, 1.0, 1.0);
  return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) };
}

function pool_dark_room(map, x, y, w, h, theme) {
  // Dark-tiled sub-room — looks similar but deadly
  map.carveRoom(x, y, w, h, T.WALL_TILE, T.FLOOR_DARK, 0);
  for (let cy2 = y + 1; cy2 < y + h - 1; cy2++) {
    for (let cx2 = x + 1; cx2 < x + w - 1; cx2++) {
      map.setFloor(cx2, cy2, T.FLOOR_DARK);
      map.specialTiles.set(`${cx2},${cy2}`, { type: 'dark_tile_hazard' });
    }
  }
  return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) };
}

// ── PARTY ROOM TEMPLATES ──────────────────────────────────────────────────────
function party_main(map, x, y, w, h, theme) {
  map.carveRoom(x, y, w, h, T.WALL_PARTY, T.FLOOR_PARTY, 1);
  map.addLight(x + w/2, y + h/2, 16, 1.0, 1.0, 1.0, 1.0);
  // Lockers as hiding spots (tables)
  if (h > 6 && Math.random() < 0.7) map.set(rng(x+2, x+w-3), y+1, T.LOCKER_CLOSED);
  if (w > 10 && Math.random() < 0.5) map.set(rng(x+2, x+w-3), y+h-2, T.LOCKER_CLOSED);
  map.specialTiles.set(`${x+Math.floor(w/2)},${y+Math.floor(h/2)}`, { type: 'party_room' });
  return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) };
}

function party_corridor(map, x, y, w, h, theme) {
  map.carveRoom(x, y, w, h, T.WALL_PARTY, T.FLOOR_PARTY, 1);
  map.addLight(x + w/2, y + h/2, 12, 0.9, 1.0, 1.0, 1.0);
  return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) };
}

// ── EXTRA ATMOSPHERE ROOMS ───────────────────────────────────────────────────

// Ultra-long void corridor — the liminal horror of infinite sameness
function lobby_void_corridor(map, x, y, w, h, theme) {
  const len = Math.max(w, h, 28); // force long corridor
  const isHoriz = Math.random() < 0.5;
  const rw = isHoriz ? len : 3, rh = isHoriz ? 3 : len;
  const cx2 = x + Math.floor(rw / 2), cy2 = y + Math.floor(rh / 2);
  map.carveRoom(x, y, Math.min(rw, MAP_W - x - 2), Math.min(rh, map.h - y - 2), T.WALL_PAPER, theme.floorType, 1);
  // Identical ceiling lights at regular intervals — OCD regularity = dread
  if (isHoriz) {
    for (let lx2 = x + 4; lx2 < x + rw - 2; lx2 += 6) map.setCeiling(lx2, cy2, 1);
  } else {
    for (let ly2 = y + 4; ly2 < y + rh - 2; ly2 += 6) map.setCeiling(cx2, ly2, 1);
  }
  map.specialTiles.set(`${cx2},${cy2}`, { type: 'liminal' });
  return { cx: cx2, cy: cy2 };
}

// Pillar forest — warehouse with dense pillar grid, hounds lurk between
function warehouse_pillar_forest(map, x, y, w, h, theme) {
  const fw = Math.max(w, 14), fh = Math.max(h, 14);
  map.carveRoom(x, y, fw, fh, T.WALL_CONCRETE, theme.floorType, 0);
  // Grid of pillars — entities path around them
  for (let py2 = y + 3; py2 < y + fh - 2; py2 += 3)
    for (let px2 = x + 3; px2 < x + fw - 2; px2 += 3)
      if (Math.random() < 0.6) map.set(px2, py2, T.WALL_CONCRETE);
  // Dim amber light — shadows everywhere
  map.addLight(x + fw/2, y + fh/2, 12, 0.35, 1.0, 0.78, 0.35, 3.5);
  return { cx: x + Math.floor(fw/2), cy: y + Math.floor(fh/2) };
}

// Switch room — find the breaker to unlock the path
function electrical_switch_room(map, x, y, w, h, theme) {
  map.carveRoom(x, y, w, h, T.WALL_BRICK_RED, theme.floorType, 0);
  map.addLight(x + w/2, y + h/2, 8, 0.7, 1.0, 0.55, 0.08, 1.5);
  // Circuit breaker boxes on walls
  if (w > 7) {
    map.set(x + 2, y + 1, T.WALL_METAL);
    map.set(x + w - 3, y + 1, T.WALL_METAL);
  }
  map.specialTiles.set(`${x+Math.floor(w/2)},${y+Math.floor(h/2)}`, { type: 'event_scream' });
  return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) };
}

// Vent room — narrow room with a vent that could be a shortcut
function pipe_vent_room(map, x, y, w, h, theme) {
  const rw = Math.max(w, 5), rh = Math.max(h, 4);
  map.carveRoom(x, y, rw, rh, T.WALL_PIPE, theme.floorType, 2);
  // Vent openings marked by VENT tile
  if (rw > 6) {
    map.set(x + 1, y + Math.floor(rh / 2), T.VENT);
    map.set(x + rw - 2, y + Math.floor(rh / 2), T.VENT);
  }
  map.addLight(x + rw/2, y + rh/2, 3, 0.25, 0.7, 0.1, 0.1);
  return { cx: x + Math.floor(rw/2), cy: y + Math.floor(rh/2) };
}

// Flooded room — ankle-deep water, eerie reflections
function warehouse_flooded(map, x, y, w, h, theme) {
  map.carveRoom(x, y, w, h, T.WALL_CONCRETE, T.FLOOR_POOL, 0);
  for (let cy2 = y + 1; cy2 < y + h - 1; cy2++)
    for (let cx2 = x + 1; cx2 < x + w - 1; cx2++)
      map.setFloor(cx2, cy2, T.FLOOR_POOL);
  map.addLight(x + w/2, y + h/2, 8, 0.3, 0.6, 0.8, 1.0);
  map.specialTiles.set(`${x+Math.floor(w/2)},${y+Math.floor(h/2)}`, { type: 'flooded' });
  return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) };
}

// ── OFFICE ROOM TEMPLATES ─────────────────────────────────────────────────────
function office_open_plan(map, x, y, w, h, theme) {
  map.carveRoom(x, y, w, h, pick(theme.wallTypes), theme.floorType, 1);
  // Cubicle partition grid
  for (let py2 = y + 3; py2 < y + h - 2; py2 += 4)
    for (let px2 = x + 3; px2 < x + w - 2; px2 += 5)
      if (Math.random() < 0.5) map.set(px2, py2, T.WALL_PAPER);
  // Vending machine on a wall
  if (w > 8) map.set(x + rng(2, w - 3), y + 1, T.VENDING_MACHINE);
  map.addLight(x + w/2, y + h/2, 12, 0.8, 1.0, 1.0, 0.98, 1.0);
  return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) };
}

function office_corridor(map, x, y, w, h, theme) {
  const rw = Math.max(w, 16), rh = Math.min(h, 4);
  map.carveRoom(x, y, rw, rh, T.WALL_PAPER, theme.floorType, 1);
  for (let lx2 = x + 4; lx2 < x + rw - 2; lx2 += 6)
    map.addLight(lx2, y + Math.floor(rh/2), 8, 0.7, 1.0, 1.0, 0.98, 1.2);
  // Doors along the corridor
  for (let dx2 = x + 3; dx2 < x + rw - 3; dx2 += 6)
    if (Math.random() < 0.5) map.set(dx2, y + 1, T.DOOR_CLOSED);
  return { cx: x + Math.floor(rw/2), cy: y + Math.floor(rh/2) };
}

function vending_room(map, x, y, w, h, theme) {
  const rw = Math.max(w, 8), rh = Math.max(h, 8);
  map.carveRoom(x, y, rw, rh, T.WALL_TILE, theme.floorType, 1);
  // 4 vending machines on walls
  map.set(x + 2, y + 1, T.VENDING_MACHINE);
  map.set(x + 4, y + 1, T.VENDING_MACHINE);
  if (rw > 8) { map.set(x + 2, y + rh - 2, T.VENDING_MACHINE); map.set(x + 4, y + rh - 2, T.VENDING_MACHINE); }
  map.addLight(x + rw/2, y + rh/2, 10, 0.85, 1.0, 1.0, 0.95, 0.8);
  // Guaranteed loot
  map.items.push({ x: x + Math.floor(rw/2) + 0.5, y: y + Math.floor(rh/2) + 0.5, type: 'battery' });
  map.items.push({ x: x + Math.floor(rw/2) - 1 + 0.5, y: y + Math.floor(rh/2) + 0.5, type: 'almond_water' });
  return { cx: x + Math.floor(rw/2), cy: y + Math.floor(rh/2) };
}

function boardroom(map, x, y, w, h, theme) {
  const rw = Math.max(w, 10), rh = Math.max(h, 10);
  map.carveRoom(x, y, rw, rh, T.WALL_TILE, theme.floorType, 1);
  // TABLE tiles in center
  for (let tx2 = x + 2; tx2 < x + rw - 2; tx2++)
    if (Math.abs(tx2 - (x + Math.floor(rw/2))) <= 2) map.set(tx2, y + Math.floor(rh/2), T.TABLE);
  map.addLight(x + rw/2, y + rh/2, 12, 0.75, 1.0, 1.0, 0.95, 0.9);
  return { cx: x + Math.floor(rw/2), cy: y + Math.floor(rh/2) };
}

function break_room(map, x, y, w, h, theme) {
  map.carveRoom(x, y, w, h, T.WALL_PAPER, theme.floorType, 1);
  // Lockers and guaranteed loot
  if (w > 6) { map.set(x + 2, y + 1, T.LOCKER_CLOSED); map.set(x + w - 3, y + 1, T.LOCKER_CLOSED); }
  map.addLight(x + w/2, y + h/2, 9, 0.8, 1.0, 1.0, 0.95, 0.9);
  map.items.push({ x: x + Math.floor(w/2) + 0.5, y: y + Math.floor(h/2) + 0.5, type: 'almond_water' });
  return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) };
}

// ── SUBURBS ROOM TEMPLATES ────────────────────────────────────────────────────
function suburb_road(map, x, y, w, h, theme) {
  const rw = Math.max(w, 20), rh = Math.max(h, 12);
  // Open road section with floor
  for (let ry2 = y; ry2 < y + rh; ry2++)
    for (let rx2 = x; rx2 < x + rw; rx2++) {
      map.set(rx2, ry2, T.EMPTY);
      map.setFloor(rx2, ry2, T.FLOOR_ROAD);
      map.setCeiling(rx2, ry2, 2); // outdoor sky
    }
  // House facades on top and bottom edges
  for (let fx2 = x + 1; fx2 < x + rw - 1; fx2 += 6) {
    if (fx2 + 4 < x + rw - 1) {
      for (let fw2 = fx2; fw2 < fx2 + 5; fw2++) {
        map.set(fw2, y, T.WALL_WOOD);
        map.set(fw2, y + rh - 1, T.WALL_WOOD);
      }
      map.set(fx2 + 2, y, T.WINDOW);
      map.set(fx2 + 2, y + rh - 1, T.WINDOW);
    }
  }
  return { cx: x + Math.floor(rw/2), cy: y + Math.floor(rh/2) };
}

function house_interior(map, x, y, w, h, theme) {
  const rw = Math.max(w, 8), rh = Math.max(h, 8);
  map.carveRoom(x, y, rw, rh, T.WALL_WOOD, T.FLOOR_WOOD, 0);
  map.set(x + 2, y + 1, T.LOCKER_CLOSED);
  if (rw > 8) map.set(x + rw - 3, y + rh - 2, T.LOCKER_CLOSED);
  map.set(x + Math.floor(rw/2), y, T.DOOR_CLOSED);
  map.items.push({ x: x + rng(2, rw - 2) + 0.5, y: y + rng(2, rh - 2) + 0.5, type: pick(['battery', 'medkit', 'almond_water', 'pockets']) });
  return { cx: x + Math.floor(rw/2), cy: y + Math.floor(rh/2) };
}

function garage(map, x, y, w, h, theme) {
  const rw = Math.max(w, 6), rh = Math.max(h, 8);
  map.carveRoom(x, y, rw, rh, T.WALL_CONCRETE, T.FLOOR_CONCRETE, 0);
  map.set(x + Math.floor(rw/2), y, T.DOOR_CLOSED);
  map.items.push({ x: x + Math.floor(rw/2) + 0.5, y: y + Math.floor(rh/2) + 0.5, type: pick(['tool', 'weapon_part', 'pipe']) });
  return { cx: x + Math.floor(rw/2), cy: y + Math.floor(rh/2) };
}

function cul_de_sac(map, x, y, w, h, theme) {
  const rw = Math.max(w, 24), rh = Math.max(h, 20);
  for (let ry2 = y; ry2 < y + rh; ry2++)
    for (let rx2 = x; rx2 < x + rw; rx2++) { map.set(rx2, ry2, T.EMPTY); map.setFloor(rx2, ry2, T.FLOOR_ROAD); map.setCeiling(rx2, ry2, 2); }
  // 4 embedded house blocks at corners
  const corners = [[x+1, y+1], [x+rw-7, y+1], [x+1, y+rh-9], [x+rw-7, y+rh-9]];
  for (const [hx2, hy2] of corners) {
    map.carveRoom(hx2, hy2, 6, 8, T.WALL_WOOD, T.FLOOR_WOOD, 0);
    map.set(hx2 + 3, hy2, T.DOOR_CLOSED);
    map.items.push({ x: hx2 + 3.5, y: hy2 + 4.5, type: pick(['battery', 'medkit', 'almond_water']) });
  }
  return { cx: x + Math.floor(rw/2), cy: y + Math.floor(rh/2) };
}

// ── CITY ROOM TEMPLATES ───────────────────────────────────────────────────────
function city_block(map, x, y, w, h, theme) {
  const rw = Math.max(w, 22), rh = Math.max(h, 22);
  // Open block — skyscraper facades as walls
  for (let ry2 = y; ry2 < y + rh; ry2++)
    for (let rx2 = x; rx2 < x + rw; rx2++) { map.set(rx2, ry2, T.EMPTY); map.setFloor(rx2, ry2, T.FLOOR_CONCRETE); map.setCeiling(rx2, ry2, 2); }
  for (let wx2 = x; wx2 < x + rw; wx2++) { map.set(wx2, y, pick(theme.wallTypes)); map.set(wx2, y + rh - 1, pick(theme.wallTypes)); }
  for (let wy2 = y; wy2 < y + rh; wy2++) { map.set(x, wy2, pick(theme.wallTypes)); map.set(x + rw - 1, wy2, pick(theme.wallTypes)); }
  // Windows in facades
  for (let wx3 = x + 2; wx3 < x + rw - 2; wx3 += 3) { map.set(wx3, y, T.WINDOW); map.set(wx3, y + rh - 1, T.WINDOW); }
  return { cx: x + Math.floor(rw/2), cy: y + Math.floor(rh/2) };
}

function skyscraper_lobby(map, x, y, w, h, theme) {
  const rw = Math.max(w, 10), rh = Math.max(h, 14);
  map.carveRoom(x, y, rw, rh, T.WALL_TILE, T.FLOOR_TILE, 1);
  map.addLight(x + rw/2, y + rh/2, 12, 0.6, 1.0, 1.0, 1.0);
  map.set(x + 2, y + 1, T.LOCKER_CLOSED);
  map.items.push({ x: x + Math.floor(rw/2) + 0.5, y: y + Math.floor(rh/2) + 0.5, type: pick(['security_keycard', 'key', 'compass']) });
  return { cx: x + Math.floor(rw/2), cy: y + Math.floor(rh/2) };
}

function apartment_floor(map, x, y, w, h, theme) {
  const rw = Math.max(w, 18), rh = Math.max(h, 14);
  map.carveRoom(x, y, rw, rh, T.WALL_CONCRETE, T.FLOOR_CONCRETE, 0);
  // 4 unit partitions
  for (let unit = 0; unit < 4; unit++) {
    const ux = x + 1 + (unit % 2) * Math.floor(rw/2), uy = y + 1 + Math.floor(unit / 2) * Math.floor(rh/2);
    const uw = Math.floor(rw/2) - 2, uh = Math.floor(rh/2) - 2;
    if (uw > 3 && uh > 3) {
      for (let px3 = ux; px3 < ux + uw; px3++) map.set(px3, uy, T.WALL_WOOD);
      for (let py3 = uy; py3 < uy + uh; py3++) map.set(ux, py3, T.WALL_WOOD);
      map.set(ux + Math.floor(uw/2), uy, T.DOOR_CLOSED);
      map.items.push({ x: ux + Math.floor(uw/2) + 0.5, y: uy + Math.floor(uh/2) + 0.5, type: pick(['battery', 'almond_water', 'medkit']) });
    }
  }
  return { cx: x + Math.floor(rw/2), cy: y + Math.floor(rh/2) };
}

function shop_interior(map, x, y, w, h, theme) {
  const rw = Math.max(w, 10), rh = Math.max(h, 8);
  map.carveRoom(x, y, rw, rh, T.WALL_TILE, T.FLOOR_TILE, 1);
  map.addLight(x + rw/2, y + rh/2, 10, 0.7, 1.0, 1.0, 0.95);
  map.set(x + 2, y + 1, T.LOCKER_CLOSED);
  map.set(x + rw - 3, y + 1, T.LOCKER_CLOSED);
  map.items.push({ x: x + Math.floor(rw/2) + 0.5, y: y + Math.floor(rh/2) + 0.5, type: pick(['almond_water', 'almond_water_pure', 'medkit', 'night_vision_goggles']) });
  return { cx: x + Math.floor(rw/2), cy: y + Math.floor(rh/2) };
}

// ── MALL ROOM TEMPLATES ───────────────────────────────────────────────────────
function mall_atrium(map, x, y, w, h, theme) {
  const rw = Math.max(w, 22), rh = Math.max(h, 22);
  map.carveRoom(x, y, rw, rh, T.WALL_TILE, T.FLOOR_TILE, 1);
  map.addLight(x + rw/2, y + rh/2, 20, 0.9, 1.0, 1.0, 0.98);
  // Food court tables in center
  for (let tx2 = x + rw/2 - 4; tx2 < x + rw/2 + 4; tx2 += 2)
    map.set(Math.floor(tx2), y + Math.floor(rh/2), T.TABLE);
  return { cx: x + Math.floor(rw/2), cy: y + Math.floor(rh/2) };
}

function store_interior(map, x, y, w, h, theme) {
  const rw = Math.max(w, 10), rh = Math.max(h, 8);
  map.carveRoom(x, y, rw, rh, T.WALL_PAPER, T.FLOOR_TILE, 1);
  map.addLight(x + rw/2, y + rh/2, 9, 0.8, 1.0, 1.0, 0.98);
  map.set(x + 2, y + 1, T.LOCKER_CLOSED);
  if (rw > 8) map.set(x + rw - 3, y + 1, T.LOCKER_CLOSED);
  map.items.push({ x: x + Math.floor(rw/2) + 0.5, y: y + Math.floor(rh/2) + 0.5, type: pick(['almond_water', 'battery', 'medkit', 'pockets']) });
  return { cx: x + Math.floor(rw/2), cy: y + Math.floor(rh/2) };
}

function food_court(map, x, y, w, h, theme) {
  const rw = Math.max(w, 16), rh = Math.max(h, 14);
  map.carveRoom(x, y, rw, rh, T.WALL_TILE, T.FLOOR_TILE, 1);
  map.addLight(x + rw/2, y + rh/2, 16, 0.85, 1.0, 1.0, 0.98);
  for (let tx2 = x + 3; tx2 < x + rw - 3; tx2 += 4)
    map.set(tx2, y + Math.floor(rh/2), T.TABLE);
  map.items.push({ x: x + 3.5, y: y + 3.5, type: 'almond_water' });
  map.items.push({ x: x + rw - 3.5, y: y + 3.5, type: 'almond_water_pure' });
  return { cx: x + Math.floor(rw/2), cy: y + Math.floor(rh/2) };
}

function flooded_wing(map, x, y, w, h, theme) {
  map.carveRoom(x, y, w, h, T.WALL_WET, T.FLOOR_POOL, 0);
  for (let cy2 = y + 1; cy2 < y + h - 1; cy2++)
    for (let cx2 = x + 1; cx2 < x + w - 1; cx2++)
      map.setFloor(cx2, cy2, T.FLOOR_POOL);
  map.addLight(x + w/2, y + h/2, 8, 0.25, 0.4, 0.6, 0.9);
  return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) };
}

function arcade_room(map, x, y, w, h, theme) {
  const rw = Math.max(w, 10), rh = Math.max(h, 10);
  map.carveRoom(x, y, rw, rh, T.WALL_TILE, T.FLOOR_TILE, 1);
  map.addLight(x + rw/2, y + rh/2, 12, 0.7, 1.0, 0.7, 1.0);
  // Arcade machines on walls
  for (let ax2 = x + 2; ax2 < x + rw - 2; ax2 += 3) map.set(ax2, y + 1, T.ARCADE_MACHINE);
  // Guaranteed rare loot
  map.items.push({ x: x + Math.floor(rw/2) + 0.5, y: y + Math.floor(rh/2) + 0.5, type: pick(['compass', 'map_upgrade', 'night_vision_goggles', 'almond_water_pure']) });
  return { cx: x + Math.floor(rw/2), cy: y + Math.floor(rh/2) };
}

// ── DREAMCORE ROOM TEMPLATES ──────────────────────────────────────────────────
function open_hills(map, x, y, w, h, theme) {
  const rw = Math.max(w, 28), rh = Math.max(h, 28);
  for (let ry2 = y; ry2 < y + rh; ry2++)
    for (let rx2 = x; rx2 < x + rw; rx2++) { map.set(rx2, ry2, T.EMPTY); map.setFloor(rx2, ry2, T.FLOOR_GRASS); map.setCeiling(rx2, ry2, 2); }
  // Low fence blocks scattered
  for (let i = 0; i < 8; i++) {
    const fx2 = x + rng(2, rw - 4), fy2 = y + rng(2, rh - 4);
    for (let fw2 = 0; fw2 < 3; fw2++) map.set(fx2 + fw2, fy2, T.WALL_WOOD);
  }
  map.addLight(x + rw/2, y + rh/2, 30, 1.0, 1.0, 1.0, 1.0);
  return { cx: x + Math.floor(rw/2), cy: y + Math.floor(rh/2) };
}

function dreamcore_house(map, x, y, w, h, theme) {
  const rw = Math.max(w, 10), rh = Math.max(h, 10);
  map.carveRoom(x, y, rw, rh, T.WALL_WOOD, T.FLOOR_WOOD, 1);
  map.addLight(x + rw/2, y + rh/2, 10, 0.9, 1.0, 1.0, 0.95);
  map.set(x + 3, y + Math.floor(rh/2), T.TABLE);
  map.set(x + 2, y + 1, T.LOCKER_CLOSED);
  map.set(x + Math.floor(rw/2), y, T.DOOR_CLOSED);
  map.items.push({ x: x + 3.5, y: y + 3.5, type: pick(['almond_water', 'battery', 'idol', 'compass']) });
  return { cx: x + Math.floor(rw/2), cy: y + Math.floor(rh/2) };
}

function van_stop(map, x, y, w, h, theme) {
  const rw = 8, rh = 5;
  map.carveRoom(x, y, rw, rh, T.WALL_METAL, T.FLOOR_WOOD, 0);
  map.set(x, y + Math.floor(rh/2), T.DOOR_CLOSED);
  map.items.push({ x: x + 2.5, y: y + 2.5, type: pick(['battery', 'almond_water', 'medkit', 'moth_jelly']) });
  map.items.push({ x: x + 5.5, y: y + 2.5, type: pick(['battery', 'almond_water']) });
  return { cx: x + Math.floor(rw/2), cy: y + Math.floor(rh/2) };
}

function water_tower(map, x, y, w, h, theme) {
  const rw = 6, rh = 6;
  map.carveRoom(x, y, rw, rh, T.WALL_METAL, T.FLOOR_CONCRETE, 0);
  map.specialTiles.set(`${x+Math.floor(rw/2)},${y+Math.floor(rh/2)}`, { type: 'liminal', text: 'AM I DREAMING?' });
  return { cx: x + Math.floor(rw/2), cy: y + Math.floor(rh/2) };
}

function castle_approach(map, x, y, w, h, theme) {
  // Long brick corridor leading to exit
  const len = 30, corridorW = 4;
  map.carveRoom(x, y, len, corridorW, T.WALL_BRICK, T.FLOOR_GRASS, 2); // outdoor sky
  map.addLight(x + len/2, y + corridorW/2, 20, 1.0, 1.0, 1.0, 0.9);
  return { cx: x + len - 2, cy: y + Math.floor(corridorW/2) };
}

// ── HOSPITAL ROOM TEMPLATES ───────────────────────────────────────────────────
function hospital_corridor(map, x, y, w, h, theme) {
  const rw = Math.max(w, 28), rh = 4;
  map.carveRoom(x, y, rw, rh, T.WALL_TILE, T.FLOOR_TILE, 0);
  // Emergency red lighting
  for (let lx2 = x + 5; lx2 < x + rw - 2; lx2 += 8)
    map.addLight(lx2, y + 2, 5, 0.4, 0.9, 0.05, 0.05, 2.0);
  // Hospital bed obstacles alternating sides
  for (let bx2 = x + 3; bx2 < x + rw - 3; bx2 += 8) {
    if (Math.random() < 0.5) map.set(bx2, y + 1, T.HOSPITAL_BED);
    else map.set(bx2, y + rh - 2, T.HOSPITAL_BED);
  }
  return { cx: x + Math.floor(rw/2), cy: y + Math.floor(rh/2) };
}

function ward(map, x, y, w, h, theme) {
  const rw = Math.max(w, 12), rh = Math.max(h, 10);
  map.carveRoom(x, y, rw, rh, T.WALL_TILE, T.FLOOR_TILE, 0);
  map.addLight(x + rw/2, y + rh/2, 8, 0.35, 0.9, 0.05, 0.05, 1.5);
  // Rows of beds as obstacles
  for (let bx2 = x + 2; bx2 < x + rw - 2; bx2 += 3) {
    map.set(bx2, y + 2, T.HOSPITAL_BED);
    map.set(bx2, y + rh - 3, T.HOSPITAL_BED);
  }
  return { cx: x + Math.floor(rw/2), cy: y + Math.floor(rh/2) };
}

function nurses_station(map, x, y, w, h, theme) {
  const rw = Math.max(w, 8), rh = Math.max(h, 8);
  map.carveRoom(x, y, rw, rh, T.WALL_TILE, T.FLOOR_TILE, 0);
  map.addLight(x + rw/2, y + rh/2, 8, 0.5, 0.9, 0.1, 0.1, 1.5);
  map.set(x + 2, y + 1, T.LOCKER_CLOSED);
  map.items.push({ x: x + 3.5, y: y + rh/2 + 0.5, type: 'battery' });
  map.items.push({ x: x + 5.5, y: y + rh/2 + 0.5, type: 'medkit' });
  return { cx: x + Math.floor(rw/2), cy: y + Math.floor(rh/2) };
}

// ── PARTY TABLE ROOM ──────────────────────────────────────────────────────────
function party_table_room(map, x, y, w, h, theme) {
  const rw = Math.max(w, 12), rh = Math.max(h, 10);
  map.carveRoom(x, y, rw, rh, T.WALL_PARTY, T.FLOOR_PARTY, 1);
  map.addLight(x + rw/2, y + rh/2, 14, 0.95, 1.0, 1.0, 1.0);
  // Tables — crouching near them hides from Partygoers
  for (let tx2 = x + 2; tx2 < x + rw - 2; tx2 += 4) map.set(tx2, y + Math.floor(rh/2), T.TABLE);
  return { cx: x + Math.floor(rw/2), cy: y + Math.floor(rh/2) };
}

// ── ROOM TEMPLATE REGISTRY ───────────────────────────────────────────────────
const ROOM_TEMPLATES = {
  lobby_standard, lobby_corridor, lobby_void, lobby_void_corridor,
  warehouse_bay, warehouse_corridor, warehouse_dark, warehouse_pillar_forest, warehouse_flooded,
  pipe_corridor, pipe_junction, pipe_wide, pipe_vent_room,
  electrical_room, electrical_corridor, electrical_junction, electrical_switch_room,
  pool_chamber, pool_corridor, pool_dark_room,
  party_main, party_corridor, party_table_room,
  office_open_plan, office_corridor, vending_room, boardroom, break_room,
  suburb_road, house_interior, garage, cul_de_sac,
  city_block, skyscraper_lobby, apartment_floor, shop_interior,
  mall_atrium, store_interior, food_court, flooded_wing, arcade_room,
  open_hills, dreamcore_house, van_stop, water_tower, castle_approach,
  hospital_corridor, ward, nurses_station,
};

// ── SPECIAL ROOMS ────────────────────────────────────────────────────────────
function placeSaveRoom(map, x, y, theme) {
  const w = 7, h = 7;
  map.carveRoom(x, y, w, h, T.WALL_SAVE, 0, 1);
  map.setCeiling(x + 2, y + 2, 1);
  map.setCeiling(x + w - 3, y + 2, 1);
  map.setCeiling(x + 2, y + h - 3, 1);
  map.setCeiling(x + w - 3, y + h - 3, 1);
  map.addLight(x + w/2, y + h/2, 8, 1.0, 1.0, 0.85, 0.6);
  map.specialTiles.set(`${x+Math.floor(w/2)},${y+Math.floor(h/2)}`, { type: 'save_room' });
  return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) };
}

// ── HALLWAY CARVER (themed) ──────────────────────────────────────────────────
function carveThemedHallway(map, x1, y1, x2, y2, wallType, floorType) {
  const goHorizFirst = Math.random() < 0.5;
  if (goHorizFirst) {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
      if (x <= 0 || x >= MAP_W - 1) continue;
      map.set(x, y1, T.EMPTY);
      if (y1 - 1 > 0) map.set(x, y1 - 1, T.EMPTY);
      map.setFloor(x, y1, floorType);
      if (y1 - 1 > 0) map.setFloor(x, y1 - 1, floorType);
    }
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      if (y <= 0 || y >= MAP_H - 1) continue;
      map.set(x2, y, T.EMPTY);
      if (x2 + 1 < MAP_W - 1) map.set(x2 + 1, y, T.EMPTY);
      map.setFloor(x2, y, floorType);
      if (x2 + 1 < MAP_W - 1) map.setFloor(x2 + 1, y, floorType);
    }
  } else {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      if (y <= 0 || y >= MAP_H - 1) continue;
      map.set(x1, y, T.EMPTY);
      if (x1 + 1 < MAP_W - 1) map.set(x1 + 1, y, T.EMPTY);
      map.setFloor(x1, y, floorType);
      if (x1 + 1 < MAP_W - 1) map.setFloor(x1 + 1, y, floorType);
    }
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
      if (x <= 0 || x >= MAP_W - 1) continue;
      map.set(x, y2, T.EMPTY);
      if (y2 - 1 > 0) map.set(x, y2 - 1, T.EMPTY);
      map.setFloor(x, y2, floorType);
      if (y2 - 1 > 0) map.setFloor(x, y2 - 1, floorType);
    }
  }
}

// ── MAIN LEVEL GENERATOR ─────────────────────────────────────────────────────
export function generateLevel(level = 1) {
  const map = new GameMap();
  const theme = getTheme(level);

  // Apply theme
  map.ambientBase = theme.ambientBase;
  const themeKey = Object.keys(LEVEL_THEMES).find(k => LEVEL_THEMES[k] === theme) || 'default';
  map.theme = themeKey;
  map.themeConfig = theme;

  // Fill entire map with primary wall type
  map.tiles.fill(theme.wallTypes[0]);

  // Room size ranges per theme
  let minRW, maxRW, minRH, maxRH;
  if (themeKey === 'lobby') {
    minRW = 8; maxRW = 14; minRH = 7; maxRH = 12;
  } else if (themeKey === 'pipes') {
    minRW = 4; maxRW = 9; minRH = 4; maxRH = 7;
  } else if (themeKey === 'poolrooms') {
    minRW = 10; maxRW = 18; minRH = 9; maxRH = 16;
  } else {
    minRW = 6; maxRW = Math.min(15, 8 + level); minRH = 5; maxRH = Math.min(13, 7 + level);
  }

  const rooms = [];
  const targetRooms = 12 + level * 2;
  let attempts = 0;

  while (rooms.length < targetRooms && attempts++ < 700) {
    const w = rng(minRW, maxRW);
    const h = rng(minRH, maxRH);
    const x = rng(2, MAP_W - w - 2);
    const y = rng(2, MAP_H - h - 2);

    // Overlap check with margin
    let overlap = false;
    for (const r of rooms) {
      if (x < r.x + r.w + 2 && x + w > r.x - 2 && y < r.y + r.h + 2 && y + h > r.y - 2) {
        overlap = true; break;
      }
    }
    if (overlap) continue;

    const roomType = rooms.length === 0 ? theme.roomPool[0] : pick(theme.roomPool);
    const fn = ROOM_TEMPLATES[roomType];
    if (!fn) continue;

    const center = fn(map, x, y, w, h, theme);
    rooms.push({ x, y, w, h, type: roomType, cx: center.cx, cy: center.cy });
    map.roomList.push({ x, y, w, h, type: roomType });
  }

  // Connect rooms with themed hallways
  const wallType = theme.wallTypes[0];
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1], b = rooms[i];
    carveThemedHallway(map, a.cx, a.cy, b.cx, b.cy, wallType, theme.floorType);

    // Doors occasionally
    if (Math.random() < 0.35) {
      const mx2 = Math.round((a.cx + b.cx) / 2);
      const my2 = Math.round((a.cy + b.cy) / 2);
      if (!map.isSolid(mx2, my2)) {
        for (const [ddx, ddy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
          const tt = map.get(mx2 + ddx, my2 + ddy);
          if (tt >= 1 && tt <= 18 && tt !== T.DOOR_CLOSED) {
            map.set(mx2 + ddx, my2 + ddy, T.DOOR_CLOSED);
            break;
          }
        }
      }
    }
    // Loop connections
    if (i > 2 && Math.random() < 0.25) {
      const j = rng(Math.max(0, i - 4), i - 2);
      carveThemedHallway(map, rooms[i].cx, rooms[i].cy, rooms[j].cx, rooms[j].cy, wallType, theme.floorType);
    }
  }

  // Spawn at first room
  map.spawnX = rooms[0].cx + 0.5;
  map.spawnY = rooms[0].cy + 0.5;

  // Save rooms
  const saveCount = Math.max(1, Math.floor(rooms.length / 6));
  for (let i = 0; i < saveCount; i++) {
    for (let a2 = 0; a2 < 100; a2++) {
      const sx = rng(3, MAP_W - 12), sy = rng(3, MAP_H - 12);
      let ok = true;
      for (const r of rooms) {
        if (sx < r.x + r.w + 2 && sx + 7 > r.x - 2 && sy < r.y + r.h + 2 && sy + 7 > r.y - 2) {
          ok = false; break;
        }
      }
      if (ok) {
        const sc = placeSaveRoom(map, sx, sy, theme);
        let near = rooms[0], nearD = Infinity;
        for (const r of rooms) {
          const d = Math.abs(r.cx - sc.cx) + Math.abs(r.cy - sc.cy);
          if (d < nearD) { nearD = d; near = r; }
        }
        carveThemedHallway(map, sc.cx, sc.cy, near.cx, near.cy, wallType, theme.floorType);
        break;
      }
    }
  }

  // Loot rooms (dead ends)
  const lootCount = rng(2, 4);
  for (let i = 0; i < lootCount; i++) {
    const r = rooms[rooms.length - 1 - i];
    if (!r) continue;
    const lx = r.cx + pick([-1, 1]) * rng(4, 8);
    const ly = r.cy + pick([-1, 1]) * rng(4, 8);
    if (lx > 3 && lx < MAP_W - 12 && ly > 3 && ly < MAP_H - 12) {
      const lw = rng(5, 8), lh = rng(5, 8);
      map.carveRoom(lx, ly, lw, lh, theme.wallTypes[0], theme.floorType, 0);
      map.specialTiles.set(`${lx+Math.floor(lw/2)},${ly+Math.floor(lh/2)}`, { type: 'loot_room' });
      carveThemedHallway(map, lx + Math.floor(lw/2), ly + Math.floor(lh/2), r.cx, r.cy, wallType, theme.floorType);
      const numItems = rng(2, 5);
      for (let j = 0; j < numItems; j++) {
        map.items.push({
          x: lx + rng(1, lw - 2),
          y: ly + rng(1, lh - 2),
          type: pickLootItem(level, themeKey),
        });
      }
    }
  }

  // Event rooms (not in poolrooms or party)
  if (themeKey !== 'poolrooms') {
    const eventCount = rng(1, 2 + Math.floor(level / 2));
    for (let i = 0; i < eventCount; i++) {
      const rx = rng(3, MAP_W - 18), ry = rng(3, MAP_H - 16);
      let ok = true;
      for (const r of rooms) {
        if (rx < r.x + r.w + 3 && rx + 14 > r.x - 3 && ry < r.y + r.h + 3 && ry + 12 > r.y - 3) {
          ok = false; break;
        }
      }
      if (ok) {
        const ew = rng(8, 14), eh = rng(8, 12);
        const etype = pick(['event_dark', 'event_scream', 'event_chase_trigger']);
        map.carveRoom(rx, ry, ew, eh, T.WALL_DARK, 0, 0);
        const ec = { cx: rx + Math.floor(ew/2), cy: ry + Math.floor(eh/2) };
        map.specialTiles.set(`${ec.cx},${ec.cy}`, { type: etype });
        let near = rooms[0], nearD = Infinity;
        for (const r of rooms) {
          const d = Math.abs(r.cx - ec.cx) + Math.abs(r.cy - ec.cy);
          if (d < nearD) { nearD = d; near = r; }
        }
        map.carveHallway(ec.cx, ec.cy, near.cx, near.cy);
      }
    }
  }

  // Exit in farthest room
  const lastRoom = rooms[rooms.length - 1];
  map.exitX = lastRoom.cx;
  map.exitY = lastRoom.cy;
  map.specialTiles.set(`${lastRoom.cx},${lastRoom.cy}`, { type: 'exit' });

  // Scatter items
  for (let i = 2; i < rooms.length; i++) {
    const r = rooms[i];
    if (Math.random() < 0.5) {
      const numItems = rng(1, 3);
      for (let j = 0; j < numItems; j++) {
        map.items.push({
          x: r.x + rng(1, r.w - 2) + 0.5,
          y: r.y + rng(1, r.h - 2) + 0.5,
          type: pickThemeItem(themeKey, level),
        });
      }
    }
  }

  // Place entities
  if (theme.entityTypes.length > 0) {
    const numEntities = Math.max(2, Math.floor(rooms.length / 3) + (level - 1));
    const entityRooms = rooms.slice(Math.floor(rooms.length * 0.35));
    for (let i = 0; i < Math.min(numEntities, entityRooms.length); i++) {
      const r = entityRooms[i % entityRooms.length];
      map.entities.push({
        x: r.cx + 0.5 + (Math.random() - 0.5) * 2,
        y: r.cy + 0.5 + (Math.random() - 0.5) * 2,
        type: pick(theme.entityTypes),
      });
    }
  }

  // Bake lighting with theme ambient base
  map.bakeLight();

  return map;
}

// ── ITEM TABLES ──────────────────────────────────────────────────────────────
function pickLootItem(level, theme) {
  const base = ['medkit', 'medkit', 'battery', 'battery', 'battery',
    'almond_water', 'flashlight_heavy', 'security_keycard', 'emergency_lantern',
    'compass', 'map_upgrade'];  // rare navigational loot
  if (level >= 2) base.push('flash_grenade', 'weapon_part', 'night_vision_goggles');
  if (level >= 3) base.push('fire_axe', 'motion_sensor', 'walkman');
  if (level >= 4) base.push('vent_tool');
  if (level >= 8) base.push('pockets', 'almond_water_pure', 'moth_jelly');
  if (level >= 18) base.push('idol');
  if (theme === 'pipes') base.push('battery', 'emergency_lantern', 'night_vision_goggles');
  if (theme === 'party') base.push('almond_water', 'almond_water', 'flash_grenade');
  if (theme === 'office') base.push('almond_water', 'almond_water', 'battery', 'battery', 'medkit');
  if (theme === 'suburbs') base.push('battery', 'battery', 'medkit', 'moth_jelly');
  if (theme === 'mall') base.push('almond_water_pure', 'pockets', 'night_vision_goggles');
  if (theme === 'hospital') base.push('medkit', 'medkit', 'battery');
  return pick(base);
}

function pickThemeItem(theme, level) {
  const base = ['battery', 'battery', 'battery', 'medkit', 'almond_water', 'almond_water'];
  if (theme === 'lobby') return pick(['battery', 'almond_water', 'key', 'tool', 'walkman']);
  if (theme === 'warehouse') return pick([...base, 'pipe', 'key', 'tool', 'compass']);
  if (theme === 'pipes') return pick(['battery', 'battery', 'emergency_lantern', 'medkit', 'vent_tool']);
  if (theme === 'electrical') return pick([...base, 'security_keycard', 'weapon_part', 'map_upgrade']);
  if (theme === 'poolrooms') return pick(['almond_water', 'almond_water', 'medkit', 'walkman']);
  if (theme === 'party') return pick(['almond_water', 'medkit', 'flash_grenade', 'compass']);
  if (theme === 'office') return pick(['battery', 'battery', 'almond_water', 'almond_water', 'medkit', 'compass', 'pockets']);
  if (theme === 'suburbs') return pick(['battery', 'battery', 'medkit', 'moth_jelly', 'night_vision_goggles']);
  if (theme === 'city') return pick([...base, 'key', 'compass', 'almond_water_pure']);
  if (theme === 'mall') return pick([...base, 'almond_water_pure', 'pockets', 'night_vision_goggles']);
  if (theme === 'dreamcore') return pick(['almond_water', 'almond_water', 'medkit', 'idol', 'compass']);
  if (theme === 'hospital') return pick(['medkit', 'medkit', 'battery', 'battery']);
  return pick(base);
}
