/**
 * 复盘配置 — 五大复盘版块的结构化定义
 *
 * 从 DailyReview.jsx 提取，降低组件复杂度，提高可维护性。
 * 单一职责：仅定义复盘版块的元数据，不包含任何 UI 逻辑。
 */

export const sectionConfig = {
  "1": {
    title: "一、市场复盘 · 事实",
    badge: "事实",
    badgeClass: "badge-accent",
    fields: [
      { key: "indexJudgment", label: "指数判断", placeholder: "上证/深证/创业板走势、关键均线、趋势方向" },
      { key: "volumeJudgment", label: "量能判断", placeholder: "放量/缩量、两市成交额、量价配合" },
      { key: "sentimentJudgment", label: "情绪判断", placeholder: "涨跌家数、涨停/跌停比、连板高度、恐慌/贪婪" },
      { key: "capitalDirection", label: "资金方向", placeholder: "北向资金、主力净流入/流出方向" },
    ],
    summaryKeys: ["indexJudgment", "volumeJudgment", "sentimentJudgment", "capitalDirection"],
    summaryLabels: ["指数判断", "量能判断", "情绪判断", "资金方向"],
  },
  "2": {
    title: "二、板块分析 · 逻辑",
    badge: "逻辑",
    badgeClass: "badge-info",
    fields: [
      { key: "leadingSectors", label: "领涨板块及个股", placeholder: "涨幅居前的板块和龙头个股" },
      { key: "laggingSectors", label: "领跌板块及个股", placeholder: "跌幅居前的板块和代表性个股" },
      { key: "sustainability", label: "持续性判断", placeholder: "领涨板块是否有持续逻辑？" },
    ],
    summaryKeys: ["leadingSectors", "laggingSectors", "sustainability"],
    summaryLabels: ["领涨板块", "领跌板块", "持续性"],
  },
  "3": {
    title: "三、个股检查 · 标的",
    badge: "标的",
    badgeClass: "badge-warning",
    fields: [
      { key: "stockStrength", label: "标的强弱", placeholder: "与大盘对比强弱，买入逻辑是否成立" },
      { key: "volAmpRanking", label: "成交量 / 振幅", placeholder: "低位放量？高位分歧？换手率" },
      { key: "limitAnalysis", label: "涨跌停分析", placeholder: "板块涨停家数、跌停家数、流动性" },
    ],
    summaryKeys: ["stockStrength", "volAmpRanking", "limitAnalysis"],
    summaryLabels: ["强弱对比", "量价分析", "涨跌停"],
  },
  "4": {
    title: "四、交易记录 · 内因",
    badge: "内因",
    badgeClass: "badge-loss",
    fields: [
      { key: "buySignal", label: "买入信号", placeholder: "形态、量能、均线、消息、盘口等" },
      { key: "sellSignal", label: "卖出信号", placeholder: "止盈、止损、破位、量价背离等" },
      { key: "operationReason", label: "操作理由", placeholder: "为什么买、为什么卖、仓位逻辑" },
      { key: "profitAttribution", label: "盈利归因", placeholder: "实力 or 运气？", accent: "profit" },
      { key: "lossAttribution", label: "亏损归因", placeholder: "大盘问题？利空？主力出货？", accent: "loss" },
      { key: "executionNotes", label: "执行偏差", placeholder: "冲动、犹豫、追高、卖飞、没按纪律" },
      { key: "improvementPlan", label: "改进计划", placeholder: "下次具体怎么做" },
    ],
    summaryKeys: ["buySignal", "sellSignal", "operationReason", "profitAttribution", "lossAttribution", "executionNotes", "improvementPlan"],
    summaryLabels: ["买入信号", "卖出信号", "操作理由", "盈利归因", "亏损归因", "执行偏差", "改进计划"],
  },
  "5": {
    title: "五、明日策略 · 决策",
    badge: "决策",
    badgeClass: "badge-profit",
    fields: [
      { key: "marketPlan", label: "大盘预案", placeholder: "上涨/震荡/下跌三种情景预案" },
      { key: "positionPlan", label: "持仓计划", placeholder: "加仓条件、止盈位、止损位、减仓触发" },
      { key: "newCandidates", label: "新标的", placeholder: "新加入池子的标的，触发条件" },
    ],
    summaryKeys: ["marketPlan", "positionPlan", "newCandidates"],
    summaryLabels: ["大盘预案", "持仓计划", "新标的"],
  },
};

/**
 * 复盘方法论描述
 */
export const methodologySteps = [
  ["市场复盘 · 发生了什么", "指数走势判断、量能分析、情绪判断、资金方向。客观记录市场状态。"],
  ["板块分析 · 为什么会发生", "领涨/领跌板块及驱动逻辑、持续性判断。寻找主线与暗线。"],
  ["个股检查 · 标的状况", "标的强弱对比大盘、成交量/振幅分析、涨跌停环境。"],
  ["交易记录 · 内因分析", "买卖信号回顾、操作理由复盘、盈亏归因、执行偏差与改进。"],
  ["明日策略 · 决策输出", "大盘预案、持仓计划、潜在新标的与买入触发条件。"],
];

/**
 * 计算复盘完整度
 * @param {object} review - 复盘数据对象
 * @returns {number} 0-100 的百分比
 */
export function calcCompleteness(review) {
  const fields = [review.symbol, review.buyPrice > 0, review.shares > 0, review.holdingStyle,
    review.indexJudgment, review.volumeJudgment, review.sentimentJudgment, review.capitalDirection,
    review.leadingSectors, review.laggingSectors, review.sustainability,
    review.stockStrength, review.volAmpRanking, review.limitAnalysis,
    review.buySignal, review.sellSignal, review.operationReason,
    review.profitAttribution, review.lossAttribution, review.executionNotes, review.improvementPlan,
    review.marketPlan, review.positionPlan, review.newCandidates,
  ].filter(Boolean);
  return Math.round((fields.length / 23) * 100);
}

/**
 * 需要持久化的复盘字段键列表
 */
export const REVIEW_DRAFT_KEY = "toolbox_review_draft";
