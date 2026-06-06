import { useState, useEffect, useRef } from "react";
import { api } from "../utils/api.js";

const defaults = {
  theme: "light", aiUrl: "", aiKey: "", aiModel: "", aiTemperature: 0.7, aiThinking: true,
  dbHost: "localhost", dbPort: "3306", dbUser: "root", dbPassword: "", dbName: "stock_toolbox",
};

// 需要使用 ref 从 DOM 读取实际值的字段（粘贴可能不触发 React onChange）
const DOM_READ_KEYS = ["aiUrl", "aiKey", "aiModel", "aiTemperature", "dbHost", "dbPort", "dbUser", "dbPassword", "dbName"];

export default function Settings({ showToast }) {
  const [s, setS] = useState({ ...defaults });
  const [dbStatus, setDbStatus] = useState("检测中…");
  const [dbType, setDbType] = useState(null); // "mysql" | "sqlite" | null
  const refs = useRef({});

  useEffect(() => { load(); updateDbStatus(); }, []);

  async function load() {
    try {
      const data = await api.getSettings();
      if (data && data.settings && Object.keys(data.settings).length > 0) {
        setS((prev) => ({ ...prev, ...data.settings }));
      }
    } catch (e) {
      showToast(`加载设置失败：${e.message}`, "error");
    }
  }

  async function updateDbStatus() {
    try {
      const d = await api.health();
      setDbStatus(d.database === "ready" ? "✅ 已连接" : "⚠️ 未就绪");
      setDbType(d.dbType || null);
    } catch { setDbStatus("❌ 无法连接"); }
  }

  async function save() {
    // 保存前从 DOM 同步实际输入值（粘贴可能不触发 React onChange）
    const synced = { ...s };
    for (const key of DOM_READ_KEYS) {
      if (refs.current[key]) {
        synced[key] = refs.current[key].value;
      }
    }
    try {
      await api.saveSettings(synced);
      setS(synced);
      showToast("设置已保存到数据库", "success");
    } catch (e) {
      showToast(`保存失败：${e.message}`, "error");
    }
  }

  const set = (k, v) => setS((p) => ({ ...p, [k]: v }));
  // 失焦时从 DOM 同步实际值（解决 WKWebView 粘贴不触发 onChange 的问题）
  const syncFromDom = (key) => {
    if (refs.current[key]) {
      set(key, refs.current[key].value);
    }
  };

  return (
    <div className="page">
      <div className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 className="topbar-title"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:-4,marginRight:6}}><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>设置</h1>
          <span className="badge">软件配置</span>
        </div>
        <button className="btn btn-primary" onClick={save}>保存设置</button>
      </div>

      <div className="card">
        <div className="card-header"><h2>🎨 外观</h2></div>
        <div className="card-body">
          <div className="form-row"><div className="form-field"><label>主题模式</label><select value={s.theme} onChange={(e) => set("theme", e.target.value)}><option value="light">浅色</option><option value="dark">深色</option></select></div></div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2>🤖 AI 接口配置</h2></div>
        <div className="card-body">
          <div className="form-row"><div className="form-field"><label>API 地址</label><input ref={(el) => refs.current.aiUrl = el} value={s.aiUrl} onChange={(e) => set("aiUrl", e.target.value)} onBlur={() => syncFromDom("aiUrl")} placeholder="https://api.deepseek.com" /><small>兼容 OpenAI 接口格式（输入 base URL 或完整地址均可）</small></div></div>
          <div className="form-row"><div className="form-field"><label>API Key</label><input ref={(el) => refs.current.aiKey = el} type="password" value={s.aiKey} onChange={(e) => set("aiKey", e.target.value)} onBlur={() => syncFromDom("aiKey")} placeholder="sk-xxxxxxxx" /><small>密钥使用 AES-256-GCM 加密存储</small></div></div>
          <div className="form-row cols-2">
            <div className="form-field"><label>模型名称</label><input ref={(el) => refs.current.aiModel = el} value={s.aiModel} onChange={(e) => set("aiModel", e.target.value)} onBlur={() => syncFromDom("aiModel")} placeholder="deepseek-chat" /></div>
            <div className="form-field"><label>温度 (0-2)</label><input ref={(el) => refs.current.aiTemperature = el} type="number" value={s.aiTemperature} onChange={(e) => set("aiTemperature", e.target.value)} onBlur={() => syncFromDom("aiTemperature")} min="0" max="2" step="0.1" /></div>
          </div>
          <div className="form-row"><div className="form-field"><label>思考模式</label><select value={s.aiThinking ? "1" : "0"} onChange={(e) => set("aiThinking", e.target.value === "1")}><option value="1">🧠 启用（DeepSeek: 思维链推理）</option><option value="0">💨 关闭（标准模式）</option></select><small>DeepSeek 模型启用后输出思维链过程，其他模型自动忽略</small></div></div>
        </div>
      </div>

      {dbType === "sqlite" ? (
        <div className="card">
          <div className="card-header"><h2>🗄️ 数据库</h2><span className="card-hint">SQLite 本地存储</span></div>
          <div className="card-body">
            <div className="settings-info-row"><span>数据库引擎</span><span>SQLite（本地文件）</span></div>
            <div className="settings-info-row"><span>存储位置</span><span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>用户数据目录/toolbox.db</span></div>
            <div className="settings-info-row"><span>说明</span><span>无需安装 MySQL，数据存储在本地文件中</span></div>
            <div className="settings-info-row"><span>当前状态</span><span>{dbStatus}</span></div>
          </div>
        </div>
      ) : (
      <div className="card">
        <div className="card-header"><h2>🗄️ 数据库服务器配置</h2><span className="card-hint">需重启服务生效</span></div>
        <div className="card-body">
          <div className="form-row cols-2">
            <div className="form-field"><label>主机地址</label><input ref={(el) => refs.current.dbHost = el} value={s.dbHost} onChange={(e) => set("dbHost", e.target.value)} onBlur={() => syncFromDom("dbHost")} /></div>
            <div className="form-field"><label>端口</label><input ref={(el) => refs.current.dbPort = el} type="number" value={s.dbPort} onChange={(e) => set("dbPort", e.target.value)} onBlur={() => syncFromDom("dbPort")} /></div>
          </div>
          <div className="form-row cols-2">
            <div className="form-field"><label>用户名</label><input ref={(el) => refs.current.dbUser = el} value={s.dbUser} onChange={(e) => set("dbUser", e.target.value)} onBlur={() => syncFromDom("dbUser")} /></div>
            <div className="form-field"><label>密码</label><input ref={(el) => refs.current.dbPassword = el} type="password" value={s.dbPassword} onChange={(e) => set("dbPassword", e.target.value)} onBlur={() => syncFromDom("dbPassword")} placeholder="数据库密码" /></div>
          </div>
          <div className="form-row"><div className="form-field"><label>数据库名</label><input ref={(el) => refs.current.dbName = el} value={s.dbName} onChange={(e) => set("dbName", e.target.value)} onBlur={() => syncFromDom("dbName")} /></div></div>
          <div className="settings-info-row"><span>当前连接状态</span><span>{dbStatus}</span></div>
        </div>
      </div>
      )}

      <div className="card">
        <div className="card-header"><h2>ℹ️ 关于</h2></div>
        <div className="card-body">
          <div className="settings-info-row"><span>应用名称</span><span>工具箱 · Toolbox</span></div>
          <div className="settings-info-row"><span>版本</span><span>2.0.0</span></div>
        </div>
      </div>
    </div>
  );
}
