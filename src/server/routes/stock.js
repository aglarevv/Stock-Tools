/**
 * StockSDK 路由 — 行情 / 板块 / 资金流向 / 北向资金 / 期货 / 选股器
 *
 * 用法：
 *   const { handleStockRoutes } = require("./routes/stock");
 *   if (await handleStockRoutes(request, response, url, ctx)) return;
 */

"use strict";

async function handleStockRoutes(request, response, url, ctx) {
  const { sendJson, sendError, readJsonBody, stockService } = ctx;

  // ── SDK 状态 ──
  if (request.method === "GET" && url.pathname === "/api/stock/status") {
    sendJson(response, 200, stockService.getStatus());
    return true;
  }

  // ── 搜索 ──
  if (request.method === "GET" && url.pathname === "/api/stock/search") {
    const keyword = url.searchParams.get("keyword") || "";
    if (!keyword.trim()) { sendError(response, 400, "请提供 keyword 参数"); return true; }
    const result = await stockService.searchStocks(keyword);
    sendJson(response, result.ok ? 200 : 500, result);
    return true;
  }

  // ── 行业板块列表 ──
  if (request.method === "GET" && url.pathname === "/api/stock/industries") {
    const topN = Math.min(Math.max(Number(url.searchParams.get("topN")) || 0, 0), 100);
    const result = await stockService.getIndustryList();
    if (!result.ok) { sendJson(response, 500, result); return true; }
    const data = topN > 0 ? result.data.slice(0, topN) : result.data;
    sendJson(response, 200, { ok: true, data, total: data.length });
    return true;
  }

  // ── 行业板块行情快照 ──
  if (request.method === "GET" && url.pathname.startsWith("/api/stock/industry/") && url.pathname.endsWith("/spot")) {
    const symbol = decodeURIComponent(url.pathname.replace("/api/stock/industry/", "").replace("/spot", ""));
    const result = await stockService.getIndustrySpot(symbol);
    sendJson(response, result.ok ? 200 : 500, result);
    return true;
  }

  // ── 行业板块成分股 ──
  if (request.method === "GET" && url.pathname.startsWith("/api/stock/industry/") && url.pathname.endsWith("/stocks")) {
    const symbol = decodeURIComponent(url.pathname.replace("/api/stock/industry/", "").replace("/stocks", ""));
    const result = await stockService.getIndustryConstituents(symbol);
    sendJson(response, result.ok ? 200 : 500, result);
    return true;
  }

  // ── 概念板块列表 ──
  if (request.method === "GET" && url.pathname === "/api/stock/concepts") {
    const topN = Math.min(Math.max(Number(url.searchParams.get("topN")) || 0, 0), 100);
    const result = await stockService.getConceptList();
    if (!result.ok) { sendJson(response, 500, result); return true; }
    const data = topN > 0 ? result.data.slice(0, topN) : result.data;
    sendJson(response, 200, { ok: true, data, total: data.length });
    return true;
  }

  // ── 概念板块行情快照 ──
  if (request.method === "GET" && url.pathname.startsWith("/api/stock/concept/") && url.pathname.endsWith("/spot")) {
    const symbol = decodeURIComponent(url.pathname.replace("/api/stock/concept/", "").replace("/spot", ""));
    const result = await stockService.getConceptSpot(symbol);
    sendJson(response, result.ok ? 200 : 500, result);
    return true;
  }

  // ── 概念板块成分股 ──
  if (request.method === "GET" && url.pathname.startsWith("/api/stock/concept/") && url.pathname.endsWith("/stocks")) {
    const symbol = decodeURIComponent(url.pathname.replace("/api/stock/concept/", "").replace("/stocks", ""));
    const result = await stockService.getConceptConstituents(symbol);
    sendJson(response, result.ok ? 200 : 500, result);
    return true;
  }

  // ── 热门板块 ──
  if (request.method === "GET" && url.pathname === "/api/stock/hot-sectors") {
    const topN = Math.min(Math.max(Number(url.searchParams.get("topN")) || 10, 1), 50);
    const result = await stockService.getHotSectors(topN);
    sendJson(response, result.ok ? 200 : 500, result);
    return true;
  }

  // ── 搜索板块 ──
  if (request.method === "GET" && url.pathname === "/api/stock/sectors/search") {
    const keyword = url.searchParams.get("keyword") || "";
    if (!keyword.trim()) { sendError(response, 400, "请提供 keyword 参数"); return true; }
    const result = await stockService.searchSectors(keyword);
    sendJson(response, result.ok ? 200 : 500, result);
    return true;
  }

  // ── 批量行情 ──
  if (request.method === "POST" && url.pathname === "/api/stock/quotes") {
    try {
      const body = await readJsonBody(request);
      const { codes } = body;
      if (!Array.isArray(codes) || codes.length === 0) { sendError(response, 400, "请提供 codes 数组"); return true; }
      const result = await stockService.getQuotes(codes);
      sendJson(response, result.ok ? 200 : 500, result);
    } catch (error) { sendError(response, 400, error.message); }
    return true;
  }

  // ── 历史K线 ──
  if (request.method === "GET" && url.pathname === "/api/stock/kline") {
    const symbol = url.searchParams.get("symbol") || "";
    const period = url.searchParams.get("period") || "daily";
    const startDate = url.searchParams.get("startDate") || undefined;
    const endDate = url.searchParams.get("endDate") || undefined;
    if (!symbol.trim()) { sendError(response, 400, "请提供 symbol 参数"); return true; }
    const result = await stockService.getStockKline(symbol, { period, startDate, endDate });
    sendJson(response, result.ok ? 200 : 500, result);
    return true;
  }

  // ── 分时走势 ──
  if (request.method === "GET" && url.pathname === "/api/stock/timeline") {
    const symbol = url.searchParams.get("symbol") || "";
    if (!symbol.trim()) { sendError(response, 400, "请提供 symbol 参数"); return true; }
    const result = await stockService.getStockTimeline(symbol);
    sendJson(response, result.ok ? 200 : 500, result);
    return true;
  }

  // ── 多市场行情 ──
  if (request.method === "POST" && url.pathname === "/api/stock/multi-quotes") {
    try {
      const body = await readJsonBody(request);
      const { codes } = body;
      if (!Array.isArray(codes) || codes.length === 0) { sendError(response, 400, "请提供 codes 数组"); return true; }
      const result = await stockService.getMultiMarketQuotes(codes);
      sendJson(response, result.ok ? 200 : 500, result);
    } catch (error) { sendError(response, 400, error.message); }
    return true;
  }

  // ── 涨停板 ──
  if (request.method === "GET" && url.pathname === "/api/stock/zt-pool") {
    const type = url.searchParams.get("type") || "zt";
    const date = url.searchParams.get("date") || undefined;
    const result = await stockService.getZTPool(type, date);
    sendJson(response, result.ok ? 200 : 500, result);
    return true;
  }

  // ── 盘口异动 ──
  if (request.method === "GET" && url.pathname === "/api/stock/changes") {
    const type = url.searchParams.get("type") || "large_buy";
    const result = await stockService.getStockChanges(type);
    sendJson(response, result.ok ? 200 : 500, result);
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/stock/board-changes") {
    const result = await stockService.getBoardChanges();
    sendJson(response, result.ok ? 200 : 500, result);
    return true;
  }

  // ── 资金流向 ──
  if (request.method === "POST" && url.pathname === "/api/stock/fund-flow") {
    const { codes } = await readJsonBody(request);
    const result = await stockService.getFundFlow(codes || []);
    sendJson(response, result.ok ? 200 : 500, result);
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/stock/trading-calendar") {
    const result = await stockService.getTradingCalendar();
    sendJson(response, result.ok ? 200 : 500, result);
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/stock/fund-flow-rank") {
    const indicator = url.searchParams.get("indicator") || "today";
    const result = await stockService.getFundFlowRank(indicator);
    sendJson(response, result.ok ? 200 : 500, result);
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/stock/sector-fund-flow-rank") {
    const indicator = url.searchParams.get("indicator") || "today";
    const sectorType = url.searchParams.get("sectorType") || "industry";
    const result = await stockService.getSectorFundFlowRank(indicator, sectorType);
    sendJson(response, result.ok ? 200 : 500, result);
    return true;
  }

  // ── 北向资金 ──
  if (request.method === "GET" && url.pathname === "/api/stock/northbound-minute") {
    const direction = url.searchParams.get("direction") || "north";
    const result = await stockService.getNorthboundMinute(direction);
    sendJson(response, result.ok ? 200 : 500, result);
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/stock/northbound-summary") {
    const result = await stockService.getNorthboundFlowSummary();
    sendJson(response, result.ok ? 200 : 500, result);
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/stock/northbound-rank") {
    const market = url.searchParams.get("market") || "all";
    const period = url.searchParams.get("period") || "5day";
    const result = await stockService.getNorthboundHoldingRank({ market, period });
    sendJson(response, result.ok ? 200 : 500, result);
    return true;
  }

  // ── 分红派送 ──
  if (request.method === "GET" && url.pathname === "/api/stock/dividend") {
    const symbol = url.searchParams.get("symbol") || "";
    const result = await stockService.getDividendDetail(symbol);
    sendJson(response, result.ok ? 200 : 500, result);
    return true;
  }

  // ── 期货行情 ──
  if (request.method === "GET" && url.pathname === "/api/stock/global-futures") {
    const pageSize = Number(url.searchParams.get("pageSize")) || undefined;
    const result = await stockService.getGlobalFuturesSpot(pageSize);
    sendJson(response, result.ok ? 200 : 500, result);
    return true;
  }

  // ── 随机K线（训练用） ──
  if (request.method === "GET" && url.pathname === "/api/kline-train/random") {
    const count = Math.min(Math.max(Number(url.searchParams.get("count")) || 500, 100), 3000);
    const result = await stockService.getRandomKline(count);
    sendJson(response, result.ok ? 200 : 500, result);
    return true;
  }

  // ── 保存训练记录 ──
  if (request.method === "POST" && url.pathname === "/api/kline-train/session") {
    try {
      const body = await readJsonBody(request);
      const { session_id, mode, stock_code, stock_name, total_klines, trades_count, win_count, win_rate, total_pnl, start_capital, end_capital, leverage, detail_json } = body;
      if (!session_id || !mode || !stock_code) { sendError(response, 400, "缺少必要字段"); return true; }
      await ctx.db.execute(
        `INSERT INTO kline_train_sessions (session_id, mode, stock_code, stock_name, total_klines, trades_count, win_count, win_rate, total_pnl, start_capital, end_capital, leverage, detail_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [session_id, mode, stock_code, stock_name, total_klines || 0, trades_count || 0, win_count || 0, win_rate || 0, total_pnl || 0, start_capital || 0, end_capital || 0, leverage || 1, detail_json || null]
      );
      sendJson(response, 200, { ok: true });
    } catch (error) { sendError(response, 500, error.message); }
    return true;
  }

  // ── 获取训练记录列表 ──
  if (request.method === "GET" && url.pathname === "/api/kline-train/sessions") {
    try {
      const [rows] = await ctx.db.query("SELECT * FROM kline_train_sessions ORDER BY created_at DESC LIMIT 50");
      sendJson(response, 200, { ok: true, data: rows });
    } catch (error) { sendError(response, 500, error.message); }
    return true;
  }

  // ── 删除训练记录 ──
  if (request.method === "DELETE" && url.pathname === "/api/kline-train/session") {
    try {
      const id = url.searchParams.get("id");
      if (id) await ctx.db.execute("DELETE FROM kline_train_sessions WHERE id = ?", [id]);
      else await ctx.db.execute("DELETE FROM kline_train_sessions");
      sendJson(response, 200, { ok: true });
    } catch (error) { sendError(response, 500, error.message); }
    return true;
  }

  return false;
}

module.exports = { handleStockRoutes };
