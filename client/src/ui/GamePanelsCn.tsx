/** 象棋与福州麻将的操作面板(便捷 2D 视角;3D 桌面供围观)。 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useWorld } from '../state/stores';
import { connection } from '../net/connection';
import { hot } from '../state/hot';
import { audio } from '../audio/engine';
import {
  xqMovesFrom, xqIsRed, XQ_CHAR, mjTileName, mjSuit,
} from '@nexuspark/shared';
import type { MahjongView } from '@nexuspark/shared';
import {
  FLIGHT_HANGARS, FLIGHT_TRACK, PAWN_OFFSETS, pawnPoint, runwayPoint,
} from './flightBoard';

/* ─── 象棋 ───────────────────────────────────────────────────────────────── */
export function XiangqiPanel({ tableId }: { tableId: string }) {
  const game = useWorld((s) => s.xq[tableId]);
  const [sel, setSel] = useState<number | null>(null);
  if (!game) return <div className="dim">棋桌不见了……</div>;
  const meIdx = game.players[0]?.id === hot.selfId ? 0 : game.players[1]?.id === hot.selfId ? 1 : -1;
  const seated = meIdx !== -1;
  const myTurn = seated && game.turn === meIdx && game.winner === -1 && game.players[0] && game.players[1];
  const targets = useMemo(() => (sel !== null ? new Set(xqMovesFrom(game.board, sel)) : new Set<number>()), [sel, game.board]);

  const cellClick = (idx: number) => {
    if (!myTurn) return;
    const piece = game.board[idx];
    const mine = piece && xqIsRed(piece) === (meIdx === 0);
    if (sel === null) {
      if (mine) { setSel(idx); audio.click(); }
      return;
    }
    if (mine && idx !== sel) { setSel(idx); audio.click(); return; }
    if (targets.has(idx)) {
      connection.send('xq_move', { tableId, from: sel, to: idx });
      setSel(null);
    } else if (idx === sel) {
      setSel(null);
    }
  };

  // 红方在下(y=0 在底部);黑方玩家翻转视角
  const flip = meIdx === 1;
  const rows = [];
  for (let ry = 0; ry < 10; ry++) {
    const y = flip ? ry : 9 - ry;
    const cells = [];
    for (let rx = 0; rx < 9; rx++) {
      const x = flip ? 8 - rx : rx;
      const idx = y * 9 + x;
      const piece = game.board[idx];
      const isSel = sel === idx;
      const isTarget = targets.has(idx);
      const isLast = game.lastMove?.includes(idx);
      cells.push(
        <div
          key={x}
          onClick={() => cellClick(idx)}
          style={{
            width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: myTurn ? 'pointer' : 'default', position: 'relative',
            background: isLast ? 'rgba(56,217,195,0.14)' : undefined,
          }}
        >
          {isTarget && (
            <div style={{
              position: 'absolute', inset: 6, borderRadius: '50%',
              border: piece ? '2px solid #ff6b6b' : undefined,
              background: piece ? undefined : 'rgba(56,217,195,0.35)',
            }} />
          )}
          {piece && (
            <div style={{
              width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 700,
              background: xqIsRed(piece) ? '#f5e6d3' : '#3a3f47',
              color: xqIsRed(piece) ? '#c0392b' : '#f2f2f2',
              border: `2px solid ${isSel ? '#38d9c3' : xqIsRed(piece) ? '#c0392b' : '#181b20'}`,
              boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
            }}>
              {XQ_CHAR[piece]}
            </div>
          )}
        </div>
      );
    }
    rows.push(<div key={ry} style={{ display: 'flex' }}>{cells}</div>);
    if (ry === 4) {
      rows.push(
        <div key="river" style={{ display: 'flex', justifyContent: 'space-around', color: '#8a6f52', fontSize: 13, letterSpacing: 12, padding: '1px 0' }}>
          <span>楚 河</span><span>汉 界</span>
        </div>
      );
    }
  }

  const name = (i: 0 | 1) => game.players[i]?.username ?? '虚位以待';
  return (
    <div className="col" style={{ alignItems: 'center' }}>
      <div className="dim" style={{ fontSize: 13 }}>
        红方:{name(0)} · 黑方:{name(1)}
        {seated && game.winner === -1 && game.players[0] && game.players[1] && (
          <b style={{ color: myTurn ? '#38d9c3' : undefined }}>{myTurn ? ' · 该你走棋!' : ' · 等对方走棋…'}</b>
        )}
      </div>
      <div style={{ background: '#e8d5b0', borderRadius: 10, padding: 8, border: '3px solid #8a6f52' }}>
        {rows}
      </div>
      <div style={{ minHeight: 20, fontSize: 14 }}>
        {game.winner !== -1 && <b>🏆 {game.winner === 0 ? '红方' : '黑方'}({name(game.winner)})获胜!</b>}
        {game.winner === -1 && (!game.players[0] || !game.players[1]) && <span className="dim">等待对手入座……</span>}
      </div>
      <div className="row">
        {!seated && <button className="btn primary" onClick={() => connection.send('game_join', { machineId: tableId })}>入座对弈</button>}
        {seated && game.winner !== -1 && <button className="btn primary" onClick={() => connection.send('game_join', { machineId: tableId })}>再来一局</button>}
        {seated && <button className="btn ghost" onClick={() => { connection.send('game_leave', { machineId: tableId }); setSel(null); }}>离席</button>}
      </div>
      <div className="dim" style={{ fontSize: 11 }}>民间规则:吃掉对方将/帅获胜,允许飞将。</div>
    </div>
  );
}

