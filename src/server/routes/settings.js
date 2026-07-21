/**
 * 设置路由 — 应用设置读写 + 数据库迁移
 *
 * 用法：
 *   const { handleSettingsRoutes } = require("./routes/settings");
 *   if (await handleSettingsRoutes(request, response, url, ctx)) return;
 */

"use strict";

const { migrateData } = require("../dbSync");

async function handleSettingsRoutes(request, response, url, ctx) {
  const { db, sendJson, sendError, readJsonBody, config, encryptApiKey, decryptApiKey } = ctx;

  // ── 读取设置 ──
  if (request.method === "GET" && url.pathname === "/api/settings") {
    try {
      const [rows] = await db.query("SELECT setting_key AS settingKey, setting_value AS settingValue FROM app_settings");
      const settings = {};
      for (const row of rows) {
        let val = row.settingValue;
        if (row.settingKey === "aiKey" && val) val = decryptApiKey(val);
        settings[row.settingKey] = val;
      }
      try {
        const cfg = db.readConfig();
        for (const key of ["theme", "aiUrl", "aiModel", "aiTemperature", "aiThinking", "dbType"]) {
          if (!settings[key] && cfg[key] !== undefined) settings[key] = String(cfg[key]);
        }
      } catch { /* ignore */ }
      sendJson(response, 200, { settings });
    } catch (error) { sendError(response, 500, `读取设置失败：${error.message}`); }
    return true;
  }

  // ── 保存设置（含自动数据迁移） ──
  if (request.method === "POST" && url.pathname === "/api/settings") {
    try {
      const body = await readJsonBody(request);
      const { settings } = body;
      if (!settings || typeof settings !== "object") {
        sendError(response, 400, "请求体需包含 settings 对象");
        return true;
      }

      const allowedKeys = [
        "theme", "aiUrl", "aiKey", "aiModel", "aiTemperature", "aiThinking",
        "dbHost", "dbPort", "dbUser", "dbPassword", "dbName", "dbType",
      ];

      for (const [key, value] of Object.entries(settings)) {
        if (!allowedKeys.includes(key)) continue;
        let strValue = String(value ?? "");
        if (key === "aiKey" && strValue) strValue = encryptApiKey(strValue);
        await db.execute(
          `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP`,
          [key, strValue],
        );
      }

      let dbTypeChanged = false;
      let targetDbType = null;
      const cfgUpdate = {};

      for (const key of ["theme", "aiUrl", "aiModel", "aiTemperature", "aiThinking", "dbType"]) {
        if (settings[key] !== undefined) cfgUpdate[key] = settings[key];
      }

      if (settings.dbType === "mysql" || settings.dbType === "sqlite") {
        const currentDbType = db.getDbType();
        dbTypeChanged = settings.dbType !== currentDbType;
        targetDbType = settings.dbType;
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

      // ── 数据迁移 ──
      let migrationResult = null;
      if (dbTypeChanged && targetDbType) {
        console.log(`[settings] 数据库类型变更: ${db.getDbType()} → ${targetDbType}，开始数据迁移...`);
        migrationResult = await migrateData(db, targetDbType, config);
        console.log(`[settings] 迁移结果:`, migrationResult.message);
      }

      sendJson(response, 200, {
        ok: true,
        restartNeeded: dbTypeChanged,
        migration: migrationResult,
      });
    } catch (error) { sendError(response, 400, `保存设置失败：${error.message}`); }
    return true;
  }

  // ── 手动触发数据迁移 ──
  if (request.method === "POST" && url.pathname === "/api/db/migrate") {
    try {
      const body = await readJsonBody(request);
      const { targetType } = body;
      if (targetType !== "mysql" && targetType !== "sqlite") {
        sendError(response, 400, "targetType 必须是 mysql 或 sqlite");
        return true;
      }
      const result = await migrateData(db, targetType, config);
      sendJson(response, result.success ? 200 : 500, result);
    } catch (error) { sendError(response, 500, `迁移失败：${error.message}`); }
    return true;
  }

  return false;
}

module.exports = { handleSettingsRoutes };
