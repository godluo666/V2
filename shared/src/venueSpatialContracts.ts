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
  rearAisleTransition: {
    // Five real treads descend from the 1.9m highest row to the rear
    // base-floor concourse.  Both visible geometry and floorHeightAt consume
    // this contract, so the entrance route never relies on a vertical snap.
    x: [-6.3, 6.3] as const,
    frontZ: 8.825,
    width: 1.55,
    stepDepth: 0.42,
    steps: 5,
    stepRise: 0.38,
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
    // Five contiguous starters form the central player bench; three reserves
    // stay on the rear tier so nc-s0..7 interactions remain available.
    x: [-4.4, -2.2, 0, 2.2, 4.4] as const,
    reserveX: [-2.2, 0, 2.2] as const,
    rowZ: [-6.3, -1.6] as const,
    seatZ: [-5.05, -2.85] as const,
    deckY: 0.6,
    seatY: 1.07,
  },
  sideStandAisles: {
    x: [-1, 1] as const,
    firstCenterX: 13.85,
    rowSpacing: 1.35,
    rows: 4,
    centerZ: 0.58,
    treadWidth: 1.32,
    treadDepth: 2.2,
    firstRise: 0.42,
    rowRise: 0.62,
  },
} as const;

export const MEDIA_SCREEN_CONTRACTS = {
  [CINEMA_SPATIAL_CONTRACT.screen.id]: CINEMA_SPATIAL_CONTRACT.screen,
  [ARENA_SPATIAL_CONTRACT.screen.id]: ARENA_SPATIAL_CONTRACT.screen,
} as const;
