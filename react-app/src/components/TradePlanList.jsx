import { useState, useEffect } from "react";
import { api } from "../utils/api.js";
import { formatMoney, escapeHtml } from "../utils/helpers.js";

const PAGE_SIZE = 15;

export default function TradePlanList({ navigate, showToast }) {
  const [records, setRecords] = useState([]);
  const [page, setPage] = useState(1);
  const [symbol, setSymbol] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const data = await api.getTradePlans(200);
      let list = data.records || [];
      if (symbol.trim()) list = list.filter((r) => r.symbol.toLowerCase().includes(symbol.trim().toLowerCase()));
      setRecords(list);
      setPage(1);
    } catch (e) { showToast(`加载失败：${e.message}`, "error"); }
  }

  async function handleDelete(id) {
    if (!confirm("确认删除这条交易计划？")) return;
    try { await api.deleteTradePlan(id); showToast("已删除", "success"); load(); } catch (e) { showToast(`删除失败：${e.message}`, "error"); }
  }

  const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  const p = Math.min(page, totalPages);
  const pageRecords = records.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);

  return (
    <div className="page">
      <div className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 className="topbar-title"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:-4,marginRight:6}}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>交易记录</h1>
          <span className="badge">全部记录</span>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2>筛选</h2><span className="card-hint">共 {records.length} 条</span></div>
        <div className="card-body">
          <div className="filter-row">
            <input placeholder="🔍 股票名称…" value={symbol} onChange={(e) => setSymbol(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} style={{ flex: 1, minWidth: 200 }} />
            <button className="btn btn-ghost" onClick={load}>查询</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          {pageRecords.length ? pageRecords.map((r) => (
            <div key={r.id} className="record-item" onClick={() => navigate("calculator")}>
              <span style={{ flex: 1 }}>
                <span className="record-symbol">{escapeHtml(r.symbol)}</span>
                &nbsp;买入 {formatMoney.format(r.buyPrice)}
                &nbsp;止盈 {formatMoney.format(r.takeProfitPrice)}
                &nbsp;止损 {formatMoney.format(r.stopLossPrice)}
                &nbsp;盈亏比 {Number(r.riskReward).toFixed(2)}:1
                {r.tradeDirection === "short" && <span style={{ color: "var(--loss)", marginLeft: 4 }}>做空</span>}
                {r.positionPct < 100 && <span style={{ color: "var(--text-muted)", marginLeft: 4 }}>{r.positionPct}%仓</span>}
              </span>
              <button className="btn btn-ghost btn-delete" style={{ flexShrink: 0, padding: "2px 8px", fontSize: 11 }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); handleDelete(r.id); }}>🗑</button>
            </div>
          )) : <div className="empty-text">暂无记录</div>}
        </div>
      </div>

      {records.length > PAGE_SIZE && (
        <div className="pagination">
          <button className="btn btn-ghost" disabled={p <= 1} onClick={() => setPage(p - 1)}>← 上一页</button>
          <span>第 {p} / {totalPages} 页</span>
          <button className="btn btn-ghost" disabled={p >= totalPages} onClick={() => setPage(p + 1)}>下一页 →</button>
        </div>
      )}
    </div>
  );
}
