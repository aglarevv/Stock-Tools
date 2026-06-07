/**
 * DailyNews — 每日时事页面（编排器）
 *
 * 职责仅限：调用 useDailyNews hook 获取数据，将 UI 区域委托给子组件。
 * 所有业务逻辑、数据获取、状态管理都在 useDailyNews hook 中。
 */
import useDailyNews from "../hooks/useDailyNews.js";
import Icon from "./Icon.jsx";
import Button from "./Button.jsx";
import { renderDigest, DigestFooter } from "./DigestRenderer.jsx";
import ArticlesModal from "./ArticlesModal.jsx";
import OpmlEditor from "./OpmlEditor.jsx";
import HistoryDigestPanel from "./HistoryDigestPanel.jsx";
import PeriodicDigestPanel from "./PeriodicDigestPanel.jsx";

export default function DailyNews({ showToast }) {
  const ctx = useDailyNews(showToast);

  if (ctx.loading) {
    return <div className="page"><div className="empty-text">正在采集分析…</div></div>;
  }
  if (!ctx.data && !ctx.loading) {
    return <div className="page"><div className="empty-text">暂无数据，请检查 RSS 源配置</div></div>;
  }
  if (!ctx.data) return null;

  const { data, digest, digestMeta } = ctx;
  const hasDigest = Boolean(digest);

  return (
    <div className="page">
      {ctx.showHistory && (
        <HistoryDigestPanel
          historyList={ctx.historyList}
          historyDigest={ctx.historyDigest}
          historyLoading={ctx.historyLoading}
          selectedDate={ctx.historyDigest?.date}
          onSelectDate={ctx.viewHistory}
          onClose={() => { ctx.setShowHistory(false); ctx.setHistoryDigest(null); }}
        />
      )}

      <div className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 className="topbar-title">
            <Icon name="news" size={22} style={{ verticalAlign: -4, marginRight: 6 }} />
            每日时事
          </h1>
          <span className="badge">{data.date}</span>
          {data.duplicateCount > 0 && (
            <span className="badge" style={{
              background: data.hasNewArticles ? "rgba(22,163,74,0.08)" : "rgba(217,119,6,0.08)",
              color: data.hasNewArticles ? "var(--profit)" : "var(--warning)", fontSize: 10,
            }}>
              {data.newArticlesCount || 0} 篇新
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {ctx.historyList.length > 0 && (
            <Button variant="ghost" size="sm" icon="calendar"
              onClick={() => { ctx.setShowHistory(!ctx.showHistory); if (!ctx.showHistory) ctx.setHistoryDigest(null); }}>
              历史 ({ctx.historyList.length})
            </Button>
          )}
          <Button variant="ghost" size="sm" icon="rss" onClick={ctx.openOpmlEditor} title="管理 RSS 源">源管理</Button>
          <Button variant="ghost" size="sm" icon="refresh" onClick={ctx.refreshArticles} disabled={ctx.refreshing} loading={ctx.refreshing}>刷新文章</Button>
        </div>
      </div>

      <div className="card" style={{ borderColor: hasDigest ? "var(--accent)" : "var(--border-subtle)", borderWidth: 2 }}>
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <h2 style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Icon name="check" size={20} /> AI 日报摘要
            {digestMeta?.sentiment && (
              <span className="badge" style={{
                background: digestMeta.sentiment.includes("乐观") ? "var(--profit-soft)" : digestMeta.sentiment.includes("悲观") ? "var(--loss-soft)" : "var(--accent-soft)",
                color: digestMeta.sentiment.includes("乐观") ? "var(--profit)" : digestMeta.sentiment.includes("悲观") ? "var(--loss)" : "var(--accent)", fontSize: 11,
              }}>{digestMeta.sentiment}</span>
            )}
            {digestMeta?.createdAt && (
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}>
                生成于 {new Date(digestMeta.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </h2>
          <Button variant="primary" icon={hasDigest ? "refresh" : "sparkles"} onClick={ctx.generateDigest}
            disabled={ctx.digestLoading || !ctx.aiConfigured || (!data?.hasNewArticles && data?.duplicateCount > 0)}
            loading={ctx.digestLoading}
            title={!ctx.aiConfigured ? "请先在设置中配置 AI API Key" : (!data?.hasNewArticles && data?.duplicateCount > 0) ? "今日没有新文章" : ""}
            style={{ fontSize: 13, padding: "6px 16px" }}>
            {hasDigest ? "重新生成" : "AI 生成日报摘要"}
          </Button>
        </div>
        <div className="card-body">
          {!ctx.aiConfigured && !hasDigest && (
            <div className="empty-text" style={{ padding: 12, fontSize: 13, color: "var(--text-muted)" }}>
              <Icon name="alert-triangle" size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
              请先在「设置」中配置 AI API Key
            </div>
          )}
          {!ctx.aiConfigured && hasDigest && (
            <div style={{ padding: "4px 0 8px", fontSize: 11, color: "var(--text-muted)" }}>
              <Icon name="alert-triangle" size={12} style={{ verticalAlign: -2, marginRight: 2 }} />
              未配置 AI 接口，显示的是历史摘要。
            </div>
          )}
          {ctx.aiConfigured && !hasDigest && !ctx.digestLoading && data?.hasNewArticles && (
            <div className="empty-text" style={{ padding: 12, fontSize: 13, color: "var(--text-muted)" }}>
              点击上方按钮，AI 复盘助手按 3-SOP 结构生成日报摘要
            </div>
          )}
          {ctx.aiConfigured && !hasDigest && !ctx.digestLoading && !data?.hasNewArticles && (
            <div className="empty-text" style={{ padding: 12, fontSize: 13, color: "var(--warning)" }}>
              <Icon name="alert-triangle" size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
              今日 RSS 无新文章（{data.duplicateCount || 0} 篇已收录）
            </div>
          )}
          {ctx.digestLoading && <div className="empty-text" style={{ padding: 20 }}>⏳ AI 正在分析今日文章，生成日报摘要…</div>}
          {hasDigest && (
            <div className="digest-content" style={{ fontSize: 14, lineHeight: 1.85, wordBreak: "break-word" }}>
              {renderDigest(digest, undefined, () => ctx.allArticles)}
            </div>
          )}
          {hasDigest && <DigestFooter sourceCount={digestMeta?.sourceCount} />}
        </div>
      </div>

      <div className="metrics-row">
        <div className="metric-card metric-info" style={{ cursor: "pointer" }}
          onClick={() => ctx.allArticles.length > 0 && ctx.setShowAllArticles(true)} title="点击查看全部文章列表">
          <div className="metric-label">文章总数 <Icon name="search" size={10} style={{ verticalAlign: 0 }} /></div>
          <div className="metric-value" style={{ color: "var(--accent)" }}>{data.totalArticles}</div>
          <div className="metric-desc">{data.topics.length} 个 SOP 分类</div>
        </div>
        <div className="metric-card" style={{ background: data.marketSentiment.label.includes("乐观") ? "var(--profit-soft)" : data.marketSentiment.label.includes("悲观") ? "var(--loss-soft)" : "var(--accent-soft)" }}>
          <div className="metric-label">市场情绪</div>
          <div className="metric-value" style={{ color: data.marketSentiment.label.includes("乐观") ? "var(--profit)" : data.marketSentiment.label.includes("悲观") ? "var(--loss)" : "var(--accent)" }}>{data.marketSentiment.label}</div>
          <div className="metric-desc">{data.marketSentiment.detail}</div>
        </div>
        <div className="metric-card metric-base">
          <div className="metric-label">多空比</div>
          <div className="metric-value">{data.marketSentiment.ratio}</div>
          <div className="metric-desc">利好 : 利空</div>
        </div>
      </div>

      <PeriodicDigestPanel
        weeklyDigest={ctx.weeklyDigest}
        monthlyDigest={ctx.monthlyDigest}
        weeklyLoading={ctx.weeklyLoading}
        monthlyLoading={ctx.monthlyLoading}
        periodicList={ctx.periodicList}
        viewingPeriodic={ctx.viewingPeriodic}
        showHistory={ctx.showPeriodicHistory}
        aiConfigured={ctx.aiConfigured}
        onGenerateWeekly={ctx.generateWeeklyDigest}
        onGenerateMonthly={ctx.generateMonthlyDigest}
        onViewPeriodic={ctx.viewPeriodicDigest}
        onToggleHistory={() => { ctx.setShowPeriodicHistory(!ctx.showPeriodicHistory); if (!ctx.showPeriodicHistory) ctx.setViewingPeriodic(null); }}
        onClose={() => { ctx.setShowPeriodicHistory(false); ctx.setViewingPeriodic(null); }}
      />

      {data.topics.map((topic, i) => {
        const sopLabels = {
          "SOP1 深度洞察": { icon: "brain", desc: "长期逻辑 · 商业模式 · 宏观定调" },
          "SOP2 势能扫描": { icon: "rss", desc: "资金流向 · 评级调整 · 突发热点" },
          "SOP3 区域/垂类": { icon: "microscope", desc: "查漏补缺 · 特定机会 · 技术前沿" },
        };
        const meta = sopLabels[topic.name] || { icon: "paperclip", desc: "" };
        return (
          <div className="card" key={i}>
            <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <h2><Icon name={meta.icon} size={16} style={{ verticalAlign: -3, marginRight: 4 }} /> {topic.name}</h2>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{meta.desc}</div>
              </div>
              <span className="badge">{topic.count} 篇</span>
            </div>
            <div className="card-body">
              {topic.highlights.map((h, j) => (
                <div key={j} style={{ padding: "8px 0", borderBottom: j < topic.highlights.length - 1 ? "1px solid var(--border-subtle)" : "none" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <span className="badge" style={{ fontSize: 10, flexShrink: 0, background: h.sentiment === "利好" ? "var(--profit-soft)" : h.sentiment === "利空" ? "var(--loss-soft)" : "var(--accent-soft)", color: h.sentiment === "利好" ? "var(--profit)" : h.sentiment === "利空" ? "var(--loss)" : "var(--accent)" }}>{h.sentiment}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <a href={h.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", textDecoration: "none", lineHeight: 1.4 }}>{h.title}</a>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{h.source}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {ctx.showAllArticles && <ArticlesModal articles={ctx.allArticles} onClose={() => ctx.setShowAllArticles(false)} />}

      {ctx.showOpmlEditor && (
        <OpmlEditor
          content={ctx.opmlContent}
          loading={ctx.opmlLoading}
          onChange={ctx.setOpmlContent}
          onSave={ctx.saveOpml}
          onRestoreDefault={ctx.restoreDefaultOpml}
          onClose={() => ctx.setShowOpmlEditor(false)}
        />
      )}
    </div>
  );
}
