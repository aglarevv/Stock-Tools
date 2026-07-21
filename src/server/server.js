"use strict";

/**
 * 股票工具箱 — 后端入口
 *
 * 职责：
 * - 启动 HTTP 服务器（端口 8765）
 * - 初始化数据库
 * - 路由分发（API → routes/* · 静态文件 → serveStatic）
 *
 * 架构：
 *   server.js  →  utils.js (配置/加密/工具)
 *             →  database.js (建表/迁移)
 *             →  routes/trade.js (交易计划/复盘/看板)
 *             →  routes/ai.js   (AI 对话/复盘/摘要)
 *             →  routes/stock.js (StockSDK 行情/板块/资金)
 *             →  routes/news.js  (RSS/OPML/日报)
 *             →  routes/settings.js (设置)
 *             →  routes/reports.js (研报分析/编写)
 *             →  routes/marketReview.js (每日AI复盘)
 *             →  services/xuangutong.js (新闻/研报爬取)
 *             →  services/reportAnalyzer.js (研报分析器)
 *             →  newsDigest.js  (每日时事生成器)
 */

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

// ── 核心模块 ──
const db = require("./db");
const {
  aiFetch, encryptApiKey, decryptApiKey, normalizeAiUrl,
  config, mimeTypes, sendJson, sendError,
  readJsonBody, buildTradePlan, buildDailyReview,
} = require("./utils");

const { initDatabase } = require("./database");
const reportAnalyzer = require("./services/reportAnalyzer");

// ── 路由模块 ──
const { handleTradeRoutes } = require("./routes/trade");
const { handleAiRoutes } = require("./routes/ai");
const { handleStockRoutes } = require("./routes/stock");
const { handleNewsRoutes } = require("./routes/news");
const { handleSettingsRoutes } = require("./routes/settings");
const { handleReportRoutes } = require("./routes/reports");
const { handleMarketReviewRoutes } = require("./routes/marketReview");
const { handlePositionRoutes } = require("./routes/positions");

// ── 服务模块 ──
const { stockService } = require("./services/stockSdk.js");
const { parseOPML, fetchRSS } = require("./services/rss.js");
const { classifyArticles, sortArticlesBySOP, detectSentiment, assessMarketSentiment, cleanDigest } = require("./services/classifier.js");

// ── 启动日志 ──
console.log(`[server] Web root: ${config.webRoot} (exists: ${fs.existsSync(config.webRoot)})`);
console.log(`[server] __dirname: ${__dirname}`);
console.log(`[server] RESOURCES_PATH: ${process.env.RESOURCES_PATH || "(not set)"}`);
console.log(`[server] WEB_ROOT env: ${process.env.WEB_ROOT || "(not set)"}`);

// ── 初始化数据库 ──
const databasePromise = initDatabase(db, config).then(() => {
  reportAnalyzer.init(db);
});

// ── 路由上下文（注入给所有路由处理器）─
const ctx = {
  db, config, sendJson, sendError, readJsonBody,
  buildTradePlan, buildDailyReview,
  aiFetch, normalizeAiUrl, decryptApiKey, encryptApiKey,
  stockService,
  services: { parseOPML, fetchRSS, classifyArticles, sortArticlesBySOP, detectSentiment, assessMarketSentiment, cleanDigest },
};

// ── API 路由分发 ──
async function handleApi(request, response, url) {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  // 健康检查
  if (request.method === "GET" && url.pathname === "/api/health") {
    const { dbInitError, dbInitialized } = require("./database");
    const dbStatus = dbInitError ? "error" : dbInitialized ? "ready" : "initializing";
    const currentDbType = dbInitialized ? db.getDbType() : null;
    const cfg = dbInitialized ? db.readConfig() : {};
    sendJson(response, dbStatus === "error" ? 503 : 200, {
      ok: dbStatus !== "error",
      database: dbStatus,
      dbType: currentDbType,
      preferredDbType: cfg.dbType || "sqlite",
      message: dbInitError
        ? `数据库错误：${dbInitError.message}`
        : dbInitialized
          ? `数据库就绪 (${currentDbType})`
          : "数据库初始化中...",
    });
    return;
  }

  // 等待数据库就绪
  try { await databasePromise; }
  catch (error) { sendError(response, 503, `数据库连接失败：${error.message}`); return; }

  // 路由分发
  if (await handleTradeRoutes(request, response, url, ctx)) return;
  if (await handleAiRoutes(request, response, url, ctx)) return;
  if (await handleStockRoutes(request, response, url, ctx)) return;
  if (await handleNewsRoutes(request, response, url, ctx)) return;
  if (await handleSettingsRoutes(request, response, url, ctx)) return;
  if (await handleReportRoutes(request, response, url, ctx)) return;
  if (await handleMarketReviewRoutes(request, response, url, ctx)) return;
  if (await handlePositionRoutes(request, response, url, ctx)) return;

  sendError(response, 404, "API not found");
}

// ── 静态文件服务 ──
function serveStatic(request, response, url) {
  const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const rootPath = path.resolve(config.webRoot);
  const filePath = path.resolve(config.webRoot, `.${requestedPath}`);

  if (filePath !== rootPath && !filePath.startsWith(rootPath + path.sep)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      if (error.code === "ENOENT") {
        console.error(`[static] 404: ${requestedPath} (root: ${config.webRoot})`);
      }
      response.writeHead(error.code === "ENOENT" ? 404 : 500, {
        "Access-Control-Allow-Origin": "*",
      });
      response.end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    });
    response.end(data);
  });
}

// ── 创建服务器 ──
const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);

  if (url.pathname.startsWith("/api/")) {
    handleApi(request, response, url).catch((error) => {
      sendError(response, 500, error.message);
    });
    return;
  }

  serveStatic(request, response, url);
});

server.listen(config.port, "127.0.0.1", () => {
  console.log(`Stock toolbox server running at http://127.0.0.1:${config.port}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${config.port} is already in use. Is another instance running?`);
    process.exit(1);
  }
  throw err;
});

process.on("SIGTERM", () => { server.close(() => process.exit(0)); });
process.on("SIGINT", () => { server.close(() => process.exit(0)); });
