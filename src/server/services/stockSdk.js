/**
 * StockSDK 服务层 — 封装 stock-sdk 所有交互
 *
 * 职责：
 * - SDK 实例管理（懒加载、单例）
 * - 所有 SDK API 调用统一封装
 * - 数据格式化与错误处理
 *
 * 设计原则：
 * - 高内聚：所有 stock-sdk 相关逻辑集中在一个模块
 * - 低耦合：通过清晰的接口与路由层交互，路由层不感知 SDK 细节
 * - 容错性：单点失败不阻塞其他功能，返回友好错误信息
 *
 * 用法：
 *   const { stockService } = require("./services/stockSdk.js");
 *   const industries = await stockService.getIndustryList();
 */

"use strict";

let sdk = null;
let sdkInitError = null;

// AKShare 降级数据源（Python 桥接）
let akshare = null;
function getAKShare() {
  if (akshare) return akshare;
  try {
    akshare = require("./akshare");
    console.log("[stockSdk] AKShare 降级数据源已加载");
    return akshare;
  } catch (err) {
    console.warn("[stockSdk] AKShare 降级数据源不可用:", err.message);
    return null;
  }
}

/**
 * 懒加载获取 SDK 实例
 * 仅在首次调用时初始化，避免服务器启动时因网络问题阻塞
 */
function getSDK() {
  if (sdk) return sdk;
  if (sdkInitError) throw sdkInitError;

  try {
    const { StockSDK } = require("stock-sdk");
    sdk = new StockSDK({
      timeout: 10000,
      rateLimit: {
        requestsPerSecond: 4,
        maxBurst: 8,
      },
      retry: {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10000,
      },
      headers: {
        "X-Request-Source": "stock-toolbox",
      },
      // 按 provider 微调策略
      providerPolicies: {
        eastmoney: {
          timeout: 12000,
          rateLimit: { requestsPerSecond: 3, maxBurst: 3 },
        },
      },
    });
    console.log("[stockSdk] SDK 初始化成功");
    return sdk;
  } catch (err) {
    sdkInitError = err;
    console.error("[stockSdk] SDK 初始化失败:", err.message);
    throw err;
  }
}

/**
 * 统一错误包装器
 * @param {string} operation - 操作名称（用于日志）
 * @param {Function} fn - 异步执行函数
 * @returns {Promise<{ok: boolean, data?: any, error?: string}>}
 */
async function safeCall(operation, fn) {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err) {
    console.error(`[stockSdk] ${operation} 失败:`, err.message);
    return { ok: false, error: err.message || "未知错误" };
  }
}

/**
 * SDK 调用降级包装器 — SDK 失败时自动尝试 AKShare
 * @param {string} operation - 操作名称
 * @param {Function} sdkFn - SDK 调用函数
 * @param {Function} akFn - AKShare 调用函数
 * @returns {Promise<{ok: boolean, data?: any, error?: string}>}
 */
async function withAKFallback(operation, sdkFn, akFn) {
  // 先尝试 SDK
  const sdkResult = await safeCall(operation, sdkFn);
  if (sdkResult.ok) return sdkResult;

  // SDK 失败，尝试 AKShare 降级
  const ak = getAKShare();
  if (!ak) {
    return { ok: false, error: `${sdkResult.error}（AKShare 降级数据源不可用）` };
  }

  console.log(`[stockSdk] ${operation} SDK失败，降级到 AKShare:`, sdkResult.error);
  try {
    const data = await akFn(ak);
    return { ok: true, data, _source: "akshare" };
  } catch (err) {
    console.error(`[stockSdk] ${operation} AKShare 降级也失败:`, err.message);
    return { ok: false, error: `SDK: ${sdkResult.error}; AKShare: ${err.message}` };
  }
}

// ═══════════════════════════════════════════════════════════════════
// 公开服务接口
// ═══════════════════════════════════════════════════════════════════

