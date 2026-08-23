import type { FlyingChessState, PublicProfile } from '@nexuspark/shared';
import type { Session } from './session';

const HOME = -1;
const TRACK_CELLS = 52;
const GOAL_START = 52;
const FINISH = 56;
const SHORTCUT_FROM = 16;
const SHORTCUT_TO = 30;

function profileOf(session: Session | null): PublicProfile | null {
  if (!session) return null;
  return {
    id: session.id,
    userId: session.user.id,
    username: session.user.username,
    avatar: session.user.avatar,
  };
}

function globalCell(colour: number, progress: number): number | null {
  if (progress < 0 || progress >= TRACK_CELLS) return null;
  return (progress + colour * 13) % TRACK_CELLS;
}

/**
 * Authoritative four-player flying chess used by the physical street stall.
 * Progress is relative to each colour: -1 is the hangar, 0..51 is the shared
 * circuit, 52..55 is that colour's home runway, and 56 is finished.
 */
export class FlyingChessTable {
  readonly machineId: string;
  players: [Session | null, Session | null, Session | null, Session | null] = [null, null, null, null];
  pawns: [number[], number[], number[], number[]] = [
    [HOME, HOME, HOME, HOME],
    [HOME, HOME, HOME, HOME],
    [HOME, HOME, HOME, HOME],
    [HOME, HOME, HOME, HOME],
  ];
  turn = -1;
  dice: number | null = null;
  winner = -1;
  lastEvent = '等待街坊入座。';

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

  private legalMovesFor(colour: number): number[] {
    if (colour < 0 || this.dice === null) return [];
    const roll = this.dice;
    const legal: number[] = [];
    for (let pawn = 0; pawn < 4; pawn += 1) {
      const current = this.pawns[colour][pawn];
      if (current === FINISH) continue;
      if (current === HOME ? roll === 6 : true) legal.push(pawn);
    }
    return legal;
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
    this.lastEvent = `${session.user.username} 选了${['红', '蓝', '黄', '绿'][slot]}色。`;
    return null;
  }

  leave(session: Session): boolean {
    const slot = this.slot(session);
    if (slot < 0) return false;
    this.players[slot] = null;
    this.pawns[slot] = [HOME, HOME, HOME, HOME];
    if (this.turn === slot) {
      this.dice = null;
      this.nextTurn(slot);
    }
    this.lastEvent = `${session.user.username} 离开了棋摊。`;
    if (this.players.every((player) => player === null)) this.reset();
    return true;
  }

  roll(session: Session): string | null {
    const slot = this.slot(session);
    if (slot < 0) return '先在棋摊选一个颜色。';
    if (this.winner >= 0) return '这一局已经结束，点击“再来一局”即可重开。';
    if (this.turn !== slot) return '还没轮到你的颜色。';
    if (this.dice !== null) return '请先移动棋子。';
    this.dice = 1 + Math.floor(Math.random() * 6);
    this.lastEvent = `${session.user.username} 掷出了 ${this.dice} 点。`;
    return null;
  }

  pass(session: Session): string | null {
    const slot = this.slot(session);
    if (slot < 0 || this.turn !== slot) return '还没轮到你的颜色。';
    if (this.dice === null) return '请先掷骰子。';
    if (this.legalMovesFor(slot).length > 0) return '还有棋子可以走，不能跳过这一回合。';
    const roll = this.dice;
    this.dice = null;
    this.lastEvent = `${session.user.username} 没有能移动的棋子。`;
    if (roll !== 6) this.nextTurn(slot);
    return null;
  }

  move(session: Session, pawn: number): string | null {
    const slot = this.slot(session);
    if (slot < 0 || this.turn !== slot) return '还没轮到你的颜色。';
    if (this.dice === null) return '请先掷骰子。';
    if (!Number.isInteger(pawn) || pawn < 0 || pawn > 3) return '棋子编号无效。';
    if (!this.legalMovesFor(slot).includes(pawn)) return '这枚棋子现在不能移动。';

    const roll = this.dice;
    const current = this.pawns[slot][pawn];
    let next = current === HOME ? 0 : current + roll;
    let event = current === HOME ? '起飞' : `前进 ${roll} 格`;

    // The goal runway requires an exact finish. Overshoots bounce back.
    if (next > FINISH) {
      next = FINISH - (next - FINISH);
      event += '，在终点折返';
    }

    // Landing on a matching coloured cell jumps four spaces. The marked
    // corner cell additionally takes the diagonal shortcut across the board.
    if (next < GOAL_START && next > 0 && next % 4 === 0) {
      if (next === SHORTCUT_FROM) {
        next = SHORTCUT_TO;
        event += '，飞过捷径';
      } else {
        next = Math.min(GOAL_START - 1, next + 4);
        event += '，同色跳跃 4 格';
      }
    }

    this.pawns[slot][pawn] = next;

    // Pawns are safe in their own runway. On the shared circuit, every enemy
    // on the landing cell is sent back to its hangar.
    const landing = globalCell(slot, next);
    let captures = 0;
    if (landing !== null) {
      for (let colour = 0; colour < 4; colour += 1) {
        if (colour === slot) continue;
        for (let other = 0; other < 4; other += 1) {
          if (globalCell(colour, this.pawns[colour][other]) === landing) {
            this.pawns[colour][other] = HOME;
            captures += 1;
          }
        }
      }
    }
    if (captures > 0) event += `，撞回 ${captures} 架飞机`;
    if (next === FINISH) event += '，到达终点';
    this.lastEvent = `${session.user.username} 的 ${pawn + 1} 号飞机${event}。`;
    this.dice = null;

    if (this.pawns[slot].every((position) => position === FINISH)) {
      this.winner = slot;
      this.lastEvent = `${session.user.username} 的四架飞机全部到达，赢得本局！`;
      return null;
    }

    // A six earns another roll after the move.
    if (roll !== 6) this.nextTurn(slot);
    else this.lastEvent += ' 掷出六点，再掷一次。';
    return null;
  }

  reset(): void {
    this.pawns = [
      [HOME, HOME, HOME, HOME],
      [HOME, HOME, HOME, HOME],
      [HOME, HOME, HOME, HOME],
      [HOME, HOME, HOME, HOME],
    ];
    this.dice = null;
    this.winner = -1;
    this.turn = this.players.findIndex((player) => player !== null);
    this.lastEvent = '新一局开始，掷出六点即可起飞。';
  }

  publicState(): FlyingChessState {
    return {
      machineId: this.machineId,
      players: this.players.map(profileOf) as FlyingChessState['players'],
      pawns: this.pawns.map((positions) => [...positions]) as FlyingChessState['pawns'],
      turn: this.turn,
      dice: this.dice,
      winner: this.winner,
      finish: FINISH,
      legalMoves: this.turn >= 0 ? this.legalMovesFor(this.turn) : [],
      lastEvent: this.lastEvent,
    };
  }
}
