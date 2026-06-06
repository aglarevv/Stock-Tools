"use strict";

/**
 * 数据库抽象层
 * 优先使用 MySQL，不可用时自动回退到 SQLite
 * SQLite 数据库文件存储在用户数据目录（不暴露给用户）
 */

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

let dbType = null; // "mysql" | "sqlite"
let mysqlPool = null;
let sqliteDb = null;
let sqliteDbPath = null;
let dbName = null; // 数据库名称，用于 information_schema 查询
let dbDir = null; // 数据目录路径

// 配置文件路径（存储数据库类型偏好）
function getConfigDir() {
  if (process.env.ELECTRON_USER_DATA) {
    return process.env.ELECTRON_USER_DATA;
  }
  if (process.env.SQLITE_DATA_DIR) {
    return process.env.SQLITE_DATA_DIR;
  }
  return path.join(os.homedir(), ".stock-toolbox");
}

function readConfig() {
  try {
    const configPath = path.join(getConfigDir(), "config.json");
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
  } catch { /* ignore */ }
  return {};
}

function writeConfig(updates) {
  try {
    const dir = getConfigDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    const configPath = path.join(dir, "config.json");
    const current = readConfig();
    const merged = { ...current, ...updates };
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2));
    return merged;
  } catch (err) {
    console.error("[db] Failed to write config:", err.message);
    return {};
  }
}

function getDbDir() {
  return getConfigDir();
}

// ---------------------------------------------------------------------------
// SQL 转换工具（MySQL → SQLite）
// ---------------------------------------------------------------------------

function sqliteSQL(sql) {
  let result = sql
    // 移除 MySQL 特有的 ENGINE / CHARSET / COLLATE 子句（包括等号形式）
    .replace(/\s*ENGINE\s*=\s*\w+(\s+DEFAULT\s+CHARSET\s*=\s*\w+(\s+COLLATE\s*=\s*\w+)?)?/gi, "")
    // 单独的 CHARSET / COLLATE
    .replace(/\s+CHARACTER\s+SET\s*=?\s*\w+/gi, "")
    .replace(/\s+COLLATE\s*=?\s*\w+/gi, "")
    // BIGINT UNSIGNED → INTEGER
    .replace(/\bBIGINT\s+UNSIGNED\b/gi, "INTEGER")
    .replace(/\bBIGINT\b/gi, "INTEGER")
    // INT UNSIGNED → INTEGER
    .replace(/\bINT\s+UNSIGNED\b/gi, "INTEGER")
    // DECIMAL(…) → REAL
    .replace(/\bDECIMAL\s*\(\s*\d+\s*,\s*\d+\s*\)/gi, "REAL")
    // VARCHAR(n) → TEXT
    .replace(/\bVARCHAR\s*\(\s*\d+\s*\)/gi, "TEXT")
    // DATE → TEXT（排除 AS date 列别名：DATE_FORMAT(…) AS date 不受影响）
    .replace(/(?<!\bAS\s)\bDATE\b/gi, "TEXT")
    // TIMESTAMP → TEXT（同样排除 AS timestamp 别名）
    .replace(/(?<!\bAS\s)\bTIMESTAMP\b/gi, "TEXT")
    // DEFAULT CURRENT_TIMESTAMP → DEFAULT (datetime('now','localtime'))
    .replace(
      /DEFAULT\s+CURRENT_TIMESTAMP(\s+ON\s+UPDATE\s+CURRENT_TIMESTAMP)?/gi,
      "DEFAULT (datetime('now','localtime'))",
    )
    // ON UPDATE CURRENT_TIMESTAMP（单独的）
    .replace(/\bON\s+UPDATE\s+CURRENT_TIMESTAMP\b/gi, "")
    // 反引号 → 双引号
    .replace(/`([^`]*)`/g, '"$1"')
    // DATE_FORMAT(col, '%Y-%m-%d') → col
    .replace(/DATE_FORMAT\s*\(\s*(\w+)\s*,\s*'%Y-%m-%d'\s*\)/gi, "$1")
    // KEY / INDEX 行移除
    .replace(/,?\s*(UNIQUE\s+)?KEY\s+\w+\s*\([^)]+\)/gi, "")
    // AUTO_INCREMENT 替换（注意：SQLite 的 AUTOINCREMENT 必须配合 PRIMARY KEY）
    .replace(/\bAUTO_INCREMENT\b/gi, "AUTOINCREMENT");

  // SQLite: AUTOINCREMENT 必须配合 INTEGER PRIMARY KEY
  // "id INTEGER NOT NULL AUTOINCREMENT" → "id INTEGER PRIMARY KEY AUTOINCREMENT"
  result = result.replace(
    /(\w+)\s+INTEGER\s+NOT\s+NULL\s+AUTOINCREMENT/gi,
    "$1 INTEGER PRIMARY KEY AUTOINCREMENT",
  );

  // 移除 CREATE TABLE 末尾单独的 PRIMARY KEY 行（已合并到列中）
  result = result.replace(/,?\s*PRIMARY\s+KEY\s*\([^)]+\)/gi, "");

  // SQLite: ALTER TABLE ... MODIFY COLUMN 不支持，注释掉
  result = result.replace(
    /\bALTER\s+TABLE\s+"?\w+"?\s+MODIFY\s+COLUMN\b/gi,
    "-- SQLite skip: MODIFY COLUMN",
  );

  return result;
}

// 将 MySQL 的 INSERT ... ON DUPLICATE KEY UPDATE 转为 SQLite UPSERT
function sqliteUpsert(mysqlSQL, conflictColumn) {
  // 匹配 INSERT INTO table (...) VALUES (...) ON DUPLICATE KEY UPDATE ...
  const match = mysqlSQL.match(
    /INSERT\s+INTO\s+`?(\w+)`?\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)\s*ON\s+DUPLICATE\s+KEY\s+UPDATE\s+(.+)/is,
  );
  if (!match) return mysqlSQL;

  const [, table, columns, values, updateClause] = match;
  // 默认取第一列作为冲突列（通常是主键），而非硬编码 "id"
  const firstCol = columns.replace(/`/g, "").trim().split(/\s*,\s*/)[0];
  const col = conflictColumn || firstCol || "id";

  // 转换 SET 子句：col = VALUES(col) → col = excluded.col
  let updatedUpdate = updateClause.replace(/=\s*VALUES\s*\(\s*(\w+)\s*\)/gi, "= excluded.$1");
  // 处理 id = LAST_INSERT_ID(id) → id = id
  updatedUpdate = updatedUpdate.replace(
    /(\w+)\s*=\s*LAST_INSERT_ID\s*\(\s*\1\s*\)/gi,
    "$1 = $1",
  );
  // 简单的 col = val → col = excluded.col (对于非 VALUES 写法)
  // 实际上大多数情况 VALUES() 已经被上面处理了

  return `INSERT INTO "${table}" (${columns.replace(/`/g, '"')}) VALUES (${values})
