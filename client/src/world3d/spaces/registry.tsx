/** Maps layout prop/interactable types to prefab components. */
import type { ReactNode } from 'react';
import type { Prop, Interactable } from '@nexuspark/shared';
import { useWorld } from '../../state/stores';
import {
  StreetLamp, Bench, Tree, Fountain, Pond, Bridge, Picnic, Flowerbed, BeachBall,
} from '../prefabs/props';
import { BldCafe, BldCinema, BldArcade, BldShop, BldTower } from '../prefabs/buildings';
import {
  Sofa, CoffeeTable, Chair, Plant, Fireplace,
} from '../prefabs/furniture';
import {
  CafeCounter, CinemaRiser, Concession, RopeBarrier, ShopShelf, ShopCounter,
  Directory, Mailboxes, WindowFrame, TableRound, HedgeRing,
} from '../prefabs/interiors';
import { MirrorStanding } from '../prefabs/furniture';
import {
  Door, SwitchPlate, MessageBoard, WhiteboardSurface, TttMachine,
  LightsOutMachine, ArcadeDeco, VendingMachine, Jukebox, Kiosk, ElevatorDoors,
} from '../prefabs/interactive';
import MediaScreen from '../media/MediaScreen';
import { Bookshelf } from '../prefabs/furniture';
import { XiangqiTablePrefab, MahjongTablePrefab, RiichiTablePrefab } from '../prefabs/gameTables';
import { GrTea, GrLantern } from '../prefabs/clubVenueProps';
import { ArenaPlayerStation } from '../prefabs/arenaHall';
import { PremiumCinemaSeat } from '../prefabs/cinemaHall';
import {
  ClubRug, ClubSofa, ClubStage, FlyingChessTable, FloorCushion, ClubTrophyWall,
  ClubStorageCabinet, ClubReadingNook, ClubChair, ClubCraftTable,
} from '../prefabs/clubInteriors';
import {
  CLamp, CVend, CBench, CFence, CBike, CTrash, CPoster, CAc, CWires, CSignal,
  CPhone, CLocker, CManhole, CHydrant, CPlanter, CPier, CStreetBanner,
} from '../city/props2';

