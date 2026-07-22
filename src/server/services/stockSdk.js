/** StockSDK 服务层 — 仅保留前端仍在用的接口 */
"use strict";

let sdk = null;
let sdkInitError = null;

let akshare = null;
function getAKShare() {
  if (akshare) return akshare;
  try { akshare = require("./bridge"); console.log("[stockSdk] Python 桥接已加载 (biying+baostock)"); return akshare; }
  catch (err) { console.warn("[stockSdk] AKShare 降级数据源不可用:", err.message); return null; }
}

function getSDK() {
  if (sdk) return sdk;
  if (sdkInitError) throw sdkInitError;
  try {
    const { StockSDK } = require("stock-sdk");
    sdk = new StockSDK({ timeout: 10000, rateLimit: { requestsPerSecond: 4, maxBurst: 8 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, headers: { "X-Request-Source": "stock-toolbox" }, providerPolicies: { eastmoney: { timeout: 12000, rateLimit: { requestsPerSecond: 3, maxBurst: 3 } } } });
    console.log("[stockSdk] SDK 初始化成功"); return sdk;
  } catch (err) { sdkInitError = err; console.error("[stockSdk] SDK 初始化失败:", err.message); throw err; }
}

async function safeCall(operation, fn) {
  try { const data = await fn(); return { ok: true, data }; }
  catch (err) { console.error(`[stockSdk] ${operation} 失败:`, err.message); return { ok: false, error: err.message || "未知错误" }; }
}

async function withAKFallback(operation, sdkFn, akFn) {
  const sdkResult = await safeCall(operation, sdkFn);
  if (sdkResult.ok) return sdkResult;
  const ak = getAKShare();
  if (!ak) return { ok: false, error: `${sdkResult.error}（AKShare 降级数据源不可用）` };
  console.log(`[stockSdk] ${operation} SDK失败，降级到 AKShare:`, sdkResult.error);
  try { const data = await akFn(ak); return { ok: true, data, _source: "akshare" }; }
  catch (err) { console.error(`[stockSdk] ${operation} AKShare 降级也失败:`, err.message); return { ok: false, error: `SDK: ${sdkResult.error}; AKShare: ${err.message}` }; }
}

const stockService = {
  isAvailable() { try { getSDK(); return true; } catch { return false; } },
  getStatus() { if (sdk) return { status: "ready" }; if (sdkInitError) return { status: "error", error: sdkInitError.message }; return { status: "uninitialized" }; },

  // 搜索股票
  async searchStocks(keyword) {
    if (!keyword || !keyword.trim()) return { ok: false, error: "关键词不能为空" };
    return withAKFallback("搜索股票",
      async () => {
        const s = getSDK();
        return (await s.search(keyword.trim())).map(r => ({ code: r.code || "", name: r.name || "", market: r.market || "", type: r.type || "", category: r.category || "other" }));
      },
      async (ak) => { const res = await ak.searchStock(keyword.trim()); if (!res.ok) throw new Error(res.error); return res.data; }
    );
  },

  // 行业板块列表
  async getIndustryList() {
    return withAKFallback("获取行业板块列表",
      async () => {
        const s = getSDK();
        return (await s.getIndustryList()).map(b => ({ rank: b.rank, name: b.name, code: b.code, price: b.price, change: b.change, changePercent: b.changePercent, totalMarketCap: b.totalMarketCap, turnoverRate: b.turnoverRate, riseCount: b.riseCount, fallCount: b.fallCount, leadingStock: b.leadingStock, leadingStockChangePercent: b.leadingStockChangePercent }));
      },
      async (ak) => { const res = await ak.getIndustries(); if (!res.ok) throw new Error(res.error); return res.data; }
    );
  },

  // 多市场行情
  async getMultiMarketQuotes(codes) {
    if (!Array.isArray(codes) || codes.length === 0) return { ok: false, error: "代码列表不能为空" };
    return withAKFallback("多市场行情",
      async () => {
        const s = getSDK();
        const aCodes = [], hkCodes = [], usCodes = [], fundCodes = [];
        for (const c of codes) {
          const code = String(c).trim();
          if (!code) continue;
          const lc = code.toLowerCase();
          if (lc.startsWith("sh") || lc.startsWith("sz") || lc.startsWith("bj")) aCodes.push(lc);
          else if (/^\d{5}$/.test(code)) hkCodes.push(code);
          else if (/^[A-Za-z]+$/.test(code) && code.length <= 5) usCodes.push(code);
          else if (/^\d{6}$/.test(code)) { const f = code.charAt(0); if (f === "6") aCodes.push("sh" + code); else if (f === "0" || f === "3") aCodes.push("sz" + code); else if (f === "9" && code.charAt(1) === "2") aCodes.push("bj" + code); else fundCodes.push(code); }
          else aCodes.push(code);
        }
        const results = [];
        if (aCodes.length > 0) try { for (const q of await s.getFullQuotes(aCodes)) results.push({ ...q, market: "ashare", currency: "CNY" }); } catch (e) { console.error("[stockSdk] A股行情获取失败:", e.message); }
        if (hkCodes.length > 0) try { for (const q of await s.getHKQuotes(hkCodes)) results.push({ ...q, market: "hk", currency: q.currency || "HKD" }); } catch (e) { console.error("[stockSdk] 港股行情获取失败:", e.message); }
        if (usCodes.length > 0) try { for (const q of await s.getUSQuotes(usCodes)) results.push({ ...q, market: "us", currency: "USD" }); } catch (e) { console.error("[stockSdk] 美股行情获取失败:", e.message); }
        if (fundCodes.length > 0) try { for (const q of await s.getFundQuotes(fundCodes)) results.push({ code: q.code, name: q.name, price: q.nav, prevClose: null, open: null, high: null, low: null, volume: null, amount: null, change: q.change, changePercent: null, time: q.navDate, market: "fund", currency: "CNY" }); } catch (e) { console.error("[stockSdk] 基金行情获取失败:", e.message); }
        return results;
      },
      async (ak) => { const res = await ak.getMultiMarketQuotes(codes); if (!res.ok) throw new Error(res.error); return res.data; }
    );
  },

  // K线数据
  async getStockKline(symbol, options = {}) {
    if (!symbol) return { ok: false, error: "股票代码不能为空" };
    return withAKFallback("获取K线数据",
      async () => {
        const s = getSDK();
        const code = symbol.trim();
        const opts = { period: options.period || "daily", adjust: options.adjust || "qfq", startDate: options.startDate, endDate: options.endDate };
        let klines;
        if (code.startsWith("sh") || code.startsWith("sz") || code.startsWith("bj")) klines = await s.getHistoryKline(code, opts);
        else if (/^\d{5}$/.test(code)) klines = await s.getHKHistoryKline(code, opts);
        else if (code.startsWith("10") && code.includes(".")) klines = await s.getUSHistoryKline(code, opts);
        else if (/^\d{6}$/.test(code)) klines = await s.getHistoryKline((code.startsWith("6") ? "sh" : code.startsWith("0") || code.startsWith("3") ? "sz" : "bj") + code, opts);
        else klines = await s.getHistoryKline(code, opts);
        return (klines || []).map(k => ({ date: k.date || "", open: k.open, close: k.close, high: k.high, low: k.low, volume: k.volume, amount: k.amount, changePercent: k.changePercent }));
      },
      async (ak) => { const res = await ak.getStockKline(symbol, options); if (!res.ok) throw new Error(res.error); return res.data; }
    );
  },

  // 搜索板块
  async searchSectors(keyword) {
    return withAKFallback("搜索板块",
      async () => { const s = getSDK(); return await s.searchSectors(keyword.trim()); },
      async (ak) => { const res = await ak.searchSectors(keyword); if (!res.ok) throw new Error(res.error); return res.data; }
    );
  },

  // 随机K线（训练用）
  async getRandomKline(count = 500) {
    const ak = getAKShare();
    if (!ak) return { ok: false, error: "AKShare 数据源不可用" };
    try { return await ak.getRandomKline(count); }
    catch (err) { return { ok: false, error: err.message }; }
  },

  // 训练会话
  async saveKlineSession(data) {
    // handled directly in route
  },
};

module.exports = { stockService };
