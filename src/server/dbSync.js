/**
 * 数据库同步迁移 — SQLite ↔ MySQL 双向数据同步
 *
 * 职责：
 * - 导出当前数据库所有表数据
 * - 导入到目标数据库
 * - 支持 SQLite → MySQL 和 MySQL → SQLite 两个方向
 *
 * 设计原则：
 * - 表结构由 database.js 的 initializeDatabase 创建，本模块只负责数据搬运
 * - 使用分批处理避免大事务
 * - 容错：跳过失败的行，统计成功/失败数
 *
 * 用法：
 *   const { migrateData } = require("./dbSync");
 *   const result = await migrateData(db, "mysql", config);
 */

"use strict";

// 所有需要同步的表名
const ALL_TABLES = [
  "trade_plans",
  "daily_reviews",
  "app_settings",
  "daily_digests",
  "rss_article_links",
  "periodic_digests",
  "report_skills",
  "positions",
  "t_trades",
];

/**
 * 从当前数据库导出所有表数据
 * @returns {Promise<{[table: string]: object[]}>}
 */
async function exportAllData(db) {
  const result = {};
  for (const table of ALL_TABLES) {
    try {
      const [rows] = await db.query(`SELECT * FROM \`${table}\``);
      result[table] = rows || [];
      console.log(`[dbSync] 导出 ${table}: ${result[table].length} 行`);
    } catch (e) {
      console.warn(`[dbSync] 跳过表 ${table}: ${e.message}`);
      result[table] = [];
    }
  }
  return result;
}

/**
 * 从 MySQL 连接导出所有表数据
 */
async function exportFromMySQL(mysqlPool) {
  const result = {};
  for (const table of ALL_TABLES) {
    try {
      const [rows] = await mysqlPool.query(`SELECT * FROM \`${table}\``);
      result[table] = rows || [];
      console.log(`[dbSync] MySQL 导出 ${table}: ${result[table].length} 行`);
    } catch (e) {
      console.warn(`[dbSync] 跳过 MySQL 表 ${table}: ${e.message}`);
      result[table] = [];
    }
  }
  return result;
}

/**
 * 将数据导入到目标数据库
 * @param {object} targetDb - 目标数据库抽象层（与 db.js 接口一致）
 * @param {object} data - exportAllData 返回的数据
 * @returns {Promise<{ success: boolean, stats: object }>}
 */
async function importAllData(targetDb, data) {
  const stats = {};
  for (const [table, rows] of Object.entries(data)) {
    if (!rows.length) { stats[table] = { ok: 0, fail: 0 }; continue; }

    let ok = 0, fail = 0;
    const columns = Object.keys(rows[0]);
    const placeholders = columns.map(() => "?").join(", ");
    const colNames = columns.map(c => `\`${c}\``).join(", ");

    // 构建 INSERT（MySQL 用 INSERT IGNORE，SQLite 用 INSERT OR IGNORE）
    const dbType = targetDb.getDbType?.() || "sqlite";
    const insertSql = dbType === "mysql"
      ? `INSERT IGNORE INTO \`${table}\` (${colNames}) VALUES (${placeholders})`
      : `INSERT OR IGNORE INTO \`${table}\` (${colNames}) VALUES (${placeholders})`;

    // 分批插入（每批100行）
    const BATCH = 100;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      for (const row of batch) {
        try {
          const values = columns.map(c => row[c] ?? null);
          await targetDb.execute(insertSql, values);
          ok++;
        } catch (e) {
          fail++;
        }
      }
    }
    stats[table] = { ok, fail };
    console.log(`[dbSync] 导入 ${table}: ${ok} 成功, ${fail} 失败`);
  }
  return { success: true, stats };
}

/**
 * 主迁移函数：从当前数据库导出 → 导入到目标数据库
 *
 * @param {object} db - 当前数据库模块
 * @param {string} targetType - "mysql" | "sqlite"
 * @param {object} config - 应用配置（含 MySQL 凭据）
 * @returns {Promise<{ success: boolean, message: string, stats?: object }>}
 */
