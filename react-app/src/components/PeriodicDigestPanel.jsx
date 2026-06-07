/**
 * PeriodicDigestPanel — 周报/月报精选面板
 *
 * 包含周报/月报生成按钮、当前结果展示、历史记录弹窗。
 */
import Icon from "./Icon.jsx";
import Button from "./Button.jsx";
import { renderDigest } from "./DigestRenderer.jsx";

export default function PeriodicDigestPanel({
  weeklyDigest, monthlyDigest, weeklyLoading, monthlyLoading,
  periodicList, viewingPeriodic, showHistory,
  aiConfigured,
  onGenerateWeekly, onGenerateMonthly,
  onViewPeriodic, onToggleHistory, onClose,
}) {
  const noData = aiConfigured && !weeklyDigest && !monthlyDigest && !weeklyLoading && !monthlyLoading;

  return (
    <>
      {/* 主卡片 */}
      <div className="card">
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <h2><Icon name="clock" size={16} style={{ verticalAlign: -3, marginRight: 4 }} /> 周报/月报精选</h2>
          <div style={{ display: "flex", gap: 8 }}>
            {periodicList.length > 0 && (
              <Button variant="ghost" size="sm" icon="calendar" onClick={onToggleHistory}>
                历史记录 ({periodicList.length})
              </Button>
            )}
            <Button variant="primary" size="sm" icon="sparkles" onClick={onGenerateWeekly}
              disabled={weeklyLoading || !aiConfigured} loading={weeklyLoading}>生成周报</Button>
            <Button variant="primary" size="sm" icon="sparkles" onClick={onGenerateMonthly}
              disabled={monthlyLoading || !aiConfigured} loading={monthlyLoading}>生成月报</Button>
          </div>
        </div>
        <div className="card-body">
          {!aiConfigured && (
            <div className="empty-text" style={{ fontSize: 13, color: "var(--text-muted)" }}>
              请先在设置中配置 AI API Key，即可生成周报/月报精选。
            </div>
          )}
          {noData && (
            <div className="empty-text" style={{ fontSize: 13, color: "var(--text-muted)" }}>
              点击上方按钮，AI 基于历史日报文章生成周期精选摘要。
            </div>
          )}
          {weeklyLoading && <div className="empty-text" style={{ padding: 16 }}>⏳ AI 正在分析过去一周的文章，生成周报精选…</div>}
          {monthlyLoading && <div className="empty-text" style={{ padding: 16 }}>⏳ AI 正在分析过去一个月的文章，生成月报精选…</div>}
          {weeklyDigest && (
            <div style={{ marginBottom: monthlyDigest ? 20 : 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <strong style={{ fontSize: 14, color: "var(--accent)" }}>
                  <Icon name="calendar" size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
                  {weeklyDigest.periodLabel} 周报 · {weeklyDigest.articlesCount} 篇精选
                </strong>
              </div>
              <div className="digest-content" style={{ fontSize: 14, lineHeight: 1.85, wordBreak: "break-word" }}>
                {renderDigest(weeklyDigest.digest)}
              </div>
            </div>
          )}
          {monthlyDigest && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <strong style={{ fontSize: 14, color: "var(--accent)" }}>
                  <Icon name="calendar" size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
                  {monthlyDigest.periodLabel} 月报 · {monthlyDigest.articlesCount} 篇精选
                </strong>
              </div>
              <div className="digest-content" style={{ fontSize: 14, lineHeight: 1.85, wordBreak: "break-word" }}>
                {renderDigest(monthlyDigest.digest)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 历史记录弹窗 */}
      {showHistory && (
        <div className="card" style={{ marginBottom: 16, borderColor: "var(--accent)", borderWidth: 2 }}>
          <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2><Icon name="clock" size={14} style={{ verticalAlign: -2, marginRight: 4 }} /> 历史周报/月报</h2>
            <Button variant="ghost" size="sm" icon="x" onClick={onClose}>关闭</Button>
          </div>
          <div className="card-body">
            {periodicList.length === 0 && <div className="empty-text" style={{ fontSize: 13 }}>暂无历史记录</div>}
            {periodicList.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: viewingPeriodic ? 16 : 0 }}>
                {periodicList.map((p) => (
                  <Button key={p.id} variant={viewingPeriodic?.id === p.id ? "primary" : "ghost"} size="sm"
                    onClick={() => onViewPeriodic(p.id)}>
                    <Icon name={p.digestType === "weekly" ? "calendar" : "clock"} size={12} style={{ verticalAlign: -1, marginRight: 2 }} />
                    {p.periodLabel}
                    {p.sentiment && (
                      <span className="badge" style={{
                        marginLeft: 4, fontSize: 10,
                        background: p.sentiment.includes("乐观") ? "var(--profit-soft)" : p.sentiment.includes("悲观") ? "var(--loss-soft)" : "var(--accent-soft)",
                        color: p.sentiment.includes("乐观") ? "var(--profit)" : p.sentiment.includes("悲观") ? "var(--loss)" : "var(--accent)",
                      }}>{p.sentiment}</span>
                    )}
                  </Button>
                ))}
              </div>
            )}
            {viewingPeriodic && (
              <div style={{ marginTop: 12, padding: 12, background: "var(--bg-root)", borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 12, color: "var(--text-muted)" }}>
                  <span>{viewingPeriodic.periodLabel} · {viewingPeriodic.digestType === "weekly" ? "周报" : "月报"} · {viewingPeriodic.articlesCount} 篇精选</span>
                </div>
                <div className="digest-content" style={{ fontSize: 14, lineHeight: 1.85, wordBreak: "break-word" }}>
                  {renderDigest(viewingPeriodic.digest)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
