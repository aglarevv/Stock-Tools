/**
 * API 客户端 — 封装所有后端接口调用
 *
 * - 开发模式（localhost）使用相对路径，由 Vite 代理到 127.0.0.1:8765
 * - 生产模式（Electron/WKWebView）使用绝对路径 http://127.0.0.1:8765
 * - 禁用 HTTP 缓存，确保设置读/写始终获取最新数据
 * - 程序单次运行期内，对板块/行业/概念等低频变数据启用内存缓存，
 *   避免重复网络请求，提升切换 Tab / 返回页面时的响应速度。
 */

// 根据当前 hostname 自动选择 API 基础路径
const API_BASE = window.location.hostname === "localhost"
  ? "" : "http://127.0.0.1:8765";

// ═══════════════════════════════════════════════════════════════════
// 程序级内存缓存（单次运行生命周期）
// ═══════════════════════════════════════════════════════════════════

/** @type {Map<string, { data: object, ts: number }>} */
const sessionCache = new Map();

/** 缓存有效期（毫秒）：板块数据在程序单次运行期间基本不变，设为极大值 */
const CACHE_TTL = 30 * 60 * 1000; // 30 分钟兜底，配合 forceRefresh 主动刷新

/**
 * 生成缓存键
 * @param {string} method
 * @param {string} path
 * @returns {string}
 */
function cacheKey(method, path) {
  return `${method}:${path}`;
}

/**
 * 尝试从内存缓存读取
 * @param {string} method
 * @param {string} path
 * @returns {object|null}
 */
function cacheGet(method, path) {
  const key = cacheKey(method, path);
  const entry = sessionCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    sessionCache.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * 写入内存缓存
 * @param {string} method
 * @param {string} path
 * @param {object} data
 */
function cacheSet(method, path, data) {
  const key = cacheKey(method, path);
  sessionCache.set(key, { data, ts: Date.now() });
}

/**
 * 清除指定前缀的缓存（用于强制刷新场景）
 * @param {string} [prefix] 不传则清空全部缓存
 */
function cacheClear(prefix) {
  if (!prefix) {
    sessionCache.clear();
    return;
  }
  for (const key of sessionCache.keys()) {
    if (key.startsWith(prefix)) sessionCache.delete(key);
  }
}

/**
 * 通用请求函数
 * @param {string} method - HTTP 方法（GET/POST/DELETE）
 * @param {string} path - API 路径（如 /api/health）
 * @param {object} [body] - 请求体（仅 POST）
 * @param {{ useCache?: boolean }} [cacheOpts] - 缓存选项
 * @returns {Promise<object>} 解析后的 JSON 响应
 */
async function request(method, path, body, cacheOpts) {
  // 启用缓存时优先读缓存
  if (cacheOpts?.useCache) {
    const cached = cacheGet(method, path);
    if (cached) return cached;
  }

  const opts = { method, headers: { "Content-Type": "application/json" }, cache: "no-store" };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "请求失败");

  // 成功响应写入缓存
  if (cacheOpts?.useCache) {
    cacheSet(method, path, data);
  }
  return data;
}

