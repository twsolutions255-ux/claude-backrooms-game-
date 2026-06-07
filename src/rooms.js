// Procedural level generation with handcrafted room templates
import { GameMap, T, MAP_W, MAP_H } from './map.js';

function rng(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ── ROOM TYPES ───────────────────────────────────────────────────────────────
const ROOM_TYPES = [
  'standard', 'standard', 'standard', 'standard', // common
  'long_corridor', 'long_corridor',                // common
  'office', 'office',                              // common
  'junction', 'junction',                          // common
  'pool_room',                                     // uncommon
  'parking_garage',                                // uncommon
  'boiler_room',                                   // uncommon
  'maintenance',                                   // uncommon
  'flooded',                                       // rare
  'narrow_maze',                                   // rare
  'void_room',                                     // rare
];

// Template: each room has a place function
const roomTemplates = {
  standard(map, x, y, w, h) {
    const wt = pick([T.WALL_PAPER, T.WALL_PAPER, T.WALL_DARK, T.WALL_WET]);
    map.carveRoom(x, y, w, h, wt, 0, 1);
    // Add lights to ceiling
    const lx = rng(x + 2, x + w - 3), ly = rng(y + 2, y + h - 3);
    map.setCeiling(lx, ly, 1);
    if (w > 8) map.setCeiling(lx + rng(-3, 3), ly + rng(-2, 2), Math.random() < 0.3 ? 2 : 1);
    // Occasional broken wall section
    if (Math.random() < 0.25) {
      const bx = rng(x + 1, x + w - 2), by = rng(y + 1, y + h - 2);
      map.set(bx, y, T.WALL_DARK);
      map.set(bx, y + h - 1, T.WALL_DARK);
    }
    return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) };
  },

  long_corridor(map, x, y, w, h) {
    // Force narrow long shape
    const isHoriz = w > h;
    map.carveRoom(x, y, w, h, T.WALL_PAPER, 0, 0);
    // Place lights at intervals
    const step = rng(4, 8);
    if (isHoriz) {
      for (let lx = x + step; lx < x + w - 1; lx += step) {
        const broken = Math.random() < 0.3;
        map.setCeiling(lx, y + Math.floor(h/2), broken ? 2 : 1);
      }
    } else {
      for (let ly = y + step; ly < y + h - 1; ly += step) {
        const broken = Math.random() < 0.3;
        map.setCeiling(x + Math.floor(w/2), ly, broken ? 2 : 1);
      }
    }
    return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) };
  },

  office(map, x, y, w, h) {
    map.carveRoom(x, y, w, h, T.WALL_PAPER, 0, 1);
    // Dividing wall with a gap
    const divX = x + Math.floor(w * 0.4) + rng(-1, 1);
    for (let dy = y + 1; dy < y + h - 1; dy++) {
      if (dy !== y + Math.floor(h / 2)) {
        map.set(divX, dy, T.WALL_DARK);
      }
    }
    // Lockers along one wall
    if (h > 6) {
      for (let i = x + 2; i < x + w - 2; i += 2) {
        if (Math.random() < 0.5) map.set(i, y + 1, T.LOCKER_CLOSED);
      }
    }
    map.setCeiling(x + 2, y + 2, 1);
    map.setCeiling(x + w - 3, y + 2, 1);
    return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) };
  },

  junction(map, x, y, w, h) {
    // Cross-shaped room
    const mx = x + Math.floor(w/2), my = y + Math.floor(h/2);
    // Main room center
    map.carveRoom(mx - 3, my - 3, 6, 6, T.WALL_PAPER, 0, 1);
    map.setCeiling(mx, my, 1);
    // Arms
    map.carveRoom(x, my - 2, mx - x, 4, T.WALL_PAPER, 0, 0);
    map.carveRoom(mx + 3, my - 2, x + w - mx - 3, 4, T.WALL_PAPER, 0, 0);
    map.carveRoom(mx - 2, y, 4, my - y, T.WALL_PAPER, 0, 0);
    map.carveRoom(mx - 2, my + 3, 4, y + h - my - 3, T.WALL_PAPER, 0, 0);
    return { cx: mx, cy: my };
  },

  pool_room(map, x, y, w, h) {
    map.carveRoom(x, y, w, h, T.WALL_TILE, 1, 1);
    // Central pool area
    const px = x + 3, py = y + 3, pw = w - 6, ph = h - 6;
    for (let cy = py; cy < py + ph; cy++) {
      for (let cx = px; cx < px + pw; cx++) {
        map.setFloor(cx, cy, 2); // wet floor
        map.set(cx, cy, T.EMPTY);
      }
    }
    // Bright lights (pool rooms are well lit)
    map.setCeiling(x + 2, y + 2, 1);
    map.setCeiling(x + w - 3, y + 2, 1);
    map.setCeiling(x + 2, y + h - 3, 1);
    map.setCeiling(x + w - 3, y + h - 3, 1);
    map.addLight(x + w/2, y + h/2, 12, 0.9, 0.9, 0.95, 1.0);
    return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) };
  },

  parking_garage(map, x, y, w, h) {
    map.carveRoom(x, y, w, h, T.WALL_CONCRETE, 2, 0);
    // Pillars
    for (let py = y + 3; py < y + h - 2; py += 4) {
      for (let px = x + 3; px < x + w - 2; px += 5) {
        map.set(px, py, T.WALL_CONCRETE);
      }
    }
    // Emergency red lights
    map.setCeiling(x + 2, y + 2, 1);
    map.addLight(x + w/2, y + h/2, 10, 0.5, 0.8, 0.1, 0.1); // red tint
    // Low, dark
    return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) };
  },

  boiler_room(map, x, y, w, h) {
    map.carveRoom(x, y, w, h, T.WALL_METAL, 2, 0);
    // Pipes / obstacles as wall blocks
    if (w > 8 && h > 8) {
      map.set(x + 3, y + 3, T.WALL_METAL);
      map.set(x + 3, y + 4, T.WALL_METAL);
      map.set(x + w - 4, y + 3, T.WALL_METAL);
      map.set(x + w - 4, y + 4, T.WALL_METAL);
      map.set(x + 3, y + h - 4, T.WALL_METAL);
      map.set(x + 3, y + h - 5, T.WALL_METAL);
    }
    // Dim flickering light
    map.setCeiling(x + Math.floor(w/2), y + Math.floor(h/2), 1);
    map.addLight(x + w/2, y + h/2, 8, 0.7, 1.0, 0.8, 0.5, 3.0); // flickering orange-warm
    return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) };
  },

  maintenance(map, x, y, w, h) {
    map.carveRoom(x, y, w, h, T.WALL_BRICK, 2, 0);
    // Vents in walls
    if (h > 5) {
      map.set(x, y + Math.floor(h/2), T.VENT);
      map.set(x + w - 1, y + Math.floor(h/2), T.VENT);
    }
    // Grim dark
    for (let cy = y + 1; cy < y + h - 1; cy++) {
      for (let cx = x + 1; cx < x + w - 1; cx++) {
        map.setFloor(cx, cy, 2);
      }
    }
    map.setCeiling(x + 2, y + 2, 2); // broken ceiling
    map.addLight(x + w/2, y + h/2, 6, 0.5, 1.0, 0.9, 0.7, 2.0);
    return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) };
  },

  flooded(map, x, y, w, h) {
    map.carveRoom(x, y, w, h, T.WALL_WET, 0, 0);
    // All floor is wet
    for (let cy = y + 1; cy < y + h - 1; cy++) {
      for (let cx = x + 1; cx < x + w - 1; cx++) {
        map.setFloor(cx, cy, 2);
      }
    }
    // Water sound marker
    map.specialTiles.set(`${x+Math.floor(w/2)},${y+Math.floor(h/2)}`, { type: 'flooded' });
    map.setCeiling(x + 2, y + 2, 1);
    return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) };
  },

  narrow_maze(map, x, y, w, h) {
    // Fill then carve winding path
    map.carveRoom(x, y, w, h, T.WALL_DARK, 0, 0);
    // Re-add some walls for maze feel
    for (let cy = y + 2; cy < y + h - 2; cy += 2) {
      for (let cx = x + 2; cx < x + w - 2; cx++) {
        if (cx % 3 !== 0) map.set(cx, cy, T.WALL_DARK);
      }
    }
    return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) };
  },

  void_room(map, x, y, w, h) {
    // Large empty room — pure liminal horror
    map.carveRoom(x, y, w, h, T.WALL_PAPER, 0, 1);
    // Sparse lights — feel of vast emptiness
    const numLights = rng(1, 3);
    for (let i = 0; i < numLights; i++) {
      const lx = rng(x + 3, x + w - 3), ly = rng(y + 3, y + h - 3);
      map.setCeiling(lx, ly, 1);
    }
    // Some broken ceiling tiles
    for (let i = 0; i < 4; i++) {
      map.setCeiling(rng(x + 1, x + w - 2), rng(y + 1, y + h - 2), 2);
    }
    map.specialTiles.set(`${x+Math.floor(w/2)},${y+Math.floor(h/2)}`, { type: 'liminal' });
    return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) };
  },
};

