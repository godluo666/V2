/** NPC 对话树。action 由 world 在回复前处理。 */

export interface DialogueOption {
  id: string;
  label: string;
  next?: string;
  action?: 'buy_coffee' | 'end';
}
export interface DNode {
  text: string | ((ctx: DialogueCtx) => string);
  options: DialogueOption[];
}
export interface DialogueCtx {
  username: string;
  credits: number;
  weather: string;
  isNight: boolean;
}

export const DIALOGUES: Record<string, Record<string, DNode>> = {
  greeter: {
    root: {
      text: (c) => `${c.username}，欢迎来到月汐町·结缘坂！第一次来吗？`,
      options: [
        { id: 'tour', label: '这里有什么好玩的?', next: 'tour' },
        { id: 'controls', label: '怎么操作呀?', next: 'controls' },
        { id: 'bye', label: '随便逛逛。', next: 'bye' },
      ],
    },
    tour: {
      text: '这条街现在开放三个地方:星汐电影院能一起看片;团子轰趴馆像温馨的社团活动室,有象棋和飞行棋;镜界电竞观战馆有联赛大屏和机位。都在几步路内!',
      options: [
        { id: 'rooms', label: '我也有房间?', next: 'rooms' },
        { id: 'thanks', label: '谢啦!', action: 'end' },
      ],
    },
    rooms: {
      text: '坡道两边都是街坊的住宅，门牌、花盆和晾衣架每天都会换点样子。现在开放的公共场馆仍是小剧场、团子活动室和镜界游戏屋。',
      options: [{ id: 'ok', label: '这就去!', action: 'end' }],
    },
    controls: {
      text: 'WASD 蹦跶,Shift 狂奔,空格跳跳。看到发光的东西就按 E。回车打字聊天,右下角的按钮是表情、语音和设置。',
      options: [
        { id: 'more', label: '还有呢?', next: 'tour' },
        { id: 'ok', label: '记住了。', action: 'end' },
      ],
    },
    bye: {
      text: '玩得开心!迷路了再来找我。',
      options: [{ id: 'ok', label: '拜拜!', action: 'end' }],
    },
  },

  walker: {
    root: {
      text: (c) =>
        c.weather === 'rain'
          ? '雨把结缘坂的石阶、排水沟和招牌照得亮晶晶的。我照样遛弯——淋点雨怕什么。'
          : c.isNight
            ? '夜里散步最舒服了。结缘坂各家门灯刚亮，这是我最喜欢的时辰。'
            : '今天阳光真好。电影院、轰趴馆和电竞观战馆,你最想去哪一个?',
      options: [
        { id: 'route', label: '你常在这儿散步?', next: 'route' },
        { id: 'bye', label: '慢走哦!', action: 'end' },
      ],
    },
    route: {
      text: '风雨无阻，每天从坡脚杂货店走到坂上食堂，再从游戏屋这边绕回来。弯道多，走到每一段看见的屋檐和树影都不一样。',
      options: [{ id: 'ok', label: '一定去看看。', action: 'end' }],
    },
  },

  florist: {
    root: {
      text: (c) => c.weather === 'rain'
        ? '下雨时我会把怕涝的花盆搬进檐下，剩下的让它们好好喝水。你脚边那条窄沟就是专门给雨水留的。'
        : '下午的光最适合看叶子的颜色。墙边是常春藤，矮盆里是香雪球，别看它们不起眼，整条街的温柔都靠这些小东西。',
      options: [
        { id: 'street', label: '这些花都是街坊养的吗？', next: 'street' },
        { id: 'cat', label: '那只猫叫什么？', next: 'cat' },
        { id: 'bye', label: '我再逛逛。', action: 'end' },
      ],
    },
    street: {
      text: '一半是店里的，一半是住户自己端出来的。谁家出远门，就在花盆底下压张纸条，隔壁自然会帮忙浇水。',
      options: [{ id: 'ok', label: '难怪这里这么有生活气。', action: 'end' }],
    },
    cat: {
      text: '叫团团。它上午睡在洗衣店的烘干机旁，下午追着树影走，傍晚准时来花店门口等饭。你慢一点靠近，它不会躲。',
      options: [{ id: 'ok', label: '我去看看它。', action: 'end' }],
    },
  },

  stairwatcher: {
    root: {
      text: '这条石阶是去坡上小院的近路。扶手旧了点，但每一级都有人重新补过；雨天踩黄色触感砖那一侧，比较不滑。',
      options: [
        { id: 'top', label: '上面能走到哪里？', next: 'top' },
        { id: 'view', label: '你常来这里吗？', next: 'view' },
        { id: 'bye', label: '谢谢提醒。', action: 'end' },
      ],
    },
    top: {
      text: '到木门前就转回来吧，里面是住家的院子。站在最上一级回头，能越过晾衣杆看见整条弯街和远处的树脊。',
      options: [{ id: 'ok', label: '我去看一眼。', action: 'end' }],
    },
    view: {
      text: '放学后会来。风从两排屋檐中间穿过去，电线轻轻晃，下面店铺开始点灯——每天都差不多，但每天又不完全一样。',
      options: [{ id: 'ok', label: '听起来很舒服。', action: 'end' }],
    },
  },

  flight_regular: {
    root: {
      text: '这副飞行棋不是摆设。坐垫、骰子和十六架飞机都能直接操作，棋子走到哪，桌面和你打开的棋盘会同时更新。',
      options: [
        { id: 'play', label: '怎么开始？', next: 'play' },
        { id: 'detail', label: '为什么摆在树下？', next: 'detail' },
        { id: 'bye', label: '我先看一局。', action: 'end' },
      ],
    },
    play: {
      text: '靠近棋布按 E 入座，轮到你时可以直接点实体骰子；掷完后，能走的飞机会出现亮环，点那一架就会移动。同格会错开叠放，不会看不清。',
      options: [{ id: 'ok', label: '这就来一局。', action: 'end' }],
    },
    detail: {
      text: '午后树荫正好罩住棋盘，旁边有低墙挡风，店里的人端杯饮料就能加入。下雨才把棋盒收进木箱，石院地面擦干就又开局。',
      options: [{ id: 'ok', label: '像真正的街坊棋摊。', action: 'end' }],
    },
  },

  barista: {
    root: {
      text: (c) => `欢迎光临研磨咖啡馆,${c.username}!现磨现煮,虚拟烘焙。来点什么?`,
      options: [
        { id: 'coffee', label: '来杯咖啡。(5金币)', action: 'buy_coffee' },
        { id: 'ask', label: '有什么推荐?', next: 'recommend' },
        { id: 'no', label: '先看看。', next: 'bye' },
      ],
    },
    recommend: {
      text: '当然是本店浓缩,无可争议。喜欢音乐的话,窗边的点歌机放一首吧——常客们最爱《咖啡圆舞曲》。东边还有麻将桌,三缺一的时候常有人喊人。',
      options: [
        { id: 'coffee', label: '成交,来一杯。(5金币)', action: 'buy_coffee' },
        { id: 'no', label: '下次一定。', next: 'bye' },
      ],
    },
    coffee_ok: {
      text: '给,小心烫!在背包里点一下就能端在手上。',
      options: [{ id: 'ok', label: '谢谢!', action: 'end' }],
    },
    coffee_broke: {
      text: (c) => `哎呀,你只有 ${c.credits} 金币,咖啡要 5 个。明天领了每日奖励再来,到时候算你……原价,嘿嘿。`,
      options: [{ id: 'ok', label: '行吧。', action: 'end' }],
    },
    bye: {
      text: '随便坐!壁炉边的沙发最舒服。',
      options: [{ id: 'ok', label: '好嘞。', action: 'end' }],
    },
  },

  shopkeeper: {
    root: {
      text: '欢迎光临团子百货。贩卖机自助购买;中间的购买台可以解锁你房间用的家具。',
      options: [
        { id: 'unlock', label: '解锁是什么意思?', next: 'unlock' },
        { id: 'credits', label: '金币怎么赚?', next: 'credits' },
        { id: 'bye', label: '随便看看。', action: 'end' },
      ],
    },
    unlock: {
      text: '在购买台付一次钱,那件家具就永久解锁,想在房间里摆几件摆几件。水族箱卖得最好——鱼看久了会上瘾。',
      options: [{ id: 'ok', label: '懂了。', action: 'end' }],
    },
    credits: {
      text: '每天登录送金币;去麻将桌胡一把也有彩头。买零食、喝咖啡,或者攒着换巨幕电视。本店概不搞抽卡。',
      options: [{ id: 'ok', label: '良心。', action: 'end' }],
    },
  },
};

export function resolveDialogueNode(dialogueId: string, nodeId: string): DNode | null {
  return DIALOGUES[dialogueId]?.[nodeId] ?? null;
}
