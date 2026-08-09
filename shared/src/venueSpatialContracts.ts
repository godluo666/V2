/**
 * Authoritative spatial data shared by gameplay, collision and venue art.
 *
 * Keep only coordinates that affect interaction or visible alignment here.
 * Decorative trims and one-off props stay in their scene modules.
 */
export const CINEMA_SPATIAL_CONTRACT = {
  bounds: { minX: -17, maxX: 17, minZ: -15, maxZ: 15 },
  ceilingY: 13.5,
  rearEntryZ: 14.7,
  exit: { position: [0, 0, 14.7] as const },
  screen: {
    id: 'cine-screen',
    position: [0, 6.8, -14.35] as const,
    width: 24,
    height: 10,
  },
  seating: {
    x: [-12, -10.8, -9.6, -3, -1.8, -0.6, 0.6, 1.8, 3, 9.6, 10.8, 12] as const,
    rows: 6,
    firstZ: -5.2,
    rowSpacing: 2.55,
    rowRise: 0.38,
    aisleX: [-6.3, 6.3] as const,
  },
} as const;

export const ARENA_SPATIAL_CONTRACT = {
  bounds: { minX: -21, maxX: 21, minZ: -17, maxZ: 17 },
  ceilingY: 13,
  exit: { position: [0, 0, 16.7] as const },
  screen: {
    id: 'nc-wall',
    position: [0, 7.2, -16.55] as const,
    width: 22.4,
    height: 7.6,
  },
  stations: {
    x: [-6.6, -2.2, 2.2, 6.6] as const,
    rowZ: [-6.3, -1.6] as const,
    seatZ: [-5.05, -2.85] as const,
    deckY: 0.6,
    seatY: 1.07,
  },
} as const;

export const MEDIA_SCREEN_CONTRACTS = {
  [CINEMA_SPATIAL_CONTRACT.screen.id]: CINEMA_SPATIAL_CONTRACT.screen,
  [ARENA_SPATIAL_CONTRACT.screen.id]: ARENA_SPATIAL_CONTRACT.screen,
} as const;
