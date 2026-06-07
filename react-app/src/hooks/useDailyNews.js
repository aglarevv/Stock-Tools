/**
 * useDailyNews — 每日时事页面数据逻辑 Hook
 *
 * 封装 DailyNews 组件中的所有数据获取、状态管理和业务逻辑，
 * 使组件只负责 UI 编排。
 */
import { useState, useEffect, useCallback } from "react";
import { useApi } from "./useApi.jsx";

export default function useDailyNews(showToast) {
  const api = useApi();
  // ── 基础数据 ──
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [digest, setDigest] = useState("");
  const [digestMeta, setDigestMeta] = useState(null);
  const [digestLoading, setDigestLoading] = useState(false);

  // ── AI 配置 ──
  const [aiConfig, setAiConfig] = useState(null);
  const [aiConfigured, setAiConfigured] = useState(false);

  // ── 历史日报 ──
  const [historyList, setHistoryList] = useState([]);
  const [historyDigest, setHistoryDigest] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // ── OPML 编辑器 ──
  const [showOpmlEditor, setShowOpmlEditor] = useState(false);
  const [opmlContent, setOpmlContent] = useState("");
  const [opmlLoading, setOpmlLoading] = useState(false);

  // ── 周报/月报精选 ──
  const [weeklyDigest, setWeeklyDigest] = useState(null);
  const [monthlyDigest, setMonthlyDigest] = useState(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [periodicList, setPeriodicList] = useState([]);
  const [showPeriodicHistory, setShowPeriodicHistory] = useState(false);
  const [viewingPeriodic, setViewingPeriodic] = useState(null);

  // ── 全部文章弹窗 ──
  const [showAllArticles, setShowAllArticles] = useState(false);

  // ── 初始化 ──
  useEffect(() => {
    loadArticles();
    loadAiConfig();
    loadHistoryList();
    loadPeriodicList();
  }, []);

  // ── 文章采集 ──
  async function loadArticles() {
    setLoading(true);
    try {
      const d = await api.dailyNews();
      setData(d);
      if (d.savedDigest?.digest) {
        setDigest(d.savedDigest.digest);
        setDigestMeta({
          sentiment: d.savedDigest.sentiment,
          sourceCount: d.savedDigest.sourceCount,
          createdAt: d.savedDigest.createdAt,
        });
      }
    } catch (e) {
      showToast(`加载失败：${e.message}`, "error");
    } finally {
      setLoading(false);
    }
  }

  async function refreshArticles() {
    setRefreshing(true);
    try {
      const d = await api.dailyNews();
      setData(d);
      if (d.savedDigest?.digest) {
        setDigest(d.savedDigest.digest);
        setDigestMeta({
          sentiment: d.savedDigest.sentiment,
          sourceCount: d.savedDigest.sourceCount,
          createdAt: d.savedDigest.createdAt,
        });
      }
      showToast("文章已刷新", "success");
    } catch (e) {
      showToast(`刷新失败：${e.message}`, "error");
    } finally {
      setRefreshing(false);
    }
  }

  // ── AI 配置 ──
  async function loadAiConfig() {
    try {
      const s = (await api.getSettings()).settings || {};
      if (s.aiKey) {
        setAiConfig({
          url: s.aiUrl, key: s.aiKey, model: s.aiModel,
          temperature: s.aiTemperature ?? 0.7,
          thinking: s.aiThinking !== false && s.aiThinking !== "false",
        });
        setAiConfigured(true);
      }
    } catch { /* ignore */ }
  }

  // ── 日报摘要 ──
  const generateDigest = useCallback(async () => {
    if (!data?.topics) return;
    const allArticles = [];
    for (const topic of data.topics) {
      for (const h of topic.highlights) {
        allArticles.push({
          source: h.source, title: h.title, link: h.link,
          summary: h.summary || "", category: topic.name, sentiment: h.sentiment,
        });
      }
    }
    if (allArticles.length === 0) { showToast("暂无文章可生成摘要", "error"); return; }
    setDigestLoading(true);
    setDigest("");
    try {
      const res = await api.dailyDigest(allArticles, aiConfig);
      setDigest(res.digest || "");
      setDigestMeta(null);
      loadHistoryList();
    } catch (e) {
      showToast(`AI 摘要生成失败：${e.message}`, "error");
    } finally {
      setDigestLoading(false);
    }
  }, [data, aiConfig, showToast]);

  // ── 历史日报 ──
  async function loadHistoryList() {
    try {
      const res = await api.dailyDigests();
      setHistoryList(res.digests || []);
    } catch { /* ignore */ }
  }

  async function viewHistory(date) {
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
    } finally {
      setHistoryLoading(false);
    }
  }

  // ── OPML 编辑 ──
  async function openOpmlEditor() {
    setOpmlLoading(true);
    setShowOpmlEditor(true);
    try {
      const res = await api.getSourcesOpml();
      setOpmlContent(res.content || "");
    } catch (e) {
      showToast(`读取 OPML 失败：${e.message}`, "error");
    } finally {
      setOpmlLoading(false);
    }
  }

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
      await refreshArticles();
    } catch (e) {
      showToast(`保存失败：${e.message}`, "error");
    } finally {
      setOpmlLoading(false);
    }
  }

  async function restoreDefaultOpml() {
    if (!confirm("确认恢复默认 RSS 源配置？当前编辑的内容将丢失。")) return;
    setOpmlLoading(true);
    try {
      const res = await api.getDefaultSourcesOpml();
      setOpmlContent(res.content || "");
      showToast("已加载默认 OPML 配置，点击「保存并刷新」生效", "info");
    } catch (e) {
      showToast(`加载默认 OPML 失败：${e.message}`, "error");
    } finally {
      setOpmlLoading(false);
    }
  }

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
    } finally {
      setWeeklyLoading(false);
    }
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
    } finally {
      setMonthlyLoading(false);
    }
  }

  async function viewPeriodicDigest(id) {
    try {
      const res = await api.periodicDigestById(id);
      setViewingPeriodic(res);
    } catch (e) {
      showToast(`加载失败：${e.message}`, "error");
    }
  }

  // ── 扁平化文章列表 ──
  function flattenArticles() {
    if (data?.allArticles?.length) return data.allArticles;
    const arr = [];
    if (!data?.topics) return arr;
    for (const t of data.topics) for (const h of t.highlights) arr.push(h);
    return arr;
  }

  return {
    // 数据
    data, loading, refreshing,
    digest, digestMeta, digestLoading,
    aiConfig, aiConfigured,
    historyList, historyDigest, historyLoading, showHistory,
    showOpmlEditor, opmlContent, opmlLoading,
    weeklyDigest, monthlyDigest, weeklyLoading, monthlyLoading,
    periodicList, viewingPeriodic, showPeriodicHistory,
    showAllArticles,
    allArticles: flattenArticles(),

    // 操作
    refreshArticles,
    generateDigest,
    viewHistory, setShowHistory, setHistoryDigest,
    openOpmlEditor, setOpmlContent, saveOpml, restoreDefaultOpml, setShowOpmlEditor,
    generateWeeklyDigest, generateMonthlyDigest,
    viewPeriodicDigest, setShowPeriodicHistory, setViewingPeriodic,
    setShowAllArticles,
  };
}
