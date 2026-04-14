export type LabRule = {
  id: string;
  category: "物理安全" | "生物污染控制" | "环境与资产保护" | "情绪与心理变量调节";
  title: string;
  detail: string;
};

export const LAB_SAFETY_RULES: LabRule[] = [
  {
    id: "stairs-focus",
    category: "物理安全",
    title: "楼梯间协议",
    detail: "走楼梯时禁止开启多线程模式（玩手机），双眼聚焦阶梯，保持重心平衡，避免非计划性位移。",
  },
  {
    id: "road-scan",
    category: "物理安全",
    title: "交通感知过滤",
    detail: "过马路执行左-右-左视觉扫描，即便绿灯亮起，也要确认两侧车辆变量已完全静止。",
  },
  {
    id: "rain-slow",
    category: "物理安全",
    title: "雨天低速模式",
    detail: "雨天路滑时将行进速度降低约20%，缩小步幅，并避开井盖等低阻力表面。",
  },
  {
    id: "wash-before-meal",
    category: "生物污染控制",
    title: "餐前洗涤程序",
    detail: "在能量摄入前，执行至少20秒流动水洗手流程，减少外部病原体侵入路径。",
  },
  {
    id: "rinse-after-sugar",
    category: "生物污染控制",
    title: "餐后消杀指令",
    detail: "摄入高糖物资（尤其奶茶）后及时清水漱口，降低对牙齿和口腔环境的长期负担。",
  },
  {
    id: "sleep-buffer",
    category: "生物污染控制",
    title: "睡眠缓冲区",
    detail: "睡前30分钟禁止刷短视频，减少高频刺激干扰，帮助更快进入深度睡眠阶段。",
  },
  {
    id: "power-check",
    category: "环境与资产保护",
    title: "离场断电检查",
    detail: "离开家或宿舍前口述清单：钥匙、手机、水壶、电源；确认高耗能设备进入休眠状态。",
  },
  {
    id: "declutter-now",
    category: "环境与资产保护",
    title: "物资分类存放",
    detail: "快递和杂物到手后立即分配到对应储物区，避免门口堆积造成空间熵增和动线阻塞。",
  },
  {
    id: "peace-filter",
    category: "情绪与心理变量调节",
    title: "和为贵滤波器",
    detail: "遇到无效社交或冲突时优先平和策略，减少情绪波动对日常实验数据的噪声干扰。",
  },
  {
    id: "dopamine-limit",
    category: "情绪与心理变量调节",
    title: "多巴胺阈值管控",
    detail: "短剧和奶茶属于即时奖励，每天设置硬性上限，避免高刺激输入造成耐受和拖延。",
  },
  {
    id: "road-no-phone",
    category: "物理安全",
    title: "道路专注",
    detail: "走在马路边和路口附近时，不低头刷手机，优先保持环境感知。",
  },
  {
    id: "step-scan",
    category: "物理安全",
    title: "地面扫描",
    detail: "步行时每隔几秒快速扫一眼地面，避免石头、坑洼和台阶边缘绊倒。",
  },
  {
    id: "umbrella-rain",
    category: "物理安全",
    title: "雨具预案",
    detail: "出门前查看天气，雨天携带雨伞或雨衣，减少突发降雨导致的行动中断。",
  },
  {
    id: "stairs-handrail",
    category: "物理安全",
    title: "楼梯扶手优先",
    detail: "雨天、疲劳或负重时，上下楼梯尽量靠近扶手侧行走。",
  },
  {
    id: "crosswalk-head-up",
    category: "物理安全",
    title: "过街抬头",
    detail: "过斑马线时抬头直行，不边走边回消息，必要时停下再处理手机信息。",
  },
  {
    id: "night-visibility",
    category: "物理安全",
    title: "夜间可见度",
    detail: "夜间外出选择明亮路线，避免耳机音量过大影响车辆提示音识别。",
  },
  {
    id: "bag-balance",
    category: "物理安全",
    title: "负重平衡",
    detail: "背包过重时分散负重，不单侧长时间拎重物，降低身体姿态失衡风险。",
  },
  {
    id: "hand-hygiene-return",
    category: "生物污染控制",
    title: "回家洗手",
    detail: "回到家后先洗手再触碰面部和食物，减少外界接触源带入。",
  },
  {
    id: "water-before-milk-tea",
    category: "生物污染控制",
    title: "含糖前补水",
    detail: "奶茶前后各补一小杯水，缓冲高糖摄入对口腔和身体的即时负担。",
  },
  {
    id: "sleep-screen-light",
    category: "生物污染控制",
    title: "睡前降亮",
    detail: "睡前一小时将屏幕亮度和音量下调，给神经系统留出降噪缓冲区。",
  },
  {
    id: "desk-sanitize",
    category: "生物污染控制",
    title: "桌面消杀",
    detail: "实验记录设备（手机、键盘、鼠标）定期擦拭，降低高频接触表面污染。",
  },
  {
    id: "food-storage",
    category: "生物污染控制",
    title: "食物时效",
    detail: "外带食物超过安全时段及时处理，不把“也许还能吃”当默认策略。",
  },
  {
    id: "exit-checklist-verbal",
    category: "环境与资产保护",
    title: "离场口述复核",
    detail: "出门前口述一次清单并触碰确认，降低“我好像忘了什么”的返程概率。",
  },
  {
    id: "path-clear",
    category: "环境与资产保护",
    title: "通道净空",
    detail: "门口、走道和床边不堆放杂物，保证夜间和紧急情况下的安全通行。",
  },
  {
    id: "wet-area-dry",
    category: "环境与资产保护",
    title: "湿区防滑",
    detail: "地面有水及时擦干，尤其浴室与厨房交界区域，防止滑倒。",
  },
  {
    id: "charging-discipline",
    category: "环境与资产保护",
    title: "充电纪律",
    detail: "充电设备远离床铺和可燃物，避免长时间无人看管充电。",
  },
  {
    id: "daily-reset-10min",
    category: "环境与资产保护",
    title: "十分钟复位",
    detail: "每天固定10分钟整理环境，把“明天再收”改成“今天复位”。",
  },
  {
    id: "pause-before-react",
    category: "情绪与心理变量调节",
    title: "三秒缓冲",
    detail: "出现情绪波动时先暂停三秒再回应，避免把瞬时情绪写入长期关系。",
  },
  {
    id: "single-thread-focus",
    category: "情绪与心理变量调节",
    title: "单线程专注",
    detail: "重要任务时只开一个主窗口，减少多任务切换造成的注意力损耗。",
  },
  {
    id: "reward-budget",
    category: "情绪与心理变量调节",
    title: "奖励预算",
    detail: "给短剧和奶茶设每日预算，超限后自动切换到低刺激活动。",
  },
  {
    id: "kind-boundary",
    category: "情绪与心理变量调节",
    title: "温和边界",
    detail: "保持礼貌但不无限让步，明确边界能保护你的时间与情绪资源。",
  },
];
