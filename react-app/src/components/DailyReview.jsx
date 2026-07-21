/**
 * DailyReview — 每日复盘主组件
 *
 * 职责：协调复盘表单、版块摘要和编辑弹窗。
 * 子模块：
 *   - reviewConfig.js      → 复盘版块元数据 + 完整度计算
 *   - ReviewSectionCard.jsx → 版块摘要卡片
 *   - ReviewEditModal.jsx   → 版块编辑弹窗
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useApi } from "../hooks/useApi.jsx";
import { formatMoney, localDateString, reviewDefaults, toNumber } from "../utils/helpers.js";
import { sectionConfig, methodologySteps, calcCompleteness, REVIEW_DRAFT_KEY } from "../utils/reviewConfig.js";
import Button, { TabButton } from "./Button.jsx";
import Icon from "./Icon.jsx";
import ReviewSectionCard from "./ReviewSectionCard.jsx";
import ReviewEditModal from "./ReviewEditModal.jsx";

export default function DailyReview({ navigate, editReviewId, showToast }) {
  const today = localDateString();
  const api = useApi();
  const [review, setReview] = useState(reviewDefaults(today));
  const [saving, setSaving] = useState(false);
  const [dbOk, setDbOk] = useState(false);
  const [tab, setTab] = useState("summary");
  const [modalSection, setModalSection] = useState(null);
  const modalSnapshot = useRef(null);

  // ── AI 配置 ──
  const [aiConfig, setAiConfig] = useState(null);

  // ── 个股行情数据（供 AI 全面复盘使用） ──
  const [stockData, setStockData] = useState(null);

  // 加载 AI 配置
  useEffect(() => {
    (async () => {
      try {
        const data = await api.getSettings();
        const s = data.settings || {};
        if (s.aiKey) {
          setAiConfig({
            url: s.aiUrl,
            key: s.aiKey,
            model: s.aiModel,
            temperature: s.aiTemperature ?? 0.7,
            thinking: s.aiThinking !== false && s.aiThinking !== "false",
          });
        }
      } catch (e) {
        showToast?.(`加载AI配置失败：${e.message}`, "error");
      }
    })();
  }, []);

  // ── 自动获取个股行情（取第一个交易标的） ──
  useEffect(() => {
    const trades = Array.isArray(review.trades) && review.trades.length > 0 ? review.trades : [];
    const primarySymbol = trades.length > 0 ? trades[0].symbol : review.symbol;
    if (!primarySymbol || primarySymbol === "自选股" || !aiConfig) return;
    let cancelled = false;
    (async () => {
      try {
        const searchRes = await api.stockSearch(primarySymbol);
        if (cancelled || !searchRes.ok) return;
        const stocks = searchRes.data.filter(
          (r) => r.category === "stock" || r.category === "index"
        );
        const exact = stocks.find((r) => r.name === primarySymbol) || stocks[0];
        if (!exact) return;
        const qRes = await api.getMultiMarketQuotes([exact.code]);
        if (cancelled || !qRes.ok) return;
        const quote = qRes.data?.[0];
        if (quote) setStockData(quote);
      } catch { /* 静默失败 */ }
    })();
    return () => { cancelled = true; };
  }, [review.symbol, review.trades, aiConfig, api]);

  // ── 辅助函数 ──
  const setField = useCallback((k, v) => setReview((r) => ({ ...r, [k]: v })), []);

  const openModal = useCallback((section) => {
    modalSnapshot.current = JSON.parse(JSON.stringify(review));
    setModalSection(section);
  }, [review]);

  const closeModal = useCallback((discard) => {
    if (discard && modalSnapshot.current) {
      const snap = modalSnapshot.current;
      setReview((r) => ({ ...r, ...snap }));
      try { localStorage.setItem(REVIEW_DRAFT_KEY, JSON.stringify({ ...review, ...snap })); } catch {}
    }
    modalSnapshot.current = null;
    setModalSection(null);
  }, [review]);

  // ── 初始化 ──
  useEffect(() => {
    api.health().then((d) => setDbOk(d.database === "ready")).catch(() => {});
    loadDraft();
  }, []);

  useEffect(() => {
    if (editReviewId) loadRecordById(editReviewId);
  }, [editReviewId]);

  // ── 草稿管理（使用 ref 避免闭包过期） ──
  const reviewRef = useRef(review);
  reviewRef.current = review;

  function loadDraft() {
    try {
      const raw = localStorage.getItem(REVIEW_DRAFT_KEY);
      if (raw) setReview((r) => ({ ...r, ...JSON.parse(raw), reviewDate: today }));
    } catch {}
  }

  const saveDraft = useCallback(() => {
    try { localStorage.setItem(REVIEW_DRAFT_KEY, JSON.stringify(reviewRef.current)); } catch {}
  }, []);

  // ── 字段更新（自动保存草稿） ──
  const update = useCallback((k, v) => {
    setField(k, v);
    saveDraft();
  }, [setField, saveDraft]);

  // ── 记录加载 ──
  async function loadRecordById(id) {
    try {
      const data = await api.getReviews({ id, limit: 1 });
      const found = (data.records || [])[0];
      if (found) setReview((r) => ({ ...r, ...found }));
    } catch { /* ignore */ }
  }

  // ── 保存 ──
  async function save() {
    setSaving(true);
    try {
      await api.saveReview(reviewRef.current);
      localStorage.removeItem(REVIEW_DRAFT_KEY);
      showToast("复盘已保存", "success");
    } catch (e) {
      showToast(`保存失败：${e.message}`, "error");
    } finally { setSaving(false); }
  }

  // ── AI 大盘复盘 ──
  const [aiMarketLoading, setAiMarketLoading] = useState(false);

  const aiAnalyzeMarket = useCallback(async () => {
    if (!aiConfig) {
      showToast?.("请先在设置页配置 AI 接口", "warning");
      return;
    }
    setAiMarketLoading(true);
    try {
      // 1. 搜索三大指数
      const indexNames = ["上证指数", "深证成指", "创业板指"];
      const searchResults = await Promise.all(
        indexNames.map((name) => api.stockSearch(name)),
      );

      const indexCodes = [];
      for (const res of searchResults) {
        if (res.ok && Array.isArray(res.data)) {
          const match = res.data.find(
            (r) => r.category === "index" && indexNames.some((n) => r.name.includes(n) || n.includes(r.name)),
          );
          if (match) indexCodes.push(match.code);
        }
      }

      if (indexCodes.length === 0) {
        showToast?.("未找到大盘指数数据，请检查网络或交易时段", "warning");
        return;
      }

      // 2. 获取行情
      const quotesRes = await api.getMultiMarketQuotes(indexCodes);
      if (!quotesRes.ok || !Array.isArray(quotesRes.data) || quotesRes.data.length === 0) {
        showToast?.("大盘行情加载失败（可能非交易时段）", "warning");
        return;
      }

      // 2.5 获取多周期K线（日/周/月），供波浪理论、道氏理论、均线理论分析
      const klineData = {};
      const periods = ["daily", "weekly", "monthly"];
      const klineResults = await Promise.all(
        indexCodes.flatMap((code) =>
          periods.map(async (period) => {
            try {
              const kRes = await api.getStockKline(code, period);
              return { code, period, data: kRes.ok ? kRes.data : [] };
            } catch {
              return { code, period, data: [] };
            }
          }),
        ),
      );
      for (const { code, period, data } of klineResults) {
        if (!klineData[code]) klineData[code] = {};
        klineData[code][period] = data;
      }

      // 3. 检查是否已有填写内容，决定模式
      const currentReview = reviewRef.current;
      const existingFields = {
        indexJudgment: currentReview?.indexJudgment || "",
        volumeJudgment: currentReview?.volumeJudgment || "",
        sentimentJudgment: currentReview?.sentimentJudgment || "",
        capitalDirection: currentReview?.capitalDirection || "",
      };
      const hasExisting = Object.values(existingFields).some((v) => v.trim().length > 0);

      // 4. AI 分析（传入实时行情 + 多周期K线 + 已有内容用于交叉验证）
      const aiRes = await api.aiMarketReview(quotesRes.data, klineData, aiConfig, hasExisting ? existingFields : undefined);
      if (aiRes.ok && aiRes.analysis) {
        const { indexJudgment, volumeJudgment, sentimentJudgment, capitalDirection } = aiRes.analysis;
        setReview((r) => ({
          ...r,
          indexJudgment: indexJudgment || r.indexJudgment || "",
          volumeJudgment: volumeJudgment || r.volumeJudgment || "",
          sentimentJudgment: sentimentJudgment || r.sentimentJudgment || "",
          capitalDirection: capitalDirection || r.capitalDirection || "",
        }));
        saveDraft();
        showToast?.(hasExisting
          ? "AI 大盘复盘已完成，已与原有内容交叉验证并修正冲突点，请检查"
          : "AI 大盘复盘已完成，请检查并修改",
          "success");
      } else {
        showToast?.("AI 分析失败，请稍后重试", "error");
      }
    } catch (e) {
      showToast?.(`AI 大盘复盘失败：${e.message}`, "error");
    } finally {
      setAiMarketLoading(false);
    }
  }, [aiConfig, api, showToast, saveDraft]);

  // ── AI 整理复盘（自由文本 → 结构化字段） ──
  const [organizeText, setOrganizeText] = useState("");
  const [organizeLoading, setOrganizeLoading] = useState(false);

  const aiOrganizeReview = useCallback(async () => {
    if (!aiConfig) { showToast?.("请先配置 AI 接口", "warning"); return; }
    const text = organizeText.trim();
    if (text.length < 10) { showToast?.("请粘贴至少10字的复盘文本", "warning"); return; }
    setOrganizeLoading(true);
    try {
      const res = await api.aiOrganizeReview(text, reviewRef.current, aiConfig);
      if (res.ok && res.fields) {
        setReview((r) => ({ ...r, ...res.fields }));
        saveDraft();
        setOrganizeText("");
        showToast?.("AI 已整理复盘内容并填入文本框，请检查修改", "success");
      } else {
        showToast?.("AI 整理失败，请重试", "error");
      }
    } catch (e) {
      showToast?.(`整理失败：${e.message}`, "error");
    } finally { setOrganizeLoading(false); }
  }, [organizeText, aiConfig, api, showToast, saveDraft]);

  // ── AI 全面复盘（独立分析 + 交叉验证） ──
  const [fullReviewLoading, setFullReviewLoading] = useState(false);

  // ── AI 每日市场复盘（行情+新闻→总结+预判+标的） ──
  const [marketReviewLoading, setMarketReviewLoading] = useState(false);
  const [marketReviewText, setMarketReviewText] = useState("");

  const aiMarketReview = useCallback(async () => {
    if (!aiConfig) { showToast?.("请先配置 AI 接口", "warning"); return; }
    setMarketReviewLoading(true);
    setMarketReviewText("");
    try {
      const data = await api.dailyMarketReview(aiConfig);
      setMarketReviewText(data.review || "AI 未返回有效结果");
      showToast?.("AI 市场复盘完成", "success");
    } catch (e) { showToast?.(`AI 复盘失败：${e.message}`, "error"); }
    finally { setMarketReviewLoading(false); }
  }, [aiConfig, api, showToast]);

  const aiFullReview = useCallback(async () => {
    if (!aiConfig) { showToast?.("请先配置 AI 接口", "warning"); return; }
    setFullReviewLoading(true);
    try {
      // 获取大盘指数数据
      const indexNames = ["上证指数", "深证成指", "创业板指"];
      const searchResults = await Promise.all(indexNames.map((n) => api.stockSearch(n)));
      const indexCodes = [];
      for (const r of searchResults) {
        if (r.ok && Array.isArray(r.data)) {
          const m = r.data.find((x) => x.category === "index" && indexNames.some((n) => x.name.includes(n)));
          if (m) indexCodes.push(m.code);
        }
      }
      let indexData = [];
      if (indexCodes.length) {
        const qRes = await api.getMultiMarketQuotes(indexCodes);
        if (qRes.ok) indexData = qRes.data;
      }

      const res = await api.aiFullReview(stockData, indexData, reviewRef.current, aiConfig);
      if (res.ok && res.fields) {
        setReview((r) => ({ ...r, ...res.fields }));
        saveDraft();
        showToast?.("AI 全面复盘完成，已交叉验证并更新文本框", "success");
      } else {
        showToast?.("AI 复盘失败，请重试", "error");
      }
    } catch (e) {
      showToast?.(`复盘失败：${e.message}`, "error");
    } finally { setFullReviewLoading(false); }
  }, [aiConfig, stockData, api, showToast, saveDraft]);

  // ── 计算指标（汇总所有交易） ──
  const trades = Array.isArray(review.trades) && review.trades.length > 0
    ? review.trades
    : (review.symbol && review.symbol !== "自选股" && toNumber(review.buyPrice) > 0
      ? [{ symbol: review.symbol, buyPrice: toNumber(review.buyPrice), sellPrice: review.sellPrice || null, shares: toNumber(review.shares), holdingStyle: review.holdingStyle || "短线" }]
      : []);
  const totalBuyValue = trades.reduce((sum, t) => sum + toNumber(t.buyPrice) * toNumber(t.shares), 0);
  const totalPnl = trades.reduce((sum, t) => {
    if (t.sellPrice !== "" && t.sellPrice !== null && t.sellPrice !== undefined) {
      return sum + (toNumber(t.sellPrice) - toNumber(t.buyPrice)) * toNumber(t.shares);
    }
    return sum;
  }, 0);
  const hasAnySold = trades.some((t) => t.sellPrice !== "" && t.sellPrice !== null && t.sellPrice !== undefined);
  const totalPnlRate = totalBuyValue > 0 ? (totalPnl / totalBuyValue) * 100 : 0;
  const displaySymbol = trades.length === 1 ? trades[0].symbol : (trades.length > 1 ? `${trades[0].symbol} 等${trades.length}只` : review.symbol);
  const comp = calcCompleteness(review);

  return (
    <div className="page">
      {/* ── 顶部栏 ── */}
      <div className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 className="topbar-title"><Icon name="review" size={22} style={{ verticalAlign: -4, marginRight: 6 }} />{displaySymbol} · {review.reviewDate}</h1>
          <span className="badge">{hasAnySold ? `${totalPnlRate.toFixed(2)}%` : "未卖出"}</span>
        </div>
        <div className="topbar-actions">
          <Button variant="ghost" onClick={() => { setReview(reviewDefaults(today)); localStorage.removeItem(REVIEW_DRAFT_KEY); showToast("表单已清空", "info"); }}>清空</Button>
          <Button variant="primary" disabled={!dbOk || saving} loading={saving} onClick={save}>保存</Button>
        </div>
      </div>

      {/* ── 指标行 ── */}
      <div className="metrics-row">
        <div className="metric-card metric-base"><div className="metric-label">买入金额</div><div className="metric-value">{formatMoney.format(totalBuyValue)}</div><div className="metric-desc">{trades.length} 只股票 · 共 {trades.reduce((s, t) => s + toNumber(t.shares), 0)} 股</div></div>
        <div className={`metric-card ${totalPnl >= 0 ? "metric-profit" : "metric-loss"}`}><div className="metric-label">盈亏金额</div><div className={`metric-value ${totalPnl >= 0 ? "green" : "red"}`}>{formatMoney.format(totalPnl)}</div><div className="metric-desc">{hasAnySold ? `收益率 ${totalPnlRate.toFixed(2)}%` : "未录入卖出价"}</div></div>
        <div className="metric-card metric-info"><div className="metric-label">复盘完整度</div><div className="metric-value purple">{comp}%</div><div className="metric-desc">{comp >= 80 ? "复盘信息较完整 ✓" : comp >= 50 ? "继续完善" : "逐步完善"}</div></div>
      </div>

      {/* ── 标签切换 ── */}
      <div style={{ display: "flex", gap: 0, background: "var(--border-subtle)", borderRadius: "var(--radius-sm)", overflow: "hidden", width: "fit-content" }}>
        <TabButton active={tab === "summary"} onClick={() => setTab("summary")}><Icon name="clipboard" size={14} style={{ verticalAlign: -2, marginRight: 2 }} /> 复盘摘要</TabButton>
        <TabButton active={tab === "methodology"} onClick={() => setTab("methodology")}><Icon name="book" size={14} style={{ verticalAlign: -2, marginRight: 2 }} /> 复盘方法论</TabButton>
      </div>

      {/* ── 复盘摘要标签页 ── */}
      {tab === "summary" && (
        <>
          {Object.entries(sectionConfig).map(([num, cfg]) => (
            <div key={num}>
              <ReviewSectionCard config={cfg} review={review} onClick={() => openModal(num)} />
              {/* 市场复盘板块专属 AI 大盘复盘按钮 */}
              {num === "1" && (
                <div style={{ marginTop: -8, marginBottom: 16, textAlign: "right" }}>
                  {(review.indexJudgment || review.volumeJudgment || review.sentimentJudgment || review.capitalDirection) && !aiMarketLoading && (
                    <span style={{ fontSize: 12, color: "var(--accent)", marginRight: 8 }}>
                      🔍 已填写内容，将交叉验证
                    </span>
                  )}
                  <Button
                    variant="primary"
                    icon="sparkles"
                    loading={aiMarketLoading}
                    disabled={aiMarketLoading || !aiConfig}
                    onClick={aiAnalyzeMarket}
                    title={aiConfig
                      ? ((review.indexJudgment || review.volumeJudgment || review.sentimentJudgment || review.capitalDirection)
                        ? "检测到已填写内容，AI 将独立分析后与你的复盘交叉验证，修正冲突点并补充遗漏"
                        : "运用道氏理论、波浪理论、均线理论、量价理论、行为金融学等多维度交叉分析大盘，自动填入指数判断、量能判断、情绪判断、资金方向")
                      : "请先在设置页配置 AI 接口"}
                  >
                    AI 多维度复盘大盘
                  </Button>
                  {aiMarketLoading && (
                    <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 10 }}>
                      正在获取大盘数据并多维度交叉分析…
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* ── AI 工具区 ── */}
          <div className="card" style={{ marginTop: 12, borderColor: "var(--accent)", borderWidth: 1, borderStyle: "dashed" }}>
            <div className="card-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon name="sparkles" size={18} style={{ color: "var(--accent)" }} />
                <h2 style={{ margin: 0, fontSize: 15 }}>AI 复盘工具</h2>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="primary" icon="sparkles" loading={marketReviewLoading}
                  disabled={marketReviewLoading || !aiConfig}
                  onClick={aiMarketReview}
                  title="基于实时行情+财经新闻，AI 生成当日市场总结、次日预判、推荐标的">
                  AI 市场复盘
                </Button>
                <Button variant="primary" icon="sparkles" loading={fullReviewLoading}
                  disabled={fullReviewLoading || !aiConfig}
                  onClick={aiFullReview}
                  title="基于个股和大盘行情独立分析，交叉验证你的复盘内容后填入文本框">
                  AI 全面复盘
                </Button>
              </div>
            </div>
            <div className="card-body" style={{ paddingTop: 0 }}>
              {/* ── AI 市场复盘结果 ── */}
              {marketReviewText && (
                <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.8, fontSize: 14, marginBottom: 12, padding: 12, background: "var(--bg-hover)", borderRadius: 8 }}>
                  {marketReviewText}
                </div>
              )}
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 8px" }}>
                基于行情数据独立分析，与你的复盘交叉验证，自动填入所有文本框。
              </p>
              <div className="form-row">
                <div className="form-field">
                  <label>📝 AI 整理复盘（粘贴你的自由文本复盘）</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <textarea
                      value={organizeText}
                      onChange={(e) => setOrganizeText(e.target.value)}
                      rows="3"
                      placeholder="粘贴你的自由文本复盘内容，AI 将自动解析并填入对应文本框…"
                      style={{ flex: 1, resize: "vertical", minHeight: 60 }}
                    />
                    <Button variant="primary" icon="sparkles" loading={organizeLoading}
                      disabled={organizeLoading || !aiConfig || organizeText.trim().length < 10}
                      onClick={aiOrganizeReview}
                      style={{ alignSelf: "flex-end" }}>
                      整理填入
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── 复盘方法论标签页 ── */}
      {tab === "methodology" && (
        <div className="card">
          <div className="card-header"><h2>复盘方法论</h2></div>
          <div className="card-body">
            {methodologySteps.map(([title, desc], i) => (
              <div className="method-step" key={i}><div className="step-num">{i + 1}</div><div><strong>{title}</strong><p>{desc}</p></div></div>
            ))}
          </div>
        </div>
      )}

      {/* ── 编辑弹窗 ── */}
      {modalSection && (
        <ReviewEditModal
          sectionConfig={sectionConfig[modalSection]}
          review={review}
          onFieldChange={update}
          onClose={(discard) => {
            closeModal(discard);
            if (!discard) showToast("内容已保存到表单", "success");
          }}
        />
      )}
    </div>
  );
}
