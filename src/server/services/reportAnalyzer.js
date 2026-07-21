/**
 * 研报分析器 — AI 提取方法论 + 按方法论编写研报 + 多文件融合分析
 *
 * 职责：
 * - 分析上传的研报，AI 提取分析方法论
 * - 支持多文件分别提取 + 交叉整合
 * - 支持多 Skill 融合编写研报
 * - 数据库持久化 Skill 存储（report_skills 表）
 *
 * 用法：
 *   const ra = require("./services/reportAnalyzer");
 *   ra.init(db);  // 必须先初始化
 *   await ra.analyzeReport(text, aiConfig, deps);
 */

"use strict";

let db = null;
const AI_MAX_INPUT = 12000;

/** 初始化数据库引用（在 server.js 中调用） */
function init(database) { db = database; }

// ═══════════════════════════════════════════════════════════
// Skill 持久化 CRUD（DB 存储）
// ═══════════════════════════════════════════════════════════

async function saveSkill(methodology, sourceReportTitle = "") {
  const skill = {
    name: methodology.name || "未命名方法论",
    framework: methodology.framework || "",
    selectionLogic: methodology.selectionLogic || { quantitative: [], qualitative: [] },
    keyIndicators: methodology.keyIndicators || [],
    outputFormat: methodology.outputFormat || { sections: [], description: "" },
    dataSources: methodology.dataSources || [],
    crossAnalysis: methodology.crossAnalysis || "",
    uniqueAngles: methodology.uniqueAngles || [],
    sourceReport: sourceReportTitle,
    createdAt: new Date().toISOString(),
  };

  if (db) {
    try {
      const [result] = await db.execute(
        "INSERT INTO report_skills (name, methodology_json, source_report) VALUES (?, ?, ?)",
        [skill.name, JSON.stringify(skill), sourceReportTitle]
      );
      skill.id = `skill_${result.insertId}`;
    } catch (e) {
      console.error("[reportAnalyzer] saveSkill DB error:", e.message);
      skill.id = `skill_${Date.now()}`; // 降级
    }
  } else {
    skill.id = `skill_${Date.now()}`;
  }

  return skill;
}

async function listSkills() {
  if (!db) return [];
  try {
    const [rows] = await db.query(
      "SELECT id, name, methodology_json AS json, source_report AS sourceReport, created_at AS createdAt FROM report_skills ORDER BY id DESC"
    );
    return rows.map(row => {
      let skill;
      try { skill = JSON.parse(row.json); } catch { return null; }
      skill.id = `skill_${row.id}`;
      skill.sourceReport = row.sourceReport;
      skill.createdAt = row.createdAt;
      return skill;
    }).filter(Boolean);
  } catch (e) {
    console.error("[reportAnalyzer] listSkills DB error:", e.message);
    return [];
  }
}

async function deleteSkill(id) {
  if (!db || !id) return false;
  const dbId = id.replace("skill_", "");
  try {
    const [result] = await db.execute("DELETE FROM report_skills WHERE id = ?", [Number(dbId)]);
    return result.affectedRows > 0;
  } catch (e) {
    console.error("[reportAnalyzer] deleteSkill DB error:", e.message);
    return false;
  }
}

