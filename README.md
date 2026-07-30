# 🍡 月汐町 (Nexus Park)

当前“一番街 + 三场馆”需求基线与扩展接入规则见
[docs/CURRENT_SCENE_REQUIREMENTS.md](docs/CURRENT_SCENE_REQUIREMENTS.md)。

A persistent, multiplayer 3D world for the browser where every player is a
bouncy **dango** dumpling. The current public scene is a compact, sunny manga
city street with three entrances: a cinema, a cozy Dango party hall, and an
esports viewing arena. Players can watch server-synchronized media, play
Xiangqi, sit around a flying-chess table, share screens and talk over proximity
voice chat. **The in-game UI is in Chinese (中文).**

Everything is real, modeled 3D geometry rendered with Three.js — no flat
image stand-ins — and every feature listed below is implemented and wired to
the authoritative server.

## 中文快速上手

```bash
npm install        # 全部依赖只装在项目目录里
npm run dev        # 开发模式:服务器 :8080 + 客户端 :5173
# 打开 http://localhost:5173,注册或"游客进入"即可
```

一键部署(生产):`./deploy.sh`(裸机)或 `docker compose up -d --build`(容器),
详见 [DEPLOY.md](DEPLOY.md)。

**操作**:WASD 蹦跶,Shift 跑,空格跳,鼠标拖动转视角,E 互动,回车聊天,1–5 表情,
Esc 关面板。右下角按钮:✏️ 房间编辑器(在自己房间时)、🎭 表情、🎙 就近语音、
📢 全世界语音(全服可闻)、🖥️ 屏幕共享、🎒 背包、🍡 捏团子、⚙️ 设置。

**好玩的**：走进一条紧凑、明媚又绚烂的漫画都市街道；电影院与电竞观战馆使用
服务器权威进度共同看片；温馨的团子轰趴馆里可以下象棋、围坐飞行棋桌，也可以在
沙发区聊天。角色造型系统保持原样。

---

## Feature overview

| Area | What works |
| --- | --- |
| **Multiplayer** | Live positions/animations/emotes at 10 Hz snapshots with client interpolation, join/leave/reconnect handling, duplicate-login supersede, per-space interest management |
| **Avatars** | Customizable dango characters (body, scarf, blush, feet, sprout, hats, glasses) with squash-and-stretch hop animation, sit/wave/dance/clap/point/laugh, nametags, speaking indicators |
| **World** | Compact 58m manga city street with continuous residential façades + cinema, Dango party hall and esports viewing arena; day/night cycle (20 min), weather and NPC routines |
| **Personal rooms** | The persistent room/editor engine is retained for a future access flow, but the current three-venue street deliberately has no tower/lobby entrance |
| **Media screens** | Cinema and arena screens show websites, YouTube or direct video. Timed providers use server revisions, RTT-midpoint clock calibration and one authoritative progress calculation; media still streams directly to each client |
| **Interactions** | Street and venue seats, doors, light switches, shared whiteboards/message boards, a synchronized synth jukebox, vending machines, bookshelves and inventory |
| **Games** | The current public scene features a full server-authoritative Xiangqi table and a warm flying-chess activity table in the Dango party hall; legacy game engines remain available to future room expansions but have no street entrance |
| **Voice & screens** | Proximity voice (WebRTC mesh, HRTF spatial audio, speaking indicators) plus a world-wide voice mode (📢 全世界语音) heard by everyone online in every space; screen sharing (720p@30fps, capped ~2.5 Mbps) that floats above your dango for nearby players |
| **Audio** | Fully procedural: hop boings, UI chimes, wind/rain/birds/crickets ambience, three sequenced jukebox tracks — zero recorded assets |

## Quick start