// 导出所有 API 方法
export const api = {
  /** 健康检查 + 数据库状态 */
  health: () => request("GET", "/api/health"),
  /** 看板统计数据 */
  dashboard: () => request("GET", "/api/dashboard"),

  // ── 交易计划 ──
  getTradePlans: (limit = 8) => request("GET", `/api/trade-plans?limit=${limit}`),
  saveTradePlan: (plan) => request("POST", "/api/trade-plans", plan),
  deleteTradePlan: (id) => request("DELETE", `/api/trade-plans?id=${id}`),

  // ── 复盘记录 ──
  getReviews: (params = {}) => {
    const q = new URLSearchParams();
    q.set("limit", params.limit || 50);
    if (params.id) q.set("id", params.id);
    if (params.symbol) q.set("symbol", params.symbol);
    if (params.dateFrom) q.set("dateFrom", params.dateFrom);
    if (params.dateTo) q.set("dateTo", params.dateTo);
    return request("GET", `/api/daily-reviews?${q}`);
  },
  saveReview: (review) => request("POST", "/api/daily-reviews", review),
  deleteReview: (id) => request("DELETE", `/api/daily-reviews?id=${id}`),

  // ── 应用设置 ──
  getSettings: () => request("GET", "/api/settings"),
  saveSettings: (settings) => request("POST", "/api/settings", { settings }),

  // ── AI 对话 ──
  aiChat: (reviewData, messages, aiConfig, stockData) =>
    request("POST", "/api/ai/chat", { reviewData, messages, aiConfig, stockData }),
  /** AI 大盘复盘：根据大盘指数行情和多周期K线生成市场复盘分析（支持与已有内容交叉验证） */
  aiMarketReview: (marketData, klineData, aiConfig, existingFields) =>
    request("POST", "/api/ai/market-review", { marketData, klineData, aiConfig, existingFields }),
  /** AI 整理复盘：将自由文本解析为结构化复盘字段 */
  aiOrganizeReview: (freeText, existingReview, aiConfig) =>
    request("POST", "/api/ai/organize-review", { freeText, existingReview, aiConfig }),
  /** AI 全面复盘：独立分析行情 + 交叉验证用户复盘 */
  aiFullReview: (stockData, indexData, existingReview, aiConfig) =>
    request("POST", "/api/ai/full-review", { stockData, indexData, existingReview, aiConfig }),
  /** AI 多维度交叉复盘：运用多种技术理论交叉验证复盘数据 */
  aiCrossReview: (reviewData, aiConfig) =>
    request("POST", "/api/ai/cross-review", { reviewData, aiConfig }),

  // ── 每日时事 ──
  dailyNews: () => request("GET", "/api/daily-news"),
  /** AI 生成每日日报摘要，传入 articles 数组和 aiConfig */
  dailyDigest: (articles, aiConfig) => request("POST", "/api/ai/daily-digest", { articles, aiConfig }),
  /** 获取历史日报列表 */
  dailyDigests: () => request("GET", "/api/daily-digests"),
  /** 按日期查询单日日报 */
  dailyDigestByDate: (date) => request("GET", `/api/daily-digest?date=${encodeURIComponent(date)}`),

  // ── 周报/月报精选 ──
  /** AI 生成周报精选摘要 */
  weeklyDigest: (aiConfig) => request("POST", "/api/ai/weekly-digest", { aiConfig }),
  /** AI 生成月报精选摘要 */
  monthlyDigest: (aiConfig) => request("POST", "/api/ai/monthly-digest", { aiConfig }),
  /** 获取历史周报/月报列表 */
  periodicDigests: (type) => request("GET", `/api/periodic-digests${type ? `?type=${type}` : ""}`),
  /** 按 ID 查询单条周报/月报详情 */
  periodicDigestById: (id) => request("GET", `/api/periodic-digest?id=${id}`),

  // ── RSS 源管理 ──
  /** 读取当前 OPML 配置内容 */
  getSourcesOpml: () => request("GET", "/api/sources/opml"),
  /** 读取捆绑的默认 OPML 配置（忽略用户自定义） */
  getDefaultSourcesOpml: () => request("GET", "/api/sources/opml?default=true"),
  /** 保存/上传 OPML 配置 */
  saveSourcesOpml: (content) => request("POST", "/api/sources/opml", { content }),

  // ═══════════════════════════════════════════════════════════════
  // Stock SDK — 板块/搜索/行情
  // ═══════════════════════════════════════════════════════════════

  /** SDK 状态检查 */
  stockStatus: () => request("GET", "/api/stock/status"),

  /** 搜索股票/基金/指数 */
  stockSearch: (keyword) => request("GET", `/api/stock/search?keyword=${encodeURIComponent(keyword)}`),

  // ── 板块数据（启用程序级内存缓存） ──

  /**
   * 获取行业板块列表
   * @param {number} [topN] 取涨幅前N
   * @param {{ forceRefresh?: boolean }} [opts]
   */
  getIndustries: (topN, opts) => {
    const path = `/api/stock/industries${topN ? `?topN=${topN}` : ""}`;
    if (opts?.forceRefresh) cacheClear(`GET:${path}`);
    return request("GET", path, undefined, { useCache: true });
  },

  /**
   * 获取概念板块列表
   * @param {number} [topN] 取涨幅前N
   * @param {{ forceRefresh?: boolean }} [opts]
   */
  getConcepts: (topN, opts) => {
    const path = `/api/stock/concepts${topN ? `?topN=${topN}` : ""}`;
    if (opts?.forceRefresh) cacheClear(`GET:${path}`);
    return request("GET", path, undefined, { useCache: true });
  },

  /**
   * 获取热门板块（行业+概念涨幅前N）
   * @param {number} [topN=10]
   * @param {{ forceRefresh?: boolean }} [opts]
   */
  getHotSectors: (topN = 10, opts) => {
    const path = `/api/stock/hot-sectors?topN=${topN}`;
    if (opts?.forceRefresh) cacheClear(`GET:${path}`);
    return request("GET", path, undefined, { useCache: true });
  },

  /**
   * 搜索板块（行业+概念模糊匹配）
   * @param {string} keyword
   * @param {{ forceRefresh?: boolean }} [opts]
   */
  searchSectors: (keyword, opts) => {
    const path = `/api/stock/sectors/search?keyword=${encodeURIComponent(keyword)}`;
    if (opts?.forceRefresh) cacheClear(`GET:${path}`);
    return request("GET", path, undefined, { useCache: true });
  },

  /** 获取行业板块成分股 */
  getIndustryStocks: (symbol) => request("GET", `/api/stock/industry/${encodeURIComponent(symbol)}/stocks`),

  /** 获取概念板块成分股 */
  getConceptStocks: (symbol) => request("GET", `/api/stock/concept/${encodeURIComponent(symbol)}/stocks`),

  /** 批量获取行情 */
  getBatchQuotes: (codes) => request("POST", "/api/stock/quotes", { codes }),

  /** 智能多市场行情（自动识别A/港/美/基金） */
  getMultiMarketQuotes: (codes) => request("POST", "/api/stock/multi-quotes", { codes }),

  /** 获取股票历史K线 */
  getStockKline: (symbol, period = "daily", startDate, endDate) => {
    const q = new URLSearchParams();
    q.set("symbol", symbol);
    q.set("period", period);
    if (startDate) q.set("startDate", startDate);
    if (endDate) q.set("endDate", endDate);
    return request("GET", `/api/stock/kline?${q}`);
  },

  /** 获取当日分时走势 */
  getStockTimeline: (symbol) => request("GET", `/api/stock/timeline?symbol=${encodeURIComponent(symbol)}`),

  // ── 涨停板 / 盘口异动 ──
  getZTPool: (type, date) => request("GET", `/api/stock/zt-pool?type=${type || "zt"}${date ? `&date=${date}` : ""}`),
  getStockChanges: (type) => request("GET", `/api/stock/changes?type=${type || "large_buy"}`),
  getBoardChanges: () => request("GET", "/api/stock/board-changes"),

  // ── 资金流向 ──
  getFundFlow: (codes) => request("POST", "/api/stock/fund-flow", { codes }),
  getTradingCalendar: () => request("GET", "/api/stock/trading-calendar"),
  getFundFlowRank: (indicator) => request("GET", `/api/stock/fund-flow-rank?indicator=${indicator || "today"}`),
  getSectorFundFlowRank: (indicator, sectorType) => request("GET", `/api/stock/sector-fund-flow-rank?indicator=${indicator || "today"}&sectorType=${sectorType || "industry"}`),

  // ── 北向资金 ──
  getNorthboundMinute: (direction) => request("GET", `/api/stock/northbound-minute?direction=${direction || "north"}`),
  getNorthboundSummary: () => request("GET", "/api/stock/northbound-summary"),
  getNorthboundRank: (market, period) => request("GET", `/api/stock/northbound-rank?market=${market || "all"}&period=${period || "5day"}`),

  // ── 分红派送 ──
  getDividend: (symbol) => request("GET", `/api/stock/dividend?symbol=${encodeURIComponent(symbol)}`),

  // ── 期货 ──
  getGlobalFutures: (pageSize) => request("GET", `/api/stock/global-futures${pageSize ? `?pageSize=${pageSize}` : ""}`),

  // ═══════════════════════════════════════════════════════════════
  // 研报系统
  // ═══════════════════════════════════════════════════════════════

  /** 上传研报 → AI 提取方法论（支持多文件）
   * @param {string|null} text - 单文本内容（兼容旧用法）
   * @param {string|null} title - 标题
   * @param {object} aiConfig
   * @param {{ files?: {name:string, text:string}[] }} [multi] - 多文件模式
   */
  analyzeReport: (text, title, aiConfig, multi) => request("POST", "/api/reports/analyze", {
    text, title, aiConfig,
    files: multi?.files || undefined,
  }),

  /** 基于方法论编写研报（支持多 skill 融合）
   * @param {string} topic - 主题
   * @param {string|null} skillId - 单 skillId（兼容旧用法）
   * @param {object} aiConfig
   * @param {{ skillIds?: string[] }} [multi] - 多 skill 融合
   */
  writeReport: (topic, skillId, aiConfig, multi) => request("POST", "/api/reports/write", {
    topic, skillId,
    aiConfig,
    skillIds: multi?.skillIds || undefined,
  }),

  /** 列出所有已保存的分析 skill */
  listReportSkills: () => request("GET", "/api/reports/skills"),

  /** 删除 skill */
  deleteReportSkill: (id) => request("DELETE", `/api/reports/skills?id=${encodeURIComponent(id)}`),

  // ═══════════════════════════════════════════════════════════════
  // 每日 AI 复盘
  // ═══════════════════════════════════════════════════════════════

  /** AI 每日市场复盘：新闻+行情→复盘+预判+标的 */
  dailyMarketReview: (aiConfig) => request("POST", "/api/market/daily-review", { aiConfig }),

  // ── 缓存管理 ──
  /** 清除程序级内存缓存（不传参清空全部，传字符串清除匹配前缀的缓存项） */
  clearCache: (prefix) => cacheClear(prefix),

  // ═══════════════════════════════════════════════════════════════
  // 数据库迁移
  // ═══════════════════════════════════════════════════════════════

  /** 手动触发数据迁移到指定数据库类型 */
  migrateDatabase: (targetType) => request("POST", "/api/db/migrate", { targetType }),

  // ═══════════════════════════════════════════════════════════════
  // 持仓记录
  // ═══════════════════════════════════════════════════════════════

  getPositions: () => request("GET", "/api/positions"),
  addPosition: (data) => request("POST", "/api/positions", data),
  updatePosition: (id, data) => request("PUT", "/api/positions", { id, ...data }),
  sellPosition: (id, sellPrice, sellShares) => request("POST", "/api/positions/sell", { id, sellPrice, sellShares }),
  deletePosition: (id) => request("DELETE", `/api/positions?id=${id}`),
  refreshPositions: () => request("POST", "/api/positions/refresh"),

  // ── 做T ──
  getTTrades: (positionId) => request("GET", `/api/positions/t-trades?positionId=${positionId}`),
  addTTrade: (data) => request("POST", "/api/positions/t-trades", data),
  deleteTTrade: (id) => request("DELETE", `/api/positions/t-trades?id=${id}`),

  // ═══════════════════════════════════════════════════════════════
  // K线训练
  // ═══════════════════════════════════════════════════════════════

  /** 随机获取一只A股的K线数据 */
  getRandomKline: (count = 500) => request("GET", `/api/kline-train/random?count=${count}`),

  /** 保存训练记录 */
  saveKlineSession: (data) => request("POST", "/api/kline-train/session", data),

  /** 获取训练记录列表 */
  getKlineSessions: () => request("GET", "/api/kline-train/sessions"),

  /** 删除训练记录 */
  deleteKlineSession: (id) => request("DELETE", `/api/kline-train/session${id ? `?id=${id}` : ""}`),
};
