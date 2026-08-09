import type { FlyingChessState, PublicProfile } from '@nexuspark/shared';
import type { Session } from './session';

const EMPTY = -1;
const FINISH = 52;

function profileOf(session: Session | null): PublicProfile | null {
  if (!session) return null;
  return {
    id: session.id,
    userId: session.user.id,
    username: session.user.username,
    avatar: session.user.avatar,
  };
}

/** Small authoritative four-player flying-chess table for the club street
 * stall. The board is intentionally deterministic and server-owned; clients
 * only request a roll or a pawn move and render the resulting state. */
export class FlyingChessTable {
  readonly machineId: string;
  players: [Session | null, Session | null, Session | null, Session | null] = [null, null, null, null];
  pawns: [number[], number[], number[], number[]] = [
    [EMPTY, EMPTY, EMPTY, EMPTY],
    [EMPTY, EMPTY, EMPTY, EMPTY],
    [EMPTY, EMPTY, EMPTY, EMPTY],
    [EMPTY, EMPTY, EMPTY, EMPTY],
  ];
  turn = -1;
  dice: number | null = null;
  winner = -1;

  constructor(machineId: string) {
    this.machineId = machineId;
  }

  private slot(session: Session): number {
    return this.players.indexOf(session);
  }

  private nextTurn(from: number): void {
    for (let step = 1; step <= 4; step += 1) {
      const candidate = (from + step) % 4;
      if (this.players[candidate]) {
        this.turn = candidate;
        return;
      }
    }
    this.turn = -1;
  }

  join(session: Session): string | null {
    const existing = this.slot(session);
    if (existing >= 0) {
      if (this.winner >= 0) this.reset();
      return null;
    }
    const slot = this.players.findIndex((player) => player === null);
    if (slot < 0) return '地摊飞行棋的四个颜色都坐满了。';
    this.players[slot] = session;
    if (this.turn < 0) this.turn = slot;
    return null;
  }

  leave(session: Session): boolean {
    const slot = this.slot(session);
    if (slot < 0) return false;
    this.players[slot] = null;
    this.pawns[slot] = [EMPTY, EMPTY, EMPTY, EMPTY];
    if (this.turn === slot) {
      this.dice = null;
      this.nextTurn(slot);
    }
    if (this.players.every((player) => player === null)) this.reset();
    return true;
  }

  roll(session: Session): string | null {
    const slot = this.slot(session);
    if (slot < 0) return '先入座才能掷骰子。';
    if (this.winner >= 0) return '这一局已经结束，重新入座即可再开一局。';
    if (this.turn !== slot) return '还没轮到你的颜色。';
    if (this.dice !== null) return '请先移动棋子或结束本回合。';
    this.dice = 1 + Math.floor(Math.random() * 6);
    return null;
  }

  pass(session: Session): string | null {
    const slot = this.slot(session);
    if (slot < 0 || this.turn !== slot) return '还没轮到你的颜色。';
    if (this.dice === null) return '请先掷骰子。';
    this.dice = null;
    this.nextTurn(slot);
    return null;
  }

  move(session: Session, pawn: number): string | null {
    const slot = this.slot(session);
    if (slot < 0 || this.turn !== slot) return '还没轮到你的颜色。';
    if (this.dice === null) return '请先掷骰子。';
    if (pawn < 0 || pawn > 3) return '棋子编号无效。';
    const current = this.pawns[slot][pawn];
    const next = current === EMPTY ? (this.dice === 6 ? 0 : EMPTY) : current + this.dice;
    if (next === EMPTY) return '只有掷出六点才能从家里出发。';
    if (next > FINISH) return '这枚棋子走不满点数，请换一枚。';
    this.pawns[slot][pawn] = next;
    this.dice = null;
    if (this.pawns[slot].every((position) => position === FINISH)) {
      this.winner = slot;
      return null;
    }
    this.nextTurn(slot);
    return null;
  }

  reset(): void {
    this.pawns = [
      [EMPTY, EMPTY, EMPTY, EMPTY],
      [EMPTY, EMPTY, EMPTY, EMPTY],
      [EMPTY, EMPTY, EMPTY, EMPTY],
      [EMPTY, EMPTY, EMPTY, EMPTY],
    ];
    this.dice = null;
    this.winner = -1;
    this.turn = this.players.findIndex((player) => player !== null);
  }

  publicState(): FlyingChessState {
    return {
      machineId: this.machineId,
      players: this.players.map(profileOf) as FlyingChessState['players'],
      pawns: this.pawns.map((positions) => [...positions]) as FlyingChessState['pawns'],
      turn: this.turn,
      dice: this.dice,
      winner: this.winner,
    };
  }
}