Requirements: **Node.js ≥ 20** (that's it — the database is embedded SQLite).

```bash
npm install          # installs all three workspaces locally
npm run dev          # server on :8080 + Vite client on :5173
```

Open **http://localhost:5173**, create an account (or *Continue as guest*),
and you'll spawn on Ichiban Street. Open a second browser window to see
multiplayer in action.

### Production build

```bash
npm run build        # builds client (vite) then server (esbuild)
npm start            # serves everything on http://127.0.0.1:8080
```

Or truly one command: **`./deploy.sh`** (installs, builds, generates
secrets, starts; `--daemon` / `--systemd` / `--stop` variants), or
**`docker compose up -d --build`**. See [DEPLOY.md](DEPLOY.md).

The production server serves the built client itself — one process, one port.

### Database

SQLite lives at `server/data/nexuspark.db` (created automatically).

```bash
npm run db:setup     # create tables explicitly (optional; happens on boot)
npm run db:reset     # wipe all data and start fresh
```

Deleting the repository folder removes every trace of the app — no global
installs, no system changes.

### Configuration

Copy `.env.example` to `.env` (repo root) and adjust. Defaults work out of
the box; set a strong `JWT_SECRET` for anything public. To test from other
devices on your LAN set `HOST=0.0.0.0`.

### Tests

```bash
npm test             # shared protocol tests + server suite (vitest)
```

The server suite includes a real end-to-end test that boots the HTTP+WS
stack, registers two accounts, and verifies movement snapshots and chat
delivery over live WebSockets, plus rules tests for xiangqi move legality
and the mahjong win-checker (gold wilds, 三金倒).

There is also a headless browser smoke test that walks the whole vertical
slice (chat → café games → elevator → room editor → TV):

```bash
npm run build && npm start     # terminal 1
npm i --no-save playwright     # once (kept out of project dependencies)
node scripts/smoke.mjs         # terminal 2
```

And a cinema media-sync test (design doc §9.1): two headless clients walk
into the cinema, one seeks/pauses/changes playback rate, and both ends must
agree on the server-clock-extrapolated position (`mediaPositionAt`) within
0.5 s. Same prerequisites as the smoke test:

```bash
node scripts/sync-test.mjs     # terminal 2
```

## Controls

| Input | Action |
| --- | --- |
| `W A S D` / arrows | Hop around |
| `Shift` | Run (bigger bounces) |
| `Space` | Jump |
| Mouse drag | Orbit third-person camera · wheel zooms |
| `E` | Interact (whatever the prompt shows) |
| `Enter` | Chat |
| `1–5` | Emotes: wave, dance, clap, point, laugh |
| `Esc` | Close panel / cancel editor action |
| Room editor | `R` rotate ghost · `X`/`Del` delete selection |

## Architecture

```
shared/   TypeScript protocol (zod-validated), world layouts, catalogs,
          collision math — imported verbatim by BOTH client and server so
          interactable positions and colliders can never drift apart.
server/   Node + Express + ws + better-sqlite3. Authoritative state:
          movement validation (speed caps, bounds, colliders), seats, media,
          rooms, games, economy, NPCs, ball physics, day/night clock.
          10 Hz snapshot broadcast per occupied space.
client/   Vite + React + React Three Fiber. Client-predicted local player,
          interpolated remotes (130 ms buffer), procedural geometry/audio,
          DOM overlay UI, WebRTC voice.
```

Key decisions, message flow, and persistence details: **[docs/architecture.md](docs/architecture.md)**.

### Security & abuse prevention

- bcrypt password hashes, JWT sessions (secret auto-generated into
  `server/data/jwt-secret` if unset), guest accounts are real rows.
- Every WebSocket message is zod-validated; per-session token buckets on
  chat/media/boards/strokes/interactions; 64 KB frame cap; origin checks.
- Server-side movement validation (anti-teleport), seat occupancy, room
  ownership, media/whiteboard/board permission checks, URL classification
  (https/http only; YouTube IDs extracted; everything else embeds as a
  sandboxed iframe — no DRM or frame-busting circumvention).
- HTTP rate limits on login/register/guest per IP.

## Graphics settings

Settings ⚙️ → quality presets (low → ultra) plus individual toggles for
shadows, post-processing (SMAA + bloom + vignette), reflections/mirrors,
weather particles and clouds. Renderer DPR scales with the preset. Interiors
are separate spaces, so only the space you're in is ever rendered.

## Known limitations (honest list)

- **Media embedding**: sites that send `X-Frame-Options`/CSP `frame-ancestors`
  refuse to render in iframes (that's their policy; we don't bypass it).
  YouTube requires internet access at runtime. Direct video files must be
  reachable from each viewer's browser.
- **Voice** is a P2P mesh — great up to ~6-8 simultaneous speakers; there is
  no TURN server bundled, so very restrictive NATs may fail to connect
  (configure `STUN_SERVERS`, or add your own TURN in `voice.ts`). World-wide
  voice (📢) fans out one upstream per listener from the speaker's browser,
  so it's comfortable for dozens of listeners, not hundreds.
- **Camera** can clip through walls in tight corners (no camera collision).
- One shared media state per space: multiple TVs in one room mirror the same
  content by design.
- Mobile: virtual joystick + action buttons (E/跳/抓/视角) and one-finger
  camera drag are in; pinch-zoom and per-panel mobile layouts are still on
  the roadmap, so complex panels (mahjong, room editor) are best on desktop.
- Whiteboard history caps at 500 strokes per board (oldest fade out).
- Fuzhou mahjong simplifications: no 游金/抢金, no scoring tables (flat
  credit rewards), no added-kong; xiangqi is folk-rules (win by capturing
  the general, flying-general allowed, no check/perpetual rules).
- Screen sharing needs a secure origin (https or localhost) in most
  browsers, same as microphone access.
- In-world bookshelf texts remain in English (public-domain classics).
- Server is a single Node process; fine for dozens of concurrent players,
  not built for thousands.

## Repository layout

```
shared/src/   constants, types, zod protocol, world layouts, catalogs, math
server/src/   config, db/, auth/, http/, ws/, game/ (world, space, handlers,
              rooms, dialogues, sessions), util/
server/test/  vitest: auth, world/permissions/games/economy, live e2e
client/src/   net/, state/, audio/, voice/, ui/ (panels, HUD, editor),
              world3d/ (avatar, animator, spaces, prefabs, env, media)
docs/         architecture notes
ASSETS.md     licensing of all bundled content
```

## License note for bundled content

All 3D geometry, textures, audio and music are **generated procedurally in
code** — there are no third-party binary assets. In-world books contain
public-domain texts (attributed) and original writing. See
[ASSETS.md](ASSETS.md).
