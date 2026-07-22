import { useState, useEffect } from "react";
import { useApi } from "../hooks/useApi.jsx";
import { formatMoney, escapeHtml } from "../utils/helpers.js";
import Icon from "./Icon.jsx";
import Button from "./Button.jsx";

export default function Dashboard({ navigate, showToast }) {
  const api = useApi();
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
          <h1 className="topbar-title">
            <Icon name="dashboard" size={22} style={{ verticalAlign: -4, marginRight: 6 }} />
            看板
          </h1>
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
        <div className="metric-card metric-profit" onClick={() => navigate("positions")}>
          <div className="metric-label">胜率</div>
          <div className="metric-value">{data.winRate}%</div>
          <div className="metric-desc">胜 {data.winCount} / 负 {data.lossCount} · 点击查看</div>
        </div>
      </div>

      <div className="metrics-row">
        <div className="metric-card metric-base" onClick={() => navigate("positions")}>
          <div className="metric-label">持仓数量</div>
          <div className="metric-value">{data.positionCount || 0}</div>
          <div className="metric-desc">持仓成本 {formatMoney.format(data.positionCost || 0)}</div>
        </div>
        <div className="metric-card metric-info" onClick={() => navigate("positions")}>
          <div className="metric-label">持仓市值</div>
          <div className="metric-value">{formatMoney.format(data.positionMarketValue || 0)}</div>
          <div className="metric-desc">净盈亏 {formatMoney.format(data.netPnl || 0)}</div>
        </div>
        <div className={`metric-card ${data.netPnl >= 0 ? "metric-profit" : "metric-loss"}`} onClick={() => navigate("positions")}>
          <div className="metric-label">盈亏汇总</div>
          <div className="metric-value" style={{ fontSize: 18 }}>{formatMoney.format(data.totalProfit || 0)}</div>
          <div className="metric-desc">盈 / {formatMoney.format(Math.abs(data.totalLoss || 0))} 亏</div>
        </div>
      </div>

      <h2 style={{ margin: "24px 0 12px", fontSize: 15 }}><Icon name="candlestick" size={18} style={{ verticalAlign: -3, marginRight: 6 }} />K线训练</h2>
      <div className="metrics-row">
        <div className="metric-card metric-base" onClick={() => navigate("kline-train")}>
          <div className="metric-label">训练局数</div>
          <div className="metric-value">{data.trainSessions || 0}</div>
          <div className="metric-desc">完成训练的局数 · 点击前往</div>
        </div>
        <div className="metric-card metric-info" onClick={() => navigate("kline-train")}>
          <div className="metric-label">总开平仓</div>
          <div className="metric-value">{data.trainTotalTrades || 0}</div>
          <div className="metric-desc">所有交易的买卖次数</div>
        </div>
        <div className={`metric-card ${data.trainWinRate >= 50 ? "metric-profit" : "metric-loss"}`} onClick={() => navigate("kline-train")}>
          <div className="metric-label">胜率</div>
          <div className="metric-value">{data.trainWinRate ?? 0}%</div>
          <div className="metric-desc">收益为正的交易占比</div>
        </div>
        <div className={`metric-card ${data.trainProfitLossRatio >= 1 ? "metric-profit" : "metric-loss"}`} onClick={() => navigate("kline-train")}>
          <div className="metric-label">盈亏比</div>
          <div className="metric-value">{data.trainProfitLossRatio ?? 0}</div>
          <div className="metric-desc">盈利次数 / 亏损次数</div>
        </div>
      </div>

      <div className="content-grid">
        <div className="card">
          <div className="card-header"><h2>最近复盘摘要</h2><span className="card-hint">{latest?.reviewDate}</span></div>
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
