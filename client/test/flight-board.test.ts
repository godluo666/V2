import { describe, expect, it } from 'vitest';
import {
  FLIGHT_HANGARS, FLIGHT_TRACK, PAWN_OFFSETS, pawnPoint, roundedTrackPoint, runwayPoint,
  trackCellForColour, trackColourIndex,
} from '../src/ui/flightBoard';

describe('graphical flying-chess board geometry', () => {
  it('lays out 52 unique, evenly advancing cells inside the paper board', () => {
    expect(FLIGHT_TRACK).toHaveLength(52);
    const rounded = new Set(FLIGHT_TRACK.map((point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`));
    expect(rounded.size).toBe(52);
    for (const point of FLIGHT_TRACK) {
      expect(point.x).toBeGreaterThanOrEqual(72);
      expect(point.x).toBeLessThanOrEqual(528);
      expect(point.y).toBeGreaterThanOrEqual(72);
      expect(point.y).toBeLessThanOrEqual(528);
    }
    const distances = FLIGHT_TRACK.map((point, index) => {
      const next = FLIGHT_TRACK[(index + 1) % FLIGHT_TRACK.length];
      return Math.hypot(next.x - point.x, next.y - point.y);
    });
    expect(Math.min(...distances)).toBeGreaterThan(25);
    expect(Math.max(...distances)).toBeLessThan(35);
  });

  it('keeps the four starts quarter-turn symmetric', () => {
    const starts = [0, 13, 26, 39].map(roundedTrackPoint);
    for (let index = 1; index < 4; index++) {
      const previous = starts[index - 1];
      const current = starts[index];
      expect(current.x - 300).toBeCloseTo(-(previous.y - 300), 5);
      expect(current.y - 300).toBeCloseTo(previous.x - 300, 5);
    }
  });

  it('colours the shared circuit in the four-colour jump cycle', () => {
    expect(Array.from({ length: 12 }, (_, index) => trackColourIndex(index))).toEqual([
      0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3,
    ]);
    expect(trackColourIndex(-1)).toBe(3);
  });

  it('marks every server-authoritative same-colour jump and no false jump cell', () => {
    for (let colour = 0; colour < 4; colour++) {
      expect(Array.from({ length: 13 }, (_, occurrence) => (
        trackColourIndex(trackCellForColour(colour, occurrence))
      ))).toEqual(Array(13).fill(colour));
      for (let progress = 0; progress < 52; progress++) {
        const globalCell = (colour * 13 + progress) % 52;
        expect(trackColourIndex(globalCell) === colour).toBe(progress % 4 === 0);
      }
    }
  });

  it('maps home, shared track, colour runway and finish to distinct graphical regions', () => {
    for (let colour = 0; colour < 4; colour++) {
      for (let pawn = 0; pawn < 4; pawn++) {
        const home = pawnPoint(colour, pawn, -1, 56);
        expect(home.x).toBeCloseTo(FLIGHT_HANGARS[colour].x + PAWN_OFFSETS[pawn].x * 1.65);
        expect(home.y).toBeCloseTo(FLIGHT_HANGARS[colour].y + PAWN_OFFSETS[pawn].y * 1.65);
      }
      expect(pawnPoint(colour, 0, 0, 56)).toEqual(FLIGHT_TRACK[colour * 13]);
      expect(pawnPoint(colour, 0, 52, 56)).toEqual(runwayPoint(colour, 0));
      const finish = pawnPoint(colour, 0, 56, 56);
      expect(Math.hypot(finish.x - 300, finish.y - 300)).toBeLessThan(28);
    }
  });
});