const FLIGHT_COLORS = ['#e8545f', '#3f9fe8', '#e8b83f', '#4dab6d'] as const;
const FLIGHT_DARK = ['#9f303b', '#24689d', '#9a741f', '#2d7647'] as const;
const FLIGHT_NAMES = ['红', '蓝', '黄', '绿'] as const;

function DiceFace({ value, active, pass, onActivate }: {
  value: number | null; active: boolean; pass: boolean; onActivate: () => void;
}) {
  const dots: Record<number, Array<[number, number]>> = {
    1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
    4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  };
  return (
    <g
      className={`flight-dice${value ? ' rolled' : ''}${active ? ' active' : ''}`}
      role={active ? 'button' : undefined}
      tabIndex={active ? 0 : undefined}
      aria-label={active
        ? pass ? '没有可走飞机，结束回合' : '掷骰子'
        : value === null ? '等待掷骰子' : `骰子点数 ${value}`}
      onClick={active ? onActivate : undefined}
      onKeyDown={active ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onActivate();
        }
      } : undefined}
    >
      <rect x={268} y={268} width={64} height={64} rx={13} fill="#fffdf6" stroke="#5e5143" strokeWidth={4} />
      {(value ? dots[value] : []).map(([dx, dy], index) => (
        <circle key={index} cx={300 + dx * 17} cy={300 + dy * 17} r={5.2} fill="#4d433a" />
      ))}
      {!value && <path d="M286 300h28M300 286v28" stroke="#9a8b78" strokeWidth={5} strokeLinecap="round" />}
    </g>
  );
}

