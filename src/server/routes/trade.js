/**
 * 交易 & 复盘路由 — 交易计划 CRUD / 复盘记录 CRUD / 看板统计
 *
 * 用法：
 *   const { handleTradeRoutes } = require("./routes/trade");
 *   if (await handleTradeRoutes(request, response, url, ctx)) return; // 已处理
 */

"use strict";

async function handleTradeRoutes(request, response, url, ctx) {
  const { db, sendJson, sendError, readJsonBody, buildTradePlan, buildDailyReview } = ctx;

  // ── 交易计划 POST ──
  if (request.method === "POST" && url.pathname === "/api/trade-plans") {
    try {
      const plan = buildTradePlan(await readJsonBody(request));
      const [existingRows] = await db.query("SELECT id FROM trade_plans WHERE symbol = ? LIMIT 1", [plan.symbol]);
      const action = existingRows.length ? "updated" : "created";
      const [result] = await db.upsert(
        `INSERT INTO trade_plans (
          symbol, buy_price, shares, profit_rate, loss_rate, fee_rate,
          stop_loss_price, take_profit_price, position_cost,
          expected_profit, expected_loss, risk_reward,
          trade_direction, position_pct, trade_notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          id = LAST_INSERT_ID(id),
          buy_price = VALUES(buy_price),
          shares = VALUES(shares),
          profit_rate = VALUES(profit_rate),
          loss_rate = VALUES(loss_rate),
          fee_rate = VALUES(fee_rate),
          stop_loss_price = VALUES(stop_loss_price),
          take_profit_price = VALUES(take_profit_price),
          position_cost = VALUES(position_cost),
          expected_profit = VALUES(expected_profit),
          expected_loss = VALUES(expected_loss),
          risk_reward = VALUES(risk_reward),
          created_at = CURRENT_TIMESTAMP`,
        [
          plan.symbol, plan.buyPrice, plan.shares,
          plan.profitRate, plan.lossRate, plan.feeRate,
          plan.stopLossPrice, plan.takeProfitPrice, plan.positionCost,
          plan.expectedProfit, plan.expectedLoss, plan.riskReward,
          plan.tradeDirection, plan.positionPct, plan.tradeNotes,
        ],
        "symbol",
      );
      sendJson(response, action === "created" ? 201 : 200, { action, id: result.insertId, ...plan });
    } catch (error) {
      sendError(response, 400, error.message);
    }
    return true;
  }

  // ── 交易计划 GET ──
  if (request.method === "GET" && url.pathname === "/api/trade-plans") {
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 8), 1), 50);
    const [rows] = await db.query(
      `SELECT
        id, symbol,
        buy_price AS buyPrice, shares,
        profit_rate AS profitRate, loss_rate AS lossRate, fee_rate AS feeRate,
        stop_loss_price AS stopLossPrice, take_profit_price AS takeProfitPrice,
        position_cost AS positionCost,
        expected_profit AS expectedProfit, expected_loss AS expectedLoss,
        risk_reward AS riskReward,
        trade_direction AS tradeDirection,
        position_pct AS positionPct,
        trade_notes AS tradeNotes,
        created_at AS createdAt
      FROM trade_plans
      ORDER BY id DESC
      LIMIT ?`,
      [limit],
    );
    sendJson(response, 200, { records: rows });
    return true;
  }

  // ── 交易计划 DELETE ──
  if (request.method === "DELETE" && url.pathname === "/api/trade-plans") {
    try {
      const id = Number(url.searchParams.get("id"));
      if (!Number.isFinite(id) || id <= 0) {
        sendError(response, 400, "需要有效的 id 参数");
        return true;
      }
      const [result] = await db.execute("DELETE FROM trade_plans WHERE id = ?", [id]);
      if (result.affectedRows === 0) {
        sendError(response, 404, "记录不存在");
        return true;
      }
      sendJson(response, 200, { ok: true, deleted: result.affectedRows });
    } catch (error) {
      sendError(response, 500, `删除失败：${error.message}`);
    }
    return true;
  }

  // ── 复盘记录 POST ──
  if (request.method === "POST" && url.pathname === "/api/daily-reviews") {
    try {
      const review = buildDailyReview(await readJsonBody(request));
      const [result] = await db.execute(
        `INSERT INTO daily_reviews (
          review_date, symbol, buy_signal, holding_style, sell_signal,
          buy_price, sell_price, shares, pnl_amount, pnl_rate,
          index_judgment, volume_judgment, sentiment_judgment, capital_direction,
          leading_sectors, lagging_sectors, sustainability,
          stock_strength, vol_amp_ranking, limit_analysis,
          operation_reason, profit_attribution, loss_attribution,
          execution_notes, improvement_plan,
          market_plan, position_plan, new_candidates, trades
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          review.reviewDate, review.symbol, review.buySignal, review.holdingStyle, review.sellSignal,
          review.buyPrice, review.sellPrice, review.shares, review.pnlAmount, review.pnlRate,
          review.indexJudgment, review.volumeJudgment, review.sentimentJudgment, review.capitalDirection,
          review.leadingSectors, review.laggingSectors, review.sustainability,
          review.stockStrength, review.volAmpRanking, review.limitAnalysis,
          review.operationReason, review.profitAttribution, review.lossAttribution,
          review.executionNotes, review.improvementPlan,
          review.marketPlan, review.positionPlan, review.newCandidates,
          review.trades && review.trades.length > 0 ? JSON.stringify(review.trades) : null,
        ],
      );
      sendJson(response, 201, { action: "created", id: result.insertId, ...review });
    } catch (error) {
      sendError(response, 400, error.message);
    }
    return true;
  }

  // ── 复盘记录 GET ──
  if (request.method === "GET" && url.pathname === "/api/daily-reviews") {
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 20), 1), 500);
    const dateFrom = url.searchParams.get("dateFrom") || "";
    const dateTo = url.searchParams.get("dateTo") || "";
    const symbol = url.searchParams.get("symbol") || "";
    const id = url.searchParams.get("id") || "";

    let where = "";
    const params = [];

    if (id && /^\d+$/.test(id)) {
      where += " AND id = ?";
      params.push(Number(id));
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
      where += " AND review_date >= ?";
      params.push(dateFrom);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      where += " AND review_date <= ?";
      params.push(dateTo);
    }
    if (symbol.trim()) {
      where += " AND symbol LIKE ?";
      params.push(`%${symbol.trim()}%`);
    }

    params.push(limit);

    const [rows] = await db.query(
      `SELECT
        id, DATE_FORMAT(review_date, '%Y-%m-%d') AS reviewDate, symbol,
        buy_signal AS buySignal, holding_style AS holdingStyle,
        sell_signal AS sellSignal, buy_price AS buyPrice,
        sell_price AS sellPrice, shares,
        pnl_amount AS pnlAmount, pnl_rate AS pnlRate,
        index_judgment AS indexJudgment,
        volume_judgment AS volumeJudgment,
        sentiment_judgment AS sentimentJudgment,
        capital_direction AS capitalDirection,
        leading_sectors AS leadingSectors,
        lagging_sectors AS laggingSectors,
        sustainability AS sustainability,
        stock_strength AS stockStrength,
        vol_amp_ranking AS volAmpRanking,
        limit_analysis AS limitAnalysis,
        operation_reason AS operationReason,
        profit_attribution AS profitAttribution,
        loss_attribution AS lossAttribution,
        execution_notes AS executionNotes,
        improvement_plan AS improvementPlan,
        market_plan AS marketPlan,
        position_plan AS positionPlan,
        new_candidates AS newCandidates,
        trades,
        created_at AS createdAt, updated_at AS updatedAt
      FROM daily_reviews
      WHERE 1=1 ${where}
      ORDER BY review_date DESC, id DESC
      LIMIT ?`,
      params,
    );

    const records = rows.map((row) => {
      let trades = [];
      if (row.trades) {
        try { trades = JSON.parse(row.trades); } catch { trades = []; }
      }
      if (trades.length === 0 && row.symbol && row.symbol !== "自选股" && row.buyPrice > 0) {
        trades = [{
          symbol: row.symbol,
          buyPrice: Number(row.buyPrice),
          sellPrice: row.sellPrice != null ? Number(row.sellPrice) : null,
          shares: Number(row.shares),
          holdingStyle: row.holdingStyle || "短线",
        }];
      }
      return { ...row, trades };
    });
    sendJson(response, 200, { records });
    return true;
  }

  // ── 复盘记录 DELETE ──
  if (request.method === "DELETE" && url.pathname === "/api/daily-reviews") {
    try {
      const id = Number(url.searchParams.get("id"));
      if (!Number.isFinite(id) || id <= 0) {
        sendError(response, 400, "需要有效的 id 参数");
        return true;
      }
      const [result] = await db.execute("DELETE FROM daily_reviews WHERE id = ?", [id]);
      if (result.affectedRows === 0) {
        sendError(response, 404, "记录不存在");
        return true;
      }
      sendJson(response, 200, { ok: true, deleted: result.affectedRows });
    } catch (error) {
      sendError(response, 500, `删除失败：${error.message}`);
    }
    return true;
  }

  // ── 看板统计 ──
  if (request.method === "GET" && url.pathname === "/api/dashboard") {
    try {
      const [[{ totalPlans }]] = await db.query("SELECT COUNT(*) AS totalPlans FROM trade_plans");
      const [[{ totalReviews }]] = await db.query("SELECT COUNT(*) AS totalReviews FROM daily_reviews");

      // 从持仓记录读取盈亏和胜率
      const [[{ totalProfit, totalLoss }]] = await db.query(
        `SELECT
          COALESCE(SUM(CASE WHEN realized_pnl > 0 THEN realized_pnl ELSE 0 END), 0) AS totalProfit,
          COALESCE(SUM(CASE WHEN realized_pnl < 0 THEN realized_pnl ELSE 0 END), 0) AS totalLoss
        FROM positions`
      );
      const [soldStats] = await db.query(
        `SELECT
          SUM(CASE WHEN realized_pnl > 0 THEN 1 ELSE 0 END) AS winCount,
          SUM(CASE WHEN realized_pnl < 0 THEN 1 ELSE 0 END) AS lossCount
        FROM positions WHERE shares = 0`
      );
      const winCount = Number(soldStats[0]?.winCount || 0);
      const lossCount = Number(soldStats[0]?.lossCount || 0);

      // 持仓汇总
      const [[posSummary]] = await db.query(
        `SELECT COUNT(*) AS positionCount, COALESCE(SUM(total_cost), 0) AS totalCost, COALESCE(SUM(market_value), 0) AS totalMarketValue FROM positions WHERE shares > 0`
      );

      const [recentReviews] = await db.query(
        `SELECT id, symbol, DATE_FORMAT(review_date, '%Y-%m-%d') AS reviewDate,
          pnl_amount AS pnlAmount, pnl_rate AS pnlRate,
          index_judgment AS indexJudgment,
          volume_judgment AS volumeJudgment,
          sentiment_judgment AS sentimentJudgment,
          leading_sectors AS leadingSectors,
          buy_signal AS buySignal,
          sell_signal AS sellSignal,
          improvement_plan AS improvementPlan,
          market_plan AS marketPlan
        FROM daily_reviews ORDER BY review_date DESC, id DESC LIMIT 5`
      );

      // K线训练统计
      const [[trainStats]] = await db.query(
        `SELECT
          COALESCE(COUNT(*), 0) AS totalSessions,
          COALESCE(SUM(trades_count), 0) AS totalTrades,
          COALESCE(SUM(win_count), 0) AS totalWins,
          COALESCE(SUM(CASE WHEN total_pnl > 0 THEN 1 ELSE 0 END), 0) AS profitableSessions,
          COALESCE(SUM(CASE WHEN total_pnl < 0 THEN 1 ELSE 0 END), 0) AS losingSessions
        FROM kline_train_sessions`
      );
      const totalTrades = Number(trainStats?.totalTrades || 0);
      const totalWins = Number(trainStats?.totalWins || 0);
      const sessionCount = Number(trainStats?.totalSessions || 0);
      const winRate = totalTrades > 0 ? (totalWins / totalTrades * 100) : 0;
      const trainLossCount = totalTrades - totalWins;
      const profitLossRatio = trainLossCount > 0 ? (totalWins / trainLossCount) : (totalWins > 0 ? 999 : 0);

      const [recentPlans] = await db.query(
        `SELECT symbol, buy_price AS buyPrice, take_profit_price AS takeProfitPrice,
          stop_loss_price AS stopLossPrice, expected_profit AS expectedProfit,
          risk_reward AS riskReward
        FROM trade_plans ORDER BY id DESC LIMIT 5`,
      );

      sendJson(response, 200, {
        totalPlans: Number(totalPlans),
        totalReviews: Number(totalReviews),
        totalProfit: Number(totalProfit),
        totalLoss: Number(totalLoss),
        winCount,
        lossCount,
        winRate: (winCount + lossCount) > 0
          ? Math.round((winCount / (winCount + lossCount)) * 100)
          : 0,
        netPnl: Number(totalProfit) + Number(totalLoss),
        positionCount: Number(posSummary?.positionCount || 0),
        positionCost: Number(posSummary?.totalCost || 0),
        positionMarketValue: Number(posSummary?.totalMarketValue || 0),
        recentReviews,
        recentPlans,
        // K线训练统计
        trainSessions: sessionCount,
        trainTotalTrades: totalTrades,
        trainWinRate: Math.round(winRate * 10) / 10,
        trainProfitLossRatio: Math.round(profitLossRatio * 100) / 100,
      });
    } catch (error) {
      sendError(response, 500, `看板数据获取失败：${error.message}`);
    }
    return true;
  }

  return false;
}

module.exports = { handleTradeRoutes };
