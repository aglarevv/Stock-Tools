import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../utils/api.js";
import { formatMoney, localDateString, reviewDefaults, toNumber, escapeHtml } from "../utils/helpers.js";

const REVIEW_DRAFT_KEY = "toolbox_review_draft";
const PAGE_SIZE = 10;

const sectionConfig = {
  "1": {
    title: "一、市场复盘 · 事实",
    badge: "事实",
    badgeClass: "badge-accent",
    fields: [
      { key: "indexJudgment", label: "指数判断", placeholder: "上证/深证/创业板走势、关键均线、趋势方向" },
      { key: "volumeJudgment", label: "量能判断", placeholder: "放量/缩量、两市成交额、量价配合" },
      { key: "sentimentJudgment", label: "情绪判断", placeholder: "涨跌家数、涨停/跌停比、连板高度、恐慌/贪婪" },
      { key: "capitalDirection", label: "资金方向", placeholder: "北向资金、主力净流入/流出方向" },
    ],
    summaryKeys: ["indexJudgment", "volumeJudgment", "sentimentJudgment", "capitalDirection"],
    summaryLabels: ["指数判断", "量能判断", "情绪判断", "资金方向"],
  },
  "2": {
    title: "二、板块分析 · 逻辑",
    badge: "逻辑",
    badgeClass: "badge-info",
    fields: [
      { key: "leadingSectors", label: "领涨板块及个股", placeholder: "涨幅居前的板块和龙头个股" },
      { key: "laggingSectors", label: "领跌板块及个股", placeholder: "跌幅居前的板块和代表性个股" },
      { key: "sustainability", label: "持续性判断", placeholder: "领涨板块是否有持续逻辑？" },
    ],
    summaryKeys: ["leadingSectors", "laggingSectors", "sustainability"],
    summaryLabels: ["领涨板块", "领跌板块", "持续性"],
  },
  "3": {
    title: "三、个股检查 · 标的",
    badge: "标的",
    badgeClass: "badge-warning",
    fields: [
      { key: "stockStrength", label: "标的强弱", placeholder: "与大盘对比强弱，买入逻辑是否成立" },
      { key: "volAmpRanking", label: "成交量 / 振幅", placeholder: "低位放量？高位分歧？换手率" },
      { key: "limitAnalysis", label: "涨跌停分析", placeholder: "板块涨停家数、跌停家数、流动性" },
    ],
    summaryKeys: ["stockStrength", "volAmpRanking", "limitAnalysis"],
    summaryLabels: ["强弱对比", "量价分析", "涨跌停"],
  },
  "4": {
    title: "四、交易记录 · 内因",
    badge: "内因",
    badgeClass: "badge-loss",
    fields: [
      { key: "buySignal", label: "买入信号", placeholder: "形态、量能、均线、消息、盘口等" },
      { key: "sellSignal", label: "卖出信号", placeholder: "止盈、止损、破位、量价背离等" },
      { key: "operationReason", label: "操作理由", placeholder: "为什么买、为什么卖、仓位逻辑" },
      { key: "profitAttribution", label: "盈利归因", placeholder: "实力 or 运气？", accent: "profit" },
      { key: "lossAttribution", label: "亏损归因", placeholder: "大盘问题？利空？主力出货？", accent: "loss" },
      { key: "executionNotes", label: "执行偏差", placeholder: "冲动、犹豫、追高、卖飞、没按纪律" },
      { key: "improvementPlan", label: "改进计划", placeholder: "下次具体怎么做" },
    ],
    summaryKeys: ["buySignal", "sellSignal", "operationReason", "profitAttribution", "lossAttribution", "executionNotes", "improvementPlan"],
    summaryLabels: ["买入信号", "卖出信号", "操作理由", "盈利归因", "亏损归因", "执行偏差", "改进计划"],
  },
  "5": {
    title: "五、明日策略 · 决策",
    badge: "决策",
    badgeClass: "badge-profit",
    fields: [
      { key: "marketPlan", label: "大盘预案", placeholder: "上涨/震荡/下跌三种情景预案" },
      { key: "positionPlan", label: "持仓计划", placeholder: "加仓条件、止盈位、止损位、减仓触发" },
      { key: "newCandidates", label: "新标的", placeholder: "新加入池子的标的，触发条件" },
    ],
    summaryKeys: ["marketPlan", "positionPlan", "newCandidates"],
    summaryLabels: ["大盘预案", "持仓计划", "新标的"],
  },
};

