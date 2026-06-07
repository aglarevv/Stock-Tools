"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const db = require("./db");
const keywords = require("./keywords.js");

// AES-256-GCM 加密配置（用于 API Key 安全存储）
const ENC_ALGO = "aes-256-gcm";
const ENC_PASSPHRASE = "stock-toolbox-local-enc-key-2025";
const ENC_SALT = "toolbox-salt";
const ENC_KEY = crypto.pbkdf2Sync(ENC_PASSPHRASE, ENC_SALT, 100000, 32, "sha256");
const ENC_IV_LEN = 12; // GCM recommended IV length
const ENC_TAG_LEN = 16;

function encryptApiKey(plaintext) {
  if (!plaintext) return "";
  const iv = crypto.randomBytes(ENC_IV_LEN);
  const cipher = crypto.createCipheriv(ENC_ALGO, ENC_KEY, iv);
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const tag = cipher.getAuthTag();
  // 格式：iv:tag:ciphertext（均为 base64）
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted}`;
}

function decryptApiKey(ciphertext) {
  if (!ciphertext || !ciphertext.includes(":")) return ciphertext || "";
  const parts = ciphertext.split(":");
  if (parts.length !== 3) return ciphertext;
  try {
    const iv = Buffer.from(parts[0], "base64");
    const tag = Buffer.from(parts[1], "base64");
    const encrypted = parts[2];
    const decipher = crypto.createDecipheriv(ENC_ALGO, ENC_KEY, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encrypted, "base64", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return ciphertext; // 解密失败返回原文（兼容旧数据）
  }
}

// 标准化 AI API URL（兼容 DeepSeek / OpenAI 等不同提供商的常见写法）
function normalizeAiUrl(rawUrl) {
  let url = (rawUrl || "").trim();
  if (!url) return "https://api.openai.com/v1/chat/completions";

  // 去除尾部斜杠
  url = url.replace(/\/+$/, "");

  // 如果只提供了 base URL（没有 chat/completions 路径），自动补全
  if (!url.endsWith("/chat/completions")) {
    // 如果是 deepseek 的常见 base URL
    if (/api\.deepseek\.com/.test(url)) {
      url = url.replace(/\/v1$/, ""); // 去掉末尾的 /v1
      return `${url}/v1/chat/completions`;
    }
    // 其他情况：尝试追加 /v1/chat/completions
    return `${url}/v1/chat/completions`;
  }

  return url;
}

// 解析静态文件根目录（多级回退）
function resolveWebRoot() {
  // 1. 环境变量 WEB_ROOT（Electron 显式传入）
  if (process.env.WEB_ROOT) {
    const p = path.resolve(process.env.WEB_ROOT);
    if (fs.existsSync(p)) return p;
    console.error(`[server] WEB_ROOT 指定的路径不存在: ${p}`);
  }

  // 2. RESOURCES_PATH + /web（Electron extraResources 标准位置）
  if (process.env.RESOURCES_PATH) {
    const p = path.join(process.env.RESOURCES_PATH, "web");
    if (fs.existsSync(p)) return p;
    console.error(`[server] RESOURCES_PATH/web 不存在: ${p}`);
  }

  // 3. 相对于 server.js 自身位置的 ../web（extraResources 共存目录）
  const sibling = path.resolve(__dirname, "..", "web");
  if (fs.existsSync(sibling)) return sibling;

  // 4. 回退到绝对路径（开发环境）
  const devPath = path.resolve(__dirname, "..", "..", "react-app", "dist");
  if (fs.existsSync(devPath)) return devPath;

  console.error(`[server] ⚠️  所有 webRoot 回退路径均不存在！静态文件将无法提供。`);
  console.error(`[server]    __dirname = ${__dirname}`);
  return sibling; // 最后一个尝试过的路径
}

const config = {
  port: Number(process.env.PORT || 8765),
  webRoot: resolveWebRoot(),
  ai: {
    url: process.env.AI_API_URL || "https://api.openai.com/v1/chat/completions",
    key: process.env.AI_API_KEY || "",
    model: process.env.AI_MODEL || "gpt-4o-mini",
  },
  mysql: {
    host: process.env.MYSQL_HOST || "localhost",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "rootroot",
    database: process.env.MYSQL_DATABASE || "stock_toolbox",
  },
};

// 启动时输出关键路径信息，方便排查"Not found"问题
console.log(`[server] Web root: ${config.webRoot} (exists: ${fs.existsSync(config.webRoot)})`);
console.log(`[server] __dirname: ${__dirname}`);
console.log(`[server] RESOURCES_PATH: ${process.env.RESOURCES_PATH || "(not set)"}`);
console.log(`[server] WEB_ROOT env: ${process.env.WEB_ROOT || "(not set)"}`);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

let dbInitError = null;
let dbInitialized = false;
const dbReady = initializeDatabase().catch((error) => {
  dbInitError = error;
  console.error("数据库初始化失败:", error.message);
  // 不重新抛出，让服务器继续运行（API 调用时会返回 503）
});

/**
 * 将 config.json 中的设置同步到当前数据库的 app_settings 表
 * 这是跨数据库引擎迁移的关键步骤：
 * - 用户从 SQLite 切换到 MySQL 后，新数据库的 app_settings 为空
 * - config.json 中保留了之前保存的所有设置
 * - 此函数将 config.json → app_settings，确保设置不丢失
 */
async function syncSettingsFromConfig() {
  try {
    const cfg = db.readConfig();
    const syncKeys = ["theme", "aiUrl", "aiModel", "aiTemperature", "aiThinking", "dbType"];
    let synced = 0;
    for (const key of syncKeys) {
      if (cfg[key] === undefined || cfg[key] === null) continue;
      const strValue = String(cfg[key]);
      await db.execute(
        `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE
           setting_value = VALUES(setting_value),
           updated_at = CURRENT_TIMESTAMP`,
        [key, strValue]
      );
      synced++;
    }
    if (synced > 0) {
      console.log(`[server] 从 config.json 同步了 ${synced} 项设置到 app_settings`);
    }
  } catch (err) {
    console.warn("[server] config.json → app_settings 同步失败:", err.message);
  }
}

async function initializeDatabase() {
  await db.initialize(config);

  // 创建交易计划表
  await db.execute(`
    CREATE TABLE IF NOT EXISTS trade_plans (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      symbol VARCHAR(64) NOT NULL,
      buy_price DECIMAL(18, 4) NOT NULL,
      shares INT UNSIGNED NOT NULL,
      profit_rate DECIMAL(10, 4) NOT NULL,
      loss_rate DECIMAL(10, 4) NOT NULL,
      fee_rate DECIMAL(10, 4) NOT NULL,
      stop_loss_price DECIMAL(18, 4) NOT NULL,
      take_profit_price DECIMAL(18, 4) NOT NULL,
      position_cost DECIMAL(18, 4) NOT NULL,
      expected_profit DECIMAL(18, 4) NOT NULL,
      expected_loss DECIMAL(18, 4) NOT NULL,
      risk_reward DECIMAL(18, 4) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_trade_plans_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 创建每日复盘表
  await db.execute(`
    CREATE TABLE IF NOT EXISTS daily_reviews (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      review_date DATE NOT NULL,
      symbol VARCHAR(64) NOT NULL,
      buy_signal TEXT NOT NULL,
      holding_style VARCHAR(64) NOT NULL,
      sell_signal TEXT NOT NULL,
      buy_price DECIMAL(18, 4) NOT NULL,
      sell_price DECIMAL(18, 4) NULL,
      shares INT UNSIGNED NOT NULL,
      pnl_amount DECIMAL(18, 4) NOT NULL,
      pnl_rate DECIMAL(10, 4) NOT NULL,
      index_judgment TEXT NOT NULL,
      volume_judgment TEXT NOT NULL,
      sentiment_judgment TEXT NOT NULL,
      capital_direction TEXT NOT NULL,
      leading_sectors TEXT NOT NULL,
      lagging_sectors TEXT NOT NULL,
      sustainability TEXT NOT NULL,
      stock_strength TEXT NOT NULL,
      vol_amp_ranking TEXT NOT NULL,
      limit_analysis TEXT NOT NULL,
      operation_reason TEXT NOT NULL,
      profit_attribution TEXT NOT NULL,
      loss_attribution TEXT NOT NULL,
      execution_notes TEXT NOT NULL,
      improvement_plan TEXT NOT NULL,
      market_plan TEXT NOT NULL,
      position_plan TEXT NOT NULL,
      new_candidates TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_review_date (review_date),
      KEY idx_review_symbol (symbol),
      KEY idx_review_date_symbol (review_date, symbol)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await enforceUniqueSymbols();

  // 迁移旧表结构——添加新列（如不存在）
  await migrateDailyReviewsTable();

  // 迁移 trade_plans 新字段
  for (const col of [
    "trade_direction",
    "position_pct",
    "trade_notes",
  ]) {
    if (!(await db.columnExists("trade_plans", col))) {
      const defs = {
        trade_direction: { type: "VARCHAR(8) NOT NULL", fallback: "long" },
        position_pct: { type: "DECIMAL(5,2) NOT NULL", fallback: "100" },
        trade_notes: { type: "TEXT NOT NULL", fallback: "" },
      };
      await db.addColumnIfNotExists("trade_plans", col, defs[col].type, defs[col].fallback);
    }
  }

  // 应用设置表
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 将 config.json 中保存的设置同步到 app_settings（跨数据库引擎迁移保障）
  await syncSettingsFromConfig();

  // 每日日报摘要持久化表
  await db.execute(`
    CREATE TABLE IF NOT EXISTS daily_digests (
      digest_date DATE NOT NULL PRIMARY KEY,
      digest TEXT NOT NULL,
      articles_json LONGTEXT,
      source_count INT NOT NULL DEFAULT 0,
      sentiment VARCHAR(64),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 文章去重表：记录已用于日报的 RSS 文章链接（通过 link hash 去重）
  await db.execute(`
    CREATE TABLE IF NOT EXISTS rss_article_links (
      link_hash VARCHAR(64) NOT NULL PRIMARY KEY,
      first_seen_date DATE NOT NULL,
      last_seen_date DATE NOT NULL,
      KEY idx_last_seen (last_seen_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 周报/月报精选持久化表
  await db.execute(`
    CREATE TABLE IF NOT EXISTS periodic_digests (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      digest_type VARCHAR(16) NOT NULL COMMENT 'weekly | monthly',
      period_label VARCHAR(64) NOT NULL COMMENT '如 "2026年第23周" 或 "2026年6月"',
      date_from DATE NOT NULL,
      date_to DATE NOT NULL,
      digest TEXT NOT NULL,
      articles_count INT NOT NULL DEFAULT 0,
      sentiment VARCHAR(64),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_type_created (digest_type, created_at DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  dbInitialized = true;
  console.log(`[server] 数据库初始化完成 (${db.getDbType()})`);
}

// ── 清理过期的文章链接记录（保留最近 N 天，防止表无限膨胀） ──
async function cleanupOldArticleLinks(retentionDays = 14) {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const dateStr = cutoff.toISOString().slice(0, 10);
    await db.execute("DELETE FROM rss_article_links WHERE last_seen_date < ?", [dateStr]);
  } catch (e) {
    console.error("[server] 清理旧文章链接失败:", e.message);
  }
}

// ── 对文章列表进行去重：仅返回未曾在日报中使用过的新文章 ──
async function filterNewArticles(articles) {
  const newArticles = [];
  const seenLinks = new Set();
  for (const article of articles) {
    const link = (article.link || "").trim();
    if (!link) { newArticles.push(article); continue; }
    const hash = crypto.createHash("sha256").update(link).digest("hex").slice(0, 16);
    if (seenLinks.has(hash)) continue;
    seenLinks.add(hash);
    try {
      const [rows] = await db.query("SELECT link_hash FROM rss_article_links WHERE link_hash = ?", [hash]);
      if (rows.length === 0) newArticles.push(article);
    } catch { newArticles.push(article); }
  }
  return newArticles;
}

async function migrateDailyReviewsTable() {
  const newColumns = [
    { name: "index_judgment", type: "TEXT NOT NULL", fallback: "''" },
    { name: "volume_judgment", type: "TEXT NOT NULL", fallback: "''" },
    { name: "sentiment_judgment", type: "TEXT NOT NULL", fallback: "''" },
    { name: "capital_direction", type: "TEXT NOT NULL", fallback: "''" },
    { name: "leading_sectors", type: "TEXT NOT NULL", fallback: "''" },
    { name: "lagging_sectors", type: "TEXT NOT NULL", fallback: "''" },
    { name: "sustainability", type: "TEXT NOT NULL", fallback: "''" },
    { name: "stock_strength", type: "TEXT NOT NULL", fallback: "''" },
    { name: "vol_amp_ranking", type: "TEXT NOT NULL", fallback: "''" },
    { name: "limit_analysis", type: "TEXT NOT NULL", fallback: "''" },
    { name: "operation_reason", type: "TEXT NOT NULL", fallback: "''" },
    { name: "profit_attribution", type: "TEXT NOT NULL", fallback: "''" },
    { name: "loss_attribution", type: "TEXT NOT NULL", fallback: "''" },
    { name: "market_plan", type: "TEXT NOT NULL", fallback: "''" },
    { name: "position_plan", type: "TEXT NOT NULL", fallback: "''" },
    { name: "new_candidates", type: "TEXT NOT NULL", fallback: "''" },
  ];

  for (const col of newColumns) {
    await db.addColumnIfNotExists("daily_reviews", col.name, col.type, col.fallback === "''" ? "" : col.fallback);
  }

  // SQLite 不支持 MODIFY COLUMN，仅在 MySQL 下执行
  if (db.isMySQL()) {
    const alterColumns = [
      "MODIFY COLUMN buy_signal TEXT NOT NULL",
      "MODIFY COLUMN sell_signal TEXT NOT NULL",
    ];
    for (const alter of alterColumns) {
      await db.modifyColumnIfNeeded("daily_reviews", alter.split(" ")[2], "TEXT NOT NULL");
    }
  }

  // 删除旧列
  const oldColumns = ["market_context", "mistake_notes", "next_action"];
  for (const col of oldColumns) {
    await db.dropColumnIfExists("daily_reviews", col);
  }
}

async function enforceUniqueSymbols() {
  // MySQL 不允许在 DELETE 子查询中直接引用同一张表，需要套一层派生表
  await db.execute(`
    DELETE FROM trade_plans
    WHERE id NOT IN (
      SELECT id FROM (
        SELECT MIN(id) AS id FROM trade_plans GROUP BY symbol
      ) AS tmp
    )
  `);

  await db.addUniqueIndexIfMissing("trade_plans", "uniq_trade_plans_symbol", "symbol");
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store, no-cache, must-revalidate",
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, statusCode, message) {
  sendJson(response, statusCode, { error: message });
}

function toFiniteNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${name} must be a finite number`);
  }
  return number;
}

function toOptionalNumber(value, name) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return toFiniteNumber(value, name);
}

function cleanText(value, fallback = "", maxLength = 2000) {
  const text = String(value ?? fallback).trim();
  return (text || fallback).slice(0, maxLength);
}

function todayDateString() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function buildTradePlan(input) {
  const symbol = String(input.symbol || "自选股").trim().slice(0, 64) || "自选股";
  const buyPrice = Math.max(0, toFiniteNumber(input.buyPrice, "buyPrice"));
  const shares = Math.max(0, Math.floor(toFiniteNumber(input.shares, "shares")));
  const profitRate = Math.max(0, toFiniteNumber(input.profitRate, "profitRate"));
  const lossRate = Math.max(0, toFiniteNumber(input.lossRate, "lossRate"));
  const feeRate = Math.max(0, toFiniteNumber(input.feeRate, "feeRate"));
  const takeProfitPrice = buyPrice * (1 + profitRate / 100);
  const stopLossPrice = Math.max(0, buyPrice * (1 - lossRate / 100));
  const buyFee = buyPrice * shares * (feeRate / 100);
  const takeProfitFee = takeProfitPrice * shares * (feeRate / 100);
  const stopLossFee = stopLossPrice * shares * (feeRate / 100);
  const positionCost = buyPrice * shares + buyFee;
  const expectedProfit = (takeProfitPrice - buyPrice) * shares - buyFee - takeProfitFee;
  const expectedLoss = (buyPrice - stopLossPrice) * shares + buyFee + stopLossFee;
  const riskReward = lossRate > 0 ? profitRate / lossRate : 0;

  if (buyPrice <= 0) {
    throw new Error("买入价必须大于 0");
  }

  const tradeDirection = String(input.tradeDirection || "long").trim() === "short" ? "short" : "long";
  const positionPct = Math.min(100, Math.max(1, Math.floor(toFiniteNumber(input.positionPct, "positionPct"))));
  const tradeNotes = cleanText(input.tradeNotes, "", 2000);

  return {
    symbol, buyPrice, shares, profitRate, lossRate, feeRate,
    stopLossPrice, takeProfitPrice, positionCost,
    expectedProfit, expectedLoss, riskReward,
    tradeDirection, positionPct, tradeNotes,
  };
}

function buildDailyReview(input) {
  const reviewDate = /^\d{4}-\d{2}-\d{2}$/.test(String(input.reviewDate || ""))
    ? String(input.reviewDate)
    : todayDateString();
  const symbol = cleanText(input.symbol, "自选股", 64);
  const holdingStyle = cleanText(input.holdingStyle, "短线", 64);
  const buySignal = cleanText(input.buySignal, "", 2000);
  const sellSignal = cleanText(input.sellSignal, "", 2000);
  const buyPrice = Math.max(0, toFiniteNumber(input.buyPrice, "buyPrice"));
  const sellPriceValue = toOptionalNumber(input.sellPrice, "sellPrice");
  const sellPrice = sellPriceValue === null ? null : Math.max(0, sellPriceValue);
  const shares = Math.max(0, Math.floor(toFiniteNumber(input.shares, "shares")));
  const pnlAmount = sellPrice === null ? 0 : (sellPrice - buyPrice) * shares;
  const pnlRate = sellPrice === null || buyPrice <= 0 ? 0 : ((sellPrice - buyPrice) / buyPrice) * 100;

  if (buyPrice <= 0) {
    throw new Error("买入价格必须大于 0");
  }

  const text = (key) => cleanText(input[key], "", 5000);

  return {
    reviewDate, symbol, buySignal, holdingStyle, sellSignal,
    buyPrice, sellPrice, shares, pnlAmount, pnlRate,
    indexJudgment: text("indexJudgment"),
    volumeJudgment: text("volumeJudgment"),
    sentimentJudgment: text("sentimentJudgment"),
    capitalDirection: text("capitalDirection"),
    leadingSectors: text("leadingSectors"),
    laggingSectors: text("laggingSectors"),
    sustainability: text("sustainability"),
    stockStrength: text("stockStrength"),
    volAmpRanking: text("volAmpRanking"),
    limitAnalysis: text("limitAnalysis"),
    operationReason: text("operationReason"),
    profitAttribution: text("profitAttribution"),
    lossAttribution: text("lossAttribution"),
    executionNotes: text("executionNotes"),
    improvementPlan: text("improvementPlan"),
    marketPlan: text("marketPlan"),
    positionPlan: text("positionPlan"),
    newCandidates: text("newCandidates"),
  };
}

async function readJsonBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 20 * 1024 * 1024) {
      throw new Error("请求体过大（最大 15MB）");
    }
  }
  return body ? JSON.parse(body) : {};
}

async function handleApi(request, response, url) {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    const dbStatus = dbInitError ? "error" : dbInitialized ? "ready" : "initializing";
    const currentDbType = dbInitialized ? db.getDbType() : null;
    const config = dbInitialized ? db.readConfig() : {};
    sendJson(response, dbStatus === "error" ? 503 : 200, {
      ok: dbStatus !== "error",
      database: dbStatus,
      dbType: currentDbType,
      preferredDbType: config.dbType || "sqlite",
      message: dbInitError
        ? `数据库错误：${dbInitError.message}`
        : dbInitialized
          ? `数据库就绪 (${currentDbType})`
          : "数据库初始化中...",
    });
    return;
  }

  try {
    await dbReady;
  } catch (error) {
    sendError(response, 503, `数据库连接失败：${error.message}`);
    return;
  }

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
          plan.symbol,
          plan.buyPrice,
          plan.shares,
          plan.profitRate,
          plan.lossRate,
          plan.feeRate,
          plan.stopLossPrice,
          plan.takeProfitPrice,
          plan.positionCost,
          plan.expectedProfit,
          plan.expectedLoss,
          plan.riskReward,
          plan.tradeDirection,
          plan.positionPct,
          plan.tradeNotes,
        ],
        "symbol",
      );
      sendJson(response, action === "created" ? 201 : 200, { action, id: result.insertId, ...plan });
    } catch (error) {
      sendError(response, 400, error.message);
    }
    return;
  }

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
    return;
  }

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
          market_plan, position_plan, new_candidates
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          review.reviewDate, review.symbol, review.buySignal, review.holdingStyle, review.sellSignal,
          review.buyPrice, review.sellPrice, review.shares, review.pnlAmount, review.pnlRate,
          review.indexJudgment, review.volumeJudgment, review.sentimentJudgment, review.capitalDirection,
          review.leadingSectors, review.laggingSectors, review.sustainability,
          review.stockStrength, review.volAmpRanking, review.limitAnalysis,
          review.operationReason, review.profitAttribution, review.lossAttribution,
          review.executionNotes, review.improvementPlan,
          review.marketPlan, review.positionPlan, review.newCandidates,
        ],
      );
      sendJson(response, 201, { action: "created", id: result.insertId, ...review });
    } catch (error) {
      sendError(response, 400, error.message);
    }
    return;
  }

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
        created_at AS createdAt, updated_at AS updatedAt
      FROM daily_reviews
      WHERE 1=1 ${where}
      ORDER BY review_date DESC, id DESC
      LIMIT ?`,
      params,
    );
    sendJson(response, 200, { records: rows });
    return;
  }

  // 看板统计 API
  if (request.method === "GET" && url.pathname === "/api/dashboard") {
    try {
      const [[{ totalPlans }]] = await db.query("SELECT COUNT(*) AS totalPlans FROM trade_plans");
      const [[{ totalReviews }]] = await db.query("SELECT COUNT(*) AS totalReviews FROM daily_reviews");
      const [[{ totalProfit, totalLoss, winCount, lossCount }]] = await db.query(
        `SELECT
          COALESCE(SUM(CASE WHEN pnl_amount > 0 THEN pnl_amount ELSE 0 END), 0) AS totalProfit,
          COALESCE(SUM(CASE WHEN pnl_amount < 0 THEN pnl_amount ELSE 0 END), 0) AS totalLoss,
          SUM(CASE WHEN pnl_amount > 0 THEN 1 ELSE 0 END) AS winCount,
          SUM(CASE WHEN pnl_amount < 0 THEN 1 ELSE 0 END) AS lossCount
        FROM daily_reviews WHERE sell_price IS NOT NULL`,
      );

      // 最近复盘
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
        FROM daily_reviews ORDER BY review_date DESC, id DESC LIMIT 5`,
      );

      // 最近交易计划
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
        winCount: Number(winCount),
        lossCount: Number(lossCount),
        winRate: (Number(winCount) + Number(lossCount)) > 0
          ? Math.round((Number(winCount) / (Number(winCount) + Number(lossCount))) * 100)
          : 0,
        netPnl: Number(totalProfit) + Number(totalLoss),
        recentReviews,
        recentPlans,
      });
    } catch (error) {
      sendError(response, 500, `看板数据获取失败：${error.message}`);
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/ai/chat") {
    try {
      const body = await readJsonBody(request);
      const { reviewData, messages, aiConfig } = body;

      // 优先使用客户端配置，回退到服务端环境变量
      const aiUrl = normalizeAiUrl(aiConfig?.url || config.ai.url);
      const aiKey = (aiConfig?.key) || decryptApiKey(config.ai.key) || config.ai.key;
      const aiModel = (aiConfig?.model) || config.ai.model;
      const aiTemp = aiConfig?.temperature ?? 0.7;
      // DeepSeek 思考模式（deepseek-reasoner / deepseek-chat 均支持）
      const enableThinking = aiConfig?.thinking !== false;

      if (!aiKey) {
        sendError(response, 503, "未配置 AI_API_KEY，请在设置页或环境变量中配置");
        return;
      }

      // 构建 API messages 数组
      const apiMessages = [];

      // 系统提示词
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

      systemPrompt += "\n\n请用中文回答，简洁专业。";
      apiMessages.push({ role: "system", content: systemPrompt });

      // 拼接多轮对话历史
      if (Array.isArray(messages) && messages.length > 0) {
        for (const m of messages) {
          if (m.role === "user") {
            apiMessages.push({ role: "user", content: m.text || "" });
          } else if (m.role === "bot") {
            apiMessages.push({ role: "assistant", content: m.text || "" });
          }
        }
      }

      // 构建请求体
      const aiRequestBody = {
        model: aiModel,
        messages: apiMessages,
        max_tokens: 4000,
      };

      // DeepSeek 思考模式（原生 HTTP 格式，非 SDK 的 extra_body）
      if (enableThinking && /deepseek/i.test(aiModel)) {
        aiRequestBody.thinking = { type: "enabled" };
      } else {
        aiRequestBody.temperature = aiTemp;
      }

      const aiResponse = await fetch(aiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${aiKey}`,
        },
        body: JSON.stringify(aiRequestBody),
      });

      if (!aiResponse.ok) {
        const errText = await aiResponse.text().catch(() => "未知错误");
        console.error("AI API error:", aiResponse.status, errText.substring(0, 300));
        sendError(response, 502, `AI 服务返回错误 (${aiResponse.status})`);
        return;
      }

      const aiData = await aiResponse.json();
      const choice = aiData?.choices?.[0]?.message || {};
      const reply = choice.content || "";

      sendJson(response, 200, { reply });
    } catch (error) {
      console.error("AI chat error:", error);
      sendError(response, 500, `AI 请求失败：${error.message}`);
    }
    return;
  }

  // 文件解析 API（支持 pdf / docx / txt / md）
  if (request.method === "POST" && url.pathname === "/api/ai/parse-file") {
    try {
      const body = await readJsonBody(request);
      const { fileName, content, mimeType } = body;

      if (!content) {
        sendError(response, 400, "缺少文件内容");
        return;
      }

      // 限制解码后大小 15MB（base64 编码后约 20MB）
      if (content.length > 20 * 1024 * 1024) {
        sendError(response, 400, "文件过大（最大 10MB）");
        return;
      }

      const buffer = Buffer.from(content, "base64");
      const ext = path.extname(fileName || "").toLowerCase();
      let text = "";

      if (ext === ".txt" || ext === ".md" || mimeType === "text/plain" || mimeType === "text/markdown") {
        text = buffer.toString("utf-8").slice(0, 50000);
      } else if (ext === ".docx" || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        // Word (docx) 解析
        try {
          const mammoth = require("mammoth");
          const result = await mammoth.extractRawText({ buffer });
          text = result.value.slice(0, 50000);
        } catch (e) {
          sendError(response, 400, `Word 文件解析失败：${e.message}`);
          return;
        }
      } else if (ext === ".pdf" || mimeType === "application/pdf") {
        // PDF 解析
        try {
          const pdfParse = require("pdf-parse");
          const data = await pdfParse(buffer);
          text = data.text.slice(0, 50000);
        } catch (e) {
          sendError(response, 400, `PDF 文件解析失败：${e.message}`);
          return;
        }
      } else {
        sendError(response, 400, `不支持的文件格式（支持：pdf / docx / txt / md）`);
        return;
      }

      if (!text.trim()) {
        sendError(response, 400, "文件中未提取到文本内容");
        return;
      }

      sendJson(response, 200, { fileName, text, length: text.length });
    } catch (error) {
      sendError(response, 500, `文件解析失败：${error.message}`);
    }
    return;
  }

  // ── RSS 源管理 API ──
  // 读取当前 OPML 内容（?default=true 时读取捆绑的默认 OPML）
  if (request.method === "GET" && url.pathname === "/api/sources/opml") {
    try {
      const loadDefault = url.searchParams.get("default") === "true";
      const opmlPath = loadDefault ? resolveDefaultOpmlPath() : resolveOpmlPath();
      if (!fs.existsSync(opmlPath)) {
        sendError(response, 404, "OPML 配置文件不存在");
        return;
      }
      const content = fs.readFileSync(opmlPath, "utf-8");
      sendJson(response, 200, { path: opmlPath, content });
    } catch (error) {
      sendError(response, 500, `读取 OPML 失败：${error.message}`);
    }
    return;
  }

  // 保存/上传 OPML 内容（覆盖 sources.opml）
  if (request.method === "POST" && url.pathname === "/api/sources/opml") {
    try {
      const body = await readJsonBody(request);
      const { content } = body;
      if (!content || typeof content !== "string" || content.trim().length < 50) {
        sendError(response, 400, "OPML 内容无效（需至少 50 字符的有效 XML）");
        return;
      }
      if (!content.includes("<opml") && !content.includes("<outline")) {
        sendError(response, 400, "内容不是有效的 OPML 格式");
        return;
      }

      // 写入用户数据目录（优先），不存在则写 Resources/
      const userOpmlPath = getUserOpmlPath();
      const dir = path.dirname(userOpmlPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(userOpmlPath, content, "utf-8");

      // 清除缓存，下次请求时重新加载
      newsCache = { date: "", data: null };

      sendJson(response, 200, { ok: true, path: userOpmlPath });
    } catch (error) {
      sendError(response, 500, `保存 OPML 失败：${error.message}`);
    }
    return;
  }

  // 每日时事 API — 解析 sources.opml → 提取 RSS → 3-SOP 分析（含已保存摘要）
  if (request.method === "GET" && url.pathname === "/api/daily-news") {
    try {
      const result = await generateDailyDigest();
      // 查询今日是否已有保存的 AI 摘要
      const today = new Date().toISOString().slice(0, 10);
      let savedDigest = null;
      try {
        const [rows] = await db.query(
          "SELECT digest, sentiment, source_count AS sourceCount, created_at AS createdAt FROM daily_digests WHERE digest_date = ?",
          [today]
        );
        if (rows.length > 0) savedDigest = rows[0];
      } catch { /* 表可能尚未创建 */ }
      sendJson(response, 200, { ...result, savedDigest });
    } catch (error) {
      sendError(response, 500, `时事分析失败：${error.message}`);
    }
    return;
  }

  // 历史日报列表 API — 返回所有已保存的 AI 摘要日期列表
  if (request.method === "GET" && url.pathname === "/api/daily-digests") {
    try {
      const [rows] = await db.query(
        "SELECT DATE_FORMAT(digest_date, '%Y-%m-%d') AS date, sentiment, source_count AS sourceCount, created_at AS createdAt FROM daily_digests ORDER BY digest_date DESC LIMIT 30"
      );
      sendJson(response, 200, { digests: rows });
    } catch (error) {
      sendError(response, 500, `查询历史日报失败：${error.message}`);
    }
    return;
  }

  // 按日期查询单日日报
  if (request.method === "GET" && url.pathname === "/api/daily-digest") {
    try {
      let dateParam = (url.searchParams.get("date") || "").trim();
      // 兼容 ISO 格式（取前10位）、空值等
      if (dateParam.length >= 10) dateParam = dateParam.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        sendError(response, 400, `请提供有效的日期参数（YYYY-MM-DD），收到：${dateParam || "(空)"}`);
        return;
      }
      const [rows] = await db.query(
        "SELECT DATE_FORMAT(digest_date, '%Y-%m-%d') AS date, digest, sentiment, source_count AS sourceCount, articles_json AS articlesJson, created_at AS createdAt FROM daily_digests WHERE digest_date = ?",
        [dateParam]
      );
      if (rows.length === 0) {
        sendError(response, 404, "该日期暂无保存的日报摘要");
        return;
      }
      const d = rows[0];
      sendJson(response, 200, {
        date: d.date,
        digest: d.digest,
        sentiment: d.sentiment,
        sourceCount: d.sourceCount,
        createdAt: d.createdAt,
        articles: (() => { try { return JSON.parse(d.articlesJson || "[]"); } catch { return []; } })(),
      });
    } catch (error) {
      sendError(response, 500, `查询日报失败：${error.message}`);
    }
    return;
  }

  // 每日时事 AI 摘要 — 3-SOP 日报（字数不限 + 来源引用 + 持久化）
  if (request.method === "POST" && url.pathname === "/api/ai/daily-digest") {
    try {
      const body = await readJsonBody(request);
      const { articles, aiConfig: ac } = body;

      if (!Array.isArray(articles) || articles.length === 0) {
        sendError(response, 400, "缺少文章数据");
        return;
      }

      const aiUrl = normalizeAiUrl(ac?.url || config.ai.url);
      const aiKey = (ac?.key) || decryptApiKey(config.ai.key) || config.ai.key;
      const aiModel = (ac?.model) || config.ai.model;
      const enableThinking = ac?.thinking !== false;

      if (!aiKey) {
        sendError(response, 503, "未配置 AI_API_KEY，请在设置页中配置");
        return;
      }

      // 构建带索引的文章列表（按 SOP 分组，确保 [来源N] 编号与前端角标一致）
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
      const sop1Text = buildSection("SOP 1 深度洞察 — 长期逻辑·商业模式·宏观定调（投资的 Why 和 What）", sopGroups.sop1, idx);
      idx += sopGroups.sop1.length;
      const sop2Text = buildSection("SOP 2 势能扫描 — 资金流向·评级调整·突发热点（投资的 When 和 Where）", sopGroups.sop2, idx);
      idx += sopGroups.sop2.length;
      const sop3Text = buildSection("SOP 3 区域/垂类 — 查漏补缺·特定机会·技术前沿（投资的 How 和 Next）", sopGroups.sop3, idx);

      const systemPrompt = `你是一位专业的中国A股市场与全球宏观研究分析师。请根据以下按3-SOP体系采集的财经新闻，撰写一份约500字的中文每日市场日报摘要。

## 写作要求
1. **结构严格按 3-SOP**：
   - **SOP 1 深度洞察**：聚焦长期逻辑、商业模式变化、宏观政策定调，回答投资的"Why"和"What"
   - **SOP 2 势能扫描**：聚焦资金流向、机构评级调整、突发市场热点，回答投资的"When"和"Where"
   - **SOP 3 区域/垂类**：聚焦细分机会、技术前沿突破、区域市场动态，回答投资的"How"和"Next"

2. **中国股市重点**：对可能影响A股/港股的事件详细描述，明确标注利空/利好方向及其逻辑
3. **来源引用**：每个关键判断和核心数据必须在句末用 [来源N] 标注出处
4. **结语展望**：一句话总结当日核心矛盾 + 对下一交易日的简短展望
5. 语言简洁专业，总字数控制在500字左右，不使用 Markdown 标题符号

以下是今日采集的文章：${sop1Text}${sop2Text}${sop3Text}`;

      const aiRequestBody = {
        model: aiModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "请按3-SOP结构撰写今日日报摘要（字数不限、逻辑完整），重点分析对中国股市的利空/利好影响，所有关键信息标注来源编号。用**粗体**标注重要概念和判断。" },
        ],
        max_tokens: 4000,
      };

      if (enableThinking && /deepseek/i.test(aiModel)) {
        aiRequestBody.thinking = { type: "enabled" };
      } else {
        aiRequestBody.temperature = 0.5;
      }

      const aiResponse = await fetch(aiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${aiKey}`,
        },
        body: JSON.stringify(aiRequestBody),
      });

      if (!aiResponse.ok) {
        const errText = await aiResponse.text().catch(() => "未知错误");
        console.error("Daily digest AI error:", aiResponse.status, errText.substring(0, 300));
        sendError(response, 502, `AI 服务返回错误 (${aiResponse.status})`);
        return;
      }

      const aiData = await aiResponse.json();
      let digest = aiData?.choices?.[0]?.message?.content || "";

      // ── 清洗 AI 输出：去除多余尾注和分隔标记 ──
      digest = cleanDigest(digest);

      // 持久化保存到数据库（articles 按 SOP 排序，与 AI 摘要角标编号一致）
      try {
        const today = new Date().toISOString().slice(0, 10);
        let bullish = 0, bearish = 0;
        for (const a of articles) {
          if (a.sentiment === "利好") bullish++;
          else if (a.sentiment === "利空") bearish++;
        }
        const sentimentLabel = bullish > bearish * 1.5 ? "偏乐观" : bearish > bullish * 1.5 ? "偏悲观" : "中性";
        const sortedArticles = sortArticlesBySOP(articles);
        await db.execute(
          `INSERT INTO daily_digests (digest_date, digest, articles_json, source_count, sentiment)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE digest = VALUES(digest), articles_json = VALUES(articles_json),
           source_count = VALUES(source_count), sentiment = VALUES(sentiment)`,
          [today, digest, JSON.stringify(sortedArticles), articles.length, sentimentLabel]
        );

        // 记录本次用到的文章链接，供次日去重使用
        for (const article of sortedArticles) {
          const link = (article.link || "").trim();
          if (!link) continue;
          const hash = crypto.createHash("sha256").update(link).digest("hex").slice(0, 16);
          try {
            await db.execute(
              `INSERT INTO rss_article_links (link_hash, first_seen_date, last_seen_date) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE last_seen_date = VALUES(last_seen_date)`,
              [hash, today, today]
            );
          } catch { /* 单个链接记录失败不影响主流程 */ }
        }
        cleanupOldArticleLinks().catch(() => {});
      } catch (e) {
        console.error("保存日报摘要失败:", e.message);
      }

      sendJson(response, 200, { digest });
    } catch (error) {
      console.error("Daily digest error:", error);
      sendError(response, 500, `AI 摘要生成失败：${error.message}`);
    }
    return;
  }

  // 设置读写 API
  if (request.method === "GET" && url.pathname === "/api/settings") {
    try {
      const [rows] = await db.query("SELECT setting_key AS settingKey, setting_value AS settingValue FROM app_settings");
      const settings = {};
      for (const row of rows) {
        let val = row.settingValue;
        // API Key 解密后返回
        if (row.settingKey === "aiKey" && val) {
          val = decryptApiKey(val);
        }
        settings[row.settingKey] = val;
      }

      // 从 config.json 合并缺失的设置（跨数据库引擎持久化保障）
      // 场景：用户从 SQLite 切换到 MySQL 后，app_settings 为空表，config.json 中保留了之前的设置
      try {
        const cfg = db.readConfig();
        const configFallbackKeys = ["theme", "aiUrl", "aiModel", "aiTemperature", "aiThinking", "dbType"];
        for (const key of configFallbackKeys) {
          if (!settings[key] && cfg[key] !== undefined) {
            settings[key] = String(cfg[key]);
          }
        }
      } catch { /* config.json 读取失败，忽略 */ }

      sendJson(response, 200, { settings });
    } catch (error) {
      sendError(response, 500, `读取设置失败：${error.message}`);
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/settings") {
    try {
      const body = await readJsonBody(request);
      const { settings } = body;
      if (!settings || typeof settings !== "object") {
        sendError(response, 400, "请求体需包含 settings 对象");
        return;
      }

      const allowedKeys = [
        "theme", "aiUrl", "aiKey", "aiModel", "aiTemperature", "aiThinking",
        "dbHost", "dbPort", "dbUser", "dbPassword", "dbName", "dbType",
      ];

      // ── 第一步：将所有设置写入 app_settings 表（当前数据库） ──
      for (const [key, value] of Object.entries(settings)) {
        if (!allowedKeys.includes(key)) continue;
        let strValue = String(value ?? "");
        // API Key 加密后存储
        if (key === "aiKey" && strValue) {
          strValue = encryptApiKey(strValue);
        }
        await db.execute(
          `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP`,
          [key, strValue],
        );
      }

      // ── 第二步：将所有设置写入 config.json（数据库无关，跨引擎持久化） ──
      // config.json 是设置的**权威持久化存储**，确保切换数据库引擎后设置不丢失
      let dbTypeChanged = false;
      const cfgUpdate = {};

      // 写入所有非敏感设置到 config.json
      for (const key of ["theme", "aiUrl", "aiModel", "aiTemperature", "aiThinking", "dbType"]) {
        if (settings[key] !== undefined) {
          cfgUpdate[key] = settings[key];
        }
      }

      // 数据库引擎变更检测
      if (settings.dbType === "mysql" || settings.dbType === "sqlite") {
        const currentDbType = db.getDbType();
        dbTypeChanged = settings.dbType !== currentDbType;
        cfgUpdate.dbType = settings.dbType;
        if (settings.dbType === "mysql") {
          cfgUpdate.mysql = {
            host: settings.dbHost || config.mysql.host,
            port: Number(settings.dbPort) || config.mysql.port,
            user: settings.dbUser || config.mysql.user,
            password: settings.dbPassword || config.mysql.password,
            database: settings.dbName || config.mysql.database,
          };
        }
      }

      db.writeConfig(cfgUpdate);

      sendJson(response, 200, { ok: true, restartNeeded: dbTypeChanged });
    } catch (error) {
      sendError(response, 400, `保存设置失败：${error.message}`);
    }
    return;
  }


  // 删除交易计划
  if (request.method === "DELETE" && url.pathname === "/api/trade-plans") {
    try {
      const id = Number(url.searchParams.get("id"));
      if (!Number.isFinite(id) || id <= 0) {
        sendError(response, 400, "需要有效的 id 参数");
        return;
      }
      const [result] = await db.execute("DELETE FROM trade_plans WHERE id = ?", [id]);
      if (result.affectedRows === 0) {
        sendError(response, 404, "记录不存在");
        return;
      }
      sendJson(response, 200, { ok: true, deleted: result.affectedRows });
    } catch (error) {
      sendError(response, 500, `删除失败：${error.message}`);
    }
    return;
  }

  // 删除复盘记录
  if (request.method === "DELETE" && url.pathname === "/api/daily-reviews") {
    try {
      const id = Number(url.searchParams.get("id"));
      if (!Number.isFinite(id) || id <= 0) {
        sendError(response, 400, "需要有效的 id 参数");
        return;
      }
      const [result] = await db.execute("DELETE FROM daily_reviews WHERE id = ?", [id]);
      if (result.affectedRows === 0) {
        sendError(response, 404, "记录不存在");
        return;
      }
      sendJson(response, 200, { ok: true, deleted: result.affectedRows });
    } catch (error) {
      sendError(response, 500, `删除失败：${error.message}`);
    }
    return;
  }

  // ════════════════════════════════════════════════════════════════════
  // 周报/月报精选 API
  // ════════════════════════════════════════════════════════════════════

  // 生成周报/月报摘要
  if (request.method === "POST" && (url.pathname === "/api/ai/weekly-digest" || url.pathname === "/api/ai/monthly-digest")) {
    try {
      const body = await readJsonBody(request);
      const { aiConfig: ac } = body;

      const aiUrl = normalizeAiUrl(ac?.url || config.ai.url);
      const aiKey = (ac?.key) || decryptApiKey(config.ai.key) || config.ai.key;
      const aiModel = (ac?.model) || config.ai.model;
      const enableThinking = ac?.thinking !== false;

      if (!aiKey) { sendError(response, 503, "未配置 AI_API_KEY"); return; }

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
      if (rows.length === 0) { sendError(response, 404, `该时间段内暂无日报数据`); return; }

      const allArticleMap = new Map();
      for (const row of rows) {
        let articles = [];
        try { articles = JSON.parse(row.articles_json || "[]"); } catch { continue; }
        for (const a of articles) { const key = a.link || a.title; if (key && !allArticleMap.has(key)) allArticleMap.set(key, a); }
      }
      const aggregatedArticles = Array.from(allArticleMap.values());
      for (const a of aggregatedArticles) a._priority = computePriority(a);
      aggregatedArticles.sort((a, b) => b._priority - a._priority);
      for (const a of aggregatedArticles) delete a._priority;
      const topArticles = aggregatedArticles.slice(0, 60);

      const articlesText = topArticles.map((a, i) =>
        `${i + 1}. [${a.source || "未知来源"}] ${a.title}\n   链接：${a.link || "无"}\n   摘要：${(a.summary || "").slice(0, 200)}\n   情感：${a.sentiment || "未标注"}`
      ).join("\n\n");

      const periodType = isWeekly ? "周报" : "月报";
      const systemPrompt = `你是一位专业的中国A股市场分析师。请根据过去${isWeekly ? "一周（7天）" : "一个月（30天）"}的财经新闻汇总，撰写一份${periodType}精选摘要。\n## 写作要求\n1. 本期核心矛盾（一句话总结）\n2. 重大事件回顾（按时间顺序或重要性排列）\n3. 板块/热点脉络梳理\n4. 对下一${isWeekly ? "周" : "月"}的展望\n5. 每个核心判断在句末标注 [来源N]\n6. 明确标注利好/利空影响\n\n以下是过去${isWeekly ? "一周" : "一月"}的新闻汇总（共 ${topArticles.length} 篇精选）：\n\n${articlesText}`;

      const aiRequestBody = {
        model: aiModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `请撰写${periodLabel}${periodType}精选摘要，用**粗体**标注重要判断。` },
        ],
        max_tokens: 16384,
      };
      if (enableThinking && /deepseek/i.test(aiModel)) aiRequestBody.thinking = { type: "enabled" };
      else aiRequestBody.temperature = 0.5;

      const aiResponse = await fetch(aiUrl, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiKey}` },
        body: JSON.stringify(aiRequestBody),
      });
      if (!aiResponse.ok) { sendError(response, 502, `AI 服务返回错误 (${aiResponse.status})`); return; }

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
    return;
  }

  // 查询历史周报/月报列表
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
    return;
  }

  // 查询单条周报/月报详情
  if (request.method === "GET" && url.pathname === "/api/periodic-digest") {
    try {
      const id = Number(url.searchParams.get("id"));
      if (!Number.isFinite(id) || id <= 0) { sendError(response, 400, "需要有效的 id 参数"); return; }
      const [rows] = await db.query(
        `SELECT id, digest_type AS digestType, period_label AS periodLabel, date_from AS dateFrom, date_to AS dateTo, digest, articles_count AS articlesCount, sentiment, created_at AS createdAt FROM periodic_digests WHERE id = ?`,
        [id]
      );
      if (rows.length === 0) { sendError(response, 404, "记录不存在"); return; }
      sendJson(response, 200, rows[0]);
    } catch (error) { sendError(response, 500, `查询失败：${error.message}`); }
    return;
  }

  sendError(response, 404, "API not found");
}

// ═════════════════════════════════════════════════════════════════════
// 每日时事日报 — 3-SOP 解析 + AI 摘要
// ═════════════════════════════════════════════════════════════════════

// 懒加载：仅在需要时 require，避免服务器启动时缺模块导致崩溃
let _feedparser = null;
let _nodeFetch = null;
function getFeedParser() {
  if (!_feedparser) _feedparser = require("feedparser");
  return _feedparser;
}
function getNodeFetch() {
  if (!_nodeFetch) _nodeFetch = require("node-fetch");
  return _nodeFetch;
}

// 内存缓存（当天有效）
let newsCache = { date: "", data: null };

/** 获取用户自定义 OPML 路径（~/.stock-toolbox/sources.opml） */
function getUserOpmlPath() {
  const home = process.env.ELECTRON_USER_DATA || process.env.HOME || os.homedir();
  return path.join(home, ".stock-toolbox", "sources.opml");
}

/** 解析 OPML 文件路径：用户自定义优先，回退到 Resources 中的默认文件 */
function resolveOpmlPath() {
  // 1. 用户自定义 OPML（~/.stock-toolbox/sources.opml）
  const userPath = getUserOpmlPath();
  if (fs.existsSync(userPath)) return userPath;

  // 2. 回退到默认捆绑文件
  return resolveDefaultOpmlPath();
}

/** 仅返回捆绑的默认 sources.opml（忽略用户自定义），用于"恢复默认"功能 */
function resolveDefaultOpmlPath() {
  const candidates = [
    path.resolve(__dirname, "sources.opml"),
    path.resolve(__dirname, "..", "sources.opml"),
    path.resolve(__dirname, "..", "..", "sources.opml"),
    path.resolve(__dirname, "..", "..", "..", "sources.opml"),
  ];
  return candidates.find(p => fs.existsSync(p)) || candidates[1];
}

/** 单次日报最多使用的文章数（超过此数量按优先级裁减） */
const MAX_ARTICLES_PER_DIGEST = 40;

async function generateDailyDigest() {
  const today = new Date().toISOString().slice(0, 10);
  if (newsCache.date === today && newsCache.data) return newsCache.data;

  // SOP 1: 采集 — 解析 OPML，拉取所有 RSS 源
  const opmlPath = resolveOpmlPath();
  const feeds = parseOPML(opmlPath);
  const articles = [];

  // 并发拉取所有 RSS 源（每源 8 秒超时）
  const results = await Promise.allSettled(
    feeds.map((feed) =>
      fetchRSS(feed.xmlUrl).then((items) => ({ feed, items }))
    )
  );
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const { feed, items } = r.value;
    for (const item of items.slice(0, 20)) {
      articles.push({
        source: feed.title,
        category: feed.category,
        title: item.title,
        summary: (item.summary || item.description || "").replace(/<[^>]+>/g, "").slice(0, 300),
        link: item.link,
        date: item.date || item.pubDate,
      });
    }
  }

  // ── 去重：过滤掉已经在历史日报中使用过的文章（按链接去重） ──
  const newArticles = await filterNewArticles(articles);
  const duplicateCount = articles.length - newArticles.length;

  // 如果没有新文章，仍然保留全部文章并通知前端
  const dedupedArticles = newArticles.length > 0 ? newArticles : articles;
  const hasNewArticles = newArticles.length > 0;

  // ── 优先级排序：按综合评分降序排列，取 TOP N 用于日报摘要 ──
  for (const a of dedupedArticles) {
    a._priority = computePriority(a);
  }
  dedupedArticles.sort((a, b) => b._priority - a._priority);
  const digestArticles = dedupedArticles.slice(0, MAX_ARTICLES_PER_DIGEST);
  for (const a of dedupedArticles) delete a._priority;

  // SOP 2: 分类 + 情感标注（基于优先级筛选后的文章）
  const topics = classifyArticles(digestArticles);

  // ── 全部文章（去重后完整列表，不限量），用于"全部文章"弹窗 ──
  const allFlat = sortArticlesBySOP(dedupedArticles).map(a => ({
    source: a.source,
    category: a.category,
    title: a.title,
    link: a.link,
    summary: a.summary || "",
    sentiment: detectSentiment(a.title + (a.summary || "")),
  }));

  // SOP 3: 组装日报
  const digest = {
    date: today,
    totalArticles: articles.length,
    newArticlesCount: newArticles.length,
    duplicateCount,
    hasNewArticles,
    allArticles: allFlat,
    marketSentiment: assessMarketSentiment(digestArticles),
    topics,
  };

  newsCache = { date: today, data: digest };
  return digest;
}

function parseOPML(filePath) {
  const feeds = [];
  try {
    const xml = fs.readFileSync(filePath, "utf-8");
    const outlineRegex = /<outline[^>]*text="([^"]*)"[^>]*xmlUrl="([^"]*)"[^>]*\/?>/gi;
    const catRegex = /<outline[^>]*text="([^"]*)"[^>]*>/gi;

    let currentCat = "综合";
    const lines = xml.split("\n");
    for (const line of lines) {
      const catMatch = line.match(/<outline text="([^"]+)"[^>]*>\s*$/);
      if (catMatch && !line.includes("xmlUrl")) {
        currentCat = catMatch[1];
        continue;
      }
      const match = outlineRegex.exec(line);
      outlineRegex.lastIndex = 0;
      if (match) {
        feeds.push({ title: match[1], xmlUrl: match[2], category: currentCat });
      }
    }
  } catch { /* OPML 解析失败 */ }
  return feeds;
}

function fetchRSS(url) {
  const fetch = getNodeFetch();
  const FeedParser = getFeedParser();
  return new Promise((resolve) => {
    const items = [];
    const parser = new FeedParser();
    const timeout = setTimeout(() => { resolve(items); }, 8000);

    try {
      fetch(url, { timeout: 5000, headers: { "User-Agent": "Toolbox/2.0" } })
        .then((res) => {
          if (!res.ok) { clearTimeout(timeout); resolve(items); return; }
          res.body.pipe(parser);
        })
        .catch(() => { clearTimeout(timeout); resolve(items); });

      parser.on("readable", () => {
        let item;
        while ((item = parser.read())) {
          items.push({
            title: item.title || "",
            summary: item.summary || item.description || "",
            link: item.link || "",
            date: item.date || item.pubDate || "",
          });
        }
      });
      parser.on("end", () => { clearTimeout(timeout); resolve(items); });
      parser.on("error", () => { clearTimeout(timeout); resolve(items); });
    } catch { clearTimeout(timeout); resolve(items); }
  });
}

function classifyArticles(articles) {
  // 直接使用 OPML 中定义的 SOP 分类层级
  const sopOrder = ["SOP 1 深度洞察", "SOP 2 势能扫描", "辅助：区域/垂类"];
  const sopLabel = {
    "SOP 1 深度洞察": "SOP1 深度洞察",
    "SOP 2 势能扫描": "SOP2 势能扫描",
    "辅助：区域/垂类": "SOP3 区域/垂类",
  };

  const topics = {};
  for (const art of articles) {
    let cat = art.category || "综合";
    // 匹配 SOP 分类
    let matched = null;
    for (const sop of sopOrder) {
      if (cat.includes(sop) || cat.includes(sopLabel[sop]?.split(" ")[0])) {
        matched = sopLabel[sop] || sop;
        break;
      }
    }
    if (!matched) matched = "综合";
    if (!topics[matched]) topics[matched] = [];
    topics[matched].push(art);
  }

  // 按 SOP 顺序排列
  const ordered = [];
  for (const label of Object.values(sopLabel)) {
    if (topics[label]) ordered.push([label, topics[label]]);
  }
  if (topics["综合"]) ordered.push(["综合", topics["综合"]]);

  return ordered.map(([name, items]) => ({
    name,
    count: items.length,
    highlights: items.slice(0, 15).map(a => ({
      title: a.title,
      source: a.source,
      link: a.link,
      summary: a.summary || "",
      sentiment: detectSentiment(a.title + (a.summary || "")),
    })),
  }));
}

/**
 * 将文章数组按 SOP 分类排序（SOP1 → SOP2 → SOP3 → 综合），组内保持原顺序。
 * 确保 AI 摘要中的 [来源N] 角标编号与前端 buildLinkMap 的索引一致。
 */
function sortArticlesBySOP(articles) {
  const sopOrder = ["SOP 1 深度洞察", "SOP 2 势能扫描", "辅助：区域/垂类"];
  const sopLabel = {
    "SOP 1 深度洞察": "SOP1 深度洞察",
    "SOP 2 势能扫描": "SOP2 势能扫描",
    "辅助：区域/垂类": "SOP3 区域/垂类",
  };

  // 分组
  const groups = { sop1: [], sop2: [], sop3: [], other: [] };
  for (const a of articles) {
    const cat = a.category || "";
    if (cat.includes("SOP 1") || cat.includes("深度洞察")) {
      groups.sop1.push(a);
    } else if (cat.includes("SOP 2") || cat.includes("势能扫描")) {
      groups.sop2.push(a);
    } else if (cat.includes("辅助") || cat.includes("区域/垂类")) {
      groups.sop3.push(a);
    } else {
      groups.other.push(a);
    }
  }

  // 按 SOP1 → SOP2 → SOP3 → 其他 拼接
  return [...groups.sop1, ...groups.sop2, ...groups.sop3, ...groups.other];
}

function detectSentiment(text) {
  const bullish = ["涨", "利好", "突破", "反弹", "增长", "上升", "扩大", "强劲", "创新高", "牛市", "回暖", "放量"];
  const bearish = ["跌", "利空", "下跌", "暴跌", "衰退", "下滑", "萎缩", "疲软", "创新低", "熊市", "低迷", "缩量", "危机", "制裁", "摩擦"];
  let score = 0;
  for (const w of bullish) if (text.includes(w)) score++;
  for (const w of bearish) if (text.includes(w)) score--;
  return score > 0 ? "利好" : score < 0 ? "利空" : "中性";
}

function assessMarketSentiment(articles) {
  let bullish = 0, bearish = 0;
  for (const a of articles) {
    const s = detectSentiment(a.title + a.summary);
    if (s === "利好") bullish++;
    else if (s === "利空") bearish++;
  }
  if (bullish > bearish * 1.5) return { label: "偏乐观 😊", ratio: `${bullish}:${bearish}`, detail: `利好 ${bullish} 条 vs 利空 ${bearish} 条，市场情绪偏暖` };
  if (bearish > bullish * 1.5) return { label: "偏悲观 😟", ratio: `${bullish}:${bearish}`, detail: `利空 ${bearish} 条 vs 利好 ${bullish} 条，注意风险` };
  return { label: "中性 😐", ratio: `${bullish}:${bearish}`, detail: `利好 ${bullish} 条，利空 ${bearish} 条，多空均衡` };
}

/**
 * 清洗 AI 日报摘要输出
 * - 去掉末尾的「注 / 备注 / 说明」行
 * - 去掉 --- 分隔线后的多余注释
 * - 去掉 AI 自述的格式说明（如 "以下按3-SOP结构..."）
 */
function cleanDigest(text) {
  if (!text) return "";
  let cleaned = text;

  // 1. 去掉末尾的 *注：...* / *备注：...* / *说明：...* 整行
  cleaned = cleaned.replace(/\n?\*{0,2}(?:注|备注|说明)[：:][^*]*\*{0,2}\s*$/g, "");

  // 2. 去掉末尾的 --- 分隔线及其之后的全部内容
  cleaned = cleaned.replace(/\n---[\s\S]*$/g, "");

  // 3. 去掉行首 "---" 孤立行
  cleaned = cleaned.replace(/^---+$/gm, "");

  // 4. 去掉 AI 自述的格式说明括号段落（如 "（全文共N处引用）"）
  cleaned = cleaned.replace(/（[^）]*全文[^）]*）\s*/g, "");
  cleaned = cleaned.replace(/\([^)]*全文[^)]*\)\s*/g, "");

  // 5. 去掉 "以下按"、"以上是" 等格式自述行
  cleaned = cleaned.replace(/^.*?(?:以下|以上)(?:按|是).*?[。\.]\s*$/gm, "");

  // 6. 折叠多余空行
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  return cleaned.trim();
}

/**
 * 根据文章情感比例生成简单情绪标签（用于周报/月报）
 */
function assessSimpleSentiment(articles) {
  let bullish = 0, bearish = 0;
  for (const a of articles) {
    if (a.sentiment === "利好") bullish++;
    else if (a.sentiment === "利空") bearish++;
  }
  if (bullish > bearish * 1.5) return "偏乐观";
  if (bearish > bullish * 1.5) return "偏悲观";
  return "中性";
}

/**
 * 获取周标签，如 "2026年第23周"
 */
function getWeekLabel(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  return `${d.getFullYear()}年第${weekNum}周`;
}

/**
 * 计算单篇文章的优先级分数（综合时间 + 关键词 + 情感）
 */
function computePriority(article) {
  const content = (article.title || "") + " " + (article.summary || "");
  let score = 0;
  const articleTime = article.date ? new Date(article.date).getTime() : 0;
  const ageHours = articleTime ? (Date.now() - articleTime) / (1000 * 60 * 60) : 48;
  score += Math.max(0, 100 - ageHours * 2);
  for (const word of keywords.heavy) { if (content.includes(word)) score += 5; }
  for (const word of keywords.important) { if (content.includes(word)) score += 3; }
  for (const word of keywords.watch) { if (content.includes(word)) score += 1; }
  const sentiment = detectSentiment(content);
  if (sentiment !== "中性") score += 2;
  return Math.round(score);
}

// ── 静态文件服务 ──
function serveStatic(request, response, url) {
  const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const rootPath = path.resolve(config.webRoot);
  const filePath = path.resolve(config.webRoot, `.${requestedPath}`);

  // 安全检查：确保解析后的路径在 webRoot 之内
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

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
