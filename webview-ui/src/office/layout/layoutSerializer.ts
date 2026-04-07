import { TileType, FurnitureType, DEFAULT_COLS, DEFAULT_ROWS, TILE_SIZE, Direction } from '../types.js'
import type { TileType as TileTypeVal, OfficeLayout, PlacedFurniture, Seat, FurnitureInstance, FloorColor } from '../types.js'
import { getCatalogEntry } from './furnitureCatalog.js'
import { getColorizedSprite } from '../colorize.js'

/** Convert flat tile array from layout into 2D grid */
export function layoutToTileMap(layout: OfficeLayout): TileTypeVal[][] {
  const map: TileTypeVal[][] = []
  for (let r = 0; r < layout.rows; r++) {
    const row: TileTypeVal[] = []
    for (let c = 0; c < layout.cols; c++) {
      row.push(layout.tiles[r * layout.cols + c])
    }
    map.push(row)
  }
  return map
}

/** Convert placed furniture into renderable FurnitureInstance[] */
export function layoutToFurnitureInstances(furniture: PlacedFurniture[]): FurnitureInstance[] {
  // Pre-compute desk zY per tile so surface items can sort in front of desks
  const deskZByTile = new Map<string, number>()
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry || !entry.isDesk) continue
    const deskZY = item.row * TILE_SIZE + entry.sprite.length
    for (let dr = 0; dr < entry.footprintH; dr++) {
      for (let dc = 0; dc < entry.footprintW; dc++) {
        const key = `${item.col + dc},${item.row + dr}`
        const prev = deskZByTile.get(key)
        if (prev === undefined || deskZY > prev) deskZByTile.set(key, deskZY)
      }
    }
  }

  const instances: FurnitureInstance[] = []
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry) continue
    const x = item.col * TILE_SIZE
    const y = item.row * TILE_SIZE
    const spriteH = entry.sprite.length
    let zY = y + spriteH

    // Chair z-sorting: ensure characters sitting on chairs render correctly
    if (entry.category === 'chairs') {
      if (entry.orientation === 'back') {
        // Back-facing chairs render IN FRONT of the seated character
        // (the chair back visually occludes the character behind it)
        zY = (item.row + 1) * TILE_SIZE + 1
      } else {
        // All other chairs: cap zY to first row bottom so characters
        // at any seat tile render in front of the chair
        zY = (item.row + 1) * TILE_SIZE
      }
    }

    // Surface items render in front of the desk they sit on
    if (entry.canPlaceOnSurfaces) {
      for (let dr = 0; dr < entry.footprintH; dr++) {
        for (let dc = 0; dc < entry.footprintW; dc++) {
          const deskZ = deskZByTile.get(`${item.col + dc},${item.row + dr}`)
          if (deskZ !== undefined && deskZ + 0.5 > zY) zY = deskZ + 0.5
        }
      }
    }

    // Colorize sprite if this furniture has a color override
    let sprite = entry.sprite
    if (item.color) {
      const { h, s, b: bv, c: cv } = item.color
      sprite = getColorizedSprite(`furn-${item.type}-${h}-${s}-${bv}-${cv}-${item.color.colorize ? 1 : 0}`, entry.sprite, item.color)
    }

    instances.push({ sprite, x, y, zY })
  }
  return instances
}

/** Get all tiles blocked by furniture footprints, optionally excluding a set of tiles.
 *  Skips top backgroundTiles rows so characters can walk through them. */
export function getBlockedTiles(furniture: PlacedFurniture[], excludeTiles?: Set<string>): Set<string> {
  const tiles = new Set<string>()
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry) continue
    const bgRows = entry.backgroundTiles || 0
    for (let dr = 0; dr < entry.footprintH; dr++) {
      if (dr < bgRows) continue // skip background rows — characters can walk through
      for (let dc = 0; dc < entry.footprintW; dc++) {
        const key = `${item.col + dc},${item.row + dr}`
        if (excludeTiles && excludeTiles.has(key)) continue
        tiles.add(key)
      }
    }
  }
  return tiles
}

