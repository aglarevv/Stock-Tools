import { useState, useEffect } from "react";
import { useApi } from "../hooks/useApi.jsx";
import { formatMoney, escapeHtml } from "../utils/helpers.js";
import Icon from "./Icon.jsx";
import Button from "./Button.jsx";

const PAGE_SIZE = 15;

export default function ReviewList({ navigate, showToast }) {
  const api = useApi();
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
          <h1 className="topbar-title">
            <Icon name="review" size={22} style={{ verticalAlign: -4, marginRight: 6 }} />
            复盘记录
          </h1>
          <span className="badge">全部记录</span>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2>筛选</h2><span className="card-hint">共 {records.length} 条</span></div>
        <div className="card-body">
          <div className="filter-row">
            <Icon name="search" size={14} style={{ flexShrink: 0, color: "var(--text-muted)" }} />
            <input placeholder="股票名称…" value={symbol} onChange={(e) => setSymbol(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} style={{ flex: 1, minWidth: 100 }} />
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); if (e.target.value) load(); }} style={{ flex: 1, minWidth: 120 }} />
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); if (e.target.value) load(); }} style={{ flex: 1, minWidth: 120 }} />
            <Button variant="ghost" onClick={load}>查询</Button>
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
              <Button variant="delete" size="sm" style={{ flexShrink: 0 }}
                onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }} icon="trash"></Button>
            </div>
          )) : <div className="empty-text">暂无记录</div>}
        </div>
      </div>

      {records.length > PAGE_SIZE && (
        <div className="pagination">
          <Button variant="ghost" disabled={p <= 1} onClick={() => setPage(p - 1)}>← 上一页</Button>
          <span>第 {p} / {totalPages} 页</span>
          <Button variant="ghost" disabled={p >= totalPages} onClick={() => setPage(p + 1)}>下一页 →</Button>
        </div>
      )}
    </div>
  );
}
