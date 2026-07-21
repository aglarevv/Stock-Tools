/**
 * 新闻 & RSS 路由 — 每日时事 / OPML 管理 / 日报 / 周报/月报查询
 *
 * 用法：
 *   const { handleNewsRoutes } = require("./routes/news");
 *   if (await handleNewsRoutes(request, response, url, ctx)) return;
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { generateDailyDigest, clearNewsCache, resolveOpmlPath, resolveDefaultOpmlPath, getUserOpmlPath } = require("../newsDigest");

async function handleNewsRoutes(request, response, url, ctx) {
  const { db, sendJson, sendError, readJsonBody, config } = ctx;

  // ── OPML 读取 ──
  if (request.method === "GET" && url.pathname === "/api/sources/opml") {
    try {
      const loadDefault = url.searchParams.get("default") === "true";
      const opmlPath = loadDefault ? resolveDefaultOpmlPath() : resolveOpmlPath();
      if (!fs.existsSync(opmlPath)) { sendError(response, 404, "OPML 配置文件不存在"); return true; }
      const content = fs.readFileSync(opmlPath, "utf-8");
      sendJson(response, 200, { path: opmlPath, content });
    } catch (error) { sendError(response, 500, `读取 OPML 失败：${error.message}`); }
    return true;
  }

  // ── OPML 保存 ──
  if (request.method === "POST" && url.pathname === "/api/sources/opml") {
    try {
      const body = await readJsonBody(request);
      const { content } = body;
      if (!content || typeof content !== "string" || content.trim().length < 50) {
        sendError(response, 400, "OPML 内容无效（需至少 50 字符的有效 XML）"); return true;
      }
      if (!content.includes("<opml") && !content.includes("<outline")) {
        sendError(response, 400, "内容不是有效的 OPML 格式"); return true;
      }
      const userOpmlPath = getUserOpmlPath();
      const dir = path.dirname(userOpmlPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(userOpmlPath, content, "utf-8");
      clearNewsCache();
      sendJson(response, 200, { ok: true, path: userOpmlPath });
    } catch (error) { sendError(response, 500, `保存 OPML 失败：${error.message}`); }
    return true;
  }

  // ── 每日时事 ──
  if (request.method === "GET" && url.pathname === "/api/daily-news") {
    try {
      const result = await generateDailyDigest(db, ctx.services, require("../keywords.js"));
      const today = new Date().toISOString().slice(0, 10);
      let savedDigest = null;
      try {
        const [rows] = await db.query(
          "SELECT digest, sentiment, source_count AS sourceCount, created_at AS createdAt FROM daily_digests WHERE digest_date = ?",
          [today]
        );
        if (rows.length > 0) savedDigest = rows[0];
      } catch { /* table may not exist yet */ }
      sendJson(response, 200, { ...result, savedDigest });
    } catch (error) { sendError(response, 500, `时事分析失败：${error.message}`); }
    return true;
  }

  // ── 历史日报列表 ──
  if (request.method === "GET" && url.pathname === "/api/daily-digests") {
    try {
      const [rows] = await db.query(
        "SELECT DATE_FORMAT(digest_date, '%Y-%m-%d') AS date, sentiment, source_count AS sourceCount, created_at AS createdAt FROM daily_digests ORDER BY digest_date DESC LIMIT 30"
      );
      sendJson(response, 200, { digests: rows });
    } catch (error) { sendError(response, 500, `查询历史日报失败：${error.message}`); }
    return true;
  }

  // ── 按日期查询日报 ──
  if (request.method === "GET" && url.pathname === "/api/daily-digest") {
    try {
      let dateParam = (url.searchParams.get("date") || "").trim();
      if (dateParam.length >= 10) dateParam = dateParam.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        sendError(response, 400, `请提供有效的日期参数（YYYY-MM-DD），收到：${dateParam || "(空)"}`); return true;
      }
      const [rows] = await db.query(
        "SELECT DATE_FORMAT(digest_date, '%Y-%m-%d') AS date, digest, sentiment, source_count AS sourceCount, articles_json AS articlesJson, created_at AS createdAt FROM daily_digests WHERE digest_date = ?",
        [dateParam]
      );
      if (rows.length === 0) { sendError(response, 404, "该日期暂无保存的日报摘要"); return true; }
      const d = rows[0];
      sendJson(response, 200, {
        date: d.date, digest: d.digest, sentiment: d.sentiment,
        sourceCount: d.sourceCount, createdAt: d.createdAt,
        articles: (() => { try { return JSON.parse(d.articlesJson || "[]"); } catch { return []; } })(),
      });
    } catch (error) { sendError(response, 500, `查询日报失败：${error.message}`); }
    return true;
  }

  // ── 周报/月报列表 ──
  if (request.method === "GET" && url.pathname === "/api/periodic-digests") {
    try {
      const type = url.searchParams.get("type") || "";
      let where = ""; const params = [];
      if (type === "weekly" || type === "monthly") { where = "WHERE digest_type = ?"; params.push(type); }
      const [rows] = await db.query(
        `SELECT id, digest_type AS digestType, period_label AS periodLabel, date_from AS dateFrom, date_to AS dateTo, articles_count AS articlesCount, sentiment, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS createdAt FROM periodic_digests ${where} ORDER BY created_at DESC LIMIT 20`,
        params
      );
      sendJson(response, 200, { digests: rows });
    } catch (error) { sendError(response, 500, `查询失败：${error.message}`); }
    return true;
  }

  // ── 周报/月报详情 ──
  if (request.method === "GET" && url.pathname === "/api/periodic-digest") {
    try {
      const id = Number(url.searchParams.get("id"));
      if (!Number.isFinite(id) || id <= 0) { sendError(response, 400, "需要有效的 id 参数"); return true; }
      const [rows] = await db.query(
        `SELECT id, digest_type AS digestType, period_label AS periodLabel, date_from AS dateFrom, date_to AS dateTo, digest, articles_count AS articlesCount, sentiment, created_at AS createdAt FROM periodic_digests WHERE id = ?`,
        [id]
      );
      if (rows.length === 0) { sendError(response, 404, "记录不存在"); return true; }
      sendJson(response, 200, rows[0]);
    } catch (error) { sendError(response, 500, `查询失败：${error.message}`); }
    return true;
  }

  return false;
}

module.exports = { handleNewsRoutes };