export default function DailyReview({ navigate, editReviewId, showToast }) {
  const today = localDateString();
  const [review, setReview] = useState(reviewDefaults(today));
  const [saving, setSaving] = useState(false);
  const [dbOk, setDbOk] = useState(false);
  const [tab, setTab] = useState("summary");
  const [modalSection, setModalSection] = useState(null);
  const modalSnapshot = useRef(null);

  const openModal = (section) => {
    modalSnapshot.current = JSON.parse(JSON.stringify(review));
    setModalSection(section);
  };
  const closeModal = (discard) => {
    if (discard && modalSnapshot.current) {
      const snap = modalSnapshot.current;
      setReview((r) => ({ ...r, ...snap }));
      // 直接用快照保存草稿，不依赖异步 setState
      try { localStorage.setItem(REVIEW_DRAFT_KEY, JSON.stringify({ ...review, ...snap })); } catch {}
    }
    modalSnapshot.current = null;
    setModalSection(null);
  };

  // Filter

  // AI Chat
  const AI_CHAT_KEY = "toolbox_ai_chat";
  const [aiMessages, setAiMessages] = useState(() => {
    try {
      const saved = localStorage.getItem(AI_CHAT_KEY);
      return saved ? JSON.parse(saved) : [{ role: "bot", text: '你好！填写复盘内容后，你可以问我任何关于交易的问题。' }];
    } catch { return [{ role: "bot", text: '你好！填写复盘内容后，你可以问我任何关于交易的问题。' }]; }
  });
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiConfig, setAiConfig] = useState(null);
  const aiEndRef = useRef(null);

  const set = (k, v) => setReview((r) => ({ ...r, [k]: v }));

  useEffect(() => {
    api.health().then((d) => setDbOk(d.database === "ready")).catch(() => {});
    loadDraft();
    loadAiConfig();
  }, []);

  useEffect(() => {
    if (editReviewId) loadRecordById(editReviewId);
  }, [editReviewId]);

  useEffect(() => {
    // 仅在用户发送新消息后滚动，初始加载不滚动
    if (aiMessages.length > 1) {
      aiEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    // 持久化聊天记录
    try { localStorage.setItem(AI_CHAT_KEY, JSON.stringify(aiMessages)); } catch {}
  }, [aiMessages]);

  function clearAiChat() {
    setAiMessages([{ role: "bot", text: "聊天记录已清空。有什么可以帮助你的？" }]);
    try { localStorage.removeItem(AI_CHAT_KEY); } catch {}
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(REVIEW_DRAFT_KEY);
      if (raw) setReview((r) => ({ ...r, ...JSON.parse(raw), reviewDate: today }));
    } catch {}
  }

  async function loadAiConfig() {
    try {
      const data = await api.getSettings();
      const s = data.settings || {};
      if (s.aiKey) {
        setAiConfig({ url: s.aiUrl, key: s.aiKey, model: s.aiModel, temperature: s.aiTemperature ?? 0.7, thinking: s.aiThinking !== false && s.aiThinking !== "false" });
      }
    } catch (e) {
      showToast(`加载AI配置失败：${e.message}`, "error");
    }
  }

  function saveDraft() {
    try { localStorage.setItem(REVIEW_DRAFT_KEY, JSON.stringify(review)); } catch {}
  }

  async function loadRecordById(id) {
    try {
      const data = await api.getReviews({ limit: 200 });
      const found = (data.records || []).find((r) => String(r.id) === String(id));
      if (found) setReview((r) => ({ ...r, ...found }));
    } catch {}
  }

  async function save() {
    setSaving(true);
    try {
      const d = await api.saveReview(review);
      localStorage.removeItem(REVIEW_DRAFT_KEY);
      showToast("复盘已保存", "success");
    } catch (e) {
      showToast(`保存失败：${e.message}`, "error");
    } finally { setSaving(false); }
  }

  const update = (k, v) => {
    set(k, v);
    saveDraft();
  };

  function completeness() {
    const fields = [review.symbol, review.buyPrice > 0, review.shares > 0, review.holdingStyle,
      review.indexJudgment, review.volumeJudgment, review.sentimentJudgment, review.capitalDirection,
      review.leadingSectors, review.laggingSectors, review.sustainability,
      review.stockStrength, review.volAmpRanking, review.limitAnalysis,
      review.buySignal, review.sellSignal, review.operationReason,
      review.profitAttribution, review.lossAttribution, review.executionNotes, review.improvementPlan,
      review.marketPlan, review.positionPlan, review.newCandidates,
    ].filter(Boolean);
    return Math.round((fields.length / 23) * 100);
  }

  async function sendAi() {
    const msg = aiInput.trim();
    if (!msg || aiLoading) return;
    setAiInput("");
    const updatedMessages = [...aiMessages, { role: "user", text: msg }];
    setAiMessages(updatedMessages);
    setAiLoading(true);
    try {
      const d = await api.aiChat(review, updatedMessages, aiConfig);
      const reply = d.reply || "";
      setAiMessages((m) => [...m, { role: "bot", text: reply || "（无回复）" }]);
    } catch (e) {
      setAiMessages((m) => [...m, { role: "bot", text: `❌ ${e.message}` }]);
    } finally { setAiLoading(false); }
  }

  const buyValue = Math.max(0, toNumber(review.buyPrice, 10)) * Math.max(0, toNumber(review.shares, 1000));
  const isClosed = review.sellPrice !== "" && review.sellPrice !== null;
  const pnlAmount = isClosed ? (toNumber(review.sellPrice) - toNumber(review.buyPrice)) * toNumber(review.shares) : 0;
  const comp = completeness();

  return (
    <div className="page">
      <div className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 className="topbar-title">{review.symbol} · {review.reviewDate}</h1>
          <span className="badge">{isClosed ? `${toNumber(review.pnlRate).toFixed(2)}%` : "未卖出"}</span>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-ghost" onClick={() => { setReview(reviewDefaults(today)); localStorage.removeItem(REVIEW_DRAFT_KEY); showToast("表单已清空", "info"); }}>清空</button>
          <button className="btn btn-primary" disabled={!dbOk || saving} onClick={save}>{saving ? "保存中…" : "保存"}</button>
        </div>
      </div>

      <div className="metrics-row">
        <div className="metric-card metric-base"><div className="metric-label">买入金额</div><div className="metric-value">{formatMoney.format(buyValue)}</div><div className="metric-desc">持仓 {review.shares} 股 · {review.holdingStyle}</div></div>
        <div className={`metric-card ${pnlAmount >= 0 ? "metric-profit" : "metric-loss"}`}><div className="metric-label">盈亏金额</div><div className={`metric-value ${pnlAmount >= 0 ? "green" : "red"}`}>{formatMoney.format(pnlAmount)}</div><div className="metric-desc">{isClosed ? `收益率 ${toNumber(review.pnlRate).toFixed(2)}%` : "未录入卖出价"}</div></div>
        <div className="metric-card metric-info"><div className="metric-label">复盘完整度</div><div className="metric-value purple">{comp}%</div><div className="metric-desc">{comp >= 80 ? "复盘信息较完整 ✓" : comp >= 50 ? "继续完善" : "逐步完善"}</div></div>
      </div>

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

      <div style={{ display: "flex", gap: 0, background: "var(--border-subtle)", borderRadius: "var(--radius-sm)", overflow: "hidden", width: "fit-content" }}>
        <button className={`btn ${tab === "summary" ? "btn-primary" : "btn-ghost"}`} style={{ borderRadius: 0, border: "none" }} onClick={() => setTab("summary")}>📋 复盘摘要</button>
        <button className={`btn ${tab === "methodology" ? "btn-primary" : "btn-ghost"}`} style={{ borderRadius: 0, border: "none" }} onClick={() => setTab("methodology")}>📖 复盘方法论</button>
      </div>

      {tab === "summary" && Object.entries(sectionConfig).map(([num, cfg]) => (
        <div className="card" key={num}>
          <div className="card-header clickable" onClick={() => openModal(num)}>
            <h2>{cfg.title}</h2>
            <span className={`badge ${cfg.badgeClass === "badge-accent" ? "" : cfg.badgeClass === "badge-info" ? "" : ""}`} style={{
              background: cfg.badgeClass === "badge-accent" ? "var(--accent-soft)" : cfg.badgeClass === "badge-info" ? "var(--info-soft)" : cfg.badgeClass === "badge-warning" ? "rgba(217,119,6,0.05)" : "var(--loss-soft)",
              color: cfg.badgeClass === "badge-accent" ? "var(--accent)" : cfg.badgeClass === "badge-info" ? "var(--info)" : cfg.badgeClass === "badge-warning" ? "var(--warning)" : "var(--loss)",
              fontSize: 10,
            }}>{cfg.badge}</span>
          </div>
          <div className="card-body">
            <div className="review-grid">
              {cfg.summaryKeys.map((k, i) => (
                <div className="summary-item" key={k}><label>{cfg.summaryLabels[i]}</label><p className={review[k] ? "filled" : ""}>{review[k] || "待填写"}</p></div>
              ))}
            </div>
          </div>
        </div>
      ))}

      {tab === "methodology" && (
        <div className="card">
          <div className="card-header"><h2>复盘方法论</h2></div>
          <div className="card-body">
            {[
              ["市场复盘 · 发生了什么", "指数走势判断、量能分析、情绪判断、资金方向。客观记录市场状态。"],
              ["板块分析 · 为什么会发生", "领涨/领跌板块及驱动逻辑、持续性判断。寻找主线与暗线。"],
              ["个股检查 · 标的状况", "标的强弱对比大盘、成交量/振幅分析、涨跌停环境。"],
              ["交易记录 · 内因分析", "买卖信号回顾、操作理由复盘、盈亏归因、执行偏差与改进。"],
              ["明日策略 · 决策输出", "大盘预案、持仓计划、潜在新标的与买入触发条件。"],
            ].map(([title, desc], i) => (
              <div className="method-step" key={i}><div className="step-num">{i + 1}</div><div><strong>{title}</strong><p>{desc}</p></div></div>
            ))}
          </div>
        </div>
      )}

      {/* AI Chat */}
      <div className="card">
        <div className="card-header"><h2>🤖 AI 复盘助手</h2><button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={clearAiChat}>清空对话</button></div>
        <div className="ai-chat-body">
          <div className="ai-messages">
            {aiMessages.map((m, i) => <div key={i} className={`ai-msg ${m.role}`}>{m.text}</div>)}
            <div ref={aiEndRef} />
          </div>
          <div className="ai-input-row">
            <textarea value={aiInput} onChange={(e) => setAiInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAi(); } }} placeholder="输入你的问题…" />
            <button className="btn btn-primary" onClick={sendAi} disabled={aiLoading}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {modalSection && (
        <div className="modal-overlay" onClick={() => closeModal(true)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize: 16, fontWeight: 700 }}>{sectionConfig[modalSection].title}</h2>
              <button className="btn btn-ghost" onClick={() => closeModal(true)}>✕ 关闭（丢弃修改）</button>
            </div>
            <div className="modal-body">
              {sectionConfig[modalSection].fields.map((f) => (
                <div className="form-row" key={f.key}>
                  <div className={`form-field ${f.accent ? `accent-${f.accent}` : ""}`}>
                    <label>{f.label}</label>
                    <textarea className={review[f.key] ? "filled" : ""} value={review[f.key] || ""} onChange={(e) => update(f.key, e.target.value)} rows="2" placeholder={f.placeholder} />
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => { closeModal(false); showToast("内容已保存到表单", "success"); }}>💾 保存并关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
