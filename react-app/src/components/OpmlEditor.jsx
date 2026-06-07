/**
 * OpmlEditor — RSS 源管理弹窗
 *
 * 职责：编辑 OPML 格式的 RSS 源列表，支持保存和恢复默认配置。
 * 所有状态由父组件管理，通过 props 传入。
 */
import Icon from "./Icon.jsx";
import Button from "./Button.jsx";

export default function OpmlEditor({
  content, loading, onChange, onSave, onRestoreDefault, onClose,
}) {
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{
      position: "fixed", inset: 0, zIndex: 1001, background: "rgba(0,0,0,0.35)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{
        background: "var(--bg-card)", borderRadius: 12, maxWidth: 750, width: "100%",
        maxHeight: "85vh", display: "flex", flexDirection: "column",
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <h3 style={{ margin: 0 }}><Icon name="rss" size={16} style={{ verticalAlign: -2, marginRight: 4 }} /> RSS 源管理（OPML）</h3>
          <Button variant="ghost" size="sm" icon="x" onClick={onClose} />
        </div>
        <div style={{ padding: 12, fontSize: 12, color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
          编辑 OPML 格式的 RSS 源列表。每行一个 &lt;outline&gt; 标签，xmlUrl 为 RSS 地址。也可粘贴其他阅读器的 OPML 导出内容。
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
          {loading && !content ? (
            <div className="empty-text" style={{ padding: 40 }}>加载中…</div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => onChange(e.target.value)}
              style={{
                width: "100%", minHeight: 400, border: "1px solid var(--border-default)",
                borderRadius: 8, padding: 12, fontFamily: "var(--font-mono)", fontSize: 12,
                lineHeight: 1.6, resize: "vertical", background: "var(--bg-input)",
                color: "var(--text-primary)", outline: "none",
              }}
              placeholder={`<?xml version="1.0" encoding="utf-8"?>\n<opml version="2.0">\n  <head><title>我的 RSS 源</title></head>\n  <body>\n    <outline text="分类名">\n      <outline type="rss" text="源名称" xmlUrl="https://example.com/feed.xml"/>\n    </outline>\n  </body>\n</opml>`}
              spellCheck={false}
            />
          )}
        </div>
        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>保存后自动刷新文章 · 保存在本地用户目录</span>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" size="sm" icon="undo" onClick={onRestoreDefault} disabled={loading} style={{ color: "var(--warning)" }}>恢复默认 OPML</Button>
            <Button variant="ghost" onClick={onClose}>取消</Button>
            <Button variant="primary" icon="save" onClick={onSave} disabled={loading} loading={loading}>保存 OPML</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
