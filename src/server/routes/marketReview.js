/**
 * 每日市场复盘路由 — AI 综合分析：新闻 + 行情 → 复盘 + 次日预判 + 推荐标的
 *
 * 用法：
 *   const { handleMarketReviewRoutes } = require("./routes/marketReview");
 *   if (await handleMarketReviewRoutes(request, response, url, ctx)) return;
 */

"use strict";

async function handleMarketReviewRoutes(request, response, url, ctx) {
  const { sendJson, sendError, readJsonBody, aiFetch, normalizeAiUrl, decryptApiKey, config, stockService } = ctx;
  const { getReports } = require("../services/xuangutong");

  // ── AI 每日市场复盘 ──
  if (request.method === "POST" && url.pathname === "/api/market/daily-review") {
    try {
      const body = await readJsonBody(request);
      const { aiConfig } = body || {};

      const aiUrl = normalizeAiUrl(aiConfig?.url || config.ai.url);
      const aiKey = (aiConfig?.key) || decryptApiKey(config.ai.key) || config.ai.key;
      const aiModel = (aiConfig?.model) || config.ai.model;
      const enableThinking = aiConfig?.thinking !== false;

      if (!aiKey) {
        sendError(response, 503, "未配置 AI_API_KEY，请在设置页或环境变量中配置");
        return true;
      }

      // ── 第一步：收集市场数据 ──

      // 1. 大盘指数行情
      const indexCodes = ["000001", "399001", "399006"]; // 上证/深证/创业板
      let indexSummary = "";
      try {
        const quotesResult = await stockService.getMultiMarketQuotes(indexCodes);
        if (quotesResult.ok && quotesResult.data) {
          indexSummary = quotesResult.data.map(q => {
            const pct = q.changePercent != null ? ((q.changePercent > 0 ? "+" : "") + q.changePercent.toFixed(2) + "%") : "-";
            return `${q.name}(${q.code}) 价${q.price} ${pct} 开${q.open || "-"} 高${q.high || "-"} 低${q.low || "-"} 量${q.volume || "-"}`;
          }).join("\n");
        }
      } catch (e) { indexSummary = "（大盘数据获取失败）"; }

      // 2. 热门板块
      let sectorSummary = "";
      try {
        const hotResult = await stockService.getHotSectors(10);
        if (hotResult.ok && hotResult.data?.industries) {
          sectorSummary = "领涨行业：" + hotResult.data.industries.slice(0, 5).map(i =>
            `${i.name} ${i.changePercent != null ? ((i.changePercent > 0 ? '+' : '') + i.changePercent.toFixed(2) + '%') : ''}`
          ).join("、");
          if (hotResult.data.concepts?.length) {
            sectorSummary += "\n领涨概念：" + hotResult.data.concepts.slice(0, 5).map(c =>
              `${c.name} ${c.changePercent != null ? ((c.changePercent > 0 ? '+' : '') + c.changePercent.toFixed(2) + '%') : ''}`
            ).join("、");
          }
        }
      } catch { /* ignore */ }

      // 3. 涨停板
      let ztSummary = "";
      try {
        const ztResult = await stockService.getZTPool("zt");
        if (ztResult.ok && ztResult.data?.length) {
          ztSummary = ztResult.data.slice(0, 10).map(s => `${s.name}(${s.code}) ${s.limitUpCount || ""}板`).join("、");
        }
      } catch { /* ignore */ }

      // 4. 最新研报/新闻
      let newsSummary = "";
      try {
        const reports = await getReports();
        if (reports.items?.length) {
          newsSummary = reports.items.slice(0, 8).map((r, i) =>
            `${i + 1}. [${r.time}] ${r.title}`
          ).join("\n");
        }
      } catch { /* ignore */ }

      // 5. 资金流向
      let fundSummary = "";
      try {
        const fundResult = await stockService.getFundFlowRank("today");
        if (fundResult.ok && fundResult.data?.length) {
          fundSummary = "个股资金流入TOP5：" + fundResult.data.slice(0, 5).map(f =>
            `${f.name}(${f.code || ""}) 净流入${f.netFlow || ""}`
          ).join("、");
        }
      } catch { /* ignore */ }

      // ── 第二步：AI 综合分析 ──

      const systemPrompt = `你是一位资深A股市场分析师。请基于以下实时市场数据，撰写当日复盘报告。

## 输出格式（严格按以下结构）
### 📊 一、今日市场总结
（用数据说话：指数涨跌、成交量变化、板块轮动特征、资金动向，2-3段）

### 🔮 二、次日走势预判
（给出明确方向：看涨/震荡偏多/震荡/震荡偏空/看跌，并引用至少2个技术面或基本面逻辑支撑。标明概率置信度）

### 🎯 三、重点关注标的
（列出3-5只值得关注的股票，每只标明：代码、名称、关注理由、建议操作方向、关键价位）
格式：
- **XXXXXX.SH 某某股份** | 关注理由：xxx | 方向：做多/观望 | 关键位：支撑x元 压力y元

### ⚠️ 四、风险提示
（3-5条需要注意的风险因素：政策/外围/流动性/技术面等）

## 写作要求
- 数据驱动，引用具体数值
- 预判有逻辑支撑，不模棱两可
- 标的推荐具体可操作
- 总字数600-1000字`;

      const userMessage = `请基于以下数据撰写今日A股复盘：

## 大盘指数
${indexSummary || "（暂无数据）"}

## 热门板块
${sectorSummary || "（暂无数据）"}

## 涨停板
${ztSummary || "（暂无数据）"}

## 最新研报/新闻
${newsSummary || "（暂无数据）"}

## 资金流向
${fundSummary || "（暂无数据）"}`;

      const aiRequestBody = {
        model: aiModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: 4000,
      };

      if (enableThinking && /deepseek/i.test(aiModel)) {
        aiRequestBody.thinking = { type: "enabled" };
      } else {
        aiRequestBody.temperature = 0.5;
      }

      const aiResponse = await aiFetch(aiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiKey}` },
        body: JSON.stringify(aiRequestBody),
      });

      if (!aiResponse.ok) {
        const errText = await aiResponse.text().catch(() => "unknown");
        sendError(response, 502, `AI 服务返回错误 (${aiResponse.status}): ${errText.slice(0, 200)}`);
        return true;
      }

      const aiData = await aiResponse.json();
      const review = aiData?.choices?.[0]?.message?.content || "";

      sendJson(response, 200, {
        ok: true,
        review,
        dataContext: {
          indexSummary,
          sectorSummary,
          ztSummary,
          fundSummary,
          newsCount: newsSummary ? newsSummary.split("\n").length : 0,
        },
      });
    } catch (error) {
      console.error("Market review error:", error);
      sendError(response, 500, `复盘生成失败：${error.message}`);
    }
    return true;
  }

  return false;
}

module.exports = { handleMarketReviewRoutes };
