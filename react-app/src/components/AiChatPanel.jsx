/**
 * AiChatPanel — AI 复盘助手聊天面板
 *
 * 纯展示组件：渲染聊天消息列表和输入框。
 * 所有状态逻辑由 useAiChat hook 管理。
 */
import Button from "./Button.jsx";
import Icon from "./Icon.jsx";

export default function AiChatPanel({ messages, input, onInputChange, loading, onSend, onClear, endRef }) {
  return (
    <div className="card">
      <div className="card-header">
        <h2><Icon name="bot" size={16} style={{ verticalAlign: -3, marginRight: 4 }} /> AI 复盘助手</h2>
        <Button variant="ghost" size="sm" onClick={onClear}>清空对话</Button>
      </div>
      <div className="ai-chat-body">
        <div className="ai-messages">
          {messages.map((m, i) => (
            <div key={i} className={`ai-msg ${m.role}`}>
              {m.text}
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <div className="ai-input-row">
          <textarea
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="输入你的问题…"
          />
          <Button variant="primary" icon="send" iconSize={16} onClick={onSend} disabled={loading} />
        </div>
      </div>
    </div>
  );
}
