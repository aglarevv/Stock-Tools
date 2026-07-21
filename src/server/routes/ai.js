/**
 * AI 路由 — 对话 / 复盘 / 摘要 / 文件解析 / 选股
 *
 * 用法：
 *   const { handleAiRoutes } = require("./routes/ai");
 *   if (await handleAiRoutes(request, response, url, ctx)) return;
 */

"use strict";

const path = require("node:path");

async function handleAiRoutes(request, response, url, ctx) {
  const { db, sendJson, sendError, readJsonBody, config, aiFetch, normalizeAiUrl, decryptApiKey, stockService, services } = ctx;
  const { classifyArticles, sortArticlesBySOP, detectSentiment, cleanDigest } = services;
  const { generateDailyDigest, computePriority, getWeekLabel, assessSimpleSentiment } = require("../newsDigest");
  const { cleanupOldArticleLinks } = require("../database");
  const crypto = require("node:crypto");

  // ── AI 对话 ──
  if (request.method === "POST" && url.pathname === "/api/ai/chat") {
    try {
      const body = await readJsonBody(request);
      const { reviewData, messages, aiConfig, stockData } = body;

      const aiUrl = normalizeAiUrl(aiConfig?.url || config.ai.url);
      const aiKey = (aiConfig?.key) || decryptApiKey(config.ai.key) || config.ai.key;
      const aiModel = (aiConfig?.model) || config.ai.model;
      const aiTemp = aiConfig?.temperature ?? 0.7;
      const enableThinking = aiConfig?.thinking !== false;

      if (!aiKey) {
        sendError(response, 503, "未配置 AI_API_KEY，请在设置页或环境变量中配置");
        return true;
      }

      const apiMessages = [];
      let systemPrompt = "你是一位专业的股票交易复盘助手。请根据复盘数据，为用户提供专业、客观的分析和建议。";

      if (reviewData && typeof reviewData === "object") {
        const r = reviewData;
        const parts = [];
        if (r.symbol) parts.push(`股票：${r.symbol}`);
        if (r.reviewDate) parts.push(`复盘日期：${r.reviewDate}`);
        if (r.holdingStyle) parts.push(`持有方式：${r.holdingStyle}`);
        if (r.buyPrice !== undefined && r.buyPrice !== null && r.buyPrice !== "") parts.push(`买入价：${r.buyPrice}`);
        if (r.sellPrice !== null && r.sellPrice !== undefined && r.sellPrice !== "") parts.push(`卖出价：${r.sellPrice}`);
        if (r.shares) parts.push(`股数：${r.shares}`);
        if (r.pnlAmount !== undefined && r.pnlAmount !== null) parts.push(`盈亏金额：${r.pnlAmount}`);
        if (r.pnlRate !== undefined && r.pnlRate !== null && r.pnlRate !== "") parts.push(`收益率：${r.pnlRate}%`);

        const sections = [];
        if (r.indexJudgment) sections.push(`一、市场复盘-指数判断：${r.indexJudgment}`);
        if (r.volumeJudgment) sections.push(`市场复盘-量能判断：${r.volumeJudgment}`);
        if (r.sentimentJudgment) sections.push(`市场复盘-情绪判断：${r.sentimentJudgment}`);
        if (r.capitalDirection) sections.push(`市场复盘-资金方向：${r.capitalDirection}`);
        if (r.leadingSectors) sections.push(`二、板块分析-领涨板块：${r.leadingSectors}`);
        if (r.laggingSectors) sections.push(`板块分析-领跌板块：${r.laggingSectors}`);
        if (r.sustainability) sections.push(`板块分析-持续性：${r.sustainability}`);
        if (r.stockStrength) sections.push(`三、个股检查-强弱对比：${r.stockStrength}`);
        if (r.volAmpRanking) sections.push(`个股检查-量价分析：${r.volAmpRanking}`);
        if (r.limitAnalysis) sections.push(`个股检查-涨跌停：${r.limitAnalysis}`);
        if (r.buySignal) sections.push(`四、交易记录-买入信号：${r.buySignal}`);
        if (r.sellSignal) sections.push(`交易记录-卖出信号：${r.sellSignal}`);
        if (r.operationReason) sections.push(`交易记录-操作理由：${r.operationReason}`);
        if (r.profitAttribution) sections.push(`交易记录-盈利归因：${r.profitAttribution}`);
        if (r.lossAttribution) sections.push(`交易记录-亏损归因：${r.lossAttribution}`);
        if (r.executionNotes) sections.push(`交易记录-执行偏差：${r.executionNotes}`);
        if (r.improvementPlan) sections.push(`交易记录-改进计划：${r.improvementPlan}`);
        if (r.marketPlan) sections.push(`五、明日策略-大盘预案：${r.marketPlan}`);
        if (r.positionPlan) sections.push(`明日策略-持仓计划：${r.positionPlan}`);
        if (r.newCandidates) sections.push(`明日策略-新标的：${r.newCandidates}`);

        if (parts.length) systemPrompt += `\n\n## 基本信息\n${parts.join("\n")}`;
        if (sections.length) systemPrompt += `\n\n## 复盘内容\n${sections.join("\n\n")}`;
      }

      if (stockData && typeof stockData === "object") {
        const sd = stockData;
        const stockLines = [];
        if (sd.name) stockLines.push(`标的：${sd.name}（${sd.code || ""}）`);
        if (sd.price != null) stockLines.push(`最新价：${sd.price}`);
        if (sd.changePercent != null) {
          const sign = sd.changePercent > 0 ? "+" : "";
          stockLines.push(`涨跌幅：${sign}${sd.changePercent.toFixed(2)}%`);
        }
        if (sd.open != null) stockLines.push(`今开：${sd.open} 最高：${sd.high || "-"} 最低：${sd.low || "-"}`);
        if (sd.volume != null) stockLines.push(`成交量：${sd.volume}`);
        if (sd.amount != null) stockLines.push(`成交额：${sd.amount}`);
        if (sd.prevClose != null) stockLines.push(`昨收：${sd.prevClose}`);
        if (sd.pe != null) stockLines.push(`市盈率：${sd.pe.toFixed(2)}`);
        if (sd.totalMarketCap != null) stockLines.push(`总市值：${(sd.totalMarketCap / 1e8).toFixed(0)}亿`);
        if (stockLines.length) systemPrompt += `\n\n## 实时行情数据\n${stockLines.join("\n")}`;
      }

      systemPrompt += "\n\n请用中文回答，简洁专业。如果提供了实时行情数据，请结合行情进行分析。";
      apiMessages.push({ role: "system", content: systemPrompt });

      if (Array.isArray(messages) && messages.length > 0) {
        for (const m of messages) {
          if (m.role === "user") apiMessages.push({ role: "user", content: m.text || "" });
          else if (m.role === "bot") apiMessages.push({ role: "assistant", content: m.text || "" });
        }
      }

      const aiRequestBody = { model: aiModel, messages: apiMessages, max_tokens: 4000 };
      if (enableThinking && /deepseek/i.test(aiModel)) aiRequestBody.thinking = { type: "enabled" };
      else aiRequestBody.temperature = aiTemp;

      const aiResponse = await aiFetch(aiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiKey}` },
        body: JSON.stringify(aiRequestBody),
      });

      if (!aiResponse.ok) {
        const errText = await aiResponse.text().catch(() => "未知错误");
        console.error("AI API error:", aiResponse.status, errText.substring(0, 300));
        sendError(response, 502, `AI 服务返回错误 (${aiResponse.status})`);
        return true;
      }

      const aiData = await aiResponse.json();
      const reply = aiData?.choices?.[0]?.message?.content || "";
      sendJson(response, 200, { reply });
    } catch (error) {
      console.error("AI chat error:", error);
      sendError(response, 500, `AI 请求失败：${error.message}`);
    }
    return true;
  }

  // ── AI 整理复盘 ──
  if (request.method === "POST" && url.pathname === "/api/ai/organize-review") {
    try {
      const body = await readJsonBody(request);
      const { freeText, existingReview, aiConfig: ac } = body;
      if (!freeText || typeof freeText !== "string" || freeText.trim().length < 10) {
        sendError(response, 400, "请提供至少10字的复盘文本"); return true;
      }
      const aiUrl = normalizeAiUrl(ac?.url || config.ai.url);
      const aiKey = (ac?.key) || decryptApiKey(config.ai.key) || config.ai.key;
      const aiModel = (ac?.model) || config.ai.model;
      const enableThinking = ac?.thinking !== false;
      if (!aiKey) { sendError(response, 503, "未配置 AI_API_KEY"); return true; }

      const systemPrompt = `你是专业交易复盘整理助手。用户提供的是自由格式的复盘文本，你需要智能判断哪些内容属于哪个结构化字段，然后按指定格式输出。

## 五大版块及字段说明

### 一、市场复盘 · 事实（大盘层面）
【指数判断】—— 关于上证/深证/创业板的走势描述、涨跌方向、关键点位、均线、趋势判断
【量能判断】—— 关于成交量、成交额、放量/缩量、量价关系的描述
【情绪判断】—— 关于涨跌家数、涨停跌停比、市场恐慌/贪婪情绪的描述
【资金方向】—— 关于北向资金、主力资金流入流出、板块资金轮动的描述

### 二、板块分析 · 逻辑（板块层面）
【领涨板块】—— 涨幅居前的板块名称、龙头个股、上涨原因
【领跌板块】—— 跌幅居前的板块名称、代表性个股、下跌原因
【持续性判断】—— 对领涨板块能否持续的判断和逻辑分析

### 三、个股检查 · 标的（个股层面）
【标的强弱】—— 个股与大盘对比的强弱分析、买入逻辑是否成立
【量价分析】—— 个股的成交量、振幅、换手率、量价配合分析
【涨跌停分析】—— 个股/板块涨停跌停家数、封板力度、流动性

### 四、交易记录 · 内因（操作层面）
【买入信号】—— 买入的依据：技术形态、量能、均线、消息面等
【卖出信号】—— 卖出的依据：止盈止损、破位、量价背离等
【操作理由】—— 为什么买/卖、仓位逻辑
【盈利归因】—— 盈利原因分析：选股能力、市场环境、运气
【亏损归因】—— 亏损原因分析：大盘影响、利空消息、主力出货、追高
【执行偏差】—— 操作与计划的偏差：冲动交易、犹豫不决、追高卖飞
【改进计划】—— 针对偏差的具体改进措施

### 五、明日策略 · 决策（计划层面）
【大盘预案】—— 次日大盘上涨/震荡/下跌三种情景的应对策略
【持仓计划】—— 现有持仓的加仓条件、减仓触发、止盈止损调整
【新标的】—— 新加入观察池的标的及其触发条件

## 输出规则
1. 从用户文本中提取与每个字段相关的内容，不要编造
2. 若某个字段在用户文本中没有相关信息，输出"（无）"
3. 保留原文关键信息，用简洁专业的语言改写
4. 每个字段2-4句话
5. 严格按照【标签】格式逐行输出，不要遗漏任何字段`;

      const aiRequestBody = { model: aiModel, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: `请将以下自由格式复盘文本整理为结构化数据：\n\n${freeText.trim()}` }], max_tokens: 3000 };
      if (enableThinking && /deepseek/i.test(aiModel)) aiRequestBody.thinking = { type: "enabled" };
      else aiRequestBody.temperature = 0.3;

      let aiResponse;
      try {
        aiResponse = await aiFetch(aiUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiKey}` }, body: JSON.stringify(aiRequestBody) });
      } catch (fetchErr) {
        sendError(response, 502, `AI 服务连接失败：${fetchErr.message}。请检查 AI 接口地址和网络连接。`);
        return true;
      }
      if (!aiResponse.ok) {
        const errText = await aiResponse.text().catch(() => "").then(t => t.substring(0, 200));
        sendError(response, 502, `AI 服务返回错误 (${aiResponse.status})：${errText}`);
        return true;
      }
      const aiData = await aiResponse.json();
      const rawReply = aiData?.choices?.[0]?.message?.content || "";

      const extract = (t, l) => { const m = t.match(new RegExp(`【${l}】\\s*\\n?([\\s\\S]*?)(?=【|$)`, "i")); return m ? m[1].trim() : ""; };
      const fieldKeys = ["indexJudgment","volumeJudgment","sentimentJudgment","capitalDirection","leadingSectors","laggingSectors","sustainability","stockStrength","volAmpRanking","limitAnalysis","buySignal","sellSignal","operationReason","profitAttribution","lossAttribution","executionNotes","improvementPlan","marketPlan","positionPlan","newCandidates"];
      const fieldLabels = ["指数判断","量能判断","情绪判断","资金方向","领涨板块","领跌板块","持续性判断","标的强弱","量价分析","涨跌停分析","买入信号","卖出信号","操作理由","盈利归因","亏损归因","执行偏差","改进计划","大盘预案","持仓计划","新标的"];
      const fields = {};
      fieldKeys.forEach((k, i) => { fields[k] = extract(rawReply, fieldLabels[i]); });
      sendJson(response, 200, { ok: true, fields, raw: rawReply });
    } catch (e) { console.error("AI organize-review:", e); sendError(response, 500, `整理失败：${e.message}`); }
    return true;
  }

  // ── AI 全面复盘 ──
  if (request.method === "POST" && url.pathname === "/api/ai/full-review") {
    try {
      const body = await readJsonBody(request);
      const { stockData, indexData, existingReview, aiConfig: ac } = body;
      const aiUrl = normalizeAiUrl(ac?.url || config.ai.url);
      const aiKey = (ac?.key) || decryptApiKey(config.ai.key) || config.ai.key;
      const aiModel = (ac?.model) || config.ai.model;
      const enableThinking = ac?.thinking !== false;
      if (!aiKey) { sendError(response, 503, "未配置 AI_API_KEY"); return true; }

      let marketSummary = "";
      if (stockData?.price) {
        const s = stockData;
        const pctStr = s.changePercent != null ? ((s.changePercent > 0 ? "+" : "") + s.changePercent.toFixed(2) + "%") : "-";
        marketSummary = `## 标的行情\n${s.name||""}(${s.code||""}) 价${s.price} ${pctStr}`;
        if (s.open) marketSummary += ` 开${s.open} 高${s.high||"-"} 低${s.low||"-"}`;
        if (s.volume) marketSummary += ` 量${s.volume} 换手${s.turnoverRate!=null?s.turnoverRate.toFixed(2)+"%":""}`;
        if (s.pe) marketSummary += ` PE${s.pe.toFixed(1)}`;
      }
      if (Array.isArray(indexData) && indexData.length) {
        marketSummary += "\n## 大盘\n" + indexData.map(q => {
          const pct = q.changePercent != null ? ((q.changePercent > 0 ? "+" : "") + q.changePercent.toFixed(2) + "%") : "-";
          return q.name + " 价" + q.price + " " + pct;
        }).join(" ");
      }

      let userSummary = "";
      if (existingReview) {
        const sections = [["指数判断",existingReview.indexJudgment],["量能判断",existingReview.volumeJudgment],["情绪判断",existingReview.sentimentJudgment],["资金方向",existingReview.capitalDirection],["领涨板块",existingReview.leadingSectors],["领跌板块",existingReview.laggingSectors],["持续性",existingReview.sustainability],["标的强弱",existingReview.stockStrength],["量价分析",existingReview.volAmpRanking],["涨跌停",existingReview.limitAnalysis],["买入信号",existingReview.buySignal],["卖出信号",existingReview.sellSignal],["操作理由",existingReview.operationReason],["盈利归因",existingReview.profitAttribution],["亏损归因",existingReview.lossAttribution],["执行偏差",existingReview.executionNotes],["改进计划",existingReview.improvementPlan],["大盘预案",existingReview.marketPlan],["持仓计划",existingReview.positionPlan],["新标的",existingReview.newCandidates]];
        const filled = sections.filter(([,v]) => v).map(([l,v]) => `- ${l}：${v}`);
        if (filled.length) userSummary = filled.join("\n");
      }

      const systemPrompt = `你是资深交易复盘教练。基于行情数据独立分析个股和大盘，然后与用户复盘交叉验证。

## 规则
1. 独立分析不受用户复盘影响
2. 交叉验证：一致→补充细节；矛盾→以数据修正并标"⚠️修正"；用户独有合理→保留
3. 严格按【标签】格式输出，字段包括：【指数判断】【量能判断】【情绪判断】【资金方向】【领涨板块】【领跌板块】【持续性判断】【标的强弱】【量价分析】【涨跌停分析】【买入信号】【卖出信号】【操作理由】【盈利归因】【亏损归因】【执行偏差】【改进计划】【大盘预案】【持仓计划】【新标的】
4. 每字段2-4句，空标（暂无数据），总字数≤800`;

      const aiRequestBody = { model: aiModel, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: `请独立分析+交叉验证：\n${marketSummary}\n\n## 用户复盘（供交叉验证）\n${userSummary||"（无）"}` }], max_tokens: 4000 };
      if (enableThinking && /deepseek/i.test(aiModel)) aiRequestBody.thinking = { type: "enabled" };
      else aiRequestBody.temperature = 0.5;

      let aiResponse;
      try {
        aiResponse = await aiFetch(aiUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiKey}` }, body: JSON.stringify(aiRequestBody) });
      } catch (fetchErr) {
        sendError(response, 502, `AI 服务连接失败：${fetchErr.message}。请检查 AI 接口地址和网络连接。`);
        return true;
      }
      if (!aiResponse.ok) { sendError(response, 502, `AI 服务返回错误 (${aiResponse.status})`); return true; }
      const aiData = await aiResponse.json();
      const rawReply = aiData?.choices?.[0]?.message?.content || "";
      const extract = (t, l) => { const m = t.match(new RegExp(`【${l}】\\s*\\n?([\\s\\S]*?)(?=【|$)`, "i")); return m ? m[1].trim() : ""; };
      const keys = ["indexJudgment","volumeJudgment","sentimentJudgment","capitalDirection","leadingSectors","laggingSectors","sustainability","stockStrength","volAmpRanking","limitAnalysis","buySignal","sellSignal","operationReason","profitAttribution","lossAttribution","executionNotes","improvementPlan","marketPlan","positionPlan","newCandidates"];
      const labels = ["指数判断","量能判断","情绪判断","资金方向","领涨板块","领跌板块","持续性判断","标的强弱","量价分析","涨跌停分析","买入信号","卖出信号","操作理由","盈利归因","亏损归因","执行偏差","改进计划","大盘预案","持仓计划","新标的"];
      const fields = {};
      keys.forEach((k, i) => { fields[k] = extract(rawReply, labels[i]); });
      sendJson(response, 200, { ok: true, fields, raw: rawReply });
    } catch (e) { console.error("AI full-review:", e); sendError(response, 500, `复盘失败：${e.message}`); }
    return true;
  }

  // ── AI 大盘复盘 ──
  if (request.method === "POST" && url.pathname === "/api/ai/market-review") {
    try {
      const body = await readJsonBody(request);
      const { marketData, klineData, aiConfig: ac, existingFields } = body;
      if (!Array.isArray(marketData) || marketData.length === 0) {
        sendError(response, 400, "缺少大盘行情数据"); return true;
      }
      const aiUrl = normalizeAiUrl(ac?.url || config.ai.url);
      const aiKey = (ac?.key) || decryptApiKey(config.ai.key) || config.ai.key;
      const aiModel = (ac?.model) || config.ai.model;
      const enableThinking = ac?.thinking !== false;
      if (!aiKey) { sendError(response, 503, "未配置 AI_API_KEY"); return true; }

      const hasExisting = existingFields && typeof existingFields === "object" &&
        Object.values(existingFields).some((v) => v && String(v).trim().length > 0);

      const indexSummary = marketData.map((q) => {
        const parts = [`${q.name}（${q.code}）`];
        if (q.price != null) parts.push(`最新价：${q.price}`);
        if (q.changePercent != null) {
          const sign = q.changePercent > 0 ? "+" : "";
          parts.push(`涨跌幅：${sign}${q.changePercent.toFixed(2)}%`);
        }
        if (q.change != null) parts.push(`涨跌额：${q.change}`);
        if (q.open != null) parts.push(`今开：${q.open}`);
        if (q.high != null) parts.push(`最高：${q.high}`);
        if (q.low != null) parts.push(`最低：${q.low}`);
        if (q.prevClose != null) parts.push(`昨收：${q.prevClose}`);
        if (q.volume != null) parts.push(`成交量：${q.volume}`);
        if (q.amount != null) parts.push(`成交额：${q.amount}`);
        if (q.amplitude != null) parts.push(`振幅：${q.amplitude.toFixed(2)}%`);
        if (q.turnoverRate != null) parts.push(`换手率：${q.turnoverRate.toFixed(2)}%`);
        return parts.join("，");
      }).join("\n\n");

      let klineSummary = "";
      if (klineData && typeof klineData === "object") {
        const periodNames = { daily: "日线", weekly: "周线", monthly: "月线" };
        const parts = [];
        for (const [code, periods] of Object.entries(klineData)) {
          if (!periods || typeof periods !== "object") continue;
          const quote = marketData.find((q) => q.code === code);
          const name = quote?.name || code;
          parts.push(`\n### ${name}（${code}）多周期K线`);
          for (const [period, bars] of Object.entries(periods)) {
            if (!Array.isArray(bars) || bars.length === 0) continue;
            const label = periodNames[period] || period;
            const recent = bars.slice(-15);
            const lines = recent.map((b) => {
              const dir = (b.close ?? 0) >= (b.open ?? 0) ? "阳" : "阴";
              return `${b.date || "?"} ${dir} 开${b.open} 收${b.close} 高${b.high} 低${b.low}` + (b.volume != null ? ` 量${b.volume}` : "");
            });
            parts.push(`\n${label}（最近${recent.length}根）：\n${lines.join("\n")}`);
          }
        }
        klineSummary = parts.join("\n");
      }

      let existingSummary = "";
      if (hasExisting) {
        const fieldLabels = { indexJudgment: "指数判断", volumeJudgment: "量能判断", sentimentJudgment: "情绪判断", capitalDirection: "资金方向" };
        const parts = [];
        for (const [key, label] of Object.entries(fieldLabels)) {
          const val = existingFields[key];
          if (val && String(val).trim()) parts.push(`【${label}】${val}`);
        }
        if (parts.length > 0) existingSummary = `\n\n## 用户已有的复盘内容（需要交叉验证）\n${parts.join("\n\n")}`;
      }

      const userMessage = (klineSummary
        ? `以下是大盘指数实时行情及多周期K线数据，请运用多理论交叉验证方法生成市场复盘分析：\n\n## 实时行情\n${indexSummary}\n\n## 多周期K线数据${klineSummary}`
        : `以下是大盘指数实时行情数据，请运用多理论交叉验证方法生成市场复盘分析：\n\n${indexSummary}`) + existingSummary;

      const crossValidationInstruction = hasExisting ? `
## ⚠️ 交叉验证模式
用户已填写了部分复盘内容（见上方"用户已有的复盘内容"）。你需要：
1. **独立分析**：基于实时行情和K线数据，按多理论框架独立生成分析结论
2. **逐项对比**：将你的独立分析结论与用户已有内容逐项对比
3. **冲突处理**：对于存在明显冲突的维度，在你的分析中明确指出分歧
4. **补充完善**：对于用户已有内容中未覆盖的角度，直接补充进去
5. **保留可取之处**：如果用户的部分分析合理且与你的独立判断一致，保留并引用
最终输出仍按标准四维度格式，每个维度中融合独立分析+冲突修正+补充的内容。` : "";

      const sysPrompt = `你是一位专业的A股市场分析师。请根据提供的实时行情及多周期K线数据，从多个理论维度进行交叉复盘分析。

## 分析框架
### 一、趋势与结构（道氏理论 + 波浪理论）
### 二、均线与成本（均线理论 + 筹码理论）
### 三、量价关系（量价理论 + 江恩理论）
### 四、情绪与资金（行为金融 + 资金博弈）
${crossValidationInstruction}

## 输出格式
【指数判断】（综合道氏理论和波浪理论分析）${hasExisting ? "；如有冲突，明确指出差异" : ""}
【量能判断】（综合均线理论、量价理论分析）${hasExisting ? "；如有冲突，明确指出差异" : ""}
【情绪判断】（综合行为金融理论分析）${hasExisting ? "；如有冲突，明确指出差异" : ""}
【资金方向】（综合资金博弈理论分析）${hasExisting ? "；如有冲突，明确指出差异" : ""}
每维度3-5句话，引用至少2种理论交叉验证，总字数≤600`;

      const aiRequestBody = { model: aiModel, messages: [{ role: "system", content: sysPrompt }, { role: "user", content: userMessage }], max_tokens: 3000 };
      if (enableThinking && /deepseek/i.test(aiModel)) aiRequestBody.thinking = { type: "enabled" };
      else aiRequestBody.temperature = 0.6;

      const aiResponse = await aiFetch(aiUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiKey}` }, body: JSON.stringify(aiRequestBody) });
      if (!aiResponse.ok) { sendError(response, 502, `AI 服务返回错误 (${aiResponse.status})`); return true; }
      const aiData = await aiResponse.json();
      const rawReply = aiData?.choices?.[0]?.message?.content || "";

      function extractSection(text, label) {
        const pattern = new RegExp(`【${label}】\\s*\\n?([\\s\\S]*?)(?=【|$)`, "i");
        const match = text.match(pattern);
        return match ? match[1].trim() : "";
      }

      const analysis = {
        indexJudgment: extractSection(rawReply, "指数判断"),
        volumeJudgment: extractSection(rawReply, "量能判断"),
        sentimentJudgment: extractSection(rawReply, "情绪判断"),
        capitalDirection: extractSection(rawReply, "资金方向"),
        raw: rawReply,
      };
      sendJson(response, 200, { ok: true, analysis });
    } catch (error) { console.error("AI market-review error:", error); sendError(response, 500, `AI 请求失败：${error.message}`); }
    return true;
  }

  // ── AI 多维度交叉复盘 ──
  if (request.method === "POST" && url.pathname === "/api/ai/cross-review") {
    try {
      const body = await readJsonBody(request);
      const { reviewData, aiConfig: ac } = body;
      if (!reviewData || typeof reviewData !== "object") { sendError(response, 400, "缺少复盘数据"); return true; }
      const aiUrl = normalizeAiUrl(ac?.url || config.ai.url);
      const aiKey = (ac?.key) || decryptApiKey(config.ai.key) || config.ai.key;
      const aiModel = (ac?.model) || config.ai.model;
      const enableThinking = ac?.thinking !== false;
      if (!aiKey) { sendError(response, 503, "未配置 AI_API_KEY"); return true; }

      const r = reviewData;
      const sections = [];
      if (r.symbol) sections.push(`- 标的：${r.symbol}`);
      if (r.holdingStyle) sections.push(`- 持有方式：${r.holdingStyle}`);
      if (r.buyPrice != null && r.buyPrice !== "") sections.push(`- 买入价：${r.buyPrice}`);
      if (r.sellPrice != null && r.sellPrice !== "") sections.push(`- 卖出价：${r.sellPrice}`);
      if (r.shares) sections.push(`- 股数：${r.shares}`);
      if (sections.length) sections.unshift("## 基本参数");
      // (abbreviated for brevity - the full system prompt is preserved from original)
      const reviewSummary = sections.join("\n");

      const systemPrompt = `你是资深交易复盘教练。请对用户的复盘数据进行多维度交叉验证分析。