/** Fully graphical, authoritative four-colour flying-chess board. */
export function FlyingChessPanel({ machineId }: { machineId: string }) {
  const game = useWorld((s) => s.flying[machineId]);
  if (!game) return <div className="dim">地摊棋局正在准备中…</div>;
  const me = game.players.findIndex((player) => player?.id === hot.selfId);
  const myTurn = me >= 0 && game.turn === me && game.winner < 0;
  const movable = new Set(game.legalMoves);
  const canRoll = myTurn && game.dice === null;
  const canPass = myTurn && game.dice !== null && movable.size === 0;
  const send = (action: 'join' | 'leave' | 'roll' | 'move' | 'pass', options: { pawn?: number; colour?: number } = {}) => {
    connection.send('flight_action', { machineId, action, ...options });
    audio.click();
  };

  return (
    <div className="flight-game">
      <div className="flight-roster">
        {game.players.map((player, colour) => {
          const done = game.pawns[colour].filter((position) => position === game.finish).length;
          return (
            <div
              key={colour}
              className={`flight-player ${game.turn === colour ? 'active' : ''} ${me === colour ? 'mine' : ''}`}
              style={{ '--flight-color': FLIGHT_COLORS[colour] } as CSSProperties}
            >
              <span className="flight-player-plane">✈</span>
              <span><b>{player?.username ?? `${FLIGHT_NAMES[colour]}色空位`}</b><small>{done}/4 抵达</small></span>
            </div>
          );
        })}
      </div>

      <div className="flight-board-shell">
        <svg className="flight-board" viewBox="0 0 600 600" role="group" aria-label="可操作的四色飞行棋棋盘">
          <defs>
            <filter id="flight-shadow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#3b2b20" floodOpacity=".28" />
            </filter>
            <pattern id="flight-paper" width="18" height="18" patternUnits="userSpaceOnUse">
              <rect width="18" height="18" fill="#f7efd9" />
              <path d="M0 18L18 0" stroke="#e9dec5" strokeWidth=".7" opacity=".55" />
            </pattern>
          </defs>
          <rect x={8} y={8} width={584} height={584} rx={32} fill="url(#flight-paper)" stroke="#755e47" strokeWidth={8} />

          {FLIGHT_HANGARS.map((home, colour) => {
            const joinable = me < 0 && !game.players[colour];
            return (
            <g
              key={`home-${colour}`}
              className={`flight-hangar${joinable ? ' joinable' : ''}`}
              role={joinable ? 'button' : undefined}
              tabIndex={joinable ? 0 : undefined}
              aria-label={joinable ? `选择${FLIGHT_NAMES[colour]}色机库` : undefined}
              onClick={joinable ? () => send('join', { colour }) : undefined}
              onKeyDown={joinable ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  send('join', { colour });
                }
              } : undefined}
            >
              <rect x={home.x - 67} y={home.y - 67} width={134} height={134} rx={30}
                fill={FLIGHT_COLORS[colour]} opacity={game.players[colour] ? 0.19 : 0.1}
                stroke={FLIGHT_COLORS[colour]} strokeWidth={5} strokeDasharray={game.players[colour] ? undefined : '10 8'} />
              <path d={`M${home.x - 35} ${home.y + 48} Q${home.x} ${home.y + 25} ${home.x + 35} ${home.y + 48}`}
                fill="none" stroke={FLIGHT_DARK[colour]} strokeWidth={5} strokeLinecap="round" opacity={0.55} />
              <text x={home.x} y={home.y - 42} textAnchor="middle" fill={FLIGHT_DARK[colour]} fontSize={18} fontWeight={800}>✈ {FLIGHT_NAMES[colour]}色机库</text>
              {PAWN_OFFSETS.map((offset, pawn) => (
                <circle key={pawn} cx={home.x + offset.x * 1.65} cy={home.y + offset.y * 1.65} r={16}
                  fill="#fffaf0" stroke={FLIGHT_COLORS[colour]} strokeWidth={3} opacity={0.72} />
              ))}
            </g>
            );
          })}

          {FLIGHT_COLORS.map((colour, slot) => {
            const shortcutStart = FLIGHT_TRACK[(16 + slot * 13) % 52];
            const shortcutEnd = FLIGHT_TRACK[(30 + slot * 13) % 52];
            const takeoff = FLIGHT_TRACK[slot * 13];
            const home = FLIGHT_HANGARS[slot];
            return (
              <g key={`flight-guides-${slot}`} opacity={0.3}>
                <path d={`M${shortcutStart.x} ${shortcutStart.y}Q300 300 ${shortcutEnd.x} ${shortcutEnd.y}`}
                  fill="none" stroke={colour} strokeWidth={6} strokeDasharray="9 9" strokeLinecap="round" />
                <path d={`M${home.x} ${home.y}Q${(home.x + takeoff.x) / 2} ${(home.y + takeoff.y) / 2 - 12} ${takeoff.x} ${takeoff.y}`}
                  fill="none" stroke={colour} strokeWidth={4} strokeDasharray="6 7" strokeLinecap="round" />
              </g>
            );
          })}

          {FLIGHT_TRACK.map((point, index) => {
            const startColour = index % 13 === 0 ? Math.floor(index / 13) : -1;
            return (
              <g key={`track-${index}`}>
                <circle cx={point.x} cy={point.y} r={15.5}
                  fill={startColour >= 0 ? FLIGHT_COLORS[startColour] : index % 4 === 0 ? '#ead9b4' : '#fffaf0'}
                  stroke={startColour >= 0 ? FLIGHT_DARK[startColour] : '#a99273'} strokeWidth={startColour >= 0 ? 3.5 : 2} />
                {index % 4 === 0 && startColour < 0 && <path d={`M${point.x - 5} ${point.y}h10`} stroke="#b58e55" strokeWidth={3} strokeLinecap="round" />}
              </g>
            );
          })}

          {FLIGHT_COLORS.map((colour, slot) => (
            <g key={`runway-${slot}`}>
              <path d={`M${runwayPoint(slot, 0).x} ${runwayPoint(slot, 0).y}L${runwayPoint(slot, 3).x} ${runwayPoint(slot, 3).y}`}
                stroke={FLIGHT_DARK[slot]} strokeWidth={5} opacity={0.38} />
              {[0, 1, 2, 3].map((step) => {
                const point = runwayPoint(slot, step);
                return <circle key={step} cx={point.x} cy={point.y} r={17} fill={colour} opacity={0.78 + step * 0.05} stroke={FLIGHT_DARK[slot]} strokeWidth={2.5} />;
              })}
            </g>
          ))}

          <path d="M300 244L356 300L300 356L244 300Z" fill="#fff8e6" stroke="#806c54" strokeWidth={4} />
          <DiceFace
            value={game.dice}
            active={canRoll || canPass}
            pass={canPass}
            onActivate={() => send(canPass ? 'pass' : 'roll')}
          />

          {game.pawns.flatMap((positions, colour) => positions.map((progress, pawn) => {
            const point = pawnPoint(colour, pawn, progress, game.finish);
            const legal = colour === me && myTurn && game.dice !== null && movable.has(pawn);
            const stackIndex = game.pawns[colour].slice(0, pawn).filter((other) => other === progress).length;
            const dx = progress >= 0 && progress < 52 ? (stackIndex % 2) * 8 - 4 : 0;
            const dy = progress >= 0 && progress < 52 ? Math.floor(stackIndex / 2) * 8 - 4 : 0;
            return (
              <g key={`pawn-${colour}-${pawn}`} transform={`translate(${point.x + dx} ${point.y + dy})`}
                className={legal ? 'flight-pawn legal' : 'flight-pawn'} role={legal ? 'button' : undefined}
                tabIndex={legal ? 0 : undefined} onClick={legal ? () => send('move', { pawn }) : undefined}
                onKeyDown={legal ? (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    send('move', { pawn });
                  }
                } : undefined}
                aria-label={`${FLIGHT_NAMES[colour]}色 ${pawn + 1} 号飞机`}>
                {legal && <circle r={25} fill="none" stroke={FLIGHT_COLORS[colour]} strokeWidth={5} opacity={0.48} />}
                <circle r={16} fill={FLIGHT_COLORS[colour]} stroke="#fffaf0" strokeWidth={3.5} filter="url(#flight-shadow)" />
                <path d="M-10 2L9-8L5 0L12 5L3 5L-1 13L-4 5L-11 6Z" fill="#fff" />
                <text x={0} y={-20} textAnchor="middle" fontSize={13} fontWeight={900} fill={FLIGHT_DARK[colour]}>{pawn + 1}</text>
              </g>
            );
          }))}
        </svg>
        {me >= 0 && game.dice !== null && movable.size > 0 && (
          <div className="flight-board-hint">直接点击发光的飞机移动</div>
        )}
      </div>

      <div className="flight-actions">
        {me < 0 && <button className="btn primary" onClick={() => send('join')}>自动选择空余颜色</button>}
        {me >= 0 && game.winner >= 0 && <button className="btn primary" onClick={() => send('join')}>再来一局</button>}
        {me >= 0 && game.winner < 0 && game.dice === null && <button className="btn primary flight-roll" disabled={!myTurn} onClick={() => send('roll')}>🎲 掷骰子</button>}
        {me >= 0 && game.winner < 0 && game.dice !== null && movable.size === 0 && <button className="btn" disabled={!myTurn} onClick={() => send('pass')}>没有飞机可走 · 结束回合</button>}
        {me >= 0 && <button className="btn ghost" onClick={() => send('leave')}>离席</button>}
      </div>
      <div className={`flight-event ${game.winner >= 0 ? 'winner' : ''}`} role="status" aria-live="polite">{game.lastEvent}</div>
    </div>
  );
}