async function getSkill(id) {
  if (!db || !id) return null;
  const dbId = id.replace("skill_", "");
  try {
    const [rows] = await db.query(
      "SELECT id, name, methodology_json AS json, source_report AS sourceReport, created_at AS createdAt FROM report_skills WHERE id = ?",
      [Number(dbId)]
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    let skill;
    try { skill = JSON.parse(row.json); } catch { return null; }
    skill.id = `skill_${row.id}`;
    skill.sourceReport = row.sourceReport;
    skill.createdAt = row.createdAt;
    return skill;
  } catch (e) {
    console.error("[reportAnalyzer] getSkill DB error:", e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// 核心：提取方法论（单文件）
// ═══════════════════════════════════════════════════════════

async function analyzeReport(reportText, aiConfig, { aiFetch, normalizeAiUrl, decryptApiKey, config }) {
  const aiUrl = normalizeAiUrl(aiConfig?.url || config.ai.url);
  const aiKey = (aiConfig?.key) || decryptApiKey(config.ai.key) || config.ai.key;
  const aiModel = (aiConfig?.model) || config.ai.model;
  if (!aiKey) return { success: false, error: "未配置 AI_API_KEY" };

  const systemPrompt = `你是一位资深证券分析师。请从以下研究报告中提取分析方法论。

## 提取要求
1. **分析框架**：报告使用了什么分析框架
2. **选股逻辑**：筛选标的的标准（定量+定性）
3. **关键指标**：报告关注的核心指标
4. **输出格式**：报告的结构
5. **信息来源**：报告引用的数据来源

## 输出格式（只输出 JSON）
{
  "name": "方法论名称（简洁）",
  "framework": "分析框架描述（100字内）",
  "selectionLogic": { "quantitative": ["条件1"], "qualitative": ["条件1"] },
  "keyIndicators": ["指标1", "指标2"],
  "outputFormat": { "sections": ["板块1", "板块2"], "description": "格式说明" },
  "dataSources": ["来源1"]
}`;

  return await _callAIJson(aiUrl, aiKey, aiModel, systemPrompt,
    `以下是一份证券研究报告，请提取其分析方法论：\n\n${reportText.slice(0, AI_MAX_INPUT)}`,
    { max_tokens: 2000, temperature: 0.3 }
  );
}

// ═══════════════════════════════════════════════════════════
// 多文件分析：分别提取 → 交叉整合
// ═══════════════════════════════════════════════════════════

async function analyzeReportMulti(files, aiConfig, deps) {
  const { aiFetch, normalizeAiUrl, decryptApiKey, config } = deps;
  const aiUrl = normalizeAiUrl(aiConfig?.url || config.ai.url);
  const aiKey = (aiConfig?.key) || decryptApiKey(config.ai.key) || config.ai.key;
  const aiModel = (aiConfig?.model) || config.ai.model;
  if (!aiKey) return { success: false, error: "未配置 AI_API_KEY" };

  const individualResults = [];
  for (const file of files) {
    try {
      const r = await analyzeReport(file.text, aiConfig, deps);
      individualResults.push({ ...r, fileName: file.name });
    } catch (err) {
      individualResults.push({ success: false, error: err.message, fileName: file.name });
    }
  }

  const successResults = individualResults.filter(r => r.success);
  if (successResults.length === 0) {
    return { success: false, error: "所有文件分析均失败", individualResults };
  }

  const methodsSummary = successResults.map((r, i) => {
    const m = r.methodology;
    return `### 方法论 ${i + 1}：${m.name}（来源：${r.fileName}）
框架：${m.framework}
定量条件：${(m.selectionLogic?.quantitative || []).join("；")}
定性条件：${(m.selectionLogic?.qualitative || []).join("；")}
核心指标：${(m.keyIndicators || []).join("、")}
输出格式：${(m.outputFormat?.sections || []).join(" → ")}
信息来源：${(m.dataSources || []).join("、")}`;
  }).join("\n\n");

  const combinePrompt = `你是一位资深证券分析方法论研究专家。以下是从 ${files.length} 份不同研报中分别提取的分析方法论。

请进行交叉整合分析：
1. **找出共性**：哪些分析维度在多份研报中反复出现？
2. **提取差异**：每份研报独特的角度是什么？
3. **融合输出**：将共性作为基础框架，差异作为可选增项

## 输出格式（只输出 JSON）
{
  "name": "融合方法论名称",
  "framework": "融合后的分析框架描述（200字内）",
  "selectionLogic": { "quantitative": ["共有的定量条件"], "qualitative": ["共有的定性条件"] },
  "keyIndicators": ["共有的核心指标"],
  "outputFormat": { "sections": ["融合后的输出板块"], "description": "格式说明" },
  "dataSources": ["共有的信息来源"],
  "crossAnalysis": "交叉分析总结（200字）",
  "uniqueAngles": ["各方法独特的视角"]
}

## 分析方法论汇总
${methodsSummary}`;

  const combined = await _callAIJson(aiUrl, aiKey, aiModel, combinePrompt,
    "请对上方的分析方法论进行交叉整合。",
    { max_tokens: 3000, temperature: 0.4 }
  );

  return {
    success: true,
    combinedMethodology: combined.success ? combined.methodology : successResults[0].methodology,
    individualResults,
  };
}

// ═══════════════════════════════════════════════════════════
// 多 Skill 融合编写研报
// ═══════════════════════════════════════════════════════════

async function writeReport(topic, skillIds, aiConfig, deps) {
  const { aiFetch, normalizeAiUrl, decryptApiKey, config } = deps;
  const ids = Array.isArray(skillIds) ? skillIds : [skillIds];
  const skills = [];
  for (const id of ids) {
    const s = await getSkill(id);
    if (s) skills.push(s);
  }

  if (skills.length === 0) return { success: false, error: "未找到任何指定的分析方法论" };

  const aiUrl = normalizeAiUrl(aiConfig?.url || config.ai.url);
  const aiKey = (aiConfig?.key) || decryptApiKey(config.ai.key) || config.ai.key;
  const aiModel = (aiConfig?.model) || config.ai.model;
  if (!aiKey) return { success: false, error: "未配置 AI_API_KEY" };

  // 收集行情和新闻上下文
  let marketContext = "";
  try {
    if (deps.stockService) {
      const searchResult = await deps.stockService.searchStocks(topic);
      if (searchResult.ok && searchResult.data?.length > 0) {
        const topMatches = searchResult.data.slice(0, 5).map(s => s.code);
        const quotesResult = await deps.stockService.getMultiMarketQuotes(topMatches);
        if (quotesResult.ok && quotesResult.data) {
          marketContext = "## 实时行情\n" + quotesResult.data.map(q =>
            `${q.name}(${q.code}) 价${q.price} ${q.changePercent != null ? ((q.changePercent > 0 ? '+' : '') + q.changePercent.toFixed(2) + '%') : ''}`
          ).join("\n");
        }
      }
    }
  } catch { /* ignore */ }

  let newsContext = "";
  try {
    if (deps.getReports) {
      const reports = await deps.getReports();
      if (reports.items?.length > 0) {
        newsContext = "## 最新研报摘要\n" + reports.items.slice(0, 5).map(r =>
          `- [${r.time}] ${r.title}: ${r.summary || ''}`
        ).join("\n");
      }
    }
  } catch { /* ignore */ }

  const skillDescriptions = skills.map((s, i) => {
    return `### 方法论 ${i + 1}：${s.name}
**框架**：${s.framework}
**选股逻辑**：定量[${(s.selectionLogic?.quantitative || []).join("；")}] 定性[${(s.selectionLogic?.qualitative || []).join("；")}]
**核心指标**：${(s.keyIndicators || []).join("、")}
**输出格式**：${(s.outputFormat?.sections || []).join(" → ")}`;
  }).join("\n\n");

  const fusionNote = skills.length > 1
    ? `\n\n## ⚠️ 多方法论融合要求\n融合以上 ${skills.length} 种方法论的视角。共识重点阐述，互补视角同时覆盖，冲突结论客观对比。`
    : "";

  const allSections = [...new Set(skills.flatMap(s => s.outputFormat?.sections || []))];

  const systemPrompt = `你是一位资深证券分析师。请融合以下分析方法论撰写研究报告。

${skillDescriptions}
${fusionNote}

## 融合输出格式
板块：${allSections.length > 0 ? allSections.join(" → ") : "行业概述 → 核心逻辑 → 标的推荐 → 风险提示"}

## 写作要求
1. 融合所有方法论的选股框架和核心指标
2. 结合实时行情数据量化分析
3. 明确推荐标的及目标价/止损位（标注代码）
4. 列出 3-5 个风险因素
5. 语言专业简洁，总字数 1000-1500 字`;

  const skillNames = skills.map(s => s.name).join(" + ");
  const userMessage = `请融合「${skillNames}」方法论，撰写主题为「${topic}」的研究报告。${marketContext ? `\n\n${marketContext}` : ""}${newsContext ? `\n\n${newsContext}` : ""}`;

  const result = await _callAIText(aiUrl, aiKey, aiModel, systemPrompt, userMessage,
    { max_tokens: 5000, temperature: 0.5 }
  );

  if (!result.success) return result;

  return { success: true, report: result.text, skillNames, topic, marketContext, newsContext };
}

// ═══════════════════════════════════════════════════════════
// 内部：调用 AI（JSON 模式）
// ═══════════════════════════════════════════════════════════

async function _callAIJson(aiUrl, aiKey, aiModel, systemPrompt, userMessage, opts = {}) {
  try {
    const response = await fetch(aiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiKey}` },
      body: JSON.stringify({ model: aiModel, messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ], ...opts }),
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => "unknown");
      return { success: false, error: `AI 返回错误 (${response.status}): ${errText.slice(0, 200)}` };
    }
    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content || "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { success: false, error: "AI 未返回有效 JSON", raw };
    return { success: true, methodology: JSON.parse(jsonMatch[0]) };
  } catch (err) {
    return { success: false, error: `AI 请求失败：${err.message}` };
  }
}

// ═══════════════════════════════════════════════════════════
// 内部：调用 AI（文本模式）
// ═══════════════════════════════════════════════════════════

async function _callAIText(aiUrl, aiKey, aiModel, systemPrompt, userMessage, opts = {}) {
  try {
    const response = await fetch(aiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiKey}` },
      body: JSON.stringify({ model: aiModel, messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ], ...opts }),
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => "unknown");
      return { success: false, error: `AI 返回错误 (${response.status}): ${errText.slice(0, 200)}` };
    }
    const data = await response.json();
    return { success: true, text: data?.choices?.[0]?.message?.content || "" };
  } catch (err) {
    return { success: false, error: `AI 请求失败：${err.message}` };
  }
}

module.exports = {
  init,
  analyzeReport,
  analyzeReportMulti,
  writeReport,
  saveSkill,
  listSkills,
  deleteSkill,
  getSkill,
};