// ── SPECIAL ROOMS ────────────────────────────────────────────────────────────
function placeSaveRoom(map, x, y) {
  const w = 7, h = 7;
  map.carveRoom(x, y, w, h, T.WALL_SAVE, 0, 1);
  // Warm lights all around
  map.setCeiling(x + 2, y + 2, 1);
  map.setCeiling(x + w - 3, y + 2, 1);
  map.setCeiling(x + 2, y + h - 3, 1);
  map.setCeiling(x + w - 3, y + h - 3, 1);
  map.addLight(x + w/2, y + h/2, 8, 1.0, 1.0, 0.85, 0.6);
  // Save station marker
  map.specialTiles.set(`${x+Math.floor(w/2)},${y+Math.floor(h/2)}`, { type: 'save_room' });
  return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) };
}

function placeLootRoom(map, x, y) {
  const w = rng(5, 8), h = rng(5, 8);
  map.carveRoom(x, y, w, h, T.WALL_DARK, 0, 0);
  // Hidden/dead-end feel — no ceiling light, dim
  map.specialTiles.set(`${x+Math.floor(w/2)},${y+Math.floor(h/2)}`, { type: 'loot_room' });
  return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2), w, h };
}

function placeEventRoom(map, x, y) {
  const w = rng(8, 14), h = rng(8, 12);
  const type = pick(['event_dark', 'event_scream', 'event_chase_trigger']);
  map.carveRoom(x, y, w, h, T.WALL_DARK, 0, 0);
  map.specialTiles.set(`${x+Math.floor(w/2)},${y+Math.floor(h/2)}`, { type });
  return { cx: x + Math.floor(w/2), cy: y + Math.floor(h/2) };
}

