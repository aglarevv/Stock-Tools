import { useState, useEffect, useCallback } from "react";
import { api } from "../utils/api.js";
import { formatMoney, defaults, presets, priceAtRate, transactionFee, toNumber, escapeHtml } from "../utils/helpers.js";

export default function TradePlan({ showToast }) {
  const [plan, setPlan] = useState({ ...defaults });
  const [saving, setSaving] = useState(false);
  const [dbOk, setDbOk] = useState(false);

  useEffect(() => { api.health().then((d) => setDbOk(d.database === "ready")).catch(() => {}); }, []);

  const set = (k, v) => setPlan((p) => ({ ...p, [k]: v }));

  const calc = useCallback(() => {
    const { symbol, buyPrice, shares, profitRate, lossRate, feeRate } = plan;
    const buy = Math.max(0, toNumber(buyPrice, 10));
    const sh = Math.max(0, Math.floor(toNumber(shares, 1000)));
    const pr = Math.max(0, toNumber(profitRate, 10));
    const lr = Math.max(0, toNumber(lossRate, 5));
    const fr = Math.max(0, toNumber(feeRate, 0.03));
    const tp = priceAtRate(buy, pr, "profit");
    const sl = priceAtRate(buy, lr, "loss");
    const bf = transactionFee(buy, sh, fr);
    const tpf = transactionFee(tp, sh, fr);
    const slf = transactionFee(sl, sh, fr);
    return {
      symbol: symbol || "自选股", buyPrice: buy, shares: sh, profitRate: pr, lossRate: lr, feeRate: fr,
      stopLossPrice: sl, takeProfitPrice: tp, positionCost: buy * sh + bf,
      expectedProfit: (tp - buy) * sh - bf - tpf, expectedLoss: (buy - sl) * sh + bf + slf,
      riskReward: lr > 0 ? pr / lr : 0,
      tradeDirection: plan.tradeDirection || "long", positionPct: plan.positionPct || 100, tradeNotes: plan.tradeNotes || "",
    };
  }, [plan]);

  const c = calc();
  const minP = Math.max(0, Math.min(c.stopLossPrice, c.buyPrice, c.takeProfitPrice) * 0.965);
  const maxP = Math.max(c.takeProfitPrice, c.buyPrice, c.stopLossPrice) * 1.035 || 1;
  const span = maxP - minP || 1;
  const pos = (v) => `${Math.max(1, Math.min(99, ((v - minP) / span) * 100))}%`;

  async function save() {
    setSaving(true);
    try {
      const d = await api.saveTradePlan(c);
      showToast("交易计划已保存", "success");
    } catch (e) {
      showToast(`保存失败：${e.message}`, "error");
    } finally { setSaving(false); }
  }

  return (
    <div className="page">
      <div className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 className="topbar-title">{c.symbol} · 买入价 {formatMoney.format(c.buyPrice)}</h1>
          <span className="badge">盈亏比 {c.riskReward ? c.riskReward.toFixed(2) : "∞"}:1</span>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-ghost" onClick={() => { setPlan({ ...defaults }); showToast("表单已重置", "info"); }}>重置</button>
          <button className="btn btn-primary" disabled={!dbOk || saving} onClick={save}>{saving ? "保存中…" : "保存"}</button>
        </div>
      </div>

      <div className="metrics-row">
        <div className="metric-card metric-loss"><div className="metric-label">止损价</div><div className="metric-value red">{formatMoney.format(c.stopLossPrice)}</div><div className="metric-desc">预计亏损 {formatMoney.format(c.expectedLoss)}</div></div>
        <div className="metric-card metric-base"><div className="metric-label">买入价</div><div className="metric-value">{formatMoney.format(c.buyPrice)}</div><div className="metric-desc">持仓成本 {formatMoney.format(c.positionCost)}</div></div>
        <div className="metric-card metric-profit"><div className="metric-label">止盈价</div><div className="metric-value green">{formatMoney.format(c.takeProfitPrice)}</div><div className="metric-desc">预计盈利 {formatMoney.format(c.expectedProfit)}</div></div>
      </div>

      <div className="content-grid">
        <div className="card">
          <div className="card-header"><h2>交易参数</h2></div>
          <div className="card-body">
            <div className="form-row"><div className="form-field"><label>股票名称</label><input value={plan.symbol} onChange={(e) => set("symbol", e.target.value)} /></div></div>
            <div className="form-row cols-2">
              <div className="form-field"><label>买入价</label><input type="number" value={plan.buyPrice} onChange={(e) => set("buyPrice", e.target.value)} /></div>
              <div className="form-field"><label>持仓股数</label><input type="number" value={plan.shares} onChange={(e) => set("shares", e.target.value)} /></div>
            </div>
            <div className="form-row cols-2">
              <div className="form-field"><label>止盈率 (%)</label><input type="number" value={plan.profitRate} onChange={(e) => set("profitRate", e.target.value)} /></div>
              <div className="form-field"><label>止损率 (%)</label><input type="number" value={plan.lossRate} onChange={(e) => set("lossRate", e.target.value)} /></div>
            </div>
            <div className="form-row"><div className="form-field"><label>交易费率 (%)</label><input type="number" value={plan.feeRate} onChange={(e) => set("feeRate", e.target.value)} /><small>按成交金额百分比估算</small></div></div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2>交易配置</h2></div>
          <div className="card-body">
            <div className="form-row cols-2">
              <div className="form-field"><label>交易方向</label><select value={plan.tradeDirection} onChange={(e) => set("tradeDirection", e.target.value)}><option value="long">做多</option><option value="short">做空</option></select></div>
              <div className="form-field"><label>仓位占比 (%)</label><input type="number" value={plan.positionPct} onChange={(e) => set("positionPct", e.target.value)} /><small>占总资金比例</small></div>
            </div>
            <div className="form-row"><div className="form-field"><label>交易备注</label><textarea value={plan.tradeNotes} onChange={(e) => set("tradeNotes", e.target.value)} rows="2" placeholder="买入理由、技术形态、风险提示等" /></div></div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2>策略预设</h2></div>
          <div className="card-body">
            <div className="preset-group">
              {Object.entries(presets).map(([k, v]) => (
                <button key={k} className={`preset-btn${plan.profitRate === v.profitRate && plan.lossRate === v.lossRate ? " active" : ""}`}
                  onClick={() => setPlan((p) => ({ ...p, ...v }))}>{k === "steady" ? "稳健" : k === "balanced" ? "均衡" : "进攻"}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2>价格区间</h2></div>
        <div className="card-body">
          <div className="range-chart">
            <div className="zone zone-loss" style={{ flex: c.buyPrice > minP ? ((c.buyPrice - minP) / span) * 100 : 0 }} />
            <div className="zone zone-hold" style={{ flex: ((c.takeProfitPrice - c.buyPrice) / span) * 100 }} />
            <div className="zone zone-profit" style={{ flex: ((maxP - c.takeProfitPrice) / span) * 100 }} />
            <div className="marker marker-loss" style={{ left: pos(c.stopLossPrice) }}><span>止损</span></div>
            <div className="marker marker-base" style={{ left: pos(c.buyPrice) }}><span>买入</span></div>
            <div className="marker marker-profit" style={{ left: pos(c.takeProfitPrice) }}><span>止盈</span></div>
          </div>
          <div className="chart-axis"><span>{formatMoney.format(minP)}</span><span>{formatMoney.format((minP + maxP) / 2)}</span><span>{formatMoney.format(maxP)}</span></div>
        </div>
      </div>
    </div>
  );
}
