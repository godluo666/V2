/** Pure graphical-board geometry shared by rendering and regression tests. */
export type FlightPoint = Readonly<{ x: number; y: number }>;

export function roundedTrackPoint(index: number): FlightPoint {
  const half = 228;
  const radius = 70;
  const straight = (half - radius) * 2;
  const arc = Math.PI * radius / 2;
  const quarter = straight + arc;
  const perimeter = quarter * 4;
  // Half a straight offset puts the four colour starts at the cardinal axes.
  let distance = (index * perimeter / 52 + straight / 2) % perimeter;
  const side = Math.floor(distance / quarter);
  distance -= side * quarter;
  let x = 0;
  let y = 0;
  if (distance <= straight) {
    const along = distance - straight / 2;
    if (side === 0) { x = along; y = -half; }
    else if (side === 1) { x = half; y = along; }
    else if (side === 2) { x = -along; y = half; }
    else { x = -half; y = -along; }
  } else {
    const theta = (distance - straight) / arc * Math.PI / 2;
    if (side === 0) { x = half - radius + Math.sin(theta) * radius; y = -half + radius - Math.cos(theta) * radius; }
    else if (side === 1) { x = half - radius + Math.cos(theta) * radius; y = half - radius + Math.sin(theta) * radius; }
    else if (side === 2) { x = -half + radius - Math.sin(theta) * radius; y = half - radius + Math.cos(theta) * radius; }
    else { x = -half + radius - Math.cos(theta) * radius; y = -half + radius - Math.sin(theta) * radius; }
  }
  return { x: 300 + x, y: 300 + y };
}

export const FLIGHT_TRACK: readonly FlightPoint[] = Array.from(
  { length: 52 },
  (_, index) => roundedTrackPoint(index),
);

export const FLIGHT_HANGARS: readonly FlightPoint[] = [
  { x: 104, y: 104 }, { x: 496, y: 104 }, { x: 496, y: 496 }, { x: 104, y: 496 },
];

export const PAWN_OFFSETS: readonly FlightPoint[] = [
  { x: -13, y: -13 }, { x: 13, y: -13 }, { x: -13, y: 13 }, { x: 13, y: 13 },
];

/** Global cells repeat red → blue → yellow → green. A pawn's relative
 * progress is jump-eligible exactly when it lands on its own cycle colour. */
export function trackColourIndex(index: number): number {
  return ((index % 4) + 4) % 4;
}

/** Global circuit index of one colour's Nth painted cell. Both the SVG board
 * and the physical 3D board use this mapping so their inlays cannot drift. */
export function trackCellForColour(colour: number, occurrence: number): number {
  return ((colour + occurrence * 4) % 52 + 52) % 52;
}

export function runwayPoint(colour: number, step: number): FlightPoint {
  const angle = -Math.PI / 2 + colour * Math.PI / 2;
  const radius = 150 - step * 34;
  return { x: 300 + Math.cos(angle) * radius, y: 300 + Math.sin(angle) * radius };
}

export function pawnPoint(colour: number, pawn: number, progress: number, finish: number): FlightPoint {
  if (progress < 0) {
    const home = FLIGHT_HANGARS[colour];
    return { x: home.x + PAWN_OFFSETS[pawn].x * 1.65, y: home.y + PAWN_OFFSETS[pawn].y * 1.65 };
  }
  if (progress === finish) {
    const angle = -Math.PI / 2 + colour * Math.PI / 2;
    return {
      x: 300 + Math.cos(angle) * 20 + PAWN_OFFSETS[pawn].x * 0.35,
      y: 300 + Math.sin(angle) * 20 + PAWN_OFFSETS[pawn].y * 0.35,
    };
  }
  if (progress >= 52) return runwayPoint(colour, progress - 52);
  return FLIGHT_TRACK[(progress + colour * 13) % 52];
}
