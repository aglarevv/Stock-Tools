/**
 * 数据库初始化 — 建表 + 迁移 + 去重
 *
 * 职责：
 * - 初始化所有数据库表（trade_plans, daily_reviews, app_settings,
 *   daily_digests, rss_article_links, periodic_digests）
 * - 执行数据库迁移（新增列、修改列类型、删除旧列）
 * - 从 config.json 同步设置到 app_settings
 * - 文章链接去重与清理
 *
 * 设计原则：
 * - 双引擎兼容（MySQL/SQLite），所有 SQL 通过 db 抽象层执行
 * - 幂等性：CREATE TABLE IF NOT EXISTS，迁移方法检查列是否存在
 * - 容错性：迁移失败不阻塞服务器启动
 *
 * 用法：
 *   const db = require("./db");
 *   const { initDatabase } = require("./database");
 *   await initDatabase(db, config);
 */

"use strict";

const crypto = require("node:crypto");

let dbInstance = null;
let dbInitError = null;
let dbInitialized = false;
let dbReady = null;

/**
 * 将 config.json 中的设置同步到当前数据库的 app_settings 表
 */
async function syncSettingsFromConfig(db) {
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

async function enforceUniqueSymbols(db) {
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

async function migrateDailyReviewsTable(db) {
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

  if (db.isMySQL()) {
    const alterColumns = [
      "MODIFY COLUMN buy_signal TEXT NOT NULL",
      "MODIFY COLUMN sell_signal TEXT NOT NULL",
    ];
    for (const alter of alterColumns) {
      await db.modifyColumnIfNeeded("daily_reviews", alter.split(" ")[2], "TEXT NOT NULL");
    }
  }

  const oldColumns = ["market_context", "mistake_notes", "next_action"];
  for (const col of oldColumns) {
    await db.dropColumnIfExists("daily_reviews", col);
  }

  await db.addColumnIfNotExists("daily_reviews", "trades", "TEXT NULL", null);
}

async function initDatabase(db, config) {
  dbInstance = db;

  dbReady = initializeDatabase(db, config).catch((error) => {
    dbInitError = error;
    console.error("数据库初始化失败:", error.message);
  });

  return dbReady;
}

async function initializeDatabase(db, config) {
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
      trades TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_review_date (review_date),
      KEY idx_review_symbol (symbol),
      KEY idx_review_date_symbol (review_date, symbol)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await enforceUniqueSymbols(db);
  await migrateDailyReviewsTable(db);

  for (const col of ["trade_direction", "position_pct", "trade_notes"]) {
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

  await syncSettingsFromConfig(db);

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

  // 文章去重表
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
      digest_type VARCHAR(16) NOT NULL,
      period_label VARCHAR(64) NOT NULL,
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

  // 研报方法论 Skill 持久化表
  await db.execute(`
    CREATE TABLE IF NOT EXISTS report_skills (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(128) NOT NULL,
      methodology_json LONGTEXT NOT NULL,
      source_report VARCHAR(256) NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 持仓记录表
  await db.execute(`
    CREATE TABLE IF NOT EXISTS positions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      symbol VARCHAR(32) NOT NULL,
      stock_name VARCHAR(64) NOT NULL DEFAULT '',
      buy_date DATE NOT NULL,
      buy_price DECIMAL(18, 4) NOT NULL,
      avg_buy_price DECIMAL(18, 4) NOT NULL,
      shares INT NOT NULL,
      total_shares_bought INT NOT NULL,
      current_price DECIMAL(18, 4) NULL,
      total_cost DECIMAL(18, 4) NOT NULL,
      market_value DECIMAL(18, 4) NULL,
      unrealized_pnl DECIMAL(18, 4) NULL,
      pnl_rate DECIMAL(10, 4) NULL,
      realized_pnl DECIMAL(18, 4) NOT NULL DEFAULT 0,
      holding_style VARCHAR(16) NOT NULL DEFAULT '中线',
      position_pct DECIMAL(5, 2) NULL,
      notes TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_positions_symbol (symbol),
      KEY idx_positions_buy_date (buy_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 迁移 positions 表新增列（兼容旧结构）
  for (const col of [
    { name: "avg_buy_price", type: "DECIMAL(18,4) NOT NULL", fallback: "0" },
    { name: "realized_pnl", type: "DECIMAL(18,4) NOT NULL", fallback: "0" },
    { name: "total_shares_bought", type: "INT NOT NULL", fallback: "0" },
  ]) {
    await db.addColumnIfNotExists("positions", col.name, col.type, col.fallback);
  }
  // 如果旧数据 avg_buy_price 为 0，用 buy_price 填充
  try { await db.execute("UPDATE positions SET avg_buy_price = buy_price WHERE avg_buy_price = 0"); } catch {}
  try { await db.execute("UPDATE positions SET total_shares_bought = shares WHERE total_shares_bought = 0"); } catch {}

  // 做T记录表
  await db.execute(`
    CREATE TABLE IF NOT EXISTS t_trades (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      position_id BIGINT UNSIGNED NOT NULL,
      symbol VARCHAR(32) NOT NULL,
      trade_date DATE NOT NULL,
      buy_price DECIMAL(18, 4) NOT NULL,
      sell_price DECIMAL(18, 4) NOT NULL,
      shares INT NOT NULL,
      profit DECIMAL(18, 4) NOT NULL,
      profit_rate DECIMAL(10, 4) NOT NULL,
      notes TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_t_trades_symbol (symbol),
      KEY idx_t_trades_position (position_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // K线训练记录表
  await db.execute(`
    CREATE TABLE IF NOT EXISTS kline_train_sessions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      session_id VARCHAR(32) NOT NULL,
      mode VARCHAR(16) NOT NULL,
      stock_code VARCHAR(16) NOT NULL,
      stock_name VARCHAR(64) NOT NULL DEFAULT '',
      total_klines INT NOT NULL DEFAULT 0,
      trades_count INT NOT NULL DEFAULT 0,
      win_count INT NOT NULL DEFAULT 0,
      win_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
      total_pnl DECIMAL(18,2) NOT NULL DEFAULT 0,
      start_capital DECIMAL(18,2) NOT NULL DEFAULT 0,
      end_capital DECIMAL(18,2) NOT NULL DEFAULT 0,
      leverage INT NOT NULL DEFAULT 1,
      detail_json LONGTEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_kts_session (session_id),
      KEY idx_kts_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  dbInitialized = true;
  console.log(`[server] 数据库初始化完成 (${db.getDbType()})`);
}

async function cleanupOldArticleLinks(db, retentionDays = 14) {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const dateStr = cutoff.toISOString().slice(0, 10);
    await db.execute("DELETE FROM rss_article_links WHERE last_seen_date < ?", [dateStr]);
  } catch (e) {
    console.error("[server] 清理旧文章链接失败:", e.message);
  }
}

async function filterNewArticles(db, articles) {
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

module.exports = {
  initDatabase,
  get dbReady() { return dbReady; },
  get dbInitError() { return dbInitError; },
  get dbInitialized() { return dbInitialized; },
  cleanupOldArticleLinks,
  filterNewArticles,
};
