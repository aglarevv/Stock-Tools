import { useState, useCallback } from "react";
import { formatMoney, futuresDefaults, toNumber } from "../utils/helpers.js";
import Button from "./Button.jsx";

export default function FuturesCalc() {
  const [f, setF] = useState({ ...futuresDefaults });
  const [reverse, setReverse] = useState({ entry: 50000, profit: 5, loss: 2, position: "long", result: null });

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const calc = useCallback(() => {
    const ep = Math.max(0, toNumber(f.entryPrice, 50000));
    const pr = Math.max(0, toNumber(f.takeProfitRate, 5));
    const lr = Math.max(0, toNumber(f.stopLossRate, 2));
    const lev = Math.max(1, Math.floor(toNumber(f.leverage, 1)));
    const isLong = f.position === "long";
    const tp = isLong ? ep * (1 + pr / 100) : ep * (1 - pr / 100);
    const sl = isLong ? ep * (1 - lr / 100) : ep * (1 + lr / 100);
    return { entryPrice: ep, takeProfitPrice: tp, stopLossPrice: sl, takeProfitRate: pr, stopLossRate: lr, leverage: lev, isLong, riskReward: lr > 0 ? pr / lr : 0 };
  }, [f]);

  const c = calc();
  const minP = Math.min(c.stopLossPrice, c.entryPrice, c.takeProfitPrice) * 0.97;
  const maxP = Math.max(c.stopLossPrice, c.entryPrice, c.takeProfitPrice) * 1.03;
  const span = maxP - minP || 1;
  const pos = (v) => `${Math.max(1, Math.min(99, ((v - minP) / span) * 100))}%`;

  function calcReverse() {
    const ep = Math.max(0, toNumber(reverse.entry, 50000));
    const pt = Math.max(0, toNumber(reverse.profit, 5));
    const ll = Math.max(0, toNumber(reverse.loss, 2));
    const isLong = reverse.position === "long";
    setReverse((r) => ({ ...r, result: { tp: isLong ? ep * (1 + pt / 100) : ep * (1 - pt / 100), sl: isLong ? ep * (1 - ll / 100) : ep * (1 + ll / 100) } }));
  }

  return (
    <div className="page">
      <div className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 className="topbar-title">{f.symbol || "BTC"} · 入场价 {formatMoney.format(c.entryPrice)}</h1>
          <span className="badge">{c.isLong ? "做多" : "做空"}</span>
        </div>
      </div>

      <div className="metrics-row">
        <div className="metric-card metric-loss"><div className="metric-label">止损价</div><div className="metric-value red">{formatMoney.format(c.stopLossPrice)}</div><div className="metric-desc">亏损空间 {c.stopLossRate.toFixed(1)}%</div></div>
        <div className="metric-card metric-base"><div className="metric-label">入场价</div><div className="metric-value">{formatMoney.format(c.entryPrice)}</div><div className="metric-desc">{c.isLong ? "做多" : "做空"}仓位{c.leverage > 1 ? ` · ${c.leverage}倍杠杆` : ""}</div></div>
        <div className="metric-card metric-profit"><div className="metric-label">止盈价</div><div className="metric-value green">{formatMoney.format(c.takeProfitPrice)}</div><div className="metric-desc">盈利空间 {c.takeProfitRate.toFixed(1)}%</div></div>
      </div>

      <div className="content-grid">
        <div className="card">
          <div className="card-header"><h2>合约参数</h2></div>
          <div className="card-body">
            <div className="form-row"><div className="form-field"><label>合约名称</label><input value={f.symbol} onChange={(e) => set("symbol", e.target.value)} /></div></div>
            <div className="form-row cols-2">
              <div className="form-field"><label>入场价格</label><input type="number" value={f.entryPrice} onChange={(e) => set("entryPrice", e.target.value)} /></div>
              <div className="form-field"><label>持仓类型</label><select value={f.position} onChange={(e) => set("position", e.target.value)}><option value="long">做多</option><option value="short">做空</option></select></div>
            </div>
            <div className="form-row cols-2">
              <div className="form-field"><label>止盈率 (%)</label><input type="number" value={f.takeProfitRate} onChange={(e) => set("takeProfitRate", e.target.value)} /></div>
              <div className="form-field"><label>止损率 (%)</label><input type="number" value={f.stopLossRate} onChange={(e) => set("stopLossRate", e.target.value)} /></div>
            </div>
            <div className="form-row"><div className="form-field"><label>合约倍数</label><input type="number" value={f.leverage} onChange={(e) => set("leverage", e.target.value)} /><small>杠杆倍数</small></div></div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2>收益率反推</h2></div>
          <div className="card-body">
            <div className="form-row"><div className="form-field"><label>入场价格</label><input type="number" value={reverse.entry} onChange={(e) => setReverse((r) => ({ ...r, entry: e.target.value }))} /></div></div>
            <div className="form-row cols-2">
              <div className="form-field"><label>目标收益率 (%)</label><input type="number" value={reverse.profit} onChange={(e) => setReverse((r) => ({ ...r, profit: e.target.value }))} /></div>
              <div className="form-field"><label>最大止损率 (%)</label><input type="number" value={reverse.loss} onChange={(e) => setReverse((r) => ({ ...r, loss: e.target.value }))} /></div>
            </div>
            <div className="form-row"><div className="form-field"><label>持仓类型</label><select value={reverse.position} onChange={(e) => setReverse((r) => ({ ...r, position: e.target.value }))}><option value="long">做多</option><option value="short">做空</option></select></div></div>
            <Button variant="primary" fullWidth onClick={calcReverse} style={{ marginTop: 8 }}>计算止盈止损价格</Button>
            {reverse.result && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
                <div style={{ padding: 10, borderRadius: 6, background: "var(--bg-input)", border: "1px solid var(--border-subtle)" }}>
                  <small style={{ color: "var(--text-muted)" }}>止盈价格</small>
                  <strong style={{ display: "block", fontSize: 18, fontFamily: "var(--font-mono)", color: "var(--profit)" }}>{formatMoney.format(reverse.result.tp)}</strong>
                </div>
                <div style={{ padding: 10, borderRadius: 6, background: "var(--bg-input)", border: "1px solid var(--border-subtle)" }}>
                  <small style={{ color: "var(--text-muted)" }}>止损价格</small>
                  <strong style={{ display: "block", fontSize: 18, fontFamily: "var(--font-mono)", color: "var(--loss)" }}>{formatMoney.format(reverse.result.sl)}</strong>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2>价格区间</h2></div>
        <div className="card-body">
          <div className="range-chart">
            <div className="zone zone-loss" style={{ flex: ((c.entryPrice - minP) / span) * 100 }} />
            <div className="zone zone-hold" style={{ flex: ((c.takeProfitPrice - c.entryPrice) / span) * 100 }} />
            <div className="zone zone-profit" style={{ flex: ((maxP - c.takeProfitPrice) / span) * 100 }} />
            <div className="marker marker-loss" style={{ left: pos(c.stopLossPrice) }}><span>止损</span></div>
            <div className="marker marker-base" style={{ left: pos(c.entryPrice) }}><span>入场</span></div>
            <div className="marker marker-profit" style={{ left: pos(c.takeProfitPrice) }}><span>止盈</span></div>
          </div>
          <div className="chart-axis"><span>{formatMoney.format(minP)}</span><span>{formatMoney.format((minP + maxP) / 2)}</span><span>{formatMoney.format(maxP)}</span></div>
        </div>
      </div>
    </div>
  );
}
