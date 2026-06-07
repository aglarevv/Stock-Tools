import { useState, useEffect, useCallback } from "react";
import { useApi } from "../hooks/useApi.jsx";
import Icon from "./Icon.jsx";
import Button from "./Button.jsx";
import AiConfigSection from "./AiConfigSection.jsx";
import DatabaseConfigSection from "./DatabaseConfigSection.jsx";

// ── 默认值 ──
const DEFAULTS = {
  theme: "light",
  aiUrl: "",
  aiKey: "",
  aiModel: "",
  aiTemperature: 0.7,
  aiThinking: true,
  dbType: "sqlite",
  dbHost: "localhost",
  dbPort: "3306",
  dbUser: "root",
  dbPassword: "",
  dbName: "stock_toolbox",
};

// 服务端允许的设置键（与 server.js allowedKeys 保持一致）
const ALLOWED_KEYS = Object.keys(DEFAULTS);

// 将服务端返回的字符串值还原为正确的类型
function deserialize(settings) {
  const result = { ...DEFAULTS };
  for (const [key, raw] of Object.entries(settings)) {
    if (!(key in DEFAULTS)) continue;
    if (key === "aiTemperature") {
      result[key] = parseFloat(raw) || DEFAULTS.aiTemperature;
    } else if (key === "aiThinking") {
      result[key] = raw === "true" || raw === true;
    } else if (key === "dbPort") {
      result[key] = String(raw || DEFAULTS.dbPort);
    } else {
      result[key] = raw ?? DEFAULTS[key];
    }
  }
  return result;
}

// 将值序列化为服务端存储的字符串
function serialize(settings) {
  const result = {};
  for (const [key, value] of Object.entries(settings)) {
    if (!ALLOWED_KEYS.includes(key)) continue;
    result[key] = String(value ?? "");
  }
  return result;
}

export default function Settings({ showToast }) {
  const api = useApi();
  // ── 核心状态 ──
  const [settings, setSettings] = useState({ ...DEFAULTS });      // 当前编辑中的设置
  const [savedSettings, setSavedSettings] = useState(null);        // 上次成功保存的快照
  const [dbStatus, setDbStatus] = useState("检测中…");
  const [dbError, setDbError] = useState(null);                    // 数据库连接错误描述
  const [currentDbType, setCurrentDbType] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── 初始化：顺序执行，避免竞态 ──
  useEffect(() => {
    (async () => {
      setLoading(true);
      // 第一步：加载已保存的设置
      const settingsFromServer = await loadSettings();
      // 第二步：检测当前数据库状态（可能需要用 config.json 修正 dbType）
      const healthInfo = await fetchHealth();
      // 第三步：合并——如果服务端从未保存过 dbType，使用 config.json 的偏好
      const merged = mergeWithHealth(settingsFromServer, healthInfo);
      setSettings(merged);
      setSavedSettings({ ...merged });
      setCurrentDbType(healthInfo?.dbType || "sqlite");
      setDbStatus(healthInfo?.statusText || "无法连接");
      setDbError(healthInfo?.dbError || null);
      setLoading(false);
    })();
  }, [api]);

  async function loadSettings() {
    try {
      const data = await api.getSettings();
      return data?.settings ? deserialize(data.settings) : { ...DEFAULTS };
    } catch (e) {
      showToast(`加载设置失败：${e.message}`, "error");
      return { ...DEFAULTS };
    }
  }

  async function fetchHealth() {
    try {
      const d = await api.health();
      return {
        dbType: d.dbType || "sqlite",
        preferredDbType: d.preferredDbType || null,
        dbError: d.dbError || null,
        statusText: d.database === "ready" ? "已连接" : "未就绪",
      };
    } catch {
      return { dbType: null, preferredDbType: null, dbError: null, statusText: "无法连接" };
    }
  }

  function mergeWithHealth(serverSettings, health) {
    if (!health) return serverSettings;
    const merged = { ...serverSettings };
    // 仅当服务端从未保存 dbType（仍然是默认值）且 config.json 有偏好时才使用 config.json 的值
    if (merged.dbType === DEFAULTS.dbType && health.preferredDbType) {
      merged.dbType = health.preferredDbType;
    }
    return merged;
  }

  // ── 是否显示"需重启"提示 ──
  const dbTypeChanged = settings.dbType !== currentDbType;
  // 是否有未保存的修改
  const hasUnsavedChanges = savedSettings
    ? JSON.stringify(serialize(settings)) !== JSON.stringify(serialize(savedSettings))
    : true;

  // ── 更新单个设置项 ──
  const updateSetting = useCallback((key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  // ── 保存 ──
  async function save() {
    setSaving(true);
    try {
      const payload = serialize(settings);
      const result = await api.saveSettings(payload);
      // 记录保存成功的快照
      setSavedSettings({ ...settings });
      // 立即应用主题（无需重启）
      document.documentElement.setAttribute("data-theme", settings.theme);
      if (result.restartNeeded) {
        showToast("⚡ 数据库类型已更改，请重启应用使配置生效", "warning");
      } else {
        showToast("设置已保存", "success");
      }
    } catch (e) {
      showToast(`保存失败：${e.message}`, "error");
    } finally {
      setSaving(false);
    }
  }

  const isMySQL = settings.dbType === "mysql";

  if (loading) {
    return (
      <div className="page">
        <div className="topbar">
          <h1 className="topbar-title">设置</h1>
        </div>
        <div className="card">
          <div className="card-body" style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
            正在加载设置…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 className="topbar-title">
            <Icon name="settings" size={22} style={{ verticalAlign: -4, marginRight: 6 }} />
            设置
          </h1>
          <span className="badge">软件配置</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {dbTypeChanged && <span style={{ fontSize: 12, color: "var(--warning)" }}>⚡ 需重启生效</span>}
          <Button
            variant="primary"
            onClick={save}
            disabled={saving || !hasUnsavedChanges}
            loading={saving}
          >
            保存设置
          </Button>
        </div>
      </div>

      {/* ── 外观 ── */}
      <div className="card">
        <div className="card-header"><h2>🎨 外观</h2></div>
        <div className="card-body">
          <div className="form-row">
            <div className="form-field">
              <label>主题模式</label>
              <select value={settings.theme} onChange={(e) => updateSetting("theme", e.target.value)}>
                <option value="light">浅色</option>
                <option value="dark">深色</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <AiConfigSection settings={settings} onUpdate={updateSetting} />

      <DatabaseConfigSection
        settings={settings}
        onUpdate={updateSetting}
        isMySQL={isMySQL}
        currentDbType={currentDbType}
        dbTypeChanged={dbTypeChanged}
        dbStatus={dbStatus}
        dbError={dbError}
      />

      {/* ── 关于 ── */}
      <div className="card">
        <div className="card-header"><h2>ℹ️ 关于</h2></div>
        <div className="card-body">
          <div className="settings-info-row"><span>应用名称</span><span>工具箱 · Toolbox</span></div>
          <div className="settings-info-row"><span>版本</span><span>{typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "2.1.0"}</span></div>
        </div>
      </div>
    </div>
  );
}
