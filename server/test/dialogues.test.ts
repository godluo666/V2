import { describe, expect, it } from 'vitest';
import { LAYOUTS, SPACE } from '@nexuspark/shared';
import { DIALOGUES, resolveDialogueNode } from '../src/game/dialogues';

describe('street dialogue trees', () => {
  it('keeps every local next-node reference valid', () => {
    for (const [dialogueId, nodes] of Object.entries(DIALOGUES)) {
      expect(nodes.root, `${dialogueId} needs a root node`).toBeDefined();
      for (const [nodeId, node] of Object.entries(nodes)) {
        expect(node.options.length, `${dialogueId}.${nodeId} needs an exit`).toBeGreaterThan(0);
        for (const option of node.options) {
          if (option.next) {
            expect(nodes[option.next], `${dialogueId}.${nodeId} -> ${option.next}`).toBeDefined();
          }
        }
      }
    }
  });

  it('exposes the new lived-in street pause points', () => {
    expect(resolveDialogueNode('florist', 'root')).not.toBeNull();
    expect(resolveDialogueNode('stairwatcher', 'top')).not.toBeNull();
    expect(resolveDialogueNode('flight_regular', 'play')?.text).toContain('实体骰子');
  });

  it('backs every authored street NPC with a resolvable dialogue root', () => {
    for (const npc of LAYOUTS[SPACE.PLAZA].npcs) {
      expect(resolveDialogueNode(npc.dialogueId, 'root'), npc.name).not.toBeNull();
    }
  });
});
