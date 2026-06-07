/**
 * AiConfigSection — AI 接口配置区块
 *
 * 纯展示组件：渲染 AI 配置表单，所有状态由父组件管理。
 */
import Icon from "./Icon.jsx";

export default function AiConfigSection({ settings, onUpdate }) {
  return (
    <div className="card">
      <div className="card-header"><h2><Icon name="bot" size={14} style={{ verticalAlign: -2, marginRight: 4 }} /> AI 接口配置</h2></div>
      <div className="card-body">
        <div className="form-row">
          <div className="form-field">
            <label>API 地址</label>
            <input value={settings.aiUrl} onChange={(e) => onUpdate("aiUrl", e.target.value)} placeholder="https://api.deepseek.com" />
            <small>兼容 OpenAI 接口格式（输入 base URL 或完整地址均可）</small>
          </div>
        </div>
        <div className="form-row">
          <div className="form-field">
            <label>API Key</label>
            <input type="password" value={settings.aiKey} onChange={(e) => onUpdate("aiKey", e.target.value)} placeholder="sk-xxxxxxxx" />
            <small>密钥使用 AES-256-GCM 加密存储</small>
          </div>
        </div>
        <div className="form-row cols-2">
          <div className="form-field">
            <label>模型名称</label>
            <input value={settings.aiModel} onChange={(e) => onUpdate("aiModel", e.target.value)} placeholder="deepseek-chat" />
          </div>
          <div className="form-field">
            <label>温度 (0-2)</label>
            <input type="number" value={settings.aiTemperature} onChange={(e) => onUpdate("aiTemperature", e.target.value)} min="0" max="2" step="0.1" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-field">
            <label>思考模式</label>
            <select value={settings.aiThinking ? "1" : "0"} onChange={(e) => onUpdate("aiThinking", e.target.value === "1")}>
              <option value="1">启用（DeepSeek: 思维链推理）</option>
              <option value="0">关闭（标准模式）</option>
            </select>
            <small>DeepSeek 模型启用后输出思维链过程，其他模型自动忽略</small>
          </div>
        </div>
      </div>
    </div>
  );
}
