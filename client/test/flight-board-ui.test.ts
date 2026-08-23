import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../src/ui/GamePanelsCn.tsx', import.meta.url), 'utf8');

describe('graphical flying-chess interaction presentation', () => {
  it('never replaces an SVG pawn translation while highlighting a legal move', () => {
    expect(styles).toContain('.flight-pawn.legal:hover { filter:');
    expect(styles).not.toMatch(/\.flight-pawn\.legal:hover\s*\{[^}]*\btransform\s*:/s);
  });

  it('supports touch, reduced motion and short landscape screens', () => {
    expect(styles).toMatch(/\.flight-board\s*\{[^}]*touch-action:\s*manipulation/s);
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(styles).toContain('@media (max-height: 620px) and (orientation: landscape)');
    expect(styles).toMatch(/\.flight-board-shell\s*\{\s*grid-column:\s*1;\s*grid-row:\s*1 \/ 4;/s);
  });

  it('renders directional cells and a live turn-colour ring instead of relying on prose', () => {
    expect(panel).toContain('className="flight-turn-ring"');
    expect(panel).toContain('transform={`rotate(${arrowAngle} ${point.x} ${point.y})`}');
    expect(panel).toContain("onClick={legal ? () => send('move', { pawn }) : undefined}");
  });
});