async function migrateData(db, targetType, config) {
  const sourceType = db.getDbType();
  if (sourceType === targetType) {
    return { success: true, message: `当前已是 ${targetType}，无需迁移` };
  }

  console.log(`[dbSync] 开始数据迁移: ${sourceType} → ${targetType}`);

  // ── 方向 1：SQLite → MySQL ──
  if (sourceType === "sqlite" && targetType === "mysql") {
    // 1a. 从当前 SQLite 导出数据
    const data = await exportAllData(db);

    // 1b. 连接 MySQL
    const mysql2 = require("mysql2/promise");
    const prefs = db.readConfig();
    const mysqlCfg = {
      host: prefs.mysql?.host || config.mysql.host,
      port: Number(prefs.mysql?.port) || config.mysql.port,
      user: prefs.mysql?.user || config.mysql.user,
      password: prefs.mysql?.password || config.mysql.password,
      database: prefs.mysql?.database || config.mysql.database,
      waitForConnections: true,
      connectionLimit: 2,
    };

    let mysqlPool;
    try {
      mysqlPool = mysql2.createPool(mysqlCfg);
      await mysqlPool.query("SELECT 1"); // 测试连接

      // 1c. 在 MySQL 中建表（调用 initializeDatabase 逻辑）
      // 重新构建一个与 SQL 兼容的 targetDb 包装
      const targetDb = createMySQLTargetDb(mysqlPool);
      await initializeTargetTables(targetDb);

      // 1d. 导入数据
      const { stats } = await importAllData(targetDb, data);
      const totalOk = Object.values(stats).reduce((s, v) => s + v.ok, 0);
      const totalFail = Object.values(stats).reduce((s, v) => s + v.fail, 0);

      await mysqlPool.end();
      return { success: true, message: `SQLite → MySQL 完成: ${totalOk} 行成功${totalFail > 0 ? `, ${totalFail} 行失败` : ''}`, stats };
    } catch (e) {
      if (mysqlPool) await mysqlPool.end().catch(() => {});
      return { success: false, message: `MySQL 连接失败: ${e.message}` };
    }
  }

  // ── 方向 2：MySQL → SQLite ──
  if (sourceType === "mysql" && targetType === "sqlite") {
    try {
      // 2a. 从 MySQL 导出全部数据
      const data = await exportAllData(db);

      // 2b. 写入 SQLite（使用 sql.js 原生 API + 完整事务）
      const sqliteDb = db.getSQLiteDb();
      if (!sqliteDb) return { success: false, message: "SQLite 连接不可用" };

      // 2c. 删除旧表，重新建表（确保列结构匹配）
      const dropOrder = ALL_TABLES.slice().reverse();
      for (const table of dropOrder) {
        try { sqliteDb.run(`DROP TABLE IF EXISTS "${table}"`); } catch {}
      }
      initializeTargetTablesSQLite(sqliteDb);

      // 2d. 在事务中批量插入
      sqliteDb.run("BEGIN TRANSACTION");
      const stats = {};
      for (const [table, rows] of Object.entries(data)) {
        let ok = 0, fail = 0;
        if (rows.length > 0) {
          const columns = Object.keys(rows[0]);
          const placeholders = columns.map(() => "?").join(", ");
          const colNames = columns.map(c => `"${c}"`).join(", ");
          const insertSql = `INSERT OR IGNORE INTO "${table}" (${colNames}) VALUES (${placeholders})`;

          for (const row of rows) {
            try {
              const values = columns.map(c => {
                const v = row[c];
                if (v === null || v === undefined) return null;
                // MySQL DATE/TIMESTAMP 返回 Date 对象，SQLite 需要字符串
                if (v instanceof Date) return v.toISOString().slice(0, 19).replace("T", " ");
                return v;
              });
              sqliteDb.run(insertSql, values);
              ok++;
            } catch (e) { fail++; if (fail === 1) console.warn(`[dbSync] ${table} 插入错误示例: ${e.message}`); }
          }
        }
        stats[table] = { ok, fail };
        console.log(`[dbSync] 导入 ${table}: ${ok} 成功, ${fail} 失败`);
      }
      sqliteDb.run("COMMIT");

      // 保存到磁盘
      db.saveSQLite();
      console.log("[dbSync] SQLite 数据已持久化到磁盘");

      const totalOk = Object.values(stats).reduce((s, v) => s + v.ok, 0);
      const totalFail = Object.values(stats).reduce((s, v) => s + v.fail, 0);
      return { success: true, message: `MySQL → SQLite 完成: ${totalOk} 行成功${totalFail > 0 ? `, ${totalFail} 行失败` : ''}`, stats };
    } catch (e) {
      return { success: false, message: `MySQL → SQLite 迁移失败: ${e.message}` };
    }
  }

  return { success: false, message: `不支持的迁移方向: ${sourceType} → ${targetType}` };
}

/**
 * 为目标数据库建表（最小化的 initializeDatabase）
 */