ON CONFLICT("${col}") DO UPDATE SET ${updatedUpdate}`;
}

// ---------------------------------------------------------------------------
// MySQL 初始化
// ---------------------------------------------------------------------------

async function initMySQL(config) {
  const mysql = require("mysql2/promise");

  // 先创建数据库（如果不存在），带超时
  const bootstrap = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    multipleStatements: false,
    connectTimeout: 3000, // 3 秒超时，避免 Windows 上长时间卡住
  });

  await bootstrap.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await bootstrap.end();

  const pool = mysql.createPool({
    ...config,
    waitForConnections: true,
    connectionLimit: 6,
    namedPlaceholders: true,
  });

  // 测试连接
  await pool.query("SELECT 1");
  return pool;
}

// ---------------------------------------------------------------------------
// SQLite 初始化 (sql.js / WASM)
// ---------------------------------------------------------------------------

async function initSQLite(config) {
  const initSqlJs = require("sql.js");
  const SQL = await initSqlJs();

  dbDir = getConfigDir();
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true, mode: 0o700 });
  }

  sqliteDbPath = path.join(dbDir, "toolbox.db");
  console.log(`[db] SQLite database: ${sqliteDbPath}`);

  let db;
  if (fs.existsSync(sqliteDbPath)) {
    const buffer = fs.readFileSync(sqliteDbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // 性能优化
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");

  return db;
}

// 保存 SQLite 数据库到文件
function saveSQLite() {
  if (!sqliteDb || !sqliteDbPath) return;
  try {
    const data = sqliteDb.export();
    const tmpPath = sqliteDbPath + ".tmp";
    fs.writeFileSync(tmpPath, Buffer.from(data));
    fs.renameSync(tmpPath, sqliteDbPath);
  } catch (err) {
    console.error("[db] Failed to save SQLite database:", err.message);
  }
}

// ---------------------------------------------------------------------------
// 统一接口初始化
// ---------------------------------------------------------------------------

async function initialize(config) {
  dbName = config.mysql?.database || "stock_toolbox";

  // ── 第一步：始终先初始化 SQLite ──
  console.log("[db] Initializing SQLite (primary)...");
  sqliteDb = await initSQLite(config);
  dbType = "sqlite";
  console.log("[db] SQLite initialized: " + sqliteDbPath);

  // ── 第二步：从 config.json 读取用户偏好（唯一数据源） ──
  const prefs = readConfig();
  const wantMySQL = prefs.dbType === "mysql";

  if (wantMySQL) {
    // 优先使用 config.json 中的 MySQL 凭据，其次用 env/默认值
    const mysqlCfg = {
      host: prefs.mysql?.host || config.mysql.host,
      port: Number(prefs.mysql?.port) || config.mysql.port,
      user: prefs.mysql?.user || config.mysql.user,
      password: prefs.mysql?.password || config.mysql.password,
      database: prefs.mysql?.database || config.mysql.database,
    };
    console.log("[db] Config.json requests MySQL, attempting...");
    try {
      mysqlPool = await initMySQL(mysqlCfg);
      dbType = "mysql";
      console.log("[db] MySQL connected — switched from SQLite");
    } catch (err) {
      console.log("[db] MySQL unavailable:", err.message);
      console.log("[db] Staying on SQLite (check MySQL settings)");
    }
  } else {
    console.log("[db] Using SQLite (config.json: dbType=sqlite)");
  }
}

// ---------------------------------------------------------------------------
// 统一查询接口（模拟 mysql2/promise 的 pool API）
// ---------------------------------------------------------------------------

/**
 * 执行 INSERT / UPDATE / DELETE 等修改操作
 * 返回 [result] 其中 result 有 insertId 和 affectedRows
 */
async function execute(sql, params) {
  if (dbType === "mysql") {
    const [result] = await mysqlPool.execute(sql, params);
    return [result];
  }

  // SQLite (sql.js)：先转换 ON DUPLICATE KEY UPDATE → ON CONFLICT
  let transformed = sql;
  if (/ON\s+DUPLICATE\s+KEY\s+UPDATE/i.test(transformed)) {
    transformed = sqliteUpsert(transformed);
  }
  transformed = sqliteSQL(transformed);
  try {
    sqliteDb.run(transformed, params);
    const changes = sqliteDb.getRowsModified();

    let insertId = 0;
    try {
      const idResult = sqliteDb.exec("SELECT last_insert_rowid() AS id");
      if (idResult.length > 0 && idResult[0].values.length > 0) {
        insertId = idResult[0].values[0][0];
      }
    } catch {
      // ignore
    }

    saveSQLite();
    return [{ insertId, affectedRows: changes }];
  } catch (err) {
    console.error("[db] SQLite execute error:", err.message);
    console.error("[db] SQL:", transformed.substring(0, 500));
    throw err;
  }
}

/**
 * 执行 SELECT 查询
 * 返回 [rows] 其中 rows 是结果数组
 */
async function query(sql, params) {
  if (dbType === "mysql") {
    const [rows] = await mysqlPool.query(sql, params);
    return [rows];
  }

  // SQLite (sql.js) - 使用 prepared statement
  const transformed = sqliteSQL(sql);
  try {
    const stmt = sqliteDb.prepare(transformed);
    if (params && params.length > 0) {
      stmt.bind(params);
    }
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return [rows];
  } catch (err) {
    console.error("[db] SQLite query error:", err.message);
    console.error("[db] SQL:", transformed.substring(0, 500));
    throw err;
  }
}

/**
 * 执行 UPSERT 操作（INSERT ... ON DUPLICATE KEY UPDATE）
 * MySQL 用原生语法，SQLite 用 ON CONFLICT
 */
async function upsert(mysqlSQL, params, conflictColumn) {
  if (dbType === "mysql") {
    const [result] = await mysqlPool.execute(mysqlSQL, params);
    return [result];
  }

  // SQLite: 转换 ON DUPLICATE KEY UPDATE → ON CONFLICT DO UPDATE
  const sqliteSql = sqliteUpsert(mysqlSQL, conflictColumn);
  const transformed = sqliteSQL(sqliteSql);
  try {
    sqliteDb.run(transformed, params);
    const changes = sqliteDb.getRowsModified();

    let insertId = 0;
    try {
      const idResult = sqliteDb.exec("SELECT last_insert_rowid() AS id");
      if (idResult.length > 0 && idResult[0].values.length > 0) {
        insertId = idResult[0].values[0][0];
      }
    } catch {
      // ignore
    }

    saveSQLite();
    return [{ insertId, affectedRows: changes }];
  } catch (err) {
    console.error("[db] SQLite upsert error:", err.message);
    console.error("[db] SQL:", transformed.substring(0, 500));
    throw err;
  }
}

// 将 SQLite exec 结果转为行对象数组
function sqliteExecToRows(results) {
  if (!results || results.length === 0) return [];
  const rows = [];
  for (const result of results) {
    for (const valueRow of result.values) {
      const row = {};
      result.columns.forEach((col, i) => {
        row[col] = valueRow[i];
      });
      rows.push(row);
    }
  }
  return rows;
}

/**
 * 检查列是否存在
 */
async function columnExists(tableName, columnName) {
  if (dbType === "mysql") {
    try {
      const db = dbName || "stock_toolbox";
      const [rows] = await mysqlPool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = '${db}' AND table_name = '${tableName}' AND column_name = '${columnName}'
         LIMIT 1`,
      );
      return rows.length > 0;
    } catch {
      return false;
    }
  }

  // SQLite: PRAGMA table_info
  try {
    const result = sqliteDb.exec(`PRAGMA table_info("${tableName}")`);
    const rows = sqliteExecToRows(result);
    return rows.some((col) => col.name === columnName);
  } catch {
    return false;
  }
}

