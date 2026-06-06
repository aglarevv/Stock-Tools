import { useState, useEffect, useCallback } from "react";
import { api } from "../utils/api.js";

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
  // ── 核心状态 ──
  const [settings, setSettings] = useState({ ...DEFAULTS });      // 当前编辑中的设置
  const [savedSettings, setSavedSettings] = useState(null);        // 上次成功保存的快照
  const [dbStatus, setDbStatus] = useState("检测中…");
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
      setDbStatus(healthInfo?.statusText || "❌ 无法连接");
      setLoading(false);
    })();
  }, []);

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
        statusText: d.database === "ready" ? "✅ 已连接" : "⚠️ 未就绪",
      };
    } catch {
      return { dbType: null, preferredDbType: null, statusText: "❌ 无法连接" };
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
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: -4, marginRight: 6 }}>
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
            设置
          </h1>
          <span className="badge">软件配置</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {dbTypeChanged && <span style={{ fontSize: 12, color: "var(--warning)" }}>⚡ 需重启生效</span>}
          <button
            className="btn btn-primary"
            onClick={save}
            disabled={saving || !hasUnsavedChanges}
          >
            {saving ? "保存中…" : "保存设置"}
          </button>
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

      {/* ── AI 接口配置 ── */}
      <div className="card">
        <div className="card-header"><h2>🤖 AI 接口配置</h2></div>
        <div className="card-body">
          <div className="form-row">
            <div className="form-field">
              <label>API 地址</label>
              <input
                value={settings.aiUrl}
                onChange={(e) => updateSetting("aiUrl", e.target.value)}
                placeholder="https://api.deepseek.com"
              />
              <small>兼容 OpenAI 接口格式（输入 base URL 或完整地址均可）</small>
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>API Key</label>
              <input
                type="password"
                value={settings.aiKey}
                onChange={(e) => updateSetting("aiKey", e.target.value)}
                placeholder="sk-xxxxxxxx"
              />
              <small>密钥使用 AES-256-GCM 加密存储</small>
            </div>
          </div>
          <div className="form-row cols-2">
            <div className="form-field">
              <label>模型名称</label>
              <input
                value={settings.aiModel}
                onChange={(e) => updateSetting("aiModel", e.target.value)}
                placeholder="deepseek-chat"
              />
            </div>
            <div className="form-field">
              <label>温度 (0-2)</label>
              <input
                type="number"
                value={settings.aiTemperature}
                onChange={(e) => updateSetting("aiTemperature", e.target.value)}
                min="0"
                max="2"
                step="0.1"
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>思考模式</label>
              <select
                value={settings.aiThinking ? "1" : "0"}
                onChange={(e) => updateSetting("aiThinking", e.target.value === "1")}
              >
                <option value="1">🧠 启用（DeepSeek: 思维链推理）</option>
                <option value="0">💨 关闭（标准模式）</option>
              </select>
              <small>DeepSeek 模型启用后输出思维链过程，其他模型自动忽略</small>
            </div>
          </div>
        </div>
      </div>

      {/* ── 数据库 ── */}
      <div className="card">
        <div className="card-header">
          <h2>🗄️ 数据库</h2>
          <span className="card-hint">切换后需重启应用</span>
        </div>
        <div className="card-body">
          <div className="form-row">
            <div className="form-field">
              <label>数据库引擎</label>
              <div style={{ display: "flex", gap: 24, paddingTop: 6, flexWrap: "wrap" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontWeight: 500, lineHeight: "20px", flexShrink: 0 }}>
                  <input
                    type="radio"
                    name="dbType"
                    value="sqlite"
                    checked={settings.dbType === "sqlite"}
                    onChange={() => updateSetting("dbType", "sqlite")}
                    style={{ margin: 0, flexShrink: 0 }}
                  />
                  <span style={{ whiteSpace: "nowrap" }}>🗂️ SQLite（本地文件，无需安装）</span>
                </label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontWeight: 500, lineHeight: "20px", flexShrink: 0 }}>
                  <input
                    type="radio"
                    name="dbType"
                    value="mysql"
                    checked={settings.dbType === "mysql"}
                    onChange={() => updateSetting("dbType", "mysql")}
                    style={{ margin: 0, flexShrink: 0 }}
                  />
                  <span style={{ whiteSpace: "nowrap" }}>🐬 MySQL（远程服务器）</span>
                </label>
              </div>
              <small>初次启动默认使用 SQLite。切换数据库类型后需重启应用生效。</small>
            </div>
          </div>

          {isMySQL ? (
            <>
              <div className="form-row cols-2">
                <div className="form-field">
                  <label>主机地址</label>
                  <input
                    value={settings.dbHost}
                    onChange={(e) => updateSetting("dbHost", e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>端口</label>
                  <input
                    type="number"
                    value={settings.dbPort}
                    onChange={(e) => updateSetting("dbPort", e.target.value)}
                  />
                </div>
              </div>
              <div className="form-row cols-2">
                <div className="form-field">
                  <label>用户名</label>
                  <input
                    value={settings.dbUser}
                    onChange={(e) => updateSetting("dbUser", e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>密码</label>
                  <input
                    type="password"
                    value={settings.dbPassword}
                    onChange={(e) => updateSetting("dbPassword", e.target.value)}
                    placeholder="数据库密码"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>数据库名</label>
                  <input
                    value={settings.dbName}
                    onChange={(e) => updateSetting("dbName", e.target.value)}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="settings-info-row">
                <span>存储位置</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>~/.stock-toolbox/toolbox.db</span>
              </div>
              <div className="settings-info-row">
                <span>说明</span>
                <span>无需安装任何数据库，开箱即用</span>
              </div>
            </>
          )}

          <div className="settings-info-row">
            <span>当前运行</span>
            <span style={{ fontWeight: 600 }}>
              {currentDbType === "mysql" ? "🐬 MySQL" : "🗂️ SQLite"} — {dbStatus}
            </span>
          </div>
          <div className="settings-info-row">
            <span>下次启动使用</span>
            <span style={{ fontWeight: 500, color: "var(--accent)" }}>
              {settings.dbType === "mysql" ? "🐬 MySQL" : "🗂️ SQLite"}
              {dbTypeChanged ? "（已变更）" : ""}
            </span>
          </div>
        </div>
      </div>

      {/* ── 关于 ── */}
      <div className="card">
        <div className="card-header"><h2>ℹ️ 关于</h2></div>
        <div className="card-body">
          <div className="settings-info-row"><span>应用名称</span><span>工具箱 · Toolbox</span></div>
          <div className="settings-info-row"><span>版本</span><span>2.0.2</span></div>
        </div>
      </div>
    </div>
  );
}
