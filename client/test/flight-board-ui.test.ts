import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../src/ui/GamePanelsCn.tsx', import.meta.url), 'utf8');
const physicalBoard = readFileSync(new URL('../src/world3d/prefabs/clubInteriors.tsx', import.meta.url), 'utf8');
const sharedLayouts = readFileSync(new URL('../../shared/src/layouts.ts', import.meta.url), 'utf8');
const cloudSmoke = readFileSync(new URL('../../scripts/smoke.mjs', import.meta.url), 'utf8');
const streetAudit = readFileSync(new URL('../../scripts/street-audit.mjs', import.meta.url), 'utf8');
const evidenceValidator = readFileSync(new URL('../../scripts/validate-evidence.mjs', import.meta.url), 'utf8');
const cloudWorkflow = readFileSync(new URL('../../.github/workflows/cloud-tests.yml', import.meta.url), 'utf8');

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

  it('makes the physical street-stall screenshot mandatory cloud evidence', () => {
    expect(cloudSmoke).toContain("'street-flight-stall-desktop.png'");
    expect(evidenceValidator).toContain("['street-flight-stall-desktop.png', desktop]");
  });

  it('uses one walkable full-scale physical rug instead of a miniature duplicate table', () => {
    expect(physicalBoard).toContain('scale={[5.12, 0.07, 5.12]}');
    expect(physicalBoard).toContain('transform.scale.set(0.145, 0.02, 0.145)');
    expect(physicalBoard).toContain('<boxGeometry args={[0.5, 0.5, 0.5]} />');
    expect(physicalBoard).toContain('game?.pawns.flatMap');
    expect(sharedLayouts.match(/b\.prop\('club_flying_chess'/g)).toHaveLength(1);
    expect(sharedLayouts).not.toContain('b.box(flightX, flightZ,');
    expect(cloudSmoke).toContain("machineId: 'gr-flight', action: 'roll'");
    expect(cloudSmoke).toContain("canMove ? 'move' : 'pass'");
  });

  it('requires the rebuilt curve, termini, stairs, courtyard and service alley audit views', () => {
    const requiredAuditFiles = [
      '01-spawn-east.png', '02-spawn-west.png',
      '02a-west-terminus.png', '02b-east-terminus.png',
      '02c-west-curve-east.png', '02d-east-curve-west.png',
      '03-stair-mouth.png', '04-stair-top.png',
      '05-flight-courtyard.png',
      '06-service-alley-mouth.png', '06a-service-alley-interior.png',
    ];
    for (const file of requiredAuditFiles) {
      expect(streetAudit).toContain(`'${file}'`);
      expect(evidenceValidator).toContain(`['${file}', audit]`);
    }
    expect(streetAudit).toContain("'spawn', 'termini', 'curve', 'stairs', 'flight', 'service-alley'");
    expect(streetAudit).toContain('const streetZ = (x) => Math.sin((x + 4) / 18) * 3.2 + x * 0.025;');
    expect(streetAudit).toContain('const stairX = -12.4;');
    expect(streetAudit).toContain('const flightX = -2.5;');
    expect(streetAudit).toContain('const alleyX = 24;');
    expect(streetAudit).toContain("await reach(page, -38, streetZ(-38), 'west street terminus');");
    expect(streetAudit).toContain("await reach(page, 38, streetZ(38), 'east street terminus');");
    expect(cloudWorkflow).toContain('scripts/street-audit.mjs');
    expect(cloudWorkflow).toContain('Twenty-two required visual-evidence frames');
  });
});