export function renderProp(p: Prop, key: string | number): ReactNode {
  const pos = p.pos;
  switch (p.type) {
    case 'street_lamp': return <StreetLamp key={key} position={pos} />;
    case 'bench': return <Bench key={key} position={pos} rotation={p.ry} />;
    case 'tree': return <Tree key={key} position={pos} variant={(p.data?.variant as number) ?? 0} scale={(p.data?.scale as number) ?? 1} />;
    case 'fountain': return <Fountain key={key} />;
    case 'pond': return <Pond key={key} position={pos} />;
    case 'bridge': return <Bridge key={key} position={pos} />;
    case 'picnic': return <Picnic key={key} position={pos} />;
    case 'flowerbed': return <Flowerbed key={key} position={pos} />;
    case 'hedge_ring': return <HedgeRing key={key} />;
    case 'bld_cafe': return <BldCafe key={key} position={pos} />;
    case 'bld_cinema': return <BldCinema key={key} position={pos} />;
    case 'bld_arcade': return <BldArcade key={key} position={pos} />;
    case 'bld_shop': return <BldShop key={key} position={pos} />;
    case 'bld_tower': return <BldTower key={key} position={pos} />;
    case 'cafe_counter': return <CafeCounter key={key} position={pos} rotation={p.ry} />;
    case 'cinema_seat': return (
      <PremiumCinemaSeat
        key={key}
        position={pos}
        rotation={p.ry}
        variant={((p.data?.row as number) ?? 0) + ((p.data?.seatIdx as number) ?? 0)}
      />
    );
    case 'cinema_riser': return (
      <CinemaRiser key={key} position={pos} rotation={p.ry}
        w={(p.data?.w as number) ?? 21}
        d={(p.data?.d as number) ?? 2.4}
        h={(p.data?.h as number) ?? 0.24} />
    );
    case 'concession': return <Concession key={key} position={pos} rotation={p.ry} />;
    case 'rope_barrier': return <RopeBarrier key={key} position={pos} rotation={p.ry} />;
    case 'arcade_deco': return <ArcadeDeco key={key} position={pos} rotation={p.ry} variant={(p.data?.variant as number) ?? 0} />;
    case 'shop_shelf': return <ShopShelf key={key} position={pos} rotation={p.ry} />;
    case 'shop_counter': return <ShopCounter key={key} position={pos} rotation={p.ry} />;
    case 'mirror_standing': return <group key={key} position={pos} rotation={[0, p.ry, 0]}><MirrorStanding /></group>;
    case 'elevator_doors': return <ElevatorDoors key={key} position={pos} rotation={p.ry} />;
    case 'directory': return <Directory key={key} position={pos} rotation={p.ry} />;
    case 'mailboxes': return <Mailboxes key={key} position={pos} rotation={p.ry} />;
    case 'window': return <WindowFrame key={key} position={pos} rotation={p.ry} w={(p.data?.w as number) ?? 1.6} />;
    case 'table_round': return <TableRound key={key} position={pos} />;
    case 'chair': return p.data?.style === 'floor'
      ? <FloorCushion key={key} position={pos} ry={p.ry} accent={(p.data?.accent as number) ?? 0} />
      : p.data?.style === 'club'
      ? <ClubChair key={key} position={pos} ry={p.ry} accent={(p.data?.accent as number) ?? 0} />
      : <group key={key} position={pos} rotation={[0, p.ry, 0]}><Chair color="#7a6248" /></group>;
    case 'sofa': return <group key={key} position={pos} rotation={[0, p.ry, 0]}><Sofa color="#4d6a92" /></group>;
    case 'coffee_table': return <group key={key} position={pos} rotation={[0, p.ry, 0]}><CoffeeTable color="#6e5136" /></group>;
    case 'plant': return <group key={key} position={pos}><Plant color="#3f7d44" /></group>;
    case 'fireplace': return <group key={key} position={pos} rotation={[0, p.ry, 0]}><Fireplace color="#8a8078" state={{ on: true }} /></group>;
    // ── 网吧 NEXUS / 雀庄「东风阁」室内专属件(P5,总纲 §4.4)──────────────
    case 'nc_station': return <ArenaPlayerStation key={key} position={pos} ry={p.ry} seatIdx={(p.data?.seatIdx as number) ?? 0} />;
    case 'gr_tea': return <GrTea key={key} position={pos} ry={p.ry} />;
    case 'gr_lantern': return <GrLantern key={key} position={pos} />;
    case 'club_rug': return (
      <ClubRug key={key} position={pos} ry={p.ry}
        w={(p.data?.w as number) ?? 8.2} d={(p.data?.d as number) ?? 6.4} />
    );
    case 'club_sofa': return <ClubSofa key={key} position={pos} ry={p.ry} />;
    case 'club_stage': return <ClubStage key={key} position={pos} ry={p.ry} />;
    case 'club_flying_chess': return <FlyingChessTable key={key} position={pos} ry={p.ry} />;
    case 'club_craft_table': return <ClubCraftTable key={key} position={pos} ry={p.ry} />;
    case 'club_trophy_wall': return <ClubTrophyWall key={key} position={pos} ry={p.ry} />;
    case 'club_storage': return <ClubStorageCabinet key={key} position={pos} ry={p.ry} />;
    case 'club_reading_nook': return <ClubReadingNook key={key} position={pos} ry={p.ry} />;
    // ── 「月汐町·晴日生活街」c_* 城市道具(cityplan/P2 布局 → city/props2 组件)──
    case 'c_lamp': return <CLamp key={key} position={pos} ry={p.ry} />;
    case 'c_vend': return (
      <CVend key={key} position={pos} ry={p.ry}
        kind={p.data?.variant === 'blue' || p.data?.kind === 'blue' ? 'blue' : 'red'} />
    );
    case 'c_bench': return <CBench key={key} position={pos} ry={p.ry} />;
    case 'c_fence': return <CFence key={key} position={pos} ry={p.ry} w={(p.data?.w as number) ?? 1.8} />;
    case 'c_pier': return <CPier key={key} position={pos} />;
    case 'c_bike': return (
      <CBike key={key} position={pos} ry={p.ry}
        fallen={p.data?.fallen === true || p.data?.variant === 1} />
    );
    case 'c_trash': return <CTrash key={key} position={pos} ry={p.ry} crow={p.data?.crow !== false} />;
    case 'c_poster': return <CPoster key={key} position={pos} ry={p.ry} variant={(p.data?.variant as number) ?? 0} />;
    case 'c_ac': return <CAc key={key} position={pos} ry={p.ry} />;
    case 'c_wires': return (
      <CWires key={key} position={pos} ry={p.ry}
        to={p.data?.to as [number, number, number] | undefined}
        len={(p.data?.len as number) ?? 12}
        sag={(p.data?.sag as number) ?? 1}
        strands={(p.data?.strands as number) ?? 2} />
    );
    case 'c_signal': return <CSignal key={key} position={pos} ry={p.ry} />;
    case 'c_banner': return (
      <CStreetBanner
        key={key}
        position={pos}
        ry={p.ry}
        text={(p.data?.text as string) ?? '月汐町 · ICHIBAN STREET'}
        color={(p.data?.color as string) ?? '#ff3f6c'}
        accent={(p.data?.accent as string) ?? '#ffd34f'}
        width={(p.data?.width as number) ?? 8.4}
      />
    );
    case 'c_phone': return <CPhone key={key} position={pos} ry={p.ry} />;
    case 'c_locker': return <CLocker key={key} position={pos} ry={p.ry} />;
    case 'c_manhole': return <CManhole key={key} position={pos} />;
    case 'c_hydrant': return <CHydrant key={key} position={pos} ry={p.ry} />;
    case 'c_planter': return <CPlanter key={key} position={pos} ry={p.ry} />;
    // 未知类型一律返回 null 保底(向前兼容 P2 后续新增)
    default: return null;
  }
}

