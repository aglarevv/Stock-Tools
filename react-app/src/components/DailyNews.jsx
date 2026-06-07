import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../utils/api.js";
import Icon from "./Icon.jsx";
import Button from "./Button.jsx";

/**
 * 每日时事 — 3-SOP 分析日报 + AI 摘要 + 历史查看
 */
export default function DailyNews({ showToast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);  // 刷新时不隐藏已有数据
  const [digest, setDigest] = useState("");
  const [digestMeta, setDigestMeta] = useState(null);
  const [digestLoading, setDigestLoading] = useState(false);
  const [aiConfig, setAiConfig] = useState(null);
  const [aiConfigured, setAiConfigured] = useState(false);

  // 全部文章弹窗
  const [showAllArticles, setShowAllArticles] = useState(false);

  // 历史日报
  const [historyList, setHistoryList] = useState([]);
  const [historyDigest, setHistoryDigest] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // OPML 编辑器
  const [showOpmlEditor, setShowOpmlEditor] = useState(false);
  const [opmlContent, setOpmlContent] = useState("");
  const [opmlLoading, setOpmlLoading] = useState(false);

  // 周报/月报精选
  const [weeklyDigest, setWeeklyDigest] = useState(null);
  const [monthlyDigest, setMonthlyDigest] = useState(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [periodicList, setPeriodicList] = useState([]);
  const [showPeriodicHistory, setShowPeriodicHistory] = useState(false);
  const [viewingPeriodic, setViewingPeriodic] = useState(null);

  const modalRef = useRef(null);

  useEffect(() => { loadArticles(); loadAiConfig(); loadHistoryList(); loadPeriodicList(); }, []);

  async function loadArticles() {
    setLoading(true);
    try {
      const d = await api.dailyNews();
      setData(d);
      if (d.savedDigest?.digest) {
        setDigest(d.savedDigest.digest);
        setDigestMeta({ sentiment: d.savedDigest.sentiment, sourceCount: d.savedDigest.sourceCount, createdAt: d.savedDigest.createdAt });
      }
    } catch (e) {
      showToast(`加载失败：${e.message}`, "error");
    } finally { setLoading(false); }
  }

  /** 刷新文章：保留已有数据显示 spinner，不清空 data */
  async function refreshArticles() {
    setRefreshing(true);
    try {
      const d = await api.dailyNews();
      setData(d);
      if (d.savedDigest?.digest) {
        setDigest(d.savedDigest.digest);
        setDigestMeta({ sentiment: d.savedDigest.sentiment, sourceCount: d.savedDigest.sourceCount, createdAt: d.savedDigest.createdAt });
      }
      showToast("文章已刷新", "success");
    } catch (e) {
      showToast(`刷新失败：${e.message}`, "error");
    } finally { setRefreshing(false); }
  }

  async function loadAiConfig() {
    try {
      const s = (await api.getSettings()).settings || {};
      if (s.aiKey) {
        setAiConfig({ url: s.aiUrl, key: s.aiKey, model: s.aiModel, temperature: s.aiTemperature ?? 0.7, thinking: s.aiThinking !== false && s.aiThinking !== "false" });
        setAiConfigured(true);
      }
    } catch { /* ignore */ }
  }

  async function loadHistoryList() {
    try {
      const res = await api.dailyDigests();
      setHistoryList(res.digests || []);
    } catch { /* ignore */ }
  }

  async function viewHistory(date) {
    // 确保日期格式为 YYYY-MM-DD（兼容 MySQL Date 对象 / SQLite TEXT）
    let dateStr = date;
    if (date instanceof Date || (typeof date === "string" && date.includes("T"))) {
      dateStr = new Date(date).toISOString().slice(0, 10);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr).trim())) {
      showToast(`日期格式错误：${date}`, "error");
      return;
    }
    setHistoryLoading(true);
    setHistoryDigest(null);
    try {
      const d = await api.dailyDigestByDate(String(dateStr).trim());
      setHistoryDigest(d);
    } catch (e) {
      showToast(`加载历史日报失败：${e.message}`, "error");
    } finally { setHistoryLoading(false); }
  }

  const generateDigest = useCallback(async () => {
    if (!data?.topics) return;
    const allArticles = [];
    for (const topic of data.topics) {
      for (const h of topic.highlights) {
        allArticles.push({ source: h.source, title: h.title, link: h.link, summary: h.summary || "", category: topic.name, sentiment: h.sentiment });
      }
    }
    if (allArticles.length === 0) { showToast("暂无文章可生成摘要", "error"); return; }
    setDigestLoading(true); setDigest("");
    try {
      const res = await api.dailyDigest(allArticles, aiConfig);
      setDigest(res.digest || "");
      setDigestMeta(null);
      loadHistoryList(); // 刷新历史列表
    } catch (e) {
      showToast(`AI 摘要生成失败：${e.message}`, "error");
    } finally { setDigestLoading(false); }
  }, [data, aiConfig, showToast]);

  // ── 周报/月报精选 ──
  async function loadPeriodicList() {
    try {
      const res = await api.periodicDigests();
      setPeriodicList(res.digests || []);
    } catch { /* ignore */ }
  }

  async function generateWeeklyDigest() {
    if (!aiConfig) { showToast("请先在设置中配置 AI API Key", "error"); return; }
    setWeeklyLoading(true);
    setWeeklyDigest(null);
    try {
      const res = await api.weeklyDigest(aiConfig);
      setWeeklyDigest(res);
      showToast(`✅ ${res.periodLabel} 周报已生成`, "success");
      loadPeriodicList();
    } catch (e) {
      if (e.message?.includes("暂无日报数据")) {
        showToast("本周暂无日报数据，请先至少生成一篇日报摘要", "warning");
      } else {
        showToast(`周报生成失败：${e.message}`, "error");
      }
    } finally { setWeeklyLoading(false); }
  }

  async function generateMonthlyDigest() {
    if (!aiConfig) { showToast("请先在设置中配置 AI API Key", "error"); return; }
    setMonthlyLoading(true);
    setMonthlyDigest(null);
    try {
      const res = await api.monthlyDigest(aiConfig);
      setMonthlyDigest(res);
      showToast(`✅ ${res.periodLabel} 月报已生成`, "success");
      loadPeriodicList();
    } catch (e) {
      if (e.message?.includes("暂无日报数据")) {
        showToast("本月暂无日报数据，请先至少生成一篇日报摘要", "warning");
      } else {
        showToast(`月报生成失败：${e.message}`, "error");
      }
    } finally { setMonthlyLoading(false); }
  }

  async function viewPeriodicDigest(id) {
    try {
      const res = await api.periodicDigestById(id);
      setViewingPeriodic(res);
    } catch (e) {
      showToast(`加载失败：${e.message}`, "error");
    }
  }

  // 关闭弹窗（点击背景）
  function onModalBackdrop(e) { if (e.target === e.currentTarget) setShowAllArticles(false); }

  // ── 富文本渲染 ──
  function renderDigest(text, linkMapOverride) {
    if (!text) return null;
    const linkMap = linkMapOverride || buildLinkMap();
    // 先清理 markdown 标题符号（### → 空）
    const cleaned = text.replace(/^#{1,6}\s+/gm, "");
    const lines = cleaned.split("\n");
    return lines.map((line, li) => {
      if (!line.trim()) return <br key={li} />;
      const segments = parseInlineMarkdown(line, linkMap);
      const isSOP = /^(SOP\s*[123])/.test(line.trim());
      const isKey = /^(结语|展望|核心矛盾|明日|总体)/.test(line.trim());
      return (
        <p key={li} style={{ marginBottom: "0.5em", fontWeight: isSOP ? 700 : "normal", color: isSOP ? "var(--accent)" : isKey ? "var(--text-primary)" : "inherit", fontSize: isSOP ? 15 : 14, borderLeft: isSOP ? "3px solid var(--accent)" : "none", paddingLeft: isSOP ? 10 : 0 }}>
          {segments}
        </p>
      );
    });
  }

  function buildLinkMap(articlesOverride) {
    const src = articlesOverride || flattenArticles();
    const map = {};
    src.forEach((a, i) => { map[i + 1] = { title: a.title, link: a.link, source: a.source }; });
    return map;
  }

  function flattenArticles() {
    // 优先使用服务端返回的完整文章列表（未截断）
    if (data?.allArticles?.length) return data.allArticles;
    const arr = [];
    if (!data?.topics) return arr;
    for (const t of data.topics) for (const h of t.highlights) arr.push(h);
    return arr;
  }

  /** 打开 OPML 编辑器并加载当前内容 */
  async function openOpmlEditor() {
    setOpmlLoading(true);
    setShowOpmlEditor(true);
    try {
      const res = await api.getSourcesOpml();
      setOpmlContent(res.content || "");
    } catch (e) {
      showToast(`读取 OPML 失败：${e.message}`, "error");
    } finally { setOpmlLoading(false); }
  }

  /** 保存 OPML 并刷新文章 */
  async function saveOpml() {
    if (!opmlContent.trim() || opmlContent.trim().length < 50) {
      showToast("OPML 内容无效", "error");
      return;
    }
    setOpmlLoading(true);
    try {
      await api.saveSourcesOpml(opmlContent);
      showToast("OPML 已保存，正在重新采集…", "success");
      setShowOpmlEditor(false);
      // 刷新文章
      await refreshArticles();
    } catch (e) {
      showToast(`保存失败：${e.message}`, "error");
    } finally { setOpmlLoading(false); }
  }

  /** 恢复默认 OPML 配置 */
  async function restoreDefaultOpml() {
    if (!confirm("确认恢复默认 RSS 源配置？当前编辑的内容将丢失。")) return;
    setOpmlLoading(true);
    try {
      const res = await api.getDefaultSourcesOpml();
      setOpmlContent(res.content || "");
      showToast("已加载默认 OPML 配置，点击「保存并刷新」生效", "info");
    } catch (e) {
      showToast(`加载默认 OPML 失败：${e.message}`, "error");
    } finally { setOpmlLoading(false); }
  }

  function parseInlineMarkdown(line, linkMap) {
    // 匹配 [来源N] 和 [N] 两种格式
    const parts = line.split(/(\[(?:来源)?\d+\])/g);
    return parts.map((part, i) => {
      const citeM = part.match(/^\[(?:来源)?(\d+)\]$/);
      if (citeM) {
        const num = parseInt(citeM[1]);
        const info = linkMap[num];
        if (info?.link) {
          return (
            <a
              key={`c${i}`}
              href={info.link}
              target="_blank"
              rel="noopener noreferrer"
              className="cite-link"
              title={info.title}
              onClick={(e) => { e.preventDefault(); try { window.open(info.link, "_blank"); } catch {} }}
            >
              [{num}]
            </a>
          );
        }
        return <span key={`c${i}`} className="cite-muted">[{num}]</span>;
      }

      // 处理 **粗体** + 利空/利好颜色标注
      const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
      if (boldParts.length > 1) {
        return boldParts.map((bp, j) => {
          const bm = bp.match(/^\*\*(.+)\*\*$/);
          if (bm) {
            const txt = bm[1];
            const style = getSentimentStyle(txt);
            return <strong key={`b${i}${j}`} style={style}>{txt}</strong>;
          }
          return colorizeText(bp, `t${i}${j}`);
        });
      }

      return colorizeText(part, `t${i}`);
    }).flat();
  }

  /** 给含 利空/利好 的文本片段添加颜色 */
  function colorizeText(text, key) {
    // 匹配 "XX利空" "利空XX" "XX利好" "利好XX" 等模式
    const parts = text.split(/(利好|利空)/g);
    if (parts.length <= 1) return <span key={key}>{text}</span>;
    return parts.map((p, j) => {
      if (p === "利好") return <strong key={`${key}-${j}`} style={{ color: "var(--profit)" }}>利好</strong>;
      if (p === "利空") return <strong key={`${key}-${j}`} style={{ color: "var(--loss)" }}>利空</strong>;
      return <span key={`${key}-${j}`}>{p}</span>;
    });
  }

  function getSentimentStyle(text) {
    if (/利好/.test(text) && !/利空/.test(text)) return { color: "var(--profit)" };
    if (/利空/.test(text) && !/利好/.test(text)) return { color: "var(--loss)" };
    return { color: "var(--text-primary)" };
  }

  // ── 渲染 ──
  if (loading) return <div className="page"><div className="empty-text">正在采集分析…</div></div>;
  if (!data && !loading) return <div className="page"><div className="empty-text">暂无数据，请检查 RSS 源配置</div></div>;
  if (!data) return null;

  const hasDigest = Boolean(digest);
  const allArts = flattenArticles();

  return (
    <div className="page">
      {/* 历史日报面板 */}
      {showHistory && (
        <div className="card" style={{ marginBottom: 16, borderColor: "var(--accent)", borderWidth: 2 }}>
          <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2><Icon name="calendar" size={16} style={{ verticalAlign: -2, marginRight: 4 }} /> 历史日报</h2>
            <Button variant="ghost" size="sm" icon="x" onClick={() => { setShowHistory(false); setHistoryDigest(null); }}>关闭</Button>
          </div>
          <div className="card-body">
            {historyList.length === 0 && <div className="empty-text" style={{ fontSize: 13 }}>暂无历史日报记录</div>}
            {historyList.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: historyDigest ? 16 : 0 }}>
                {historyList.map((h) => (
                  <Button key={h.date} variant={historyDigest?.date === h.date ? "primary" : "ghost"} size="sm"
                    onClick={() => viewHistory(h.date)}>
                    {h.date}
                    <span className="badge" style={{ marginLeft: 6, fontSize: 10, background: h.sentiment?.includes("乐观") ? "var(--profit-soft)" : h.sentiment?.includes("悲观") ? "var(--loss-soft)" : "var(--accent-soft)", color: h.sentiment?.includes("乐观") ? "var(--profit)" : h.sentiment?.includes("悲观") ? "var(--loss)" : "var(--accent)" }}>{h.sentiment}</span>
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
                  {renderDigest(historyDigest.digest, historyDigest.articles ? buildLinkMap(historyDigest.articles) : undefined)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Topbar */}
      <div className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 className="topbar-title">
            <Icon name="news" size={22} style={{ verticalAlign: -4, marginRight: 6 }} />
            每日时事
          </h1>
          <span className="badge">{data.date}</span>
          {data.duplicateCount > 0 && (
            <span className="badge" style={{ background: data.hasNewArticles ? "rgba(22,163,74,0.08)" : "rgba(217,119,6,0.08)", color: data.hasNewArticles ? "var(--profit)" : "var(--warning)", fontSize: 10 }}>
              {data.newArticlesCount || 0} 篇新
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {historyList.length > 0 && (
            <Button variant="ghost" size="sm" icon="calendar" onClick={() => { setShowHistory(!showHistory); if (!showHistory) setHistoryDigest(null); }}>
              历史 ({historyList.length})
            </Button>
          )}
          <Button variant="ghost" size="sm" icon="rss" onClick={openOpmlEditor} title="管理 RSS 源">源管理</Button>
          <Button variant="ghost" size="sm" icon="refresh" onClick={refreshArticles} disabled={refreshing} loading={refreshing}>
            刷新文章
          </Button>
        </div>
      </div>

      {/* ── AI 日报摘要卡片 ── */}
      <div className="card" style={{ borderColor: hasDigest ? "var(--accent)" : "var(--border-subtle)", borderWidth: 2 }}>
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <h2 style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Icon name="check" size={20} />
            AI 日报摘要
            {digestMeta?.sentiment && <span className="badge" style={{ background: digestMeta.sentiment.includes("乐观") ? "var(--profit-soft)" : digestMeta.sentiment.includes("悲观") ? "var(--loss-soft)" : "var(--accent-soft)", color: digestMeta.sentiment.includes("乐观") ? "var(--profit)" : digestMeta.sentiment.includes("悲观") ? "var(--loss)" : "var(--accent)", fontSize: 11 }}>{digestMeta.sentiment}</span>}
            {digestMeta?.createdAt && <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}>生成于 {new Date(digestMeta.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span>}
          </h2>
          <Button variant="primary" icon={hasDigest ? "refresh" : "sparkles"} onClick={generateDigest}
            disabled={digestLoading || !aiConfigured || (!data?.hasNewArticles && data?.duplicateCount > 0)}
            loading={digestLoading}
            title={!aiConfigured ? "请先在设置中配置 AI API Key" : (!data?.hasNewArticles && data?.duplicateCount > 0) ? "今日没有新文章，无法生成新的日报摘要" : ""}
            style={{ fontSize: 13, padding: "6px 16px" }}>
            {hasDigest ? "重新生成" : "AI 生成日报摘要"}
          </Button>
        </div>
        <div className="card-body">
          {!aiConfigured && !hasDigest && <div className="empty-text" style={{ padding: 12, fontSize: 13, color: "var(--text-muted)" }}><Icon name="alert-triangle" size={14} style={{ verticalAlign: -2, marginRight: 4 }} /> 请先在「设置」中配置 AI API Key（支持 DeepSeek / OpenAI 兼容接口），即可生成 3-SOP 日报摘要</div>}
          {!aiConfigured && hasDigest && <div style={{ padding: "4px 0 8px", fontSize: 11, color: "var(--text-muted)" }}><Icon name="alert-triangle" size={12} style={{ verticalAlign: -2, marginRight: 2 }} /> 未配置 AI 接口，显示的是历史摘要。配置后可重新生成。</div>}
          {aiConfigured && !hasDigest && !digestLoading && data?.hasNewArticles && <div className="empty-text" style={{ padding: 12, fontSize: 13, color: "var(--text-muted)" }}>点击上方按钮，AI 复盘助手按 3-SOP 结构生成日报摘要，关键信息标注来源引用</div>}
          {aiConfigured && !hasDigest && !digestLoading && !data?.hasNewArticles && (
            <div className="empty-text" style={{ padding: 12, fontSize: 13, color: "var(--warning)" }}>
              <Icon name="alert-triangle" size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
              今日 RSS 无新文章（{data.duplicateCount || 0} 篇已收录），暂无新的日报内容可生成。
            </div>
          )}
          {digestLoading && <div className="empty-text" style={{ padding: 20 }}>⏳ AI 正在按 3-SOP 结构分析今日文章，生成日报摘要…</div>}
          {hasDigest && <div className="digest-content" style={{ fontSize: 14, lineHeight: 1.85, wordBreak: "break-word" }}>{renderDigest(digest)}</div>}
          {hasDigest && (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border-subtle)", fontSize: 11, color: "var(--text-muted)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <span><Icon name="paperclip" size={12} style={{ verticalAlign: -1, marginRight: 2 }} /> 点击角标 [N] 跳转原文 · <strong style={{ color: "var(--profit)" }}>利好</strong>/<strong style={{ color: "var(--loss)" }}>利空</strong>已高亮标注</span>
              {digestMeta?.sourceCount && <span>基于 {digestMeta.sourceCount} 篇来源</span>}
            </div>
          )}
        </div>
      </div>

      {/* 市场情绪总览 */}
      <div className="metrics-row">
        <div className="metric-card metric-info" style={{ cursor: "pointer" }} onClick={() => allArts.length > 0 && setShowAllArticles(true)} title="点击查看全部文章列表">
          <div className="metric-label">文章总数 <Icon name="search" size={10} style={{ verticalAlign: 0 }} /></div>
          <div className="metric-value" style={{ color: "var(--accent)" }}>{data.totalArticles}</div>
          <div className="metric-desc">{data.topics.length} 个 SOP 分类 · 点击查看</div>
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

      {/* ── 周报/月报精选卡片 ── */}
      <div className="card">
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <h2><Icon name="clock" size={16} style={{ verticalAlign: -3, marginRight: 4 }} /> 周报/月报精选</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" size="sm" icon="calendar" onClick={() => { setShowPeriodicHistory(!showPeriodicHistory); if (!showPeriodicHistory) setViewingPeriodic(null); }}>
              历史记录 ({periodicList.length})
            </Button>
            <Button variant="primary" size="sm" icon="sparkles" onClick={generateWeeklyDigest} disabled={weeklyLoading || !aiConfigured} loading={weeklyLoading}>
              生成周报
            </Button>
            <Button variant="primary" size="sm" icon="sparkles" onClick={generateMonthlyDigest} disabled={monthlyLoading || !aiConfigured} loading={monthlyLoading}>
              生成月报
            </Button>
          </div>
        </div>
        <div className="card-body">
          {!aiConfigured && <div className="empty-text" style={{ fontSize: 13, color: "var(--text-muted)" }}>请先在设置中配置 AI API Key，即可生成周报/月报精选。</div>}
          {aiConfigured && !weeklyDigest && !monthlyDigest && !weeklyLoading && !monthlyLoading && (
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

      {/* ── 周报/月报历史弹窗 ── */}
      {showPeriodicHistory && (
        <div className="card" style={{ marginBottom: 16, borderColor: "var(--accent)", borderWidth: 2 }}>
          <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2><Icon name="clock" size={14} style={{ verticalAlign: -2, marginRight: 4 }} /> 历史周报/月报</h2>
            <Button variant="ghost" size="sm" icon="x" onClick={() => { setShowPeriodicHistory(false); setViewingPeriodic(null); }}>关闭</Button>
          </div>
          <div className="card-body">
            {periodicList.length === 0 && <div className="empty-text" style={{ fontSize: 13 }}>暂无历史记录</div>}
            {periodicList.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: viewingPeriodic ? 16 : 0 }}>
                {periodicList.map((p) => (
                  <Button key={p.id} variant={viewingPeriodic?.id === p.id ? "primary" : "ghost"} size="sm"
                    onClick={() => viewPeriodicDigest(p.id)}>
                    <Icon name={p.digestType === "weekly" ? "calendar" : "clock"} size={12} style={{ verticalAlign: -1, marginRight: 2 }} />
                    {p.periodLabel}
                    {p.sentiment && <span className="badge" style={{ marginLeft: 4, fontSize: 10, background: p.sentiment.includes("乐观") ? "var(--profit-soft)" : p.sentiment.includes("悲观") ? "var(--loss-soft)" : "var(--accent-soft)", color: p.sentiment.includes("乐观") ? "var(--profit)" : p.sentiment.includes("悲观") ? "var(--loss)" : "var(--accent)" }}>{p.sentiment}</span>}
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

      {/* SOP 分组文章列表 */}
      {data.topics.map((topic, i) => {
        const sopLabels = { "SOP1 深度洞察": { icon: "brain", desc: "长期逻辑 · 商业模式 · 宏观定调（Why & What）" }, "SOP2 势能扫描": { icon: "rss", desc: "资金流向 · 评级调整 · 突发热点（When & Where）" }, "SOP3 区域/垂类": { icon: "microscope", desc: "查漏补缺 · 特定机会 · 技术前沿（How & Next）" } };
        const meta = sopLabels[topic.name] || { icon: "paperclip", desc: "" };
        return (
          <div className="card" key={i}>
            <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div><h2><Icon name={meta.icon} size={16} style={{ verticalAlign: -3, marginRight: 4 }} /> {topic.name}</h2><div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{meta.desc}</div></div>
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

      {/* ── 全部文章弹窗 ── */}
      {showAllArticles && (
        <div ref={modalRef} onClick={onModalBackdrop} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 12, maxWidth: 700, width: "100%", maxHeight: "80vh", overflow: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
            <div style={{ position: "sticky", top: 0, background: "var(--bg-card)", padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 1 }}>
              <h3 style={{ margin: 0 }}><Icon name="clipboard" size={16} style={{ verticalAlign: -2, marginRight: 4 }} /> 全部文章（{allArts.length} 篇）</h3>
              <Button variant="ghost" size="sm" icon="x" onClick={() => setShowAllArticles(false)} />
            </div>
            <div style={{ padding: "8px 20px 20px" }}>
              {allArts.map((a, idx) => (
                <div key={idx} style={{ padding: "8px 0", borderBottom: idx < allArts.length - 1 ? "1px solid var(--border-subtle)" : "none", display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 24, flexShrink: 0, textAlign: "right" }}>{idx + 1}.</span>
                  <span className="badge" style={{ fontSize: 10, flexShrink: 0, background: a.sentiment === "利好" ? "var(--profit-soft)" : a.sentiment === "利空" ? "var(--loss-soft)" : "var(--accent-soft)", color: a.sentiment === "利好" ? "var(--profit)" : a.sentiment === "利空" ? "var(--loss)" : "var(--accent)" }}>{a.sentiment}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <a href={a.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "var(--text-primary)", textDecoration: "none" }}>{a.title}</a>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{a.source}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── OPML 源管理弹窗 ── */}
      {showOpmlEditor && (
        <div ref={modalRef} onClick={(e) => { if (e.target === e.currentTarget) setShowOpmlEditor(false); }} style={{ position: "fixed", inset: 0, zIndex: 1001, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 12, maxWidth: 750, width: "100%", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <h3 style={{ margin: 0 }}><Icon name="rss" size={16} style={{ verticalAlign: -2, marginRight: 4 }} /> RSS 源管理（OPML）</h3>
              <Button variant="ghost" size="sm" icon="x" onClick={() => setShowOpmlEditor(false)} />
            </div>
            <div style={{ padding: 12, fontSize: 12, color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
              编辑 OPML 格式的 RSS 源列表。每行一个 &lt;outline&gt; 标签，xmlUrl 为 RSS 地址。也可粘贴其他阅读器的 OPML 导出内容。
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
              {opmlLoading && !opmlContent ? (
                <div className="empty-text" style={{ padding: 40 }}>加载中…</div>
              ) : (
                <textarea
                  value={opmlContent}
                  onChange={(e) => setOpmlContent(e.target.value)}
                  style={{
                    width: "100%", minHeight: 400, border: "1px solid var(--border-default)",
                    borderRadius: 8, padding: 12, fontFamily: "var(--font-mono)", fontSize: 12,
                    lineHeight: 1.6, resize: "vertical", background: "var(--bg-input)", color: "var(--text-primary)",
                    outline: "none",
                  }}
                  placeholder={`<?xml version="1.0" encoding="utf-8"?>\n<opml version="2.0">\n  <head><title>我的 RSS 源</title></head>\n  <body>\n    <outline text="分类名">\n      <outline type="rss" text="源名称" xmlUrl="https://example.com/feed.xml"/>\n    </outline>\n  </body>\n</opml>`}
                  spellCheck={false}
                />
              )}
            </div>
            <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                保存后自动刷新文章 · 保存在本地用户目录
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="ghost" size="sm" icon="undo" onClick={restoreDefaultOpml} disabled={opmlLoading} style={{ color: "var(--warning)" }}>
                  恢复默认 OPML
                </Button>
                <Button variant="ghost" onClick={() => setShowOpmlEditor(false)}>取消</Button>
                <Button variant="primary" icon="save" onClick={saveOpml} disabled={opmlLoading} loading={opmlLoading}>
                  保存 OPML
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
