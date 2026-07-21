"use strict";

async function handlePositionRoutes(request, response, url, ctx) {
  const { db, sendJson, sendError, readJsonBody, stockService } = ctx;

  // ── 获取全部持仓 + 胜率汇总 ──
  if (request.method === "GET" && url.pathname === "/api/positions") {
    try {
      // 修复旧数据：根据 current_price + avg_buy_price + shares 重新计算
      await db.execute(
        `UPDATE positions SET
          total_cost = COALESCE(avg_buy_price, buy_price) * shares,
          market_value = CASE WHEN current_price IS NOT NULL THEN current_price * shares ELSE NULL END,
          unrealized_pnl = CASE WHEN current_price IS NOT NULL THEN (current_price - COALESCE(avg_buy_price, buy_price)) * shares ELSE NULL END,
          pnl_rate = CASE WHEN current_price IS NOT NULL AND COALESCE(avg_buy_price, buy_price) > 0
            THEN ((current_price - COALESCE(avg_buy_price, buy_price)) / COALESCE(avg_buy_price, buy_price)) * 100 ELSE NULL END
        WHERE shares > 0`
      );
      const [rows] = await db.query(
        `SELECT id, symbol, stock_name AS stockName, DATE_FORMAT(buy_date, '%Y-%m-%d') AS buyDate,
          avg_buy_price AS avgBuyPrice, buy_price AS buyPrice, shares,
          total_shares_bought AS totalSharesBought, total_cost AS totalCost,
          current_price AS currentPrice, market_value AS marketValue,
          unrealized_pnl AS unrealizedPnl, pnl_rate AS pnlRate,
          realized_pnl AS realizedPnl,
          holding_style AS holdingStyle, notes,
          created_at AS createdAt, updated_at AS updatedAt
        FROM positions WHERE shares > 0 ORDER BY buy_date DESC`
      );
      const t = rows.reduce((a, r) => ({
        totalCost: a.totalCost + Number(r.totalCost || 0),
        totalMarketValue: a.totalMarketValue + Number(r.marketValue || 0),
        totalUnrealizedPnl: a.totalUnrealizedPnl + Number(r.unrealizedPnl || 0),
        totalRealizedPnl: a.totalRealizedPnl + Number(r.realizedPnl || 0),
      }), { totalCost: 0, totalMarketValue: 0, totalUnrealizedPnl: 0, totalRealizedPnl: 0 });

      // 汇总已清仓记录的已实现盈亏
      const [sold] = await db.query("SELECT realized_pnl FROM positions WHERE shares = 0");
      const wins = sold.filter(r => Number(r.realized_pnl) > 0).length;
      const losses = sold.filter(r => Number(r.realized_pnl) < 0).length;
      const totalSoldRealized = sold.reduce((s, r) => s + Number(r.realized_pnl || 0), 0);
      t.totalRealizedPnl += totalSoldRealized;

      sendJson(response, 200, {
        records: rows,
        summary: { ...t, totalPnl: t.totalUnrealizedPnl + t.totalRealizedPnl, winCount: wins, lossCount: losses, winRate: (wins + losses) > 0 ? Math.round((wins / (wins + losses)) * 100) : 0 },
      });
    } catch (e) { sendError(response, 500, e.message); }
    return true;
  }

  // ── 添加/加仓（同股自动加权平均买入价） ──
  if (request.method === "POST" && url.pathname === "/api/positions") {
    try {
      const body = await readJsonBody(request);
      const symbol = String(body.symbol || "").trim().slice(0, 32);
      if (!symbol) { sendError(response, 400, "请提供股票代码"); return true; }
      const buyPrice = Number(body.buyPrice);
      const newShares = parseInt(body.shares);
      if (!buyPrice || buyPrice <= 0 || !newShares || newShares <= 0) { sendError(response, 400, "买入价和股数必须大于0"); return true; }

      const [existing] = await db.query("SELECT id, shares, total_shares_bought, total_cost, avg_buy_price FROM positions WHERE symbol = ? AND shares > 0 LIMIT 1", [symbol]);

      if (existing.length > 0) {
        const ex = existing[0];
        const oldShares = Number(ex.shares);
        const oldTotalBought = Number(ex.total_shares_bought || oldShares);
        const oldTotalCost = Number(ex.total_cost);
        const newTotalBought = oldTotalBought + newShares;
        const newTotalCost = oldTotalCost + (buyPrice * newShares);
        const avgBuyPrice = +(newTotalCost / newTotalBought).toFixed(4);
        await db.execute(
          "UPDATE positions SET buy_price = ?, avg_buy_price = ?, shares = shares + ?, total_shares_bought = total_shares_bought + ?, total_cost = ?, buy_date = ? WHERE id = ?",
          [buyPrice, avgBuyPrice, newShares, newShares, newTotalCost, body.buyDate, ex.id]
        );
        sendJson(response, 200, { ok: true, id: ex.id, action: "added", avgBuyPrice, shares: oldShares + newShares });
      } else {
        const avgBuyPrice = +buyPrice.toFixed(4);
        const totalCost = +(buyPrice * newShares).toFixed(4);
        const currentPrice = body.currentPrice ? Number(body.currentPrice) : null;
        const marketValue = currentPrice ? +(currentPrice * newShares).toFixed(4) : null;
        const unrealizedPnl = currentPrice ? +((currentPrice - avgBuyPrice) * newShares).toFixed(4) : null;
        const pnlRate = currentPrice && avgBuyPrice > 0 ? +(((currentPrice - avgBuyPrice) / avgBuyPrice) * 100).toFixed(2) : null;

        const [result] = await db.execute(
          "INSERT INTO positions (symbol, stock_name, buy_date, buy_price, avg_buy_price, shares, total_shares_bought, current_price, total_cost, market_value, unrealized_pnl, pnl_rate, realized_pnl, holding_style, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)",
          [symbol, String(body.stockName || "").slice(0, 64), body.buyDate || new Date().toISOString().slice(0, 10),
           buyPrice, avgBuyPrice, newShares, newShares, currentPrice, totalCost, marketValue, unrealizedPnl, pnlRate,
           String(body.holdingStyle || "中线").slice(0, 16), body.notes ? String(body.notes).slice(0, 2000) : null]
        );
        sendJson(response, 201, { ok: true, id: result.insertId, action: "created", shares: newShares });
      }
    } catch (e) { sendError(response, 400, e.message); }
    return true;
  }

  // ── 卖出（计算已实现盈亏） ──
  if (request.method === "POST" && url.pathname === "/api/positions/sell") {
    try {
      const body = await readJsonBody(request);
      const id = parseInt(body.id), sellPrice = Number(body.sellPrice), sellShares = parseInt(body.sellShares);
      if (!id || !sellPrice || sellPrice <= 0 || !sellShares || sellShares <= 0) { sendError(response, 400, "参数无效"); return true; }

      const [rows] = await db.query("SELECT shares, avg_buy_price, buy_price, realized_pnl, total_cost, current_price FROM positions WHERE id = ?", [id]);
      if (rows.length === 0) { sendError(response, 404, "持仓不存在"); return true; }

      const r = rows[0], currentShares = Number(r.shares);
      if (sellShares > currentShares) { sendError(response, 400, "卖出股数超过持仓"); return true; }

      const avgBuyPrice = Number(r.avg_buy_price || r.buy_price), realized = +((sellPrice - avgBuyPrice) * sellShares).toFixed(4);
      const totalRealized = Number(r.realized_pnl || 0) + realized, remaining = currentShares - sellShares;

      // 按比例扣减成本 + 更新剩余盈亏
      const oldTotalCost = Number(r.total_cost || (avgBuyPrice * currentShares));
      const newTotalCost = remaining > 0 ? +((oldTotalCost / currentShares) * remaining).toFixed(4) : 0;
      const cp = r.current_price ? Number(r.current_price) : null;
      const newMarketValue = cp && remaining > 0 ? +(cp * remaining).toFixed(4) : null;
      const newUnrealizedPnl = cp && remaining > 0 ? +((cp - avgBuyPrice) * remaining).toFixed(4) : null;
      const newPnlRate = cp && remaining > 0 && avgBuyPrice > 0 ? +(((cp - avgBuyPrice) / avgBuyPrice) * 100).toFixed(2) : null;
      await db.execute(
        "UPDATE positions SET shares = ?, realized_pnl = ?, total_cost = ?, market_value = ?, unrealized_pnl = ?, pnl_rate = ? WHERE id = ?",
        [remaining, totalRealized, newTotalCost, newMarketValue, newUnrealizedPnl, newPnlRate, id]
      );
      sendJson(response, 200, { ok: true, soldShares: sellShares, remainingShares: remaining, sellPrice, avgBuyPrice, realizedPnL: realized, totalRealizedPnL: totalRealized });
    } catch (e) { sendError(response, 400, e.message); }
    return true;
  }

  // ── 更新持仓（现价/备注） ──
  if (request.method === "PUT" && url.pathname === "/api/positions") {
    try {
      const body = await readJsonBody(request);
      const id = parseInt(body.id);
      if (!id) { sendError(response, 400, "需要有效的 id"); return true; }
      const fields = [], params = [];

      if (body.currentPrice !== undefined) {
        const cp = Number(body.currentPrice);
        const [rows] = await db.query("SELECT avg_buy_price, buy_price, shares FROM positions WHERE id = ?", [id]);
        if (rows.length > 0) {
          const bp = Number(rows[0].avg_buy_price || rows[0].buy_price), sh = Number(rows[0].shares);
          fields.push("current_price = ?, market_value = ?, unrealized_pnl = ?, pnl_rate = ?");
          params.push(cp, +(cp * sh).toFixed(4), +((cp - bp) * sh).toFixed(4), bp > 0 ? +(((cp - bp) / bp) * 100).toFixed(2) : 0);
        }
      }
      if (body.notes !== undefined) { fields.push("notes = ?"); params.push(body.notes ? String(body.notes).slice(0, 2000) : null); }
      if (body.holdingStyle !== undefined) { fields.push("holding_style = ?"); params.push(String(body.holdingStyle).slice(0, 16)); }
      if (body.stockName !== undefined) { fields.push("stock_name = ?"); params.push(String(body.stockName).slice(0, 64)); }
      if (body.buyDate !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(body.buyDate)) { fields.push("buy_date = ?"); params.push(body.buyDate); }
      if (fields.length === 0) { sendError(response, 400, "无更新字段"); return true; }

      params.push(id);
      await db.execute(`UPDATE positions SET ${fields.join(", ")} WHERE id = ?`, params);
      sendJson(response, 200, { ok: true });
    } catch (e) { sendError(response, 400, e.message); }
    return true;
  }

  // ── 刷新行情 ──
  if (request.method === "POST" && url.pathname === "/api/positions/refresh") {
    try {
      const [rows] = await db.query("SELECT id, symbol, avg_buy_price, buy_price, shares FROM positions WHERE shares > 0");
      if (rows.length === 0) { sendJson(response, 200, { ok: true, updated: 0 }); return true; }
      const quotesRes = await stockService.getMultiMarketQuotes(rows.map(r => r.symbol));
      let updated = 0;
      if (quotesRes.ok && quotesRes.data) {
        for (const row of rows) {
          const q = quotesRes.data.find(q => q.code === row.symbol);
          if (q && q.price) {
            const cp = Number(q.price), bp = Number(row.avg_buy_price || row.buy_price), sh = Number(row.shares);
            await db.execute("UPDATE positions SET current_price=?, market_value=?, unrealized_pnl=?, pnl_rate=? WHERE id=?", [cp, +(cp * sh).toFixed(4), +((cp - bp) * sh).toFixed(4), bp > 0 ? +(((cp - bp) / bp) * 100).toFixed(2) : 0, row.id]);
            updated++;
          }
        }
      }
      sendJson(response, 200, { ok: true, updated });
    } catch (e) { sendError(response, 500, e.message); }
    return true;
  }

  // ── 做T记录 ──
  // GET  /api/positions/t-trades?positionId=xxx  → 获取某持仓的做T记录 + 汇总
  if (request.method === "GET" && url.pathname === "/api/positions/t-trades") {
    try {
      const positionId = parseInt(url.searchParams.get("positionId"));
      if (!positionId) { sendError(response, 400, "需要 positionId"); return true; }
      const [rows] = await db.query(
        `SELECT id, position_id AS positionId, symbol,
          DATE_FORMAT(trade_date, '%Y-%m-%d') AS tradeDate,
          buy_price AS buyPrice, sell_price AS sellPrice,
          shares, profit, profit_rate AS profitRate, notes, created_at AS createdAt
        FROM t_trades WHERE position_id = ? ORDER BY trade_date DESC, id DESC`, [positionId]
      );
      const summary = rows.reduce((a, r) => ({
        totalProfit: a.totalProfit + Number(r.profit || 0),
        totalTrades: a.totalTrades + 1,
      }), { totalProfit: 0, totalTrades: 0 });
      sendJson(response, 200, { records: rows, summary });
    } catch (e) { sendError(response, 500, e.message); }
    return true;
  }

  // POST /api/positions/t-trades  → 添加做T记录
  if (request.method === "POST" && url.pathname === "/api/positions/t-trades") {
    try {
      const body = await readJsonBody(request);
      const positionId = parseInt(body.positionId);
      if (!positionId) { sendError(response, 400, "需要 positionId"); return true; }

      const buyPrice = Number(body.buyPrice), sellPrice = Number(body.sellPrice), shares = parseInt(body.shares);
      if (!buyPrice || !sellPrice || !shares || buyPrice <= 0 || sellPrice <= 0 || shares <= 0) {
        sendError(response, 400, "参数无效"); return true;
      }

      const profit = +((sellPrice - buyPrice) * shares).toFixed(4);
      const profitRate = +(((sellPrice - buyPrice) / buyPrice) * 100).toFixed(2);

      // 获取 symbol
      const [pos] = await db.query("SELECT symbol FROM positions WHERE id = ?", [positionId]);
      const symbol = pos.length > 0 ? pos[0].symbol : "";

      const [result] = await db.execute(
        "INSERT INTO t_trades (position_id, symbol, trade_date, buy_price, sell_price, shares, profit, profit_rate, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [positionId, symbol, body.tradeDate || new Date().toISOString().slice(0, 10),
         buyPrice, sellPrice, shares, profit, profitRate,
         body.notes ? String(body.notes).slice(0, 500) : null]
      );
      sendJson(response, 201, { ok: true, id: result.insertId, profit, profitRate });
    } catch (e) { sendError(response, 400, e.message); }
    return true;
  }

  // DELETE /api/positions/t-trades?id=xxx
  if (request.method === "DELETE" && url.pathname === "/api/positions/t-trades") {
    try {
      const id = parseInt(url.searchParams.get("id"));
      if (!id) { sendError(response, 400, "需要 id"); return true; }
      await db.execute("DELETE FROM t_trades WHERE id = ?", [id]);
      sendJson(response, 200, { ok: true });
    } catch (e) { sendError(response, 500, e.message); }
    return true;
  }

  // ── 删除 ──
  if (request.method === "DELETE" && url.pathname === "/api/positions") {
    try {
      const id = parseInt(url.searchParams.get("id"));
      if (!id) { sendError(response, 400, "需要有效的 id"); return true; }
      await db.execute("DELETE FROM positions WHERE id = ?", [id]);
      sendJson(response, 200, { ok: true });
    } catch (e) { sendError(response, 500, e.message); }
    return true;
  }

  return false;
}

module.exports = { handlePositionRoutes };
