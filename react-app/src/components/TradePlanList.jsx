import { useState, useEffect, useCallback } from "react";
import { useApi } from "../hooks/useApi.jsx";
import { formatMoney, escapeHtml } from "../utils/helpers.js";
import Icon from "./Icon.jsx";
import Button from "./Button.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";

const PAGE_SIZE = 15;

export default function TradePlanList({ navigate, showToast }) {
  const api = useApi();
  const [records, setRecords] = useState([]);
  const [page, setPage] = useState(1);
  const [symbol, setSymbol] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, symbol }

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

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    setDeleteTarget(null);
    try { await api.deleteTradePlan(id); showToast("已删除", "success"); load(); } catch (e) { showToast(`删除失败：${e.message}`, "error"); }
  }, [deleteTarget, api]);

  const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  const p = Math.min(page, totalPages);
  const pageRecords = records.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);

  return (
    <div className="page">
      <div className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 className="topbar-title">
            <Icon name="trending-up" size={22} style={{ verticalAlign: -4, marginRight: 6 }} />
            交易记录
          </h1>
          <span className="badge">全部记录</span>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2>筛选</h2><span className="card-hint">共 {records.length} 条</span></div>
        <div className="card-body">
          <div className="filter-row">
            <Icon name="search" size={14} style={{ flexShrink: 0, color: "var(--text-muted)" }} />
            <input placeholder="股票名称…" value={symbol} onChange={(e) => setSymbol(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} style={{ flex: 1, minWidth: 200 }} />
            <Button variant="ghost" onClick={load}>查询</Button>
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
              <Button variant="delete" size="sm" style={{ flexShrink: 0 }}
                onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: r.id, symbol: r.symbol }); }} icon="trash"></Button>
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

      <ConfirmDialog
        open={!!deleteTarget}
        title="删除确认"
        message={`确定删除 "${deleteTarget?.symbol || ''}" 交易计划？`}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
