/** 仅保留前端仍使用的 stock SDK 路由 */
"use strict";
async function handleStockRoutes(request, response, url, ctx) {
  const { sendJson, sendError, readJsonBody, stockService } = ctx;

  // 搜索股票
  if (request.method === "GET" && url.pathname === "/api/stock/search") {
    const keyword = url.searchParams.get("keyword") || "";
    if (!keyword.trim()) { sendError(response, 400, "请提供 keyword 参数"); return true; }
    const result = await stockService.searchStocks(keyword);
    sendJson(response, result.ok ? 200 : 500, result);
    return true;
  }

  // 行业板块列表
  if (request.method === "GET" && url.pathname === "/api/stock/industries") {
    const topN = Math.min(Math.max(Number(url.searchParams.get("topN")) || 0, 0), 100);
    const result = await stockService.getIndustryList();
    if (!result.ok) { sendJson(response, 500, result); return true; }
    const data = topN > 0 ? result.data.slice(0, topN) : result.data;
    sendJson(response, 200, { ok: true, data, total: data.length });
    return true;
  }

  // 历史K线
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

  // 多市场行情
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

  // 搜索板块
  if (request.method === "GET" && url.pathname === "/api/stock/sectors/search") {
    const keyword = url.searchParams.get("keyword") || "";
    if (!keyword.trim()) { sendError(response, 400, "请提供 keyword 参数"); return true; }
    const result = await stockService.searchSectors(keyword);
    sendJson(response, result.ok ? 200 : 500, result);
    return true;
  }

  // ── K线训练路由 ──
  if (request.method === "GET" && url.pathname === "/api/kline-train/random") {
    const count = Math.min(Math.max(Number(url.searchParams.get("count")) || 500, 100), 3000);
    const result = await stockService.getRandomKline(count);
    sendJson(response, result.ok ? 200 : 500, result);
    return true;
  }
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
  if (request.method === "GET" && url.pathname === "/api/kline-train/sessions") {
    try {
      const [rows] = await ctx.db.query("SELECT * FROM kline_train_sessions ORDER BY created_at DESC LIMIT 50");
      sendJson(response, 200, { ok: true, data: rows });
    } catch (error) { sendError(response, 500, error.message); }
    return true;
  }
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