/** Get tiles blocked for placement purposes — skips top backgroundTiles rows per item */
export function getPlacementBlockedTiles(furniture: PlacedFurniture[], excludeUid?: string): Set<string> {
  const tiles = new Set<string>()
  for (const item of furniture) {
    if (item.uid === excludeUid) continue
    const entry = getCatalogEntry(item.type)
    if (!entry) continue
    const bgRows = entry.backgroundTiles || 0
    for (let dr = 0; dr < entry.footprintH; dr++) {
      if (dr < bgRows) continue // skip background rows
      for (let dc = 0; dc < entry.footprintW; dc++) {
        tiles.add(`${item.col + dc},${item.row + dr}`)
      }
    }
  }
  return tiles
}

/** Map chair orientation to character facing direction */
function orientationToFacing(orientation: string): Direction {
  switch (orientation) {
    case 'front': return Direction.DOWN
    case 'back': return Direction.UP
    case 'left': return Direction.LEFT
    case 'right': return Direction.RIGHT
    default: return Direction.DOWN
  }
}

/** Generate seats from chair furniture.
 *  Facing priority: 1) chair orientation, 2) adjacent desk, 3) forward (DOWN). */
export function layoutToSeats(furniture: PlacedFurniture[]): Map<string, Seat> {
  const seats = new Map<string, Seat>()

  // Build set of all desk tiles
  const deskTiles = new Set<string>()
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry || !entry.isDesk) continue
    for (let dr = 0; dr < entry.footprintH; dr++) {
      for (let dc = 0; dc < entry.footprintW; dc++) {
        deskTiles.add(`${item.col + dc},${item.row + dr}`)
      }
    }
  }

  const dirs: Array<{ dc: number; dr: number; facing: Direction }> = [
    { dc: 0, dr: -1, facing: Direction.UP },    // desk is above chair → face UP
    { dc: 0, dr: 1, facing: Direction.DOWN },   // desk is below chair → face DOWN
    { dc: -1, dr: 0, facing: Direction.LEFT },   // desk is left of chair → face LEFT
    { dc: 1, dr: 0, facing: Direction.RIGHT },   // desk is right of chair → face RIGHT
  ]

  // For each chair, every footprint tile becomes a seat.
  // Multi-tile chairs (e.g. 2-tile couches) produce multiple seats.
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry || entry.category !== 'chairs') continue

    let seatCount = 0
    for (let dr = 0; dr < entry.footprintH; dr++) {
      for (let dc = 0; dc < entry.footprintW; dc++) {
        const tileCol = item.col + dc
        const tileRow = item.row + dr

        // Determine facing direction:
        // 1) Chair orientation takes priority
        // 2) Adjacent desk direction
        // 3) Default forward (DOWN)
        let facingDir: Direction = Direction.DOWN
        if (entry.orientation) {
          facingDir = orientationToFacing(entry.orientation)
        } else {
          for (const d of dirs) {
            if (deskTiles.has(`${tileCol + d.dc},${tileRow + d.dr}`)) {
              facingDir = d.facing
              break
            }
          }
        }

        // First seat uses chair uid (backward compat), subsequent use uid:N
        const seatUid = seatCount === 0 ? item.uid : `${item.uid}:${seatCount}`
        seats.set(seatUid, {
          uid: seatUid,
          seatCol: tileCol,
          seatRow: tileRow,
          facingDir,
          assigned: false,
        })
        seatCount++
      }
    }
  }

  return seats
}

/** Get the set of tiles occupied by seats (so they can be excluded from blocked tiles) */
export function getSeatTiles(seats: Map<string, Seat>): Set<string> {
  const tiles = new Set<string>()
  for (const seat of seats.values()) {
    tiles.add(`${seat.seatCol},${seat.seatRow}`)
  }
  return tiles
}