function SwitchWrapper({ it }: { it: Interactable }) {
  const switchId = String(it.data?.switchId ?? it.id);
  const on = useWorld((s) => s.switches[switchId] ?? true);
  return <SwitchPlate position={it.pos} rotation={it.ry} on={on} />;
}

export function renderInteractable(it: Interactable, key: string | number): ReactNode {
  switch (it.kind) {
    case 'door': {
      const wide = it.id === 'd-cinema' || it.id === 'd-tower' || it.id === 'cine-exit' || it.id === 'lobby-exit';
      return <Door key={key} position={it.pos} rotation={it.ry} wide={wide} />;
    }
    case 'switch': return <SwitchWrapper key={key} it={it} />;
    case 'board': return <MessageBoard key={key} position={[it.pos[0], 0, it.pos[2]]} rotation={it.ry} boardId={it.id} />;
    case 'whiteboard': return (
      <WhiteboardSurface key={key} position={it.pos} rotation={it.ry} boardId={String(it.data?.boardId ?? it.id)} />
    );
    // Screen dimensions travel with the authoritative interactable contract;
    // registry no longer mirrors venue IDs and hard-coded metres.
    case 'screen': return (
      <MediaScreen
        key={key}
        position={it.pos}
        rotation={it.ry}
        width={(it.data?.width as number) ?? 8.6}
        height={(it.data?.height as number) ?? 4.6}
      />
    );
    case 'jukebox': return <Jukebox key={key} position={[it.pos[0], 0, it.pos[2]]} rotation={it.ry} />;
    case 'ttt': return <TttMachine key={key} position={[it.pos[0], 0, it.pos[2]]} rotation={it.ry} machineId={it.id} />;
    case 'lightsout': return <LightsOutMachine key={key} position={[it.pos[0], 0, it.pos[2]]} rotation={it.ry} machineId={it.id} />;
    case 'vending': {
      // 晴日生活街户外售货机(v-vend*):城市赛璐璐外观(c_vend 可互动版,红/蓝按标签)
      if (it.id.startsWith('v-vend')) {
        return <CVend key={key} position={[it.pos[0], 0, it.pos[2]]} ry={it.ry} kind={it.label.includes('蓝') ? 'blue' : 'red'} />;
      }
      const items = (it.data?.items as string[]) ?? [];
      return <VendingMachine key={key} position={[it.pos[0], 0, it.pos[2]]} rotation={it.ry} kind={items.includes('coffee') ? 'coffee' : 'drinks'} />;
    }
    case 'kiosk': return <Kiosk key={key} position={[it.pos[0], 0, it.pos[2]]} rotation={it.ry} />;
    case 'bookshelf': return (
      <group key={key} position={[it.pos[0], 0, it.pos[2]]} rotation={[0, it.ry, 0]}>
        <Bookshelf color="#6a4f37" />
      </group>
    );
    case 'elevator': return (
      <group key={key} position={it.pos} rotation={[0, it.ry, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.22, 0.34, 0.06]} />
          <meshStandardMaterial color="#8a929c" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.05, 0.035]}>
          <circleGeometry args={[0.035, 10]} />
          <meshStandardMaterial color="#ffca7a" emissive="#ffca7a" emissiveIntensity={1.2} />
        </mesh>
        <mesh position={[0, -0.05, 0.035]}>
          <circleGeometry args={[0.035, 10]} />
          <meshStandardMaterial color="#7ec8ff" emissive="#7ec8ff" emissiveIntensity={0.7} />
        </mesh>
      </group>
    );
    case 'xiangqi':
      return <XiangqiTablePrefab key={key} position={[it.pos[0], 0, it.pos[2]]} rotation={it.ry} tableId={it.id} />;
    case 'mahjong':
      return <MahjongTablePrefab key={key} position={[it.pos[0], 0, it.pos[2]]} rotation={it.ry} tableId={it.id} />;
    case 'riichi':
      return <RiichiTablePrefab key={key} position={[it.pos[0], 0, it.pos[2]]} rotation={it.ry} tableId={it.id} />;
    case 'seat':
    default:
      return null;
  }
}

export { BeachBall };