/**
 * 添加列（如不存在）
 */
async function addColumnIfNotExists(tableName, columnName, columnDef, fallback) {
  if (await columnExists(tableName, columnName)) return;

  if (dbType === "mysql") {
    await mysqlPool.execute(
      `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${columnDef} DEFAULT ?`,
      [fallback],
    );
    return;
  }

  // SQLite
  const sqliteDef = columnDef
    .replace(/\bVARCHAR\s*\(\d+\)/gi, "TEXT")
    .replace(/\bTEXT\b/i, "TEXT")
    .replace(/\bDECIMAL\s*\(\d+,\d+\)/gi, "REAL");
  const sqliteFallback = typeof fallback === "string"
    ? `'${fallback.replace(/'/g, "''")}'`
    : String(fallback ?? "''");

  try {
    sqliteDb.run(`ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" ${sqliteDef} DEFAULT ${sqliteFallback}`);
    saveSQLite();
  } catch (err) {
    if (!err.message.includes("duplicate column") && !err.message.includes("already exists")) throw err;
  }
}

/**
 * 修改列类型（MySQL 支持 MODIFY COLUMN，SQLite 不支持，跳过）
 */
async function modifyColumnIfNeeded(tableName, columnName, newType) {
  if (dbType !== "mysql") return; // SQLite 不支持 MODIFY COLUMN，跳过

  try {
    await mysqlPool.execute(
      `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${columnName}\` ${newType}`,
    );
  } catch (err) {
    // 忽略
  }
}

