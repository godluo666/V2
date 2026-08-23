import { describe, expect, it } from 'vitest';
import { FlyingChessTable } from '../src/game/flyingChess';
import type { Session } from '../src/game/session';

function player(id: number, username: string): Session {
  return {
    id,
    user: { id, username, avatar: {} },
  } as unknown as Session;
}

describe('physical flying-chess stall rules', () => {
  it('lets a player choose a graphical colour hangar and protects occupied colours', () => {
    const table = new FlyingChessTable('street-flight');
    const red = player(1, 'red');
    const green = player(2, 'green');
    expect(table.join(red, 0)).toBeNull();
    expect(table.join(green, 0)).toContain('红色已经有人');
    expect(table.join(green, 3)).toBeNull();
    expect(table.players[0]).toBe(red);
    expect(table.players[3]).toBe(green);
  });

  it('requires a six to launch and grants another roll after moving a six', () => {
    const table = new FlyingChessTable('street-flight');
    const red = player(1, 'red');
    table.join(red);

    table.dice = 4;
    expect(table.publicState().legalMoves).toEqual([]);
    expect(table.move(red, 0)).toBe('这枚棋子现在不能移动。');
    expect(table.pass(red)).toBeNull();

    table.dice = 6;
    expect(table.move(red, 0)).toBeNull();
    expect(table.pawns[0][0]).toBe(0);
    expect(table.turn).toBe(0);
    expect(table.dice).toBeNull();
  });

  it('jumps on a matching cell and uses the marked shortcut', () => {
    const table = new FlyingChessTable('street-flight');
    const red = player(1, 'red');
    table.join(red);
    table.pawns[0][0] = 12;
    table.dice = 4;

    expect(table.move(red, 0)).toBeNull();
    expect(table.pawns[0][0]).toBe(30);
    expect(table.lastEvent).toContain('飞过捷径');
  });

  it('captures every opposing pawn on the landing cell', () => {
    const table = new FlyingChessTable('street-flight');
    const red = player(1, 'red');
    const blue = player(2, 'blue');
    table.join(red);
    table.join(blue);
    table.pawns[0][0] = 12;
    table.pawns[1][0] = 0; // both resolve to global cell 13 after red moves
    table.dice = 1;

    expect(table.move(red, 0)).toBeNull();
    expect(table.pawns[1][0]).toBe(-1);
    expect(table.lastEvent).toContain('撞回 1 架飞机');
  });

  it('bounces at the exact finish and detects a completed colour', () => {
    const table = new FlyingChessTable('street-flight');
    const red = player(1, 'red');
    table.join(red);
    table.pawns[0] = [56, 56, 56, 55];
    table.dice = 3;
    expect(table.move(red, 3)).toBeNull();
    expect(table.pawns[0][3]).toBe(54);
    expect(table.winner).toBe(-1);

    table.dice = 2;
    expect(table.move(red, 3)).toBeNull();
    expect(table.pawns[0][3]).toBe(56);
    expect(table.winner).toBe(0);
  });
});