async function initializeTargetTables(targetDb) {
  // 只需要创建表结构，不执行迁移（表中已有完整列）
  const tables = {
    trade_plans: `CREATE TABLE IF NOT EXISTS trade_plans (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      symbol VARCHAR(64) NOT NULL,
      buy_price DECIMAL(18,4) NOT NULL, shares INT UNSIGNED NOT NULL,
      profit_rate DECIMAL(10,4) NOT NULL, loss_rate DECIMAL(10,4) NOT NULL,
      fee_rate DECIMAL(10,4) NOT NULL, stop_loss_price DECIMAL(18,4) NOT NULL,
      take_profit_price DECIMAL(18,4) NOT NULL, position_cost DECIMAL(18,4) NOT NULL,
      expected_profit DECIMAL(18,4) NOT NULL, expected_loss DECIMAL(18,4) NOT NULL,
      risk_reward DECIMAL(18,4) NOT NULL, trade_direction VARCHAR(8) NOT NULL DEFAULT 'long',
      position_pct DECIMAL(5,2) NOT NULL DEFAULT 100, trade_notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    daily_reviews: `CREATE TABLE IF NOT EXISTS daily_reviews (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      review_date DATE NOT NULL, symbol VARCHAR(64) NOT NULL,
      buy_signal TEXT NOT NULL, holding_style VARCHAR(64) NOT NULL,
      sell_signal TEXT NOT NULL, buy_price DECIMAL(18,4) NOT NULL,
      sell_price DECIMAL(18,4) NULL, shares INT UNSIGNED NOT NULL,
      pnl_amount DECIMAL(18,4) NOT NULL, pnl_rate DECIMAL(10,4) NOT NULL,
      index_judgment TEXT NOT NULL, volume_judgment TEXT NOT NULL,
      sentiment_judgment TEXT NOT NULL, capital_direction TEXT NOT NULL,
      leading_sectors TEXT NOT NULL, lagging_sectors TEXT NOT NULL,
      sustainability TEXT NOT NULL, stock_strength TEXT NOT NULL,
      vol_amp_ranking TEXT NOT NULL, limit_analysis TEXT NOT NULL,
      operation_reason TEXT NOT NULL, profit_attribution TEXT NOT NULL,
      loss_attribution TEXT NOT NULL, execution_notes TEXT NOT NULL,
      improvement_plan TEXT NOT NULL, market_plan TEXT NOT NULL,
      position_plan TEXT NOT NULL, new_candidates TEXT NOT NULL,
      trades TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    app_settings: `CREATE TABLE IF NOT EXISTS app_settings (
      setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    daily_digests: `CREATE TABLE IF NOT EXISTS daily_digests (
      digest_date DATE NOT NULL PRIMARY KEY,
      digest TEXT NOT NULL, articles_json LONGTEXT,
      source_count INT NOT NULL DEFAULT 0, sentiment VARCHAR(64),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    rss_article_links: `CREATE TABLE IF NOT EXISTS rss_article_links (
      link_hash VARCHAR(64) NOT NULL PRIMARY KEY,
      first_seen_date DATE NOT NULL, last_seen_date DATE NOT NULL
    )`,
    periodic_digests: `CREATE TABLE IF NOT EXISTS periodic_digests (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      digest_type VARCHAR(16) NOT NULL, period_label VARCHAR(64) NOT NULL,
      date_from DATE NOT NULL, date_to DATE NOT NULL,
      digest TEXT NOT NULL, articles_count INT NOT NULL DEFAULT 0,
      sentiment VARCHAR(64),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    report_skills: `CREATE TABLE IF NOT EXISTS report_skills (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(128) NOT NULL, methodology_json LONGTEXT NOT NULL,
      source_report VARCHAR(256) NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    positions: `CREATE TABLE IF NOT EXISTS positions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      symbol VARCHAR(32) NOT NULL, stock_name VARCHAR(64) NOT NULL DEFAULT '',
      buy_date DATE NOT NULL, buy_price DECIMAL(18,4) NOT NULL,
      shares INT NOT NULL, current_price DECIMAL(18,4) NULL,
      total_cost DECIMAL(18,4) NOT NULL, market_value DECIMAL(18,4) NULL,
      unrealized_pnl DECIMAL(18,4) NULL, pnl_rate DECIMAL(10,4) NULL,
      holding_style VARCHAR(16) NOT NULL DEFAULT '中线',
      position_pct DECIMAL(5,2) NULL, notes TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  };

  for (const [table, sql] of Object.entries(tables)) {
    try { await targetDb.execute(sql); } catch (e) { console.warn(`[dbSync] 建表 ${table} 失败: ${e.message}`); }
  }
}

/**
 * 创建一个模仿 db.js 接口的 MySQL target 包装
 */
function createMySQLTargetDb(mysqlPool) {
  return {
    getDbType: () => "mysql",
    async execute(sql, params) {
      const [result] = await mysqlPool.execute(sql, params);
      return [result];
    },
    async query(sql, params) {
      const [rows] = await mysqlPool.query(sql, params);
      return [rows];
    },
  };
}

/**
 * 创建一个模仿 db.js 接口的 SQLite target 包装
 */
function createSQLiteTargetDb(sqliteDb, dbModule) {
  return {
    getDbType: () => "sqlite",
    async execute(sql, params) {
      // 直接用 sql.js API 写入
      try {
        const stmt = sqliteDb.prepare(sql);
        if (params && params.length > 0) stmt.bind(params);
        stmt.step();
        stmt.free();
        const insertId = sqliteDb.exec("SELECT last_insert_rowid() AS id");
        const id = (insertId.length > 0 && insertId[0].values.length > 0) ? insertId[0].values[0][0] : 0;
        return [{ insertId: id, affectedRows: 1 }];
      } catch (e) {
        // 忽略唯一约束冲突
        return [{ insertId: 0, affectedRows: 0 }];
      }
    },
    async query(sql, params) {
      return dbModule.query(sql, params);
    },
  };
}

/**
 * 在 SQLite 中建表（sql.js 原生 API）
 */
function initializeTargetTablesSQLite(sqliteDb) {
  const tables = [
    `CREATE TABLE IF NOT EXISTS trade_plans (id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT NOT NULL, buy_price REAL NOT NULL, shares INTEGER NOT NULL, profit_rate REAL NOT NULL, loss_rate REAL NOT NULL, fee_rate REAL NOT NULL, stop_loss_price REAL NOT NULL, take_profit_price REAL NOT NULL, position_cost REAL NOT NULL, expected_profit REAL NOT NULL, expected_loss REAL NOT NULL, risk_reward REAL NOT NULL, trade_direction TEXT NOT NULL DEFAULT 'long', position_pct REAL NOT NULL DEFAULT 100, trade_notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS daily_reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, review_date TEXT NOT NULL, symbol TEXT NOT NULL, buy_signal TEXT NOT NULL, holding_style TEXT NOT NULL DEFAULT '短线', sell_signal TEXT NOT NULL, buy_price REAL NOT NULL, sell_price REAL, shares INTEGER NOT NULL, pnl_amount REAL NOT NULL, pnl_rate REAL NOT NULL, index_judgment TEXT NOT NULL, volume_judgment TEXT NOT NULL, sentiment_judgment TEXT NOT NULL, capital_direction TEXT NOT NULL, leading_sectors TEXT NOT NULL, lagging_sectors TEXT NOT NULL, sustainability TEXT NOT NULL, stock_strength TEXT NOT NULL, vol_amp_ranking TEXT NOT NULL, limit_analysis TEXT NOT NULL, operation_reason TEXT NOT NULL, profit_attribution TEXT NOT NULL, loss_attribution TEXT NOT NULL, execution_notes TEXT NOT NULL, improvement_plan TEXT NOT NULL, market_plan TEXT NOT NULL, position_plan TEXT NOT NULL, new_candidates TEXT NOT NULL, trades TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS app_settings (setting_key TEXT NOT NULL PRIMARY KEY, setting_value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS daily_digests (digest_date TEXT NOT NULL PRIMARY KEY, digest TEXT NOT NULL, articles_json TEXT, source_count INTEGER NOT NULL DEFAULT 0, sentiment TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS rss_article_links (link_hash TEXT NOT NULL PRIMARY KEY, first_seen_date TEXT NOT NULL, last_seen_date TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS periodic_digests (id INTEGER PRIMARY KEY AUTOINCREMENT, digest_type TEXT NOT NULL, period_label TEXT NOT NULL, date_from TEXT NOT NULL, date_to TEXT NOT NULL, digest TEXT NOT NULL, articles_count INTEGER NOT NULL DEFAULT 0, sentiment TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    "CREATE TABLE IF NOT EXISTS report_skills (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, methodology_json TEXT NOT NULL, source_report TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE IF NOT EXISTS positions (id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT NOT NULL, stock_name TEXT NOT NULL DEFAULT '', buy_date TEXT NOT NULL, buy_price REAL NOT NULL, shares INTEGER NOT NULL, current_price REAL, total_cost REAL NOT NULL, market_value REAL, unrealized_pnl REAL, pnl_rate REAL, holding_style TEXT NOT NULL DEFAULT '中线', position_pct REAL, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  ];
  for (const sql of tables) {
    try { sqliteDb.run(sql); } catch (e) { console.warn("[dbSync] SQLite 建表失败:", e.message); }
  }
}

module.exports = { migrateData };
