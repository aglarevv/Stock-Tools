import { useState, useEffect } from "react";
import { api } from "../utils/api.js";
import { formatMoney, escapeHtml } from "../utils/helpers.js";

const PAGE_SIZE = 15;

export default function ReviewList({ navigate, showToast }) {
  const [records, setRecords] = useState([]);
  const [page, setPage] = useState(1);
  const [symbol, setSymbol] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const data = await api.getReviews({ limit: 200, symbol, dateFrom, dateTo });
      setRecords(data.records || []);
      setPage(1);
    } catch (e) { showToast(`加载失败：${e.message}`, "error"); }
  }

  async function handleDelete(id) {
    if (!confirm("确认删除这条复盘记录？")) return;
    try { await api.deleteReview(id); showToast("已删除", "success"); load(); } catch (e) { showToast(`删除失败：${e.message}`, "error"); }
  }

  const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  const p = Math.min(page, totalPages);
  const pageRecords = records.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);

  return (
    <div className="page">
      <div className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 className="topbar-title"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:-4,marginRight:6}}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>复盘记录</h1>
          <span className="badge">全部记录</span>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2>筛选</h2><span className="card-hint">共 {records.length} 条</span></div>
        <div className="card-body">
          <div className="filter-row">
            <input placeholder="🔍 股票名称…" value={symbol} onChange={(e) => setSymbol(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} style={{ flex: 1, minWidth: 120 }} />
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); if (e.target.value) load(); }} style={{ flex: 1, minWidth: 120 }} />
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); if (e.target.value) load(); }} style={{ flex: 1, minWidth: 120 }} />
            <button className="btn btn-ghost" onClick={load}>查询</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          {pageRecords.length ? pageRecords.map((r) => (
            <div key={r.id} className="record-item" onClick={() => navigate("review", { reviewId: r.id })}>
              <span style={{ flex: 1 }}>
                <span className="record-symbol">{r.reviewDate} {escapeHtml(r.symbol)}</span>
                &nbsp;{escapeHtml(r.holdingStyle)}&nbsp;
                {r.sellPrice == null ? "未卖出" : formatMoney.format(r.sellPrice)}&nbsp;
                <span style={{ color: r.pnlAmount >= 0 ? "var(--profit)" : "var(--loss)" }}>{formatMoney.format(r.pnlAmount)}</span>
              </span>
              <button className="btn btn-ghost btn-delete" style={{ flexShrink: 0, padding: "2px 8px", fontSize: 11 }} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); handleDelete(r.id); }}>🗑</button>
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
