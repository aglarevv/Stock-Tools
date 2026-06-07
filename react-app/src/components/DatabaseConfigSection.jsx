/**
 * DatabaseConfigSection — 数据库配置区块
 *
 * 纯展示组件：渲染数据库引擎选择、MySQL 连接参数、当前状态。
 */
import Icon from "./Icon.jsx";

export default function DatabaseConfigSection({
  settings, onUpdate, isMySQL, currentDbType, dbTypeChanged, dbStatus, dbError,
}) {
  return (
    <div className="card">
      <div className="card-header">
        <h2>数据库</h2>
        <span className="card-hint">切换后需重启应用</span>
      </div>
      <div className="card-body">
        <div className="form-row">
          <div className="form-field">
            <label>数据库引擎</label>
            <div style={{ display: "flex", gap: 24, paddingTop: 6, flexWrap: "wrap" }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontWeight: 500, lineHeight: "20px", flexShrink: 0 }}>
                <input type="radio" name="dbType" value="sqlite" checked={settings.dbType === "sqlite"}
                  onChange={() => onUpdate("dbType", "sqlite")} style={{ margin: 0, flexShrink: 0 }} />
                <span>SQLite（本地文件，无需安装）</span>
              </label>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontWeight: 500, lineHeight: "20px", flexShrink: 0 }}>
                <input type="radio" name="dbType" value="mysql" checked={settings.dbType === "mysql"}
                  onChange={() => onUpdate("dbType", "mysql")} style={{ margin: 0, flexShrink: 0 }} />
                <span>MySQL（远程服务器）</span>
              </label>
            </div>
            <small>初次启动默认使用 SQLite。切换数据库类型后需重启应用生效。</small>
          </div>
        </div>

        {isMySQL ? (
          <>
            <div className="form-row cols-2">
              <div className="form-field"><label>主机地址</label><input value={settings.dbHost} onChange={(e) => onUpdate("dbHost", e.target.value)} /></div>
              <div className="form-field"><label>端口</label><input type="number" value={settings.dbPort} onChange={(e) => onUpdate("dbPort", e.target.value)} /></div>
            </div>
            <div className="form-row cols-2">
              <div className="form-field"><label>用户名</label><input value={settings.dbUser} onChange={(e) => onUpdate("dbUser", e.target.value)} /></div>
              <div className="form-field"><label>密码</label><input type="password" value={settings.dbPassword} onChange={(e) => onUpdate("dbPassword", e.target.value)} placeholder="数据库密码" /></div>
            </div>
            <div className="form-row"><div className="form-field"><label>数据库名</label><input value={settings.dbName} onChange={(e) => onUpdate("dbName", e.target.value)} /></div></div>
          </>
        ) : (
          <>
            <div className="settings-info-row"><span>存储位置</span><span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>~/.stock-toolbox/toolbox.db</span></div>
            <div className="settings-info-row"><span>说明</span><span>无需安装任何数据库，开箱即用</span></div>
          </>
        )}

        <div className="settings-info-row">
          <span>当前运行</span>
          <span style={{ fontWeight: 600 }}>{currentDbType === "mysql" ? "MySQL" : "SQLite"} — {dbStatus}</span>
        </div>
        <div className="settings-info-row">
          <span>下次启动使用</span>
          <span style={{ fontWeight: 500, color: "var(--accent)" }}>
            {settings.dbType === "mysql" ? "MySQL" : "SQLite"}{dbTypeChanged ? "（已变更）" : ""}
          </span>
        </div>
        {dbError && (
          <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "var(--loss-soft)", border: "1px solid var(--loss)", fontSize: 13, color: "var(--loss)", lineHeight: 1.5 }}>
            <Icon name="alert-triangle" size={12} style={{ verticalAlign: -1, marginRight: 2 }} /> {dbError}
          </div>
        )}
      </div>
    </div>
  );
}
