import { useState, useEffect } from "react";
import { api } from "../utils/api.js";
import { formatMoney, escapeHtml } from "../utils/helpers.js";

export default function Dashboard({ navigate, showToast }) {
  const [data, setData] = useState(null);

  useEffect(() => { load(); }, []);
  async function load() {
    try { setData(await api.dashboard()); } catch { /* ignore */ }
  }

  if (!data) return <div className="page"><div className="empty-text">加载中…</div></div>;

  const latest = data.recentReviews?.[0];

  return (
    <div className="page">
      <div className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 className="topbar-title"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:-4,marginRight:6}}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>看板</h1>
          <span className="badge">数据概览</span>
        </div>
      </div>

      <div className="metrics-row">
        <div className="metric-card metric-base" onClick={() => navigate("plan-list")}>
          <div className="metric-label">交易计划</div>
          <div className="metric-value">{data.totalPlans}</div>
          <div className="metric-desc">已保存的计划数 · 点击查看</div>
        </div>
        <div className="metric-card metric-info" onClick={() => navigate("review-list")}>
          <div className="metric-label">复盘记录</div>
          <div className="metric-value">{data.totalReviews}</div>
          <div className="metric-desc">已保存的复盘数 · 点击查看</div>
        </div>
        <div className="metric-card metric-profit">
          <div className="metric-label">胜率</div>
          <div className="metric-value">{data.winRate}%</div>
          <div className="metric-desc">胜 {data.winCount} / 负 {data.lossCount}</div>
        </div>
      </div>

      <div className="content-grid">
        <div className="card">
          <div className="card-header"><h2>盈亏汇总</h2></div>
          <div className="card-body">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div className="metric-card metric-profit" style={{ border: "none", padding: 12, background: "var(--bg-hover)" }}>
                <div className="metric-label">总盈利</div>
                <div className="metric-value" style={{ fontSize: 20, color: "var(--profit)" }}>{formatMoney.format(data.totalProfit)}</div>
              </div>
              <div className="metric-card metric-loss" style={{ border: "none", padding: 12, background: "var(--bg-hover)" }}>
                <div className="metric-label">总亏损</div>
                <div className="metric-value" style={{ fontSize: 20, color: "var(--loss)" }}>{formatMoney.format(data.totalLoss)}</div>
              </div>
            </div>
            <div style={{ textAlign: "center", marginTop: 8 }}>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>净盈亏：</span>
              <strong style={{ fontSize: 18, fontFamily: "var(--font-mono)", color: data.netPnl >= 0 ? "var(--profit)" : "var(--loss)" }}>{formatMoney.format(data.netPnl)}</strong>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2>📝 最近复盘摘要</h2><span className="card-hint">{latest?.reviewDate}</span></div>
          <div className="card-body">
            {latest ? (
              <div onClick={() => navigate("review", { reviewId: latest.id })} style={{ cursor: "pointer" }}>
                <ReviewSummary record={latest} />
              </div>
            ) : <div className="empty-text">暂无复盘记录</div>}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2>最近复盘记录</h2></div>
          <div className="card-body">
            {data.recentReviews?.length ? data.recentReviews.map((r) => (
              <div key={r.reviewDate + r.symbol} className="record-item" onClick={() => navigate("review", { reviewId: r.id })}>
                <span style={{ flex: 1 }}>
                  <span className="record-symbol">{r.reviewDate} {escapeHtml(r.symbol)}</span>
                  &nbsp;<span style={{ color: r.pnlAmount >= 0 ? "var(--profit)" : "var(--loss)" }}>{formatMoney.format(r.pnlAmount)}</span>
                  &nbsp;({Number(r.pnlRate).toFixed(2)}%)
                </span>
              </div>
            )) : <div className="empty-text">
              暂无复盘记录 · <span style={{ color: "var(--accent)", cursor: "pointer", textDecoration: "underline" }} onClick={() => navigate("review")}>去复盘</span>
            </div>}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2>最近交易计划</h2></div>
        <table className="data-table">
          <thead><tr><th>股票</th><th>买入价</th><th>止盈价</th><th>止损价</th><th>预期盈利</th><th>盈亏比</th></tr></thead>
          <tbody>
            {data.recentPlans?.length ? data.recentPlans.map((r, i) => (
              <tr key={i} className="clickable" onClick={() => navigate("plan-list")}>
                <td className="record-symbol">{escapeHtml(r.symbol)}</td>
                <td>{formatMoney.format(r.buyPrice)}</td>
                <td style={{ color: "var(--profit)" }}>{formatMoney.format(r.takeProfitPrice)}</td>
                <td style={{ color: "var(--loss)" }}>{formatMoney.format(r.stopLossPrice)}</td>
                <td>{formatMoney.format(r.expectedProfit)}</td>
                <td>{Number(r.riskReward).toFixed(2)}:1</td>
              </tr>
            )) : <tr><td colSpan="6" style={{ textAlign: "center", color: "var(--text-muted)", padding: 16 }}>
              暂无交易计划 · <span style={{ color: "var(--accent)", cursor: "pointer", textDecoration: "underline" }} onClick={() => navigate("calculator")}>去创建</span>
            </td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReviewSummary({ record }) {
  const fields = [
    ["指数判断", record.indexJudgment],
    ["量能判断", record.volumeJudgment],
    ["情绪判断", record.sentimentJudgment],
    ["领涨板块", record.leadingSectors],
    ["买入信号", record.buySignal],
    ["卖出信号", record.sellSignal],
    ["改进计划", record.improvementPlan],
    ["明日预案", record.marketPlan],
  ].filter(([, v]) => v);

  return fields.length ? fields.map(([label, val], i) => (
    <div key={i} style={{ marginBottom: 6, fontSize: 12, lineHeight: 1.6 }}>
      <strong>{label}：</strong>{escapeHtml(val)}
    </div>
  )) : <div className="empty-text">最新复盘暂无详细内容</div>;
}