/* ─── 麻将牌面 ───────────────────────────────────────────────────────────── */
export function TileFace({ face, gold, small = false, onClick, raised = false }: {
  face: number; gold?: boolean; small?: boolean; onClick?: () => void; raised?: boolean;
}) {
  const suit = mjSuit(face);
  const color = suit === 'wan' ? '#c0392b' : suit === 'tiao' ? '#2f9e5f' : suit === 'tong' ? '#2f6fdb' : '#3a3f47';
  return (
    <div
      onClick={onClick}
      style={{
        width: small ? 26 : 38, height: small ? 36 : 52, borderRadius: 5,
        background: '#f8f5ee', color, border: `2px solid ${gold ? '#d4a017' : '#c9c2b4'}`,
        boxShadow: gold ? '0 0 8px rgba(212,160,23,0.7)' : '0 2px 3px rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: small ? 12 : 15, fontWeight: 700, cursor: onClick ? 'pointer' : 'default',
        transform: raised ? 'translateY(-8px)' : undefined, transition: 'transform 0.12s',
        userSelect: 'none', flexShrink: 0, textAlign: 'center', lineHeight: 1.1,
      }}
    >
      {mjTileName(face)}
    </div>
  );
}

/* ─── 福州麻将 ───────────────────────────────────────────────────────────── */
const SEAT_NAMES = ['东', '南', '西', '北'];
export function MahjongPanel({ tableId }: { tableId: string }) {
  const view = useWorld((s) => s.mj[tableId]) as MahjongView | undefined;
  const [, force] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => force((n) => n + 1), 1000); // 倒计时刷新
    return () => clearInterval(iv);
  }, []);
  if (!view) return <div className="dim">牌桌不见了……</div>;
  const { pub, priv } = view;
  const mySeat = priv?.mySeat ?? -1;
  const seated = mySeat !== -1;
  const myDiscardTurn = !!priv?.mustAct && pub.claimDeadline === null && pub.turn === mySeat;
  const claimLeft = pub.claimDeadline ? Math.max(0, Math.ceil((pub.claimDeadline - Date.now()) / 1000)) : null;
  const send = (action: string, tile?: number) => connection.send('mj_action', { tableId, action, tile });

  const seatLabel = (i: number) => {
    const seat = pub.seats[i];
    const who = seat.profile?.username ?? (seat.isBot ? '🤖 陪打' : '空位');
    return `${SEAT_NAMES[i]}·${who}${i === pub.dealer && pub.phase !== 'waiting' ? '(庄)' : ''}`;
  };

  return (
    <div className="col">
      <div className="row" style={{ flexWrap: 'wrap', fontSize: 12 }} >
        {pub.seats.map((seat, i) => (
          <span key={i} className="dim" style={{
            padding: '3px 8px', borderRadius: 6,
            background: pub.turn === i && pub.phase === 'playing' ? 'rgba(56,217,195,0.18)' : 'rgba(120,150,200,0.08)',
            border: i === mySeat ? '1px solid #38d9c3' : '1px solid transparent',
          }}>
            {seatLabel(i)} <b>{seat.handCount}张</b>
          </span>
        ))}
        <span className="spacer" />
        <span className="dim">墙余 {pub.wallCount}</span>
      </div>

      {pub.goldFace >= 0 && (
        <div className="row" style={{ fontSize: 13 }}>
          <span>开金:</span>
          <TileFace face={pub.goldFace} gold small />
          <span className="dim">({mjTileName(pub.goldFace)} 为金,可当任意牌;起手三金即三金倒!)</span>
        </div>
      )}

      {/* 弃牌河 */}
      {pub.phase !== 'waiting' && (
        <div className="col" style={{ gap: 4 }}>
          {pub.seats.map((seat, i) => (
            <div key={i} className="row" style={{ gap: 3, flexWrap: 'wrap', minHeight: 24 }}>
              <span className="dim" style={{ fontSize: 11, width: 60, flexShrink: 0 }}>{SEAT_NAMES[i]}家弃牌</span>
              {seat.discards.map((t, j) => (
                <TileFace key={j} face={t} small gold={t === pub.goldFace} />
              ))}
              {seat.melds.map((m, j) => (
                <span key={`m${j}`} className="row" style={{ gap: 1, marginLeft: 6, padding: '0 3px', border: '1px dashed rgba(212,160,23,0.6)', borderRadius: 5 }}>
                  {Array.from({ length: m.kind === 'kong' ? 4 : 3 }).map((_, k) => (
                    <TileFace key={k} face={m.tile} small />
                  ))}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* 结果 */}
      {pub.phase === 'finished' && (
        <div style={{ fontSize: 15, textAlign: 'center' }}>
          {pub.winner === -2
            ? <b>荒庄 — 牌墙摸完了,流局。</b>
            : <b>🏆 {SEAT_NAMES[pub.winner]}家 {pub.seats[pub.winner]?.profile?.username ?? '🤖'}
                {pub.winKind === 'sanjindao' ? ' 三金倒!!' : pub.winKind === 'zimo' ? ' 自摸!' : ' 胡牌!'}</b>}
        </div>
      )}

      {/* 我的手牌 */}
      {seated && priv && pub.phase === 'playing' && (
        <>
          <div className="row" style={{ gap: 3, flexWrap: 'wrap', padding: '8px 0' }}>
            {priv.hand.map((t, i) => (
              <TileFace
                key={i} face={t} gold={t === pub.goldFace}
                raised={priv.drawn === t && i === priv.hand.lastIndexOf(t)}
                onClick={myDiscardTurn ? () => send('discard', t) : undefined}
              />
            ))}
          </div>
          <div className="row">
            {claimLeft !== null && priv.mustAct && <span className="dim" style={{ fontSize: 12 }}>抢牌 {claimLeft}s:</span>}
            {priv.canHu && <button className="btn primary" onClick={() => send('hu')}>胡!</button>}
            {priv.canPong && <button className="btn" onClick={() => send('pong')}>碰</button>}
            {priv.canKong && <button className="btn" onClick={() => send('kong', pub.lastDiscard?.tile ?? priv.hand.find((t) => priv.hand.filter((x) => x === t).length >= 4))}>杠</button>}
            {claimLeft !== null && priv.mustAct && <button className="btn ghost" onClick={() => send('pass')}>过</button>}
            {myDiscardTurn && <span className="dim" style={{ fontSize: 12 }}>点击手牌打出</span>}
          </div>
        </>
      )}

      <div className="row">
        {!seated && pub.phase !== 'playing' && <button className="btn primary" onClick={() => send('sit')}>入座</button>}
        {!seated && pub.phase === 'playing' && pub.seats.some((x) => x.isBot && !x.profile) && (
          <button className="btn primary" onClick={() => send('sit')}>顶替机器人</button>
        )}
        {seated && pub.phase !== 'playing' && (
          <button className="btn primary" onClick={() => send('start')}>开局(空位由🤖陪打)</button>
        )}
        {seated && <button className="btn ghost" onClick={() => send('leave')}>离席</button>}
      </div>
      <div className="dim" style={{ fontSize: 11 }}>
        福州规则:不能吃,可碰/杠/胡;开金定百搭,三金倒直接胡。胡牌赢金币(自摸、三金倒更多)。
      </div>
    </div>
  );
}