/**
 * 删除列
 */
async function dropColumnIfExists(tableName, columnName) {
  if (!(await columnExists(tableName, columnName))) return;

  if (dbType === "mysql") {
    await mysqlPool.execute(`ALTER TABLE \`${tableName}\` DROP COLUMN \`${columnName}\``);
    return;
  }

  // SQLite 3.35+ 支持 DROP COLUMN
  try {
    sqliteDb.run(`ALTER TABLE "${tableName}" DROP COLUMN "${columnName}"`);
    saveSQLite();
  } catch (err) {
    console.warn(`[db] Cannot drop column ${columnName} in SQLite:`, err.message);
  }
}

/**
 * 添加唯一索引
 */
async function addUniqueIndexIfMissing(tableName, indexName, columnName) {
  if (dbType === "mysql") {
    try {
      const [indexes] = await mysqlPool.execute(
        `SHOW INDEX FROM \`${tableName}\` WHERE Key_name = '${indexName}'`,
      );
      if (indexes.length === 0) {
        await mysqlPool.query(
          `ALTER TABLE \`${tableName}\` ADD UNIQUE KEY \`${indexName}\` (\`${columnName}\`)`,
        );
      }
    } catch (err) {
      if (!err.message.includes("Duplicate key") && !err.message.includes("already exists")) {
        throw err;
      }
    }
    return;
  }

  // SQLite
  try {
    const idxResult = sqliteDb.exec(`PRAGMA index_list("${tableName}")`);
    const idxRows = sqliteExecToRows(idxResult);
    const exists = idxRows.some((idx) => idx.name === indexName);
    if (!exists) {
      sqliteDb.run(`CREATE UNIQUE INDEX "${indexName}" ON "${tableName}" ("${columnName}")`);
      saveSQLite();
    }
  } catch (err) {
    if (!err.message.includes("already exists")) throw err;
  }
}

function getDbType() {
  return dbType;
}

function isMySQL() {
  return dbType === "mysql";
}

function isSQLite() {
  return dbType === "sqlite";
}

module.exports = {
  initialize,
  execute,
  query,
  upsert,
  columnExists,
  addColumnIfNotExists,
  modifyColumnIfNeeded,
  dropColumnIfExists,
  addUniqueIndexIfMissing,
  getDbType,
  isMySQL,
  isSQLite,
  readConfig,
  writeConfig,
  getDbDir,
};