/** Default floor colors for each room zone */
const COLOR_CONFERENCE: FloorColor = { h: 210, s: 25, b: 10, c: 0 }    // cool blue-gray carpet
const COLOR_MAIN: FloorColor      = { h: 35,  s: 20, b: 10, c: 0 }     // warm gray carpet
const COLOR_BREAK: FloorColor     = { h: 30,  s: 10, b: 20, c: 0 }     // polished concrete (kitchen)
const COLOR_DOORWAY: FloorColor   = { h: 35,  s: 25, b: 10, c: 0 }     // tan doorway
const COLOR_ENTRY: FloorColor     = { h: 30,  s: 10, b: 15, c: 0 }     // polished concrete (entry)
const COLOR_OFFICE: FloorColor    = { h: 30,  s: 35, b: 10, c: 0 }     // warm amber carpet
const COLOR_TECH: FloorColor      = { h: 260, s: 30, b: 12, c: 0 }     // cool indigo (dev floor)
const COLOR_LOUNGE: FloorColor    = { h: 340, s: 20, b: 12, c: 0 }     // warm rose (lounge)

/**
 * Create the default office layout — 26×31
 *
 * Zones:
 *  C = Conference room   (top-left,  rows 1-7,  cols 1-11)
 *  T = Tech / Dev floor  (top-right, rows 1-7,  cols 14-24)  ← separate room, dev agents spawn here
 *  O = Individual offices (left side, rows 9-25, cols 1-5) — 4 offices
 *  M = Main open area    (center,    rows 9-25, cols 7-21)
 *  E = Entry / reception (right,     rows 9-13, cols 21-24)
 *  B = Kitchen/break     (bottom-right, rows 20-25, cols 21-24)
 *  L = Lounge            (bottom,    rows 27-29, cols 8-23)
 */
