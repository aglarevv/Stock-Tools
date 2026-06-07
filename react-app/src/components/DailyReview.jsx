/**
 * DailyReview — 每日复盘主组件
 *
 * 职责：协调复盘表单、版块摘要、编辑弹窗和 AI 聊天。
 * 子模块：
 *   - reviewConfig.js      → 复盘版块元数据 + 完整度计算
 *   - useAiChat.js         → AI 聊天状态管理
 *   - AiChatPanel.jsx      → AI 聊天 UI
 *   - ReviewSectionCard.jsx → 版块摘要卡片
 *   - ReviewEditModal.jsx   → 版块编辑弹窗
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useApi } from "../hooks/useApi.jsx";
import { formatMoney, localDateString, reviewDefaults, toNumber } from "../utils/helpers.js";
import { sectionConfig, methodologySteps, calcCompleteness, REVIEW_DRAFT_KEY } from "../utils/reviewConfig.js";
import { useAiChat } from "../hooks/useAiChat.js";
import Button, { TabButton } from "./Button.jsx";
import Icon from "./Icon.jsx";
import AiChatPanel from "./AiChatPanel.jsx";
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

  // ── AI 聊天 ──
  const ai = useAiChat(review, showToast);

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

  // ── 计算指标 ──
  const buyValue = Math.max(0, toNumber(review.buyPrice, 10)) * Math.max(0, toNumber(review.shares, 1000));
  const isClosed = review.sellPrice !== "" && review.sellPrice !== null;
  const pnlAmount = isClosed ? (toNumber(review.sellPrice) - toNumber(review.buyPrice)) * toNumber(review.shares) : 0;
  const comp = calcCompleteness(review);

  return (
    <div className="page">
      {/* ── 顶部栏 ── */}
      <div className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 className="topbar-title">{review.symbol} · {review.reviewDate}</h1>
          <span className="badge">{isClosed ? `${toNumber(review.pnlRate).toFixed(2)}%` : "未卖出"}</span>
        </div>
        <div className="topbar-actions">
          <Button variant="ghost" onClick={() => { setReview(reviewDefaults(today)); localStorage.removeItem(REVIEW_DRAFT_KEY); showToast("表单已清空", "info"); }}>清空</Button>
          <Button variant="primary" disabled={!dbOk || saving} loading={saving} onClick={save}>保存</Button>
        </div>
      </div>

      {/* ── 指标行 ── */}
      <div className="metrics-row">
        <div className="metric-card metric-base"><div className="metric-label">买入金额</div><div className="metric-value">{formatMoney.format(buyValue)}</div><div className="metric-desc">持仓 {review.shares} 股 · {review.holdingStyle}</div></div>
        <div className={`metric-card ${pnlAmount >= 0 ? "metric-profit" : "metric-loss"}`}><div className="metric-label">盈亏金额</div><div className={`metric-value ${pnlAmount >= 0 ? "green" : "red"}`}>{formatMoney.format(pnlAmount)}</div><div className="metric-desc">{isClosed ? `收益率 ${toNumber(review.pnlRate).toFixed(2)}%` : "未录入卖出价"}</div></div>
        <div className="metric-card metric-info"><div className="metric-label">复盘完整度</div><div className="metric-value purple">{comp}%</div><div className="metric-desc">{comp >= 80 ? "复盘信息较完整 ✓" : comp >= 50 ? "继续完善" : "逐步完善"}</div></div>
      </div>

      {/* ── 基本参数 ── */}
      <div className="card">
        <div className="card-header"><h2>基本参数</h2></div>
        <div className="card-body">
          <div className="form-row cols-2">
            <div className="form-field"><label>复盘日期</label><input type="date" value={review.reviewDate} onChange={(e) => update("reviewDate", e.target.value)} /></div>
            <div className="form-field"><label>股票名称</label><input value={review.symbol} onChange={(e) => update("symbol", e.target.value)} /></div>
          </div>
          <div className="form-row cols-3">
            <div className="form-field"><label>买入价</label><input type="number" value={review.buyPrice} onChange={(e) => update("buyPrice", e.target.value)} /></div>
            <div className="form-field"><label>卖出价</label><input type="number" value={review.sellPrice} onChange={(e) => update("sellPrice", e.target.value)} placeholder="未卖出留空" /></div>
            <div className="form-field"><label>股数</label><input type="number" value={review.shares} onChange={(e) => update("shares", e.target.value)} /></div>
          </div>
          <div className="form-row">
            <div className="form-field" style={{ maxWidth: 200 }}><label>持有方式</label><select value={review.holdingStyle} onChange={(e) => update("holdingStyle", e.target.value)}><option>短线</option><option>波段</option><option>中线</option><option>长线</option><option>试错仓</option></select></div>
          </div>
        </div>
      </div>

      {/* ── 标签切换 ── */}
      <div style={{ display: "flex", gap: 0, background: "var(--border-subtle)", borderRadius: "var(--radius-sm)", overflow: "hidden", width: "fit-content" }}>
        <TabButton active={tab === "summary"} onClick={() => setTab("summary")}><Icon name="clipboard" size={14} style={{ verticalAlign: -2, marginRight: 2 }} /> 复盘摘要</TabButton>
        <TabButton active={tab === "methodology"} onClick={() => setTab("methodology")}><Icon name="book" size={14} style={{ verticalAlign: -2, marginRight: 2 }} /> 复盘方法论</TabButton>
      </div>

      {/* ── 复盘摘要标签页 ── */}
      {tab === "summary" && Object.entries(sectionConfig).map(([num, cfg]) => (
        <ReviewSectionCard key={num} config={cfg} review={review} onClick={() => openModal(num)} />
      ))}

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

      {/* ── AI 聊天 ── */}
      <AiChatPanel
        messages={ai.messages}
        input={ai.input}
        onInputChange={ai.setInput}
        loading={ai.loading}
        onSend={ai.send}
        onClear={ai.clear}
        endRef={ai.endRef}
      />

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
