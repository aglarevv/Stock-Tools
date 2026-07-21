/**
 * 研报路由 — 多文件分析 / 多Skill编写 / Skill 管理
 *
 * 用法：
 *   const { handleReportRoutes } = require("./routes/reports");
 *   if (await handleReportRoutes(request, response, url, ctx)) return;
 */

"use strict";

const { analyzeReport, analyzeReportMulti, writeReport, saveSkill, listSkills, deleteSkill, getSkill } = require("../services/reportAnalyzer");

async function handleReportRoutes(request, response, url, ctx) {
  const { sendJson, sendError, readJsonBody, aiFetch, normalizeAiUrl, decryptApiKey, config, stockService } = ctx;
  const { getReports } = require("../services/xuangutong");

  // ── 上传研报 → AI 分析 → 提取方法论（支持多文件） ──
  if (request.method === "POST" && url.pathname === "/api/reports/analyze") {
    try {
      const body = await readJsonBody(request);
      const { text, title, files, aiConfig } = body;

      // 兼容单文件和多文件模式
      const fileList = files && Array.isArray(files) && files.length > 0
        ? files.filter(f => f.text && f.text.trim().length >= 100)
        : text && text.trim().length >= 100
          ? [{ name: title || "未命名", text: text.trim() }]
          : [];

      if (fileList.length === 0) {
        sendError(response, 400, "请提供研报文本内容（每份至少100字）");
        return true;
      }

      if (fileList.length > 10) {
        sendError(response, 400, "最多同时分析10份研报");
        return true;
      }

      // 提取 skills（每份单独分析，再交叉整合）
      const deps = { aiFetch, normalizeAiUrl, decryptApiKey, config };

      if (fileList.length === 1) {
        // 单文件：快速路径
        const result = await analyzeReport(fileList[0].text, aiConfig || {}, deps);
        if (!result.success) { sendError(response, 500, result.error); return true; }
        const skill = await saveSkill(result.methodology, fileList[0].name);
        sendJson(response, 200, { ok: true, methodology: result.methodology, skill, fileCount: 1 });
      } else {
        // 多文件：分别提取 + 交叉整合
        const result = await analyzeReportMulti(fileList, aiConfig || {}, deps);
        if (!result.success) { sendError(response, 500, result.error); return true; }

        // 保存整合后的 skill 和各文件的子 skill
        const combinedName = fileList.map(f => f.name).join(" + ");
        const combinedSkill = await saveSkill(result.combinedMethodology, combinedName);
        const individualSkills = [];
        for (const r of result.individualResults) {
          if (r.success && r.methodology) {
            const sk = await saveSkill(r.methodology, r.fileName || "研报片段");
            individualSkills.push(sk);
          }
        }

        sendJson(response, 200, {
          ok: true,
          combined: { methodology: result.combinedMethodology, skill: combinedSkill },
          individual: individualSkills.map((s, i) => ({ methodology: result.individualResults[i]?.methodology, skill: s })),
          fileCount: fileList.length,
        });
      }
    } catch (error) {
      sendError(response, 500, `分析失败：${error.message}`);
    }
    return true;
  }

  // ── 基于方法论编写研报（支持多 skill 融合） ──
  if (request.method === "POST" && url.pathname === "/api/reports/write") {
    try {
      const body = await readJsonBody(request);
      const { topic, skillId, skillIds, aiConfig } = body;

      if (!topic || typeof topic !== "string" || topic.trim().length < 2) {
        sendError(response, 400, "请提供研报主题");
        return true;
      }

      // 支持单 skill 和多 skill 融合
      const allSkillIds = skillIds && Array.isArray(skillIds) && skillIds.length > 0
        ? skillIds
        : skillId ? [skillId] : [];

      if (allSkillIds.length === 0) {
        sendError(response, 400, "请选择使用的分析方法论 (skillId 或 skillIds)");
        return true;
      }
      if (allSkillIds.length > 5) {
        sendError(response, 400, "最多融合5个方法论");
        return true;
      }

      const deps = { aiFetch, normalizeAiUrl, decryptApiKey, config, stockService, getReports };
      const result = await writeReport(topic.trim(), allSkillIds, aiConfig || {}, deps);

      if (!result.success) {
        sendError(response, 500, result.error);
        return true;
      }

      sendJson(response, 200, {
        ok: true,
        report: result.report,
        skillNames: result.skillNames,
        topic: result.topic,
        skillCount: allSkillIds.length,
      });
    } catch (error) {
      sendError(response, 500, `编写失败：${error.message}`);
    }
    return true;
  }

  // ── 列出所有 skill ──
  if (request.method === "GET" && url.pathname === "/api/reports/skills") {
    const skills = await listSkills();
    sendJson(response, 200, { ok: true, skills });
    return true;
  }

  // ── 删除 skill ──
  if (request.method === "DELETE" && url.pathname === "/api/reports/skills") {
    const skillId = url.searchParams.get("id") || "";
    if (!skillId) {
      sendError(response, 400, "请提供 skill id");
      return true;
    }
    const deleted = await deleteSkill(skillId);
    if (!deleted) {
      sendError(response, 404, "Skill 不存在");
      return true;
    }
    sendJson(response, 200, { ok: true, deleted: skillId });
    return true;
  }

  return false;
}

module.exports = { handleReportRoutes };