export function createDefaultLayout(): OfficeLayout {
  const W = TileType.WALL
  const V = TileType.VOID
  const C = TileType.FLOOR_1   // Conference
  const M = TileType.FLOOR_2   // Main open area
  const B = TileType.FLOOR_3   // Kitchen / break
  const D = TileType.FLOOR_4   // Doorway (tan)
  const E = TileType.FLOOR_5   // Entry / reception
  const O = TileType.FLOOR_6   // Offices
  const T = TileType.FLOOR_7   // Tech / Dev floor
  const L = TileType.FLOOR_3   // Lounge — reuse FLOOR_3 pattern, different color per tile

  //       0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25
  const grid: TileTypeVal[][] = [
    [ W, W, W, W, W, W, W, W, W, W, W, W, W, V, W, W, W, W, W, W, W, W, W, W, W, W ], // row 0
    [ W, C, C, C, C, C, C, C, C, C, C, C, W, V, W, T, T, T, T, T, T, T, T, T, T, W ], // row 1
    [ W, C, C, C, C, C, C, C, C, C, C, C, W, V, W, T, T, T, T, T, T, T, T, T, T, W ], // row 2
    [ W, C, C, C, C, C, C, C, C, C, C, C, W, V, W, T, T, T, T, T, T, T, T, T, T, W ], // row 3
    [ W, C, C, C, C, C, C, C, C, C, C, C, W, V, W, T, T, T, T, T, T, T, T, T, T, W ], // row 4
    [ W, C, C, C, C, C, C, C, C, C, C, C, W, V, W, T, T, T, T, T, T, T, T, T, T, W ], // row 5
    [ W, C, C, C, C, C, C, C, C, C, C, C, W, V, W, T, T, T, T, T, T, T, T, T, T, W ], // row 6
    [ W, C, C, C, C, C, C, C, C, C, C, C, W, V, W, T, T, T, T, T, T, T, T, T, T, W ], // row 7
    [ W, W, W, W, W, W, W, D, W, W, W, W, W, V, V, V, V, V, V, V, V, V, V, V, V, V ], // row 8 — conf door
    [ W, O, O, O, O, O, W, M, M, M, M, M, M, M, M, M, M, M, M, M, M, M, M, M, M, W ], // row 9
    [ W, O, O, O, O, O, W, M, M, M, M, M, M, M, M, M, M, M, M, M, M, E, E, E, E, W ], // row 10
    [ W, O, O, O, O, O, D, M, M, M, M, M, M, M, M, M, M, M, M, M, M, E, E, E, E, W ], // row 11 — office 1 door
    [ W, O, O, O, O, O, W, M, M, M, M, M, M, M, M, M, M, M, M, M, M, E, E, E, E, W ], // row 12
    [ W, O, O, O, O, O, W, M, M, M, M, M, M, M, M, M, M, M, M, M, M, E, E, E, E, W ], // row 13
    [ W, W, W, W, W, W, W, M, M, M, M, M, M, M, M, M, M, M, M, M, M, E, E, E, E, D ], // row 14 — front entrance
    [ W, O, O, O, O, O, W, M, M, M, M, M, M, M, M, M, M, M, M, M, M, M, M, M, M, W ], // row 15
    [ W, O, O, O, O, O, D, M, M, M, M, M, M, M, M, M, M, M, M, M, M, M, M, M, M, W ], // row 16 — office 2 door
    [ W, O, O, O, O, O, W, M, M, M, M, M, M, M, M, M, M, M, M, M, M, M, M, M, M, W ], // row 17
    [ W, W, W, W, W, W, W, M, M, M, M, M, M, M, M, M, M, M, M, M, M, M, M, M, M, W ], // row 18
    [ W, O, O, O, O, O, W, M, M, M, M, M, M, M, M, M, M, M, M, M, W, W, W, W, W, W ], // row 19 — kitchen top
    [ W, O, O, O, O, O, D, M, M, M, M, M, M, M, M, M, M, M, M, M, W, B, B, B, B, W ], // row 20 — office 3 door
    [ W, O, O, O, O, O, W, M, M, M, M, M, M, M, M, M, M, M, M, D, B, B, B, B, B, W ], // row 21 — kitchen door
    [ W, W, W, W, W, W, W, M, M, M, M, M, M, M, M, M, M, M, M, M, W, B, B, B, B, W ], // row 22
    [ W, O, O, O, O, O, W, M, M, M, M, M, M, M, M, M, M, M, M, M, W, B, B, B, B, W ], // row 23
    [ W, O, O, O, O, O, D, M, M, M, M, M, M, M, M, M, M, M, M, M, W, B, B, B, B, W ], // row 24 — office 4 door
    [ W, O, O, O, O, O, W, M, M, M, M, M, M, M, M, M, M, M, M, M, W, B, B, B, B, W ], // row 25
    [ W, W, W, W, W, W, W, W, W, W, D, W, W, W, W, W, W, W, W, W, W, W, W, D, W, W ], // row 26 — lounge door+kitchen bottom
    [ V, V, V, V, V, V, V, W, L, L, L, L, L, L, L, L, L, L, L, L, L, L, L, L, W, V ], // row 27 — lounge
    [ V, V, V, V, V, V, V, W, L, L, L, L, L, L, L, L, L, L, L, L, L, L, L, L, W, V ], // row 28
    [ V, V, V, V, V, V, V, W, L, L, L, L, L, L, L, L, L, L, L, L, L, L, L, L, W, V ], // row 29
    [ V, V, V, V, V, V, V, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, V ], // row 30
  ]

  // Flatten grid and assign per-tile colors
  const tiles: TileTypeVal[] = []
  const tileColors: Array<FloorColor | null> = []

  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const tile = grid[r][c]
      tiles.push(tile)
      // Lounge rows override FLOOR_3 default (kitchen) with lounge color
      if (r >= 27 && r <= 29 && tile === TileType.FLOOR_3) {
        tileColors.push(COLOR_LOUNGE)
      } else {
        const colorMap: Record<number, FloorColor | null> = {
          [TileType.WALL]: null,
          [TileType.VOID]: null,
          [TileType.FLOOR_1]: COLOR_CONFERENCE,
          [TileType.FLOOR_2]: COLOR_MAIN,
          [TileType.FLOOR_3]: COLOR_BREAK,
          [TileType.FLOOR_4]: COLOR_DOORWAY,
          [TileType.FLOOR_5]: COLOR_ENTRY,
          [TileType.FLOOR_6]: COLOR_OFFICE,
          [TileType.FLOOR_7]: COLOR_TECH,
        }
        tileColors.push(colorMap[tile] ?? null)
      }
    }
  }

  const furniture: PlacedFurniture[] = [
    // ════════════════════════════════════════
    // CONFERENCE ROOM — rows 1-7, cols 1-11
    // 6 seats (meeting table cluster)
    // ════════════════════════════════════════
    { uid: 'conf-desk-1',   type: FurnitureType.DESK,       col: 2,  row: 3 },
    { uid: 'conf-desk-2',   type: FurnitureType.DESK,       col: 5,  row: 3 },
    { uid: 'conf-desk-3',   type: FurnitureType.DESK,       col: 8,  row: 3 },
    // chairs above table
    { uid: 'conf-chair-1',  type: FurnitureType.CHAIR,      col: 2,  row: 2 },
    { uid: 'conf-chair-2',  type: FurnitureType.CHAIR,      col: 5,  row: 2 },
    { uid: 'conf-chair-3',  type: FurnitureType.CHAIR,      col: 8,  row: 2 },
    // chairs below table
    { uid: 'conf-chair-4',  type: FurnitureType.CHAIR,      col: 3,  row: 5 },
    { uid: 'conf-chair-5',  type: FurnitureType.CHAIR,      col: 6,  row: 5 },
    { uid: 'conf-chair-6',  type: FurnitureType.CHAIR,      col: 9,  row: 5 },
    // decorations
    { uid: 'conf-wb',       type: FurnitureType.WHITEBOARD, col: 3,  row: 1 },
    { uid: 'conf-tv',       type: FurnitureType.PC,         col: 11, row: 4 },
    { uid: 'conf-plant-1',  type: FurnitureType.PLANT,      col: 1,  row: 1 },
    { uid: 'conf-plant-2',  type: FurnitureType.PLANT,      col: 11, row: 1 },
    { uid: 'conf-lamp-1',   type: FurnitureType.LAMP,       col: 1,  row: 6 },
    { uid: 'conf-lamp-2',   type: FurnitureType.LAMP,       col: 11, row: 6 },
    { uid: 'conf-shelf',    type: FurnitureType.BOOKSHELF,  col: 10, row: 1 },

    // ════════════════════════════════════════
    // TECH / DEV FLOOR — rows 1-7, cols 15-24
    // 4 seats: tech_lead, frontend_dev, backend_dev, mobile_dev
    // ════════════════════════════════════════
    // Top row workstations (tech lead + frontend)
    { uid: 'tech-desk-1',   type: FurnitureType.DESK,       col: 15, row: 1 },
    { uid: 'tech-chair-1',  type: FurnitureType.CHAIR,      col: 16, row: 3 },
    { uid: 'tech-pc-1',     type: FurnitureType.PC,         col: 15, row: 1 },
    { uid: 'tech-desk-2',   type: FurnitureType.DESK,       col: 19, row: 1 },
    { uid: 'tech-chair-2',  type: FurnitureType.CHAIR,      col: 20, row: 3 },
    { uid: 'tech-pc-2',     type: FurnitureType.PC,         col: 19, row: 1 },
    // Bottom row workstations (backend + mobile)
    { uid: 'tech-desk-3',   type: FurnitureType.DESK,       col: 15, row: 4 },
    { uid: 'tech-chair-3',  type: FurnitureType.CHAIR,      col: 16, row: 6 },
    { uid: 'tech-pc-3',     type: FurnitureType.PC,         col: 15, row: 4 },
    { uid: 'tech-desk-4',   type: FurnitureType.DESK,       col: 19, row: 4 },
    { uid: 'tech-chair-4',  type: FurnitureType.CHAIR,      col: 20, row: 6 },
    { uid: 'tech-pc-4',     type: FurnitureType.PC,         col: 19, row: 4 },
    // Shared tech area decor
    { uid: 'tech-wb',       type: FurnitureType.WHITEBOARD, col: 22, row: 3 },
    { uid: 'tech-shelf-1',  type: FurnitureType.BOOKSHELF,  col: 18, row: 1 },
    { uid: 'tech-shelf-2',  type: FurnitureType.BOOKSHELF,  col: 18, row: 4 },
    { uid: 'tech-server-1', type: FurnitureType.SERVER_RACK,col: 23, row: 1 },
    { uid: 'tech-server-2', type: FurnitureType.SERVER_RACK,col: 24, row: 1 },
    { uid: 'tech-plant',    type: FurnitureType.BIG_PLANT,  col: 24, row: 5 },
    { uid: 'tech-lamp-1',   type: FurnitureType.LAMP,       col: 17, row: 3 },
    { uid: 'tech-lamp-2',   type: FurnitureType.LAMP,       col: 21, row: 3 },

    // ════════════════════════════════════════
    // OFFICE 1 (rows 9-13, cols 1-5) — brand_designer — 2 seats
    // ════════════════════════════════════════
    { uid: 'off1-desk-a',   type: FurnitureType.DESK,       col: 1,  row: 9 },
    { uid: 'off1-chair-a',  type: FurnitureType.CHAIR,      col: 2,  row: 11 },
    { uid: 'off1-desk-b',   type: FurnitureType.DESK,       col: 3,  row: 9 },
    { uid: 'off1-chair-b',  type: FurnitureType.CHAIR,      col: 4,  row: 11 },
    { uid: 'off1-shelf',    type: FurnitureType.BOOKSHELF,  col: 5,  row: 9 },
    { uid: 'off1-wb',       type: FurnitureType.WHITEBOARD, col: 1,  row: 13 },
    { uid: 'off1-plant',    type: FurnitureType.PLANT,      col: 5,  row: 12 },

    // ════════════════════════════════════════
    // OFFICE 2 (rows 15-17, cols 1-5) — ux_designer — 1 seat
    // ════════════════════════════════════════
    { uid: 'off2-desk',     type: FurnitureType.DESK,       col: 1,  row: 15 },
    { uid: 'off2-chair',    type: FurnitureType.CHAIR,      col: 2,  row: 17 },
    { uid: 'off2-wb',       type: FurnitureType.WHITEBOARD, col: 3,  row: 15 },
    { uid: 'off2-shelf',    type: FurnitureType.BOOKSHELF,  col: 5,  row: 15 },
    { uid: 'off2-plant',    type: FurnitureType.PLANT,      col: 5,  row: 17 },

    // ════════════════════════════════════════
    // OFFICE 3 (rows 19-21, cols 1-5) — qa_engineer — 1 seat
    // ════════════════════════════════════════
    { uid: 'off3-desk',     type: FurnitureType.DESK,       col: 1,  row: 19 },
    { uid: 'off3-chair',    type: FurnitureType.CHAIR,      col: 2,  row: 21 },
    { uid: 'off3-pc',       type: FurnitureType.PC,         col: 2,  row: 19 },
    { uid: 'off3-shelf',    type: FurnitureType.BOOKSHELF,  col: 4,  row: 19 },
    { uid: 'off3-lamp',     type: FurnitureType.LAMP,       col: 5,  row: 20 },

    // ════════════════════════════════════════
    // OFFICE 4 (rows 23-25, cols 1-5) — devops_engineer — 1 seat
    // ════════════════════════════════════════
    { uid: 'off4-desk',     type: FurnitureType.DESK,       col: 1,  row: 23 },
    { uid: 'off4-chair',    type: FurnitureType.CHAIR,      col: 2,  row: 25 },
    { uid: 'off4-pc',       type: FurnitureType.PC,         col: 2,  row: 23 },
    { uid: 'off4-server',   type: FurnitureType.SERVER_RACK,col: 4,  row: 23 },
    { uid: 'off4-lamp',     type: FurnitureType.LAMP,       col: 5,  row: 24 },

    // ════════════════════════════════════════
    // MAIN OPEN AREA — rows 9-25, cols 7-20
    // ui_designer (2 seats) + ux_writer (1 seat) + meeting table (4 seats)
    // ════════════════════════════════════════
    // UI Designer workstation (top of main, cols 7-9)
    { uid: 'main-ui-desk',    type: FurnitureType.DESK,       col: 7,  row: 9 },
    { uid: 'main-ui-chair',   type: FurnitureType.CHAIR,      col: 8,  row: 11 },
    { uid: 'main-ui-pc',      type: FurnitureType.PC,         col: 7,  row: 9 },
    // UX Writer workstation (col 11-12)
    { uid: 'main-uw-desk',    type: FurnitureType.DESK,       col: 11, row: 9 },
    { uid: 'main-uw-chair',   type: FurnitureType.CHAIR,      col: 12, row: 11 },
    { uid: 'main-uw-shelf',   type: FurnitureType.BOOKSHELF,  col: 13, row: 9 },
    // Meeting table cluster (center)
    { uid: 'main-meet-d1',    type: FurnitureType.DESK,       col: 9,  row: 14 },
    { uid: 'main-meet-d2',    type: FurnitureType.DESK,       col: 11, row: 14 },
    { uid: 'main-meet-c1',    type: FurnitureType.CHAIR,      col: 9,  row: 13 },
    { uid: 'main-meet-c2',    type: FurnitureType.CHAIR,      col: 11, row: 13 },
    { uid: 'main-meet-c3',    type: FurnitureType.CHAIR,      col: 10, row: 16 },
    { uid: 'main-meet-c4',    type: FurnitureType.CHAIR,      col: 12, row: 16 },
    { uid: 'main-meet-wb',    type: FurnitureType.WHITEBOARD, col: 15, row: 14 },
    // Reception / hotdesk cluster (mid-right)
    { uid: 'main-hot-d1',     type: FurnitureType.DESK,       col: 15, row: 9 },
    { uid: 'main-hot-c1',     type: FurnitureType.CHAIR,      col: 16, row: 11 },
    { uid: 'main-hot-d2',     type: FurnitureType.DESK,       col: 18, row: 9 },
    { uid: 'main-hot-c2',     type: FurnitureType.CHAIR,      col: 19, row: 11 },
    // Decorations scattered around main area
    { uid: 'main-plant-1',   type: FurnitureType.PLANT,      col: 20, row: 9 },
    { uid: 'main-big-plant',  type: FurnitureType.BIG_PLANT,  col: 7,  row: 18 },
    { uid: 'main-plant-3',   type: FurnitureType.PLANT,      col: 20, row: 18 },
    { uid: 'main-lamp-1',    type: FurnitureType.LAMP,       col: 20, row: 15 },
    { uid: 'main-lamp-2',    type: FurnitureType.LAMP,       col: 7,  row: 24 },
    { uid: 'main-shelf',     type: FurnitureType.BOOKSHELF,  col: 20, row: 22 },
    { uid: 'main-pc',        type: FurnitureType.PC,         col: 7,  row: 16 },

    // ════════════════════════════════════════
    // ENTRY / RECEPTION — rows 9-13, cols 21-24
    // ════════════════════════════════════════
    { uid: 'entry-plant-1',  type: FurnitureType.BIG_PLANT,  col: 21, row: 9 },
    { uid: 'entry-plant-2',  type: FurnitureType.PLANT,      col: 24, row: 9 },
    { uid: 'entry-lamp-1',   type: FurnitureType.LAMP,       col: 24, row: 12 },
    { uid: 'entry-sofa',     type: FurnitureType.SOFA,       col: 21, row: 11 },
    { uid: 'entry-ctable',   type: FurnitureType.COFFEE_TABLE,col:21, row: 13 },

    // ════════════════════════════════════════
    // KITCHEN / BREAK ROOM — rows 20-25, cols 21-24
    // ════════════════════════════════════════
    { uid: 'break-counter',  type: FurnitureType.DESK,       col: 21, row: 20 },
    { uid: 'break-cooler',   type: FurnitureType.COOLER,     col: 24, row: 20 },
    { uid: 'break-cooler-2', type: FurnitureType.COOLER,     col: 24, row: 21 },
    { uid: 'break-plant',    type: FurnitureType.PLANT,      col: 21, row: 24 },
    { uid: 'break-lamp',     type: FurnitureType.LAMP,       col: 24, row: 24 },
    { uid: 'break-shelf',    type: FurnitureType.BOOKSHELF,  col: 23, row: 22 },

    // ════════════════════════════════════════
    // LOUNGE — rows 27-29, cols 8-23
    // ════════════════════════════════════════
    { uid: 'lounge-sofa-1',  type: FurnitureType.SOFA,       col: 9,  row: 27 },
    { uid: 'lounge-sofa-2',  type: FurnitureType.SOFA,       col: 15, row: 27 },
    { uid: 'lounge-sofa-3',  type: FurnitureType.SOFA,       col: 20, row: 27 },
    { uid: 'lounge-ct-1',    type: FurnitureType.COFFEE_TABLE,col: 9, row: 29 },
    { uid: 'lounge-ct-2',    type: FurnitureType.COFFEE_TABLE,col: 15,row: 29 },
    { uid: 'lounge-ct-3',    type: FurnitureType.COFFEE_TABLE,col: 20,row: 29 },
    { uid: 'lounge-plant-1', type: FurnitureType.BIG_PLANT,  col: 8,  row: 27 },
    { uid: 'lounge-plant-2', type: FurnitureType.BIG_PLANT,  col: 22, row: 27 },
    { uid: 'lounge-plant-3', type: FurnitureType.PLANT,      col: 13, row: 28 },
    { uid: 'lounge-lamp-1',  type: FurnitureType.LAMP,       col: 8,  row: 29 },
    { uid: 'lounge-lamp-2',  type: FurnitureType.LAMP,       col: 22, row: 29 },
  ]

  return { version: 1, cols: DEFAULT_COLS, rows: DEFAULT_ROWS, tiles, tileColors, furniture }
}

