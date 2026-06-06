/**
 * AiChatPanel — AI 复盘助手聊天面板
 *
 * 纯展示组件：渲染聊天消息列表和输入框。
 * 所有状态逻辑由 useAiChat hook 管理。
 */
export default function AiChatPanel({ messages, input, onInputChange, loading, onSend, onClear, endRef }) {
  return (
    <div className="card">
      <div className="card-header">
        <h2>🤖 AI 复盘助手</h2>
        <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={onClear}>
          清空对话
        </button>
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
          <button className="btn btn-primary" onClick={onSend} disabled={loading}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
