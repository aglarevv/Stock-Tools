/**
 * HistoryDigestPanel — 历史日报面板
 *
 * 纯展示组件：显示历史日报日期列表，点击查看详情。
 */
import Icon from "./Icon.jsx";
import Button from "./Button.jsx";
import { renderDigest } from "./DigestRenderer.jsx";

export default function HistoryDigestPanel({
  historyList, historyDigest, historyLoading,
  selectedDate, onSelectDate, onClose,
}) {
  return (
    <div className="card" style={{ marginBottom: 16, borderColor: "var(--accent)", borderWidth: 2 }}>
      <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2><Icon name="calendar" size={16} style={{ verticalAlign: -2, marginRight: 4 }} /> 历史日报</h2>
        <Button variant="ghost" size="sm" icon="x" onClick={onClose}>关闭</Button>
      </div>
      <div className="card-body">
        {historyList.length === 0 && <div className="empty-text" style={{ fontSize: 13 }}>暂无历史日报记录</div>}
        {historyList.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: historyDigest ? 16 : 0 }}>
            {historyList.map((h) => (
              <Button key={h.date} variant={selectedDate === h.date ? "primary" : "ghost"} size="sm"
                onClick={() => onSelectDate(h.date)}>
                {h.date}
                {h.sentiment && (
                  <span className="badge" style={{
                    marginLeft: 6, fontSize: 10,
                    background: h.sentiment.includes("乐观") ? "var(--profit-soft)" : h.sentiment.includes("悲观") ? "var(--loss-soft)" : "var(--accent-soft)",
                    color: h.sentiment.includes("乐观") ? "var(--profit)" : h.sentiment.includes("悲观") ? "var(--loss)" : "var(--accent)",
                  }}>{h.sentiment}</span>
                )}
              </Button>
            ))}
          </div>
        )}
        {historyLoading && <div className="empty-text">⏳ 加载中…</div>}
        {historyDigest && !historyLoading && (
          <div style={{ marginTop: 12, padding: 12, background: "var(--bg-root)", borderRadius: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 12, color: "var(--text-muted)" }}>
              <span>{historyDigest.date} · {historyDigest.sentiment} · {historyDigest.sourceCount} 篇来源</span>
              <span>生成于 {new Date(historyDigest.createdAt).toLocaleString("zh-CN")}</span>
            </div>
            <div className="digest-content" style={{ fontSize: 14, lineHeight: 1.85, wordBreak: "break-word" }}>
              {renderDigest(historyDigest.digest, undefined,
                () => historyDigest.articles || [])}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