/** Serialize layout to JSON string */
export function serializeLayout(layout: OfficeLayout): string {
  return JSON.stringify(layout)
}

/** Deserialize layout from JSON string, migrating old tile types if needed */
export function deserializeLayout(json: string): OfficeLayout | null {
  try {
    const obj = JSON.parse(json)
    if (obj && obj.version === 1 && Array.isArray(obj.tiles) && Array.isArray(obj.furniture)) {
      return migrateLayout(obj as OfficeLayout)
    }
  } catch { /* ignore parse errors */ }
  return null
}

/**
 * Ensure layout has tileColors. If missing, generate defaults based on tile types.
 * Exported for use by message handlers that receive layouts over the wire.
 */
export function migrateLayoutColors(layout: OfficeLayout): OfficeLayout {
  return migrateLayout(layout)
}

/**
 * Migrate old layouts that use legacy tile types (TILE_FLOOR=1, WOOD_FLOOR=2, CARPET=3, DOORWAY=4)
 * to the new pattern-based system. If tileColors is already present, no migration needed.
 */
function migrateLayout(layout: OfficeLayout): OfficeLayout {
  if (layout.tileColors && layout.tileColors.length === layout.tiles.length) {
    return layout // Already migrated
  }

  // Check if any tiles use old values (1-4) — these map directly to FLOOR_1-4
  // but need color assignments
  const tileColors: Array<FloorColor | null> = []
  for (const tile of layout.tiles) {
    switch (tile) {
      case 0: // WALL
        tileColors.push(null)
        break
      case 1: // FLOOR_1 conference (blue-gray)
        tileColors.push(COLOR_CONFERENCE)
        break
      case 2: // FLOOR_2 main area (beige)
        tileColors.push(COLOR_MAIN)
        break
      case 3: // FLOOR_3 break area (purple)
        tileColors.push(COLOR_BREAK)
        break
      case 4: // was DOORWAY → FLOOR_4 tan
        tileColors.push(COLOR_DOORWAY)
        break
      case 5: // FLOOR_5 polished concrete (entry/reception)
        tileColors.push(COLOR_ENTRY)
        break
      case 6: // FLOOR_6 warm amber (offices)
        tileColors.push(COLOR_OFFICE)
        break
      default:
        // Other tile types without colors — use neutral gray
        tileColors.push(tile > 0 ? { h: 0, s: 0, b: 0, c: 0 } : null)
    }
  }

  return { ...layout, tileColors }
}