// ── MAIN GENERATOR ───────────────────────────────────────────────────────────
export function generateLevel(level = 1) {
  const map = new GameMap();
  const rooms = [];
  const roomCenters = [];

  // Room size ranges scale with level
  const minRW = 6, maxRW = Math.min(16, 8 + level);
  const minRH = 5, maxRH = Math.min(14, 7 + level);

  // Attempt to place N rooms
  const targetRooms = 10 + level * 3;
  let attempts = 0;
  while (rooms.length < targetRooms && attempts++ < 500) {
    const w = rng(minRW, maxRW);
    const h = rng(minRH, maxRH);
    const x = rng(2, MAP_W - w - 2);
    const y = rng(2, MAP_H - h - 2);

    // Check overlap with existing rooms (with margin)
    let overlap = false;
    for (const r of rooms) {
      if (x < r.x + r.w + 2 && x + w > r.x - 2 && y < r.y + r.h + 2 && y + h > r.y - 2) {
        overlap = true; break;
      }
    }
    if (overlap) continue;

    const typeRoll = Math.random();
    let type;
    if (rooms.length === 0) type = 'standard'; // first room = spawn
    else if (typeRoll < 0.05 && level >= 2) type = 'pool_room';
    else if (typeRoll < 0.1) type = 'boiler_room';
    else if (typeRoll < 0.15) type = 'maintenance';
    else if (typeRoll < 0.2) type = 'parking_garage';
    else if (typeRoll < 0.22 && level >= 1) type = 'flooded';
    else if (typeRoll < 0.25) type = 'junction';
    else if (typeRoll < 0.30) type = 'office';
    else if (typeRoll < 0.35) type = 'long_corridor';
    else if (typeRoll < 0.37 && level >= 2) type = 'void_room';
    else type = 'standard';

    const fn = roomTemplates[type] || roomTemplates.standard;
    const center = fn(map, x, y, w, h);
    rooms.push({ x, y, w, h, type, cx: center.cx, cy: center.cy });
    roomCenters.push({ x: center.cx, y: center.cy });
    map.roomList.push({ x, y, w, h, type });
  }

  // Connect rooms with corridors
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1], b = rooms[i];
    map.carveHallway(a.cx, a.cy, b.cx, b.cy);
    // Add doors occasionally
    if (Math.random() < 0.4) {
      const mx = Math.round((a.cx + b.cx) / 2);
      const my = Math.round((a.cy + b.cy) / 2);
      // Try to place a door in the corridor midpoint wall
      if (!map.isSolid(mx, my)) {
        // Find a nearby wall to door-ify
        for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
          if (map.get(mx + dx, my + dy) >= T.WALL_PAPER && map.get(mx + dx, my + dy) <= T.WALL_WOOD) {
            map.set(mx + dx, my + dy, T.DOOR_CLOSED);
            break;
          }
        }
      }
    }
    // Add some loop connections (some rooms connect to non-adjacent rooms)
    if (i > 2 && Math.random() < 0.3) {
      const j = rng(Math.max(0, i - 4), i - 2);
      map.carveHallway(rooms[i].cx, rooms[i].cy, rooms[j].cx, rooms[j].cy);
    }
  }

  // Spawn room = first room
  map.spawnX = rooms[0].cx + 0.5;
  map.spawnY = rooms[0].cy + 0.5;

  // Place save room(s)
  const saveCount = Math.max(1, Math.floor(rooms.length / 6));
  for (let i = 0; i < saveCount; i++) {
    const attempts2 = 100;
    for (let a2 = 0; a2 < attempts2; a2++) {
      const sx = rng(3, MAP_W - 12), sy = rng(3, MAP_H - 12);
      let ok = true;
      for (const r of rooms) {
        if (sx < r.x + r.w + 2 && sx + 7 > r.x - 2 && sy < r.y + r.h + 2 && sy + 7 > r.y - 2) {
          ok = false; break;
        }
      }
      if (ok) {
        const saveCenter = placeSaveRoom(map, sx, sy);
        // Connect to nearest room
        let near = rooms[0], nearD = Infinity;
        for (const r of rooms) {
          const d = Math.abs(r.cx - saveCenter.cx) + Math.abs(r.cy - saveCenter.cy);
          if (d < nearD) { nearD = d; near = r; }
        }
        map.carveHallway(saveCenter.cx, saveCenter.cy, near.cx, near.cy);
        break;
      }
    }
  }

  // Place loot rooms (dead-ends)
  const lootCount = rng(2, 4);
  for (let i = 0; i < lootCount; i++) {
    // Find edge room with only one connection
    const r = rooms[rooms.length - 1 - i];
    if (r) {
      const lx = r.cx + pick([-1, 1]) * rng(4, 8);
      const ly = r.cy + pick([-1, 1]) * rng(4, 8);
      if (lx > 3 && lx < MAP_W - 12 && ly > 3 && ly < MAP_H - 12) {
        const lc = placeLootRoom(map, lx, ly);
        map.carveHallway(lc.cx, lc.cy, r.cx, r.cy);
        // Place items in loot room
        const numItems = rng(2, 5);
        for (let j = 0; j < numItems; j++) {
          map.items.push({
            x: lx + rng(1, lc.w ? lc.w - 2 : 4),
            y: ly + rng(1, lc.h ? lc.h - 2 : 4),
            type: pickLootItem(level),
          });
        }
      }
    }
  }

  // Place event rooms
  const eventCount = rng(1, 2 + level);
  for (let i = 0; i < eventCount; i++) {
    const rx = rng(3, MAP_W - 18), ry = rng(3, MAP_H - 16);
    let ok = true;
    for (const r of rooms) {
      if (rx < r.x + r.w + 3 && rx + 14 > r.x - 3 && ry < r.y + r.h + 3 && ry + 12 > r.y - 3) {
        ok = false; break;
      }
    }
    if (ok) {
      const ec = placeEventRoom(map, rx, ry);
      // Connect to nearest room
      let near = rooms[0], nearD = Infinity;
      for (const r of rooms) {
        const d = Math.abs(r.cx - ec.cx) + Math.abs(r.cy - ec.cy);
        if (d < nearD) { nearD = d; near = r; }
      }
      map.carveHallway(ec.cx, ec.cy, near.cx, near.cy);
    }
  }

  // Place exit in the room farthest from spawn
  const lastRoom = rooms[rooms.length - 1];
  map.exitX = lastRoom.cx;
  map.exitY = lastRoom.cy;
  map.specialTiles.set(`${lastRoom.cx},${lastRoom.cy}`, { type: 'exit' });

  // Scatter items across rooms
  for (let i = 2; i < rooms.length; i++) {
    const r = rooms[i];
    if (Math.random() < 0.5) {
      const numItems = rng(1, 3);
      for (let j = 0; j < numItems; j++) {
        map.items.push({
          x: r.x + rng(1, r.w - 2) + 0.5,
          y: r.y + rng(1, r.h - 2) + 0.5,
          type: pickRandomItem(level),
        });
      }
    }
  }

  // Place entities
  const numEntities = Math.max(1, Math.floor(rooms.length / 4) + (level - 1));
  const entityRooms = rooms.slice(Math.floor(rooms.length * 0.4)); // Spawn in back half
  for (let i = 0; i < Math.min(numEntities, entityRooms.length); i++) {
    const r = entityRooms[i % entityRooms.length];
    map.entities.push({
      x: r.cx + 0.5 + (Math.random() - 0.5) * 2,
      y: r.cy + 0.5 + (Math.random() - 0.5) * 2,
      type: level >= 3 && i === 0 ? 'fast' : 'stalker',
    });
  }

  // Bake static lighting
  map.bakeLight();

  return map;
}

function pickLootItem(level) {
  const lootTable = [
    'medkit', 'medkit',
    'battery', 'battery', 'battery',
    'almond_water',
    'flashlight_heavy',
    'security_keycard',
    'fire_axe',
    'motion_sensor',
    'emergency_lantern',
    'rare_collectible',
  ];
  if (level >= 2) lootTable.push('flash_grenade', 'weapon_part');
  return pick(lootTable);
}

function pickRandomItem(level) {
  const items = [
    'battery', 'battery', 'battery',
    'medkit',
    'almond_water', 'almond_water',
    'tool',
    'key',
    'pipe',
  ];
  if (level >= 2) items.push('security_keycard', 'weapon_part');
  if (level >= 3) items.push('flash_grenade', 'fire_axe');
  return pick(items);
}