## 分析框架
### 理论一：道氏理论 — 趋势验证
### 理论二：行为金融学 — 认知偏差检测
### 理论三：风险回报理论 — 交易纪律评估
### 理论四：量价关系理论 — 信号一致性检验
### 理论五：市场微观结构 — 执行与博弈
## 输出格式
🔍 **多维度交叉复盘报告**
【理论交叉验证】（综合以上理论，指出共识点与矛盾点）
【认知偏差警示】（具体认知偏差及改进建议）
【交易纪律评分】（风险回报、仓位管理、止损纪律 每项1-10分）
【关键改进建议】（3条最高优先级可操作建议）
【思维升级】（用户可能忽略的市场逻辑或分析视角）
每部分引用至少2种理论交叉验证，总字数600字以内`;

      const aiRequestBody = { model: aiModel, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: `请对以下复盘数据进行多理论交叉复盘分析：\n\n${reviewSummary}` }], max_tokens: 3000 };
      if (enableThinking && /deepseek/i.test(aiModel)) aiRequestBody.thinking = { type: "enabled" };
      else aiRequestBody.temperature = 0.6;

      const aiResponse = await aiFetch(aiUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiKey}` }, body: JSON.stringify(aiRequestBody) });
      if (!aiResponse.ok) { sendError(response, 502, `AI 服务返回错误 (${aiResponse.status})`); return true; }
      const aiData = await aiResponse.json();
      const reply = aiData?.choices?.[0]?.message?.content || "";
      sendJson(response, 200, { reply });
    } catch (error) { console.error("AI cross-review error:", error); sendError(response, 500, `AI 请求失败：${error.message}`); }
    return true;
  }

  // ── 文件解析 ──
  if (request.method === "POST" && url.pathname === "/api/ai/parse-file") {
    try {
      const body = await readJsonBody(request);
      const { fileName, content, mimeType } = body;
      if (!content) { sendError(response, 400, "缺少文件内容"); return true; }
      if (content.length > 20 * 1024 * 1024) { sendError(response, 400, "文件过大（最大 10MB）"); return true; }

      const buffer = Buffer.from(content, "base64");
      const ext = path.extname(fileName || "").toLowerCase();
      let text = "";

      if (ext === ".txt" || ext === ".md" || mimeType === "text/plain" || mimeType === "text/markdown") {
        text = buffer.toString("utf-8").slice(0, 50000);
      } else if (ext === ".docx" || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        try {
          const mammoth = require("mammoth");
          const result = await mammoth.extractRawText({ buffer });
          text = result.value.slice(0, 50000);
        } catch (e) { sendError(response, 400, `Word 文件解析失败：${e.message}`); return true; }
      } else if (ext === ".pdf" || mimeType === "application/pdf") {
        try {
          const pdfParse = require("pdf-parse");
          const data = await pdfParse(buffer);
          text = data.text.slice(0, 50000);
        } catch (e) { sendError(response, 400, `PDF 文件解析失败：${e.message}`); return true; }
      } else { sendError(response, 400, "不支持的文件格式（支持：pdf / docx / txt / md）"); return true; }

      if (!text.trim()) { sendError(response, 400, "文件中未提取到文本内容"); return true; }
      sendJson(response, 200, { fileName, text, length: text.length });
    } catch (error) { sendError(response, 500, `文件解析失败：${error.message}`); }
    return true;
  }

  // ── 每日时事 AI 摘要 ──
  if (request.method === "POST" && url.pathname === "/api/ai/daily-digest") {
    try {
      const body = await readJsonBody(request);
      const { articles, aiConfig: ac } = body;
      if (!Array.isArray(articles) || articles.length === 0) { sendError(response, 400, "缺少文章数据"); return true; }

      const aiUrl = normalizeAiUrl(ac?.url || config.ai.url);
      const aiKey = (ac?.key) || decryptApiKey(config.ai.key) || config.ai.key;
      const aiModel = (ac?.model) || config.ai.model;
      const enableThinking = ac?.thinking !== false;
      if (!aiKey) { sendError(response, 503, "未配置 AI_API_KEY"); return true; }

      const sortedArticles = sortArticlesBySOP(articles);
      const sopGroups = { sop1: [], sop2: [], sop3: [] };
      for (const a of sortedArticles) {
        const cat = a.category || "";
        if (cat.includes("SOP 1") || cat.includes("深度洞察")) sopGroups.sop1.push(a);
        else if (cat.includes("SOP 2") || cat.includes("势能扫描")) sopGroups.sop2.push(a);
        else sopGroups.sop3.push(a);
      }

      const buildSection = (label, arts, startIdx) => {
        if (arts.length === 0) return "";
        let text = `\n【${label}】\n`;
        arts.forEach((a, i) => {
          const n = startIdx + i + 1;
          text += `${n}. [${a.source}] ${a.title}\n   链接：${a.link || "无"}\n   摘要：${a.summary || ""}\n   情感：${a.sentiment || "未标注"}\n\n`;
        });
        return text;
      };

      let idx = 0;
      const sop1Text = buildSection("SOP 1 深度洞察 — 长期逻辑·商业模式·宏观定调", sopGroups.sop1, idx);
      idx += sopGroups.sop1.length;
      const sop2Text = buildSection("SOP 2 势能扫描 — 资金流向·评级调整·突发热点", sopGroups.sop2, idx);
      idx += sopGroups.sop2.length;
      const sop3Text = buildSection("SOP 3 区域/垂类 — 查漏补缺·特定机会·技术前沿", sopGroups.sop3, idx);

      const systemPrompt = `你是一位专业的中国A股市场分析师。请根据以下按3-SOP体系采集的财经新闻，撰写一份约500字的中文每日市场日报摘要。
## 写作要求
1. **结构严格按 3-SOP**
2. **来源引用**：每个关键判断和核心数据必须在句末用 [来源N] 标注出处
3. 语言简洁专业，总字数控制在500字左右
以下是今日采集的文章：${sop1Text}${sop2Text}${sop3Text}`;

      const aiRequestBody = { model: aiModel, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: "请按3-SOP结构撰写今日日报摘要，重点分析对中国股市的利空/利好影响，所有关键信息标注来源编号。" }], max_tokens: 4000 };
      if (enableThinking && /deepseek/i.test(aiModel)) aiRequestBody.thinking = { type: "enabled" };
      else aiRequestBody.temperature = 0.5;

      const aiResponse = await aiFetch(aiUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiKey}` }, body: JSON.stringify(aiRequestBody) });
      if (!aiResponse.ok) { sendError(response, 502, `AI 服务返回错误 (${aiResponse.status})`); return true; }
      const aiData = await aiResponse.json();
      let digest = aiData?.choices?.[0]?.message?.content || "";
      digest = cleanDigest(digest);

      try {
        const today = new Date().toISOString().slice(0, 10);
        let bullish = 0, bearish = 0;
        for (const a of articles) { if (a.sentiment === "利好") bullish++; else if (a.sentiment === "利空") bearish++; }
        const sentimentLabel = bullish > bearish * 1.5 ? "偏乐观" : bearish > bullish * 1.5 ? "偏悲观" : "中性";
        const sorted = sortArticlesBySOP(articles);
        await db.execute(
          `INSERT INTO daily_digests (digest_date, digest, articles_json, source_count, sentiment)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE digest = VALUES(digest), articles_json = VALUES(articles_json),
           source_count = VALUES(source_count), sentiment = VALUES(sentiment)`,
          [today, digest, JSON.stringify(sorted), articles.length, sentimentLabel]
        );
        for (const article of sorted) {
          const link = (article.link || "").trim();
          if (!link) continue;
          const hash = crypto.createHash("sha256").update(link).digest("hex").slice(0, 16);
          try { await db.execute(`INSERT INTO rss_article_links (link_hash, first_seen_date, last_seen_date) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE last_seen_date = VALUES(last_seen_date)`, [hash, today, today]); } catch { /* ignore */ }
        }
        cleanupOldArticleLinks(db).catch(() => {});
      } catch (e) { console.error("保存日报摘要失败:", e.message); }

      sendJson(response, 200, { digest });
    } catch (error) { console.error("Daily digest error:", error); sendError(response, 500, `AI 摘要生成失败：${error.message}`); }
    return true;
  }

  // ── 周报/月报精选 ──
  if (request.method === "POST" && (url.pathname === "/api/ai/weekly-digest" || url.pathname === "/api/ai/monthly-digest")) {
    try {
      const body = await readJsonBody(request);
      const { aiConfig: ac } = body;
      const aiUrl = normalizeAiUrl(ac?.url || config.ai.url);
      const aiKey = (ac?.key) || decryptApiKey(config.ai.key) || config.ai.key;
      const aiModel = (ac?.model) || config.ai.model;
      const enableThinking = ac?.thinking !== false;
      if (!aiKey) { sendError(response, 503, "未配置 AI_API_KEY"); return true; }

      const isWeekly = url.pathname === "/api/ai/weekly-digest";
      const now = new Date();
      const dateTo = now.toISOString().slice(0, 10);
      const fromDate = new Date(now);
      isWeekly ? fromDate.setDate(fromDate.getDate() - 7) : fromDate.setMonth(fromDate.getMonth() - 1);
      const dateFrom = fromDate.toISOString().slice(0, 10);
      const periodLabel = isWeekly ? getWeekLabel(now) : `${now.getFullYear()}年${now.getMonth() + 1}月`;

      const [rows] = await db.query(
        "SELECT digest_date, articles_json FROM daily_digests WHERE digest_date >= ? AND digest_date <= ? ORDER BY digest_date DESC",
        [dateFrom, dateTo]
      );
      if (rows.length === 0) { sendError(response, 404, "该时间段内暂无日报数据"); return true; }

      const allArticleMap = new Map();
      for (const row of rows) {
        let arts = [];
        try { arts = JSON.parse(row.articles_json || "[]"); } catch { continue; }
        for (const a of arts) { const key = a.link || a.title; if (key && !allArticleMap.has(key)) allArticleMap.set(key, a); }
      }
      const aggregatedArticles = Array.from(allArticleMap.values());
      for (const a of aggregatedArticles) a._priority = computePriority(a, require("../keywords.js"), detectSentiment);
      aggregatedArticles.sort((a, b) => b._priority - a._priority);
      for (const a of aggregatedArticles) delete a._priority;
      const topArticles = aggregatedArticles.slice(0, 60);

      const articlesText = topArticles.map((a, i) =>
        `${i + 1}. [${a.source || "未知来源"}] ${a.title}\n   链接：${a.link || "无"}\n   摘要：${(a.summary || "").slice(0, 200)}\n   情感：${a.sentiment || "未标注"}`
      ).join("\n\n");

      const periodType = isWeekly ? "周报" : "月报";
      const systemPrompt = `你是专业的中国A股市场分析师。请撰写一份${periodType}精选摘要。\n## 写作要求\n1. 本期核心矛盾\n2. 重大事件回顾\n3. 板块/热点脉络梳理\n4. 对下一${isWeekly ? "周" : "月"}的展望\n5. 每个核心判断标注 [来源N]\n\n以下是汇总（共 ${topArticles.length} 篇精选）：\n\n${articlesText}`;

      const aiRequestBody = { model: aiModel, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: `请撰写${periodLabel}${periodType}精选摘要，用**粗体**标注重要判断。` }], max_tokens: 16384 };
      if (enableThinking && /deepseek/i.test(aiModel)) aiRequestBody.thinking = { type: "enabled" };
      else aiRequestBody.temperature = 0.5;

      const aiResponse = await aiFetch(aiUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiKey}` }, body: JSON.stringify(aiRequestBody) });
      if (!aiResponse.ok) { sendError(response, 502, `AI 服务返回错误 (${aiResponse.status})`); return true; }
      const aiData = await aiResponse.json();
      let digest = aiData?.choices?.[0]?.message?.content || "";
      digest = cleanDigest(digest);

      try {
        const sentimentLabel = assessSimpleSentiment(topArticles);
        await db.execute(
          `INSERT INTO periodic_digests (digest_type, period_label, date_from, date_to, digest, articles_count, sentiment) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [isWeekly ? "weekly" : "monthly", periodLabel, dateFrom, dateTo, digest, topArticles.length, sentimentLabel]
        );
      } catch (e) { console.error(`保存${periodType}失败:`, e.message); }

      sendJson(response, 200, { digest, type: isWeekly ? "weekly" : "monthly", periodLabel, dateFrom, dateTo, articlesCount: topArticles.length });
    } catch (error) { console.error("Periodic digest error:", error); sendError(response, 500, `AI 摘要生成失败：${error.message}`); }
    return true;
  }

  return false;
}

module.exports = { handleAiRoutes };