const stockService = {
  // ── SDK 状态 ──
  /** 检查 SDK 是否可用 */
  isAvailable() {
    try {
      getSDK();
      return true;
    } catch {
      return false;
    }
  },

  /** 获取 SDK 状态信息 */
  getStatus() {
    if (sdk) return { status: "ready" };
    if (sdkInitError) return { status: "error", error: sdkInitError.message };
    return { status: "uninitialized" };
  },

  // ── 搜索 ──
  /**
   * 搜索股票/基金/指数（SDK失败时降级到 AKShare）
   * @param {string} keyword - 关键词（代码/名称/拼音）
   */
  async searchStocks(keyword) {
    if (!keyword || !keyword.trim()) {
      return { ok: false, error: "关键词不能为空" };
    }
    return withAKFallback("搜索股票",
      async () => {
        const s = getSDK();
        const results = await s.search(keyword.trim());
        return results.map((r) => ({
          code: r.code || "",
          name: r.name || "",
          market: r.market || "",
          type: r.type || "",
          category: r.category || "other",
        }));
      },
      async (ak) => {
        const res = await ak.searchStock(keyword.trim());
        if (!res.ok) throw new Error(res.error);
        return res.data;
      }
    );
  },

  // ── 行业板块 ──
  /**
   * 获取所有行业板块列表（SDK失败时降级到 AKShare）
   */
  async getIndustryList() {
    return withAKFallback("获取行业板块列表",
      async () => {
        const s = getSDK();
        const boards = await s.getIndustryList();
        return boards.map((b) => ({
          rank: b.rank, name: b.name, code: b.code,
          price: b.price, change: b.change, changePercent: b.changePercent,
          totalMarketCap: b.totalMarketCap, turnoverRate: b.turnoverRate,
          riseCount: b.riseCount, fallCount: b.fallCount,
          leadingStock: b.leadingStock, leadingStockChangePercent: b.leadingStockChangePercent,
        }));
      },
      async (ak) => { const res = await ak.getIndustries(); if (!res.ok) throw new Error(res.error); return res.data; }
    );
  },

  /**
   * 获取行业板块实时行情快照
   * @param {string} symbol - 板块名称或代码
   */
  async getIndustrySpot(symbol) {
    return safeCall("获取行业板块行情", async () => {
      const s = getSDK();
      return await s.getIndustrySpot(symbol);
    });
  },

  /**
   * 获取行业板块成分股
   * @param {string} symbol - 板块名称或代码
   */
  async getIndustryConstituents(symbol) {
    return withAKFallback("获取行业成分股",
      async () => {
        const s = getSDK();
        const stocks = await s.getIndustryConstituents(symbol);
        return stocks.map((st) => ({
          rank: st.rank, code: st.code, name: st.name,
          price: st.price, changePercent: st.changePercent, change: st.change,
          volume: st.volume, amount: st.amount, amplitude: st.amplitude,
          high: st.high, low: st.low, open: st.open, prevClose: st.prevClose,
          turnoverRate: st.turnoverRate, pe: st.pe, pb: st.pb,
        }));
      },
      async (ak) => { const res = await ak.getBoardStocks(symbol, "industry"); if (!res.ok) throw new Error(res.error); return res.data; }
    );
  },

  /**
   * 获取行业板块历史K线
   * @param {string} symbol - 板块名称或代码
   * @param {object} options - { period, adjust, startDate, endDate }
   */
  async getIndustryKline(symbol, options = {}) {
    return safeCall("获取行业K线", async () => {
      const s = getSDK();
      return await s.getIndustryKline(symbol, options);
    });
  },

  // ── 概念板块 ──
  /**
   * 获取所有概念板块列表（含实时行情概览）
   */
  async getConceptList() {
    return withAKFallback("获取概念板块列表",
      async () => {
        const s = getSDK();
        const boards = await s.getConceptList();
        return boards.map((b) => ({
          rank: b.rank, name: b.name, code: b.code,
          price: b.price, change: b.change, changePercent: b.changePercent,
          totalMarketCap: b.totalMarketCap, turnoverRate: b.turnoverRate,
          riseCount: b.riseCount, fallCount: b.fallCount,
          leadingStock: b.leadingStock, leadingStockChangePercent: b.leadingStockChangePercent,
        }));
      },
      async (ak) => { const res = await ak.getConcepts(); if (!res.ok) throw new Error(res.error); return res.data; }
    );
  },

  /**
   * 获取概念板块实时行情快照
   * @param {string} symbol - 板块名称或代码
   */
  async getConceptSpot(symbol) {
    return safeCall("获取概念板块行情", async () => {
      const s = getSDK();
      return await s.getConceptSpot(symbol);
    });
  },

  /**
   * 获取概念板块成分股
   * @param {string} symbol - 板块名称或代码
   */
  async getConceptConstituents(symbol) {
    return withAKFallback("获取概念成分股",
      async () => {
        const s = getSDK();
        const stocks = await s.getConceptConstituents(symbol);
        return stocks.map((st) => ({
          rank: st.rank, code: st.code, name: st.name,
          price: st.price, changePercent: st.changePercent, change: st.change,
          volume: st.volume, amount: st.amount, amplitude: st.amplitude,
          high: st.high, low: st.low, open: st.open, prevClose: st.prevClose,
          turnoverRate: st.turnoverRate, pe: st.pe, pb: st.pb,
        }));
      },
      async (ak) => { const res = await ak.getBoardStocks(symbol, "concept"); if (!res.ok) throw new Error(res.error); return res.data; }
    );
  },

  /**
   * 获取概念板块历史K线
   * @param {string} symbol - 板块名称或代码
   * @param {object} options - { period, adjust, startDate, endDate }
   */
  async getConceptKline(symbol, options = {}) {
    return safeCall("获取概念K线", async () => {
      const s = getSDK();
      return await s.getConceptKline(symbol, options);
    });
  },

  // ── 行情 ──
  /**
   * 批量获取A股行情
   * @param {string[]} codes - 股票代码数组
   */
  async getQuotes(codes) {
    if (!Array.isArray(codes) || codes.length === 0) {
      return { ok: false, error: "代码列表不能为空" };
    }
    return safeCall("批量获取行情", async () => {
      const s = getSDK();
      return await s.getFullQuotes(codes);
    });
  },

  /**
   * 批量获取简要行情（轻量版）
   * @param {string[]} codes - 股票代码数组
   */
  async getSimpleQuotes(codes) {
    if (!Array.isArray(codes) || codes.length === 0) {
      return { ok: false, error: "代码列表不能为空" };
    }
    return safeCall("批量获取简要行情", async () => {
      const s = getSDK();
      return await s.getSimpleQuotes(codes);
    });
  },

  /**
   * 智能多市场行情 — SDK失败时降级到 AKShare
   * @param {string[]} codes - 混合代码数组
   */
  async getMultiMarketQuotes(codes) {
    if (!Array.isArray(codes) || codes.length === 0) {
      return { ok: false, error: "代码列表不能为空" };
    }
    return withAKFallback("多市场行情",
      async () => {
      const s = getSDK();
      const aCodes = [];
      const hkCodes = [];
      const usCodes = [];
      const fundCodes = [];

      for (const c of codes) {
        const code = String(c).trim();
        if (!code) continue;
        const lc = code.toLowerCase();
        if (lc.startsWith("sh") || lc.startsWith("sz") || lc.startsWith("bj")) {
          aCodes.push(lc);
        } else if (/^\d{5}$/.test(code)) {
          hkCodes.push(code);
        } else if (/^[A-Za-z]+$/.test(code) && code.length <= 5) {
          // 纯字母 ticker → 美股
          usCodes.push(code);
        } else if (/^\d{6}$/.test(code)) {
          // 6位数字：可能是A股（无前缀）或基金
          // A股: 6开头=沪, 0/3=深, 92=北；基金: 其他开头
          const first = code.charAt(0);
          if (first === "6") aCodes.push("sh" + code);
          else if (first === "0" || first === "3") aCodes.push("sz" + code);
          else if (first === "9" && code.charAt(1) === "2") aCodes.push("bj" + code);
          else fundCodes.push(code);
        } else {
          // 兜底：尝试A股
          aCodes.push(code);
        }
      }

      const results = [];

      if (aCodes.length > 0) {
        try {
          const aQuotes = await s.getFullQuotes(aCodes);
          for (const q of aQuotes) {
            results.push({ ...q, market: "ashare", currency: "CNY" });
          }
        } catch (e) {
          console.error("[stockSdk] A股行情获取失败:", e.message);
        }
      }

      if (hkCodes.length > 0) {
        try {
          const hkQuotes = await s.getHKQuotes(hkCodes);
          for (const q of hkQuotes) {
            results.push({ ...q, market: "hk", currency: q.currency || "HKD" });
          }
        } catch (e) {
          console.error("[stockSdk] 港股行情获取失败:", e.message);
        }
      }

      if (usCodes.length > 0) {
        try {
          const usQuotes = await s.getUSQuotes(usCodes);
          for (const q of usQuotes) {
            results.push({ ...q, market: "us", currency: "USD" });
          }
        } catch (e) {
          console.error("[stockSdk] 美股行情获取失败:", e.message);
        }
      }

      if (fundCodes.length > 0) {
        try {
          const fQuotes = await s.getFundQuotes(fundCodes);
          for (const q of fQuotes) {
            // 基金返回结构调整为统一格式
            results.push({
              code: q.code,
              name: q.name,
              price: q.nav,
              prevClose: null,
              open: null,
              high: null,
              low: null,
              volume: null,
              amount: null,
              change: q.change,
              changePercent: null,
              time: q.navDate,
              market: "fund",
              currency: "CNY",
            });
          }
        } catch (e) {
          console.error("[stockSdk] 基金行情获取失败:", e.message);
        }
      }

      return results;
      },
      async (ak) => {
        const res = await ak.getMultiMarketQuotes(codes);
        if (!res.ok) throw new Error(res.error);
        return res.data;
      }
    );
  },

  // ── K线数据 ──
  /**
   * 获取股票历史K线（自动识别市场，SDK失败时降级到 AKShare）
   * @param {string} symbol - 股票代码（如 sh600519 / 00700）
   * @param {object} options - { period, adjust, startDate, endDate }
   */
  async getStockKline(symbol, options = {}) {
    if (!symbol) return { ok: false, error: "股票代码不能为空" };
    return withAKFallback("获取K线数据",
      async () => {
        const s = getSDK();
        const code = symbol.trim();
        const opts = {
          period: options.period || "daily",
          adjust: options.adjust || "qfq",
          startDate: options.startDate || undefined,
          endDate: options.endDate || undefined,
        };

        let klines;
        if (code.startsWith("sh") || code.startsWith("sz") || code.startsWith("bj")) {
          klines = await s.getHistoryKline(code, opts);
        } else if (/^\d{5}$/.test(code)) {
          klines = await s.getHKHistoryKline(code, opts);
        } else if (code.startsWith("10") && code.includes(".")) {
          klines = await s.getUSHistoryKline(code, opts);
        } else if (/^\d{6}$/.test(code)) {
          const prefix = code.startsWith("6") ? "sh" : code.startsWith("0") || code.startsWith("3") ? "sz" : "bj";
          klines = await s.getHistoryKline(prefix + code, opts);
        } else {
          klines = await s.getHistoryKline(code, opts);
        }

        return (klines || []).map((k) => ({
          date: k.date || "",
          open: k.open,
          close: k.close,
          high: k.high,
          low: k.low,
          volume: k.volume,
          amount: k.amount,
          changePercent: k.changePercent,
        }));
      },
      async (ak) => {
        const res = await ak.getStockKline(symbol, options);
        if (!res.ok) throw new Error(res.error);
        return res.data;
      }
    );
  },

  // ── 分时走势 ──
  /**
   * 获取当日分时走势
   * @param {string} symbol - 股票代码（如 sz000001）
   */
  async getStockTimeline(symbol) {
    if (!symbol) return { ok: false, error: "股票代码不能为空" };
    return safeCall("获取分时走势", async () => {
      const s = getSDK();
      // 标准化代码：补全交易所前缀（getTodayTimeline 要求 sz000001 格式）
      let code = symbol.trim().toLowerCase();
      if (/^\d{6}$/.test(code)) {
        const first = code.charAt(0);
        if (first === "6") code = "sh" + code;
        else if (first === "0" || first === "3") code = "sz" + code;
        else if (first === "9" && code.charAt(1) === "2") code = "bj" + code;
      }
      const result = await s.getTodayTimeline(code);
      return {
        code: result.code,
        date: result.date,
        preClose: result.preClose || null,
        data: (result.data || []).map((d) => ({
          time: d.time || "",
          price: d.price,
          volume: d.volume,
          amount: d.amount,
          avgPrice: d.avgPrice,
        })),
      };
    });
  },

  // ── 板块行情聚合 ──
  /**
   * 获取热门板块（涨幅前N的行业+概念板块）
   * @param {number} topN - 取前几名
   */
  async getHotSectors(topN = 10) {
    const [industries, concepts] = await Promise.all([
      this.getIndustryList(),
      this.getConceptList(),
    ]);

    const result = { industries: [], concepts: [] };

    if (industries.ok) {
      result.industries = industries.data.slice(0, topN).map((b) => ({
        ...b,
        boardType: "industry",
      }));
    }

    if (concepts.ok) {
      result.concepts = concepts.data.slice(0, topN).map((b) => ({
        ...b,
        boardType: "concept",
      }));
    }

    return { ok: true, data: result };
  },

  /**
   * 搜索板块（行业+概念）——按名称模糊匹配
   * @param {string} keyword - 搜索关键词
   */
  async searchSectors(keyword) {
    if (!keyword || !keyword.trim()) {
      return { ok: false, error: "关键词不能为空" };
    }

    const kw = keyword.trim().toLowerCase();
    const [industries, concepts] = await Promise.all([
      this.getIndustryList(),
      this.getConceptList(),
    ]);

    const results = [];

    if (industries.ok) {
      for (const b of industries.data) {
        if (b.name.toLowerCase().includes(kw) || b.code.toLowerCase().includes(kw)) {
          results.push({ ...b, boardType: "industry" });
        }
      }
    }

    if (concepts.ok) {
      for (const b of concepts.data) {
        if (b.name.toLowerCase().includes(kw) || b.code.toLowerCase().includes(kw)) {
          results.push({ ...b, boardType: "concept" });
        }
      }
    }

    return { ok: true, data: results };
  },

  // ═══════════════════════════════════════════════════════════════
  // 涨停板 / 盘口异动
  // ═══════════════════════════════════════════════════════════════

  /** 获取涨停板股池（SDK失败时降级到 AKShare） */
  async getZTPool(type = "zt", date) {
    return withAKFallback("涨停板股池",
      async () => { const s = getSDK(); return await s.getZTPool(type, date); },
      async (ak) => { const res = await ak.getZTPool(type, date); if (!res.ok) throw new Error(res.error); return res.data; }
    );
  },

  /** 获取盘口异动 */
  async getStockChanges(type = "large_buy") {
    return safeCall("盘口异动", async () => {
      const s = getSDK();
      return await s.getStockChanges(type);
    });
  },

  /** 获取板块异动 */
  async getBoardChanges() {
    return safeCall("板块异动", async () => {
      const s = getSDK();
      return await s.getBoardChanges();
    });
  },

  // ═══════════════════════════════════════════════════════════════
  // 资金流向（扩展）
  // ═══════════════════════════════════════════════════════════════

  /** 获取股票资金流向 */
  async getFundFlow(codes) {
    return safeCall("资金流向", async () => {
      const s = getSDK();
      return await s.getFundFlow(codes);
    });
  },

  /** 获取盘口大单占比 */
  async getPanelLargeOrder(codes) {
    return safeCall("盘口大单", async () => {
      const s = getSDK();
      return await s.getPanelLargeOrder(codes);
    });
  },

  /** 获取交易日历 */
  async getTradingCalendar() {
    return safeCall("交易日历", async () => {
      const s = getSDK();
      return await s.getTradingCalendar();
    });
  },

  // ═══════════════════════════════════════════════════════════════
  // 资金流向（深度）
  // ═══════════════════════════════════════════════════════════════

  /** 个股资金流历史 */
  async getIndividualFundFlow(symbol, period = "daily") {
    return safeCall("个股资金流", async () => {
      const s = getSDK();
      return await s.getIndividualFundFlow(symbol, { period });
    });
  },

  /** 大盘资金流历史 */
  async getMarketFundFlow() {
    return safeCall("大盘资金流", async () => {
      const s = getSDK();
      return await s.getMarketFundFlow();
    });
  },

  /** 个股资金流排名（SDK失败时降级到 AKShare） */
  async getFundFlowRank(indicator = "today") {
    return withAKFallback("资金流排名",
      async () => { const s = getSDK(); return await s.getFundFlowRank({ indicator }); },
      async (ak) => { const res = await ak.getFundFlowRank(indicator); if (!res.ok) throw new Error(res.error); return res.data; }
    );
  },

  /** 板块资金流排名（SDK失败时降级到 AKShare） */
  async getSectorFundFlowRank(indicator = "today", sectorType = "industry") {
    return withAKFallback("板块资金流排名",
      async () => { const s = getSDK(); return await s.getSectorFundFlowRank({ indicator, sectorType }); },
      async (ak) => { const res = await ak.getSectorFundFlowRank(indicator, sectorType); if (!res.ok) throw new Error(res.error); return res.data; }
    );
  },

  // ═══════════════════════════════════════════════════════════════
  // 北向资金
  // ═══════════════════════════════════════════════════════════════

  /** 北向/南向资金分时 */
  async getNorthboundMinute(direction = "north") {
    return safeCall("北向分时", async () => {
      const s = getSDK();
      return await s.getNorthboundMinute(direction);
    });
  },

  /** 沪深港通市场汇总 */
  async getNorthboundFlowSummary() {
    return safeCall("北向汇总", async () => {
      const s = getSDK();
      return await s.getNorthboundFlowSummary();
    });
  },

  /** 北向持股排行 */
  async getNorthboundHoldingRank(options = {}) {
    return safeCall("北向持股排行", async () => {
      const s = getSDK();
      return await s.getNorthboundHoldingRank(options);
    });
  },

  /** 北向资金历史 */
  async getNorthboundHistory(direction = "north", options = {}) {
    return safeCall("北向历史", async () => {
      const s = getSDK();
      return await s.getNorthboundHistory(direction, options);
    });
  },

  /** 个股北向持仓历史 */
  async getNorthboundIndividual(symbol, options = {}) {
    return safeCall("个股北向持仓", async () => {
      const s = getSDK();
      return await s.getNorthboundIndividual(symbol, options);
    });
  },

  // ═══════════════════════════════════════════════════════════════
  // 分红派送
  // ═══════════════════════════════════════════════════════════════

  /** 获取股票分红派送详情 */
  async getDividendDetail(symbol) {
    return safeCall("分红派送", async () => {
      const s = getSDK();
      return await s.getDividendDetail(symbol);
    });
  },

  // ═══════════════════════════════════════════════════════════════
  // 基金扩展
  // ═══════════════════════════════════════════════════════════════

  /** 基金分红列表 */
  async getFundDividendList(options = {}) {
    return safeCall("基金分红列表", async () => {
      const s = getSDK();
      return await s.getFundDividendList(options);
    });
  },

  /** 基金历史净值 */
  async getFundNavHistory(code) {
    return safeCall("基金净值", async () => {
      const s = getSDK();
      return await s.getFundNavHistory(code);
    });
  },

  /** 基金实时估值 */
  async getFundEstimate(code) {
    return safeCall("基金估值", async () => {
      const s = getSDK();
      return await s.getFundEstimate(code);
    });
  },

  /** 基金同类排名 */
  async getFundRankHistory(code) {
    return safeCall("基金排名", async () => {
      const s = getSDK();
      return await s.getFundRankHistory(code);
    });
  },

  // ═══════════════════════════════════════════════════════════════
  // 期货行情
  // ═══════════════════════════════════════════════════════════════

  /** 国内期货K线 */
  async getFuturesKline(symbol, options = {}) {
    return safeCall("期货K线", async () => {
      const s = getSDK();
      return await s.getFuturesKline(symbol, options);
    });
  },

  /** 全球期货实时行情 */
  async getGlobalFuturesSpot(pageSize) {
    return safeCall("全球期货行情", async () => {
      const s = getSDK();
      return await s.getGlobalFuturesSpot({ pageSize });
    });
  },

  /** 全球期货K线 */
  async getGlobalFuturesKline(symbol, options = {}) {
    return safeCall("全球期货K线", async () => {
      const s = getSDK();
      return await s.getGlobalFuturesKline(symbol, options);
    });
  },

  /** 期货库存 */
  async getFuturesInventory(symbol, options = {}) {
    return safeCall("期货库存", async () => {
      const s = getSDK();
      return await s.getFuturesInventory(symbol, options);
    });
  },

  /** COMEX 黄金/白银库存 */
  async getComexInventory(symbol) {
    return safeCall("COMEX库存", async () => {
      const s = getSDK();
      return await s.getComexInventory(symbol);
    });
  },

  /** 代码列表 — A股 */
  async getAShareCodeList(options) {
    return safeCall("A股代码列表", async () => {
      const s = getSDK();
      return await s.getAShareCodeList(options);
    });
  },

  /** 代码列表 — 港股 */
  async getHKCodeList() {
    return safeCall("港股代码列表", async () => {
      const s = getSDK();
      return await s.getHKCodeList();
    });
  },

  /** 代码列表 — 美股 */
  async getUSCodeList(options) {
    return safeCall("美股代码列表", async () => {
      const s = getSDK();
      return await s.getUSCodeList(options);
    });
  },

  /** 代码列表 — 基金 */
  async getFundCodeList() {
    return safeCall("基金代码列表", async () => {
      const s = getSDK();
      return await s.getFundCodeList();
    });
  },

  // ═══════════════════════════════════════════════════════════════
  // 选股器
  // ═══════════════════════════════════════════════════════════════

  /**
   * 股票筛选
   * @param {object} filters - 筛选条件
   * @param {string} [filters.industry] - 行业板块名称
   * @param {string} [filters.concept] - 概念板块名称
   * @param {number} [filters.priceMin] - 最低价
   * @param {number} [filters.priceMax] - 最高价
   * @param {number} [filters.changeMin] - 最低涨幅%
   * @param {number} [filters.changeMax] - 最高涨幅%
   * @param {number} [filters.peMin] - 最低PE
   * @param {number} [filters.peMax] - 最高PE
   * @param {number} [filters.turnoverMin] - 最低换手率%
   * @param {number} [filters.turnoverMax] - 最高换手率%
   * @param {string} [filters.sortBy] - 排序字段
   * @param {string} [filters.sortOrder] - 排序方向 asc/desc
   * @param {number} [filters.limit] - 最大返回数
   */
  async screenStocks(filters = {}) {
    return safeCall("选股筛选", async () => {
      const s = getSDK();
      let allStocks = [];

      // 数据来源：指定板块时用板块成分股，否则聚合资金流排名（覆盖面更广）
      if (filters.industry) {
        const result = await s.getIndustryConstituents(filters.industry);
        allStocks = (result || []).map((st) => normalizeStock(st));
      } else if (filters.concept) {
        const result = await s.getConceptConstituents(filters.concept);
        allStocks = (result || []).map((st) => normalizeStock(st));
      } else {
        // 从资金流排名获取全市场股票（数据更全面）
        try {
          const rankRes = await s.getFundFlowRank({ indicator: "today" });
          if (Array.isArray(rankRes)) {
            allStocks = rankRes.map((st) => normalizeStock(st));
          }
        } catch (e) {
          console.error("[stockSdk] 资金流排名获取失败，尝试行业汇总:", e.message);
        }

        // 回退：汇总前5大行业成分股
        if (allStocks.length === 0) {
          const sdk = getSDK();
          const industries = await sdk.getIndustryList();
          const topIndustries = (industries || []).slice(0, 5);
          const seen = new Set();
          for (const ind of topIndustries) {
            try {
              const stocks = await sdk.getIndustryConstituents(ind.name);
              for (const st of (stocks || [])) {
                if (!seen.has(st.code)) {
                  seen.add(st.code);
                  allStocks.push(normalizeStock(st));
                }
              }
            } catch { /* skip */ }
          }
        }
      }

      // 应用筛选
      let filtered = allStocks.filter((st) => {
        if (filters.priceMin != null && st.price < filters.priceMin) return false;
        if (filters.priceMax != null && st.price > filters.priceMax) return false;
        if (filters.changeMin != null && st.changePercent < filters.changeMin) return false;
        if (filters.changeMax != null && st.changePercent > filters.changeMax) return false;
        if (filters.peMin != null && (st.pe == null || st.pe < filters.peMin)) return false;
        if (filters.peMax != null && (st.pe == null || st.pe > filters.peMax)) return false;
        if (filters.turnoverMin != null && (st.turnoverRate == null || st.turnoverRate < filters.turnoverMin)) return false;
        if (filters.turnoverMax != null && (st.turnoverRate == null || st.turnoverRate > filters.turnoverMax)) return false;
        return true;
      });

      // 排序
      const sortBy = filters.sortBy || "changePercent";
      const sortOrder = filters.sortOrder === "asc" ? 1 : -1;
      filtered.sort((a, b) => {
        const va = a[sortBy] != null ? a[sortBy] : -Infinity;
        const vb = b[sortBy] != null ? b[sortBy] : -Infinity;
        return (va - vb) * sortOrder;
      });

      // 限制数量
      const limit = Math.min(filters.limit || 100, 200);
      return filtered.slice(0, limit);
    });
  },

  /** 随机获取一只A股的K线（训练用） */
  async getRandomKline(count = 500) {
    const ak = getAKShare();
    if (!ak) return { ok: false, error: "AKShare 数据源不可用" };
    try {
      return await ak.getRandomKline(count);
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },
};

/**
 * 标准化股票数据字段
 */
function normalizeStock(st) {
  return {
    code: st.code || "",
    name: st.name || "",
    price: Number(st.price) || 0,
    change: Number(st.change) || 0,
    changePercent: Number(st.changePercent) || 0,
    volume: Number(st.volume) || 0,
    amount: Number(st.amount) || 0,
    amplitude: st.amplitude != null ? Number(st.amplitude) : null,
    high: st.high != null ? Number(st.high) : null,
    low: st.low != null ? Number(st.low) : null,
    open: st.open != null ? Number(st.open) : null,
    prevClose: st.prevClose != null ? Number(st.prevClose) : null,
    turnoverRate: st.turnoverRate != null ? Number(st.turnoverRate) : null,
    pe: st.pe != null ? Number(st.pe) : null,
    pb: st.pb != null ? Number(st.pb) : null,
    totalMarketCap: st.totalMarketCap != null ? Number(st.totalMarketCap) : null,
    circulatingMarketCap: st.circulatingMarketCap != null ? Number(st.circulatingMarketCap) : null,
    mainNetInflow: st.mainNetInflow != null ? Number(st.mainNetInflow) : null,
  };
}

module.exports = { stockService };
