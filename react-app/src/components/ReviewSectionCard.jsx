/**
 * ReviewSectionCard — 复盘版块摘要卡片
 *
 * 纯展示组件：渲染单个复盘版块的标题、徽章和摘要网格。
 * 点击打开 Modal 由父组件通过 onClick prop 控制。
 */

const BADGE_STYLE_MAP = {
  "badge-accent": { bg: "var(--accent-soft)", color: "var(--accent)" },
  "badge-info": { bg: "var(--info-soft)", color: "var(--info)" },
  "badge-warning": { bg: "rgba(217,119,6,0.05)", color: "var(--warning)" },
  "badge-loss": { bg: "var(--loss-soft)", color: "var(--loss)" },
  "badge-profit": { bg: "var(--loss-soft)", color: "var(--loss)" },
};

export default function ReviewSectionCard({ config, review, onClick }) {
  const { title, badge, badgeClass, summaryKeys, summaryLabels } = config;
  const badgeStyle = BADGE_STYLE_MAP[badgeClass] || BADGE_STYLE_MAP["badge-accent"];

  return (
    <div className="card">
      <div className="card-header clickable" onClick={onClick}>
        <h2>{title}</h2>
        <span className="badge" style={{ background: badgeStyle.bg, color: badgeStyle.color, fontSize: 10 }}>
          {badge}
        </span>
      </div>
      <div className="card-body" onClick={onClick} style={{ cursor: "pointer" }}>
        <div className="review-grid">
          {summaryKeys.map((k, i) => (
            <div className="summary-item" key={k}>
              <label>{summaryLabels[i]}</label>
              <p className={review[k] ? "filled" : ""}>{review[k] || "待填写"}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
