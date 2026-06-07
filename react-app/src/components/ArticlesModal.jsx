/**
 * ArticlesModal — 全部文章列表弹窗
 *
 * 纯展示组件：显示当日的全部 RSS 文章列表，支持点击跳转原文。
 */
import { useRef } from "react";
import Icon from "./Icon.jsx";
import Button from "./Button.jsx";

export default function ArticlesModal({ articles, onClose }) {
  const ref = useRef(null);

  function onBackdrop(e) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div ref={ref} onClick={onBackdrop} style={{
      position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.35)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{
        background: "var(--bg-card)", borderRadius: 12, maxWidth: 700, width: "100%",
        maxHeight: "80vh", overflow: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
      }}>
        <div style={{
          position: "sticky", top: 0, background: "var(--bg-card)", padding: "16px 20px",
          borderBottom: "1px solid var(--border-subtle)", display: "flex",
          justifyContent: "space-between", alignItems: "center", zIndex: 1,
        }}>
          <h3 style={{ margin: 0 }}>
            <Icon name="clipboard" size={16} style={{ verticalAlign: -2, marginRight: 4 }} />
            全部文章（{articles.length} 篇）
          </h3>
          <Button variant="ghost" size="sm" icon="x" onClick={onClose} />
        </div>
        <div style={{ padding: "8px 20px 20px" }}>
          {articles.map((a, idx) => (
            <div key={idx} style={{
              padding: "8px 0", borderBottom: idx < articles.length - 1 ? "1px solid var(--border-subtle)" : "none",
              display: "flex", alignItems: "flex-start", gap: 8,
            }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 24, flexShrink: 0, textAlign: "right" }}>{idx + 1}.</span>
              <span className="badge" style={{
                fontSize: 10, flexShrink: 0,
                background: a.sentiment === "利好" ? "var(--profit-soft)" : a.sentiment === "利空" ? "var(--loss-soft)" : "var(--accent-soft)",
                color: a.sentiment === "利好" ? "var(--profit)" : a.sentiment === "利空" ? "var(--loss)" : "var(--accent)",
              }}>{a.sentiment}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <a href={a.link} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 13, color: "var(--text-primary)", textDecoration: "none" }}>{a.title}</a>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{a.source}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
