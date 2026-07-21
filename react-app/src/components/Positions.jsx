import { useState, useEffect } from "react";
import { useApi } from "../hooks/useApi.jsx";
import Icon from "./Icon.jsx";
import Button from "./Button.jsx";

export default function Positions({ showToast }) {
  const api = useApi();
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);

  const [showBuyForm, setShowBuyForm] = useState(false);
  const [showSellForm, setShowSellForm] = useState(null);
  const [showEdit, setShowEdit] = useState(null); // { id, symbol, stockName, currentPrice, holdingStyle, notes }
  const [form, setForm] = useState({ symbol: "", stockName: "", buyDate: today(), buyPrice: "", shares: "", holdingStyle: "中线", notes: "" });
  const [sellForm, setSellForm] = useState({ sellPrice: "", sellShares: "" });
  const [editForm, setEditForm] = useState({ currentPrice: "", stockName: "", buyDate: "", holdingStyle: "中线", notes: "" });

  // ── 做T ──
  const [showTTrade, setShowTTrade] = useState(null); // { id, symbol }
  const [tTradeRecords, setTTradeRecords] = useState([]);
  const [tTradeSummary, setTTradeSummary] = useState({});
  const [tForm, setTForm] = useState({ tradeDate: today(), buyPrice: "", sellPrice: "", shares: "", notes: "" });

  useEffect(() => { load(); }, []);

  function today() { return new Date().toISOString().slice(0, 10); }

  async function load() {
    setLoading(true);
    try { const d = await api.getPositions(); setRecords(d.records || []); setSummary(d.summary || {}); }
    catch (e) { showToast("加载失败", "error"); }
    setLoading(false);
  }

  function openBuy() { setForm({ symbol: "", stockName: "", buyDate: today(), buyPrice: "", shares: "", holdingStyle: "中线", notes: "" }); setShowBuyForm(true); }

  // 输入代码时自动检测是否已有持仓
  function handleSymbolChange(value) {
    const s = value.trim().toUpperCase();
    setForm(prev => ({ ...prev, symbol: s }));
    if (s) {
      const existing = records.find(r => r.symbol === s);
      if (existing) setForm(prev => ({ ...prev, stockName: existing.stockName || "", holdingStyle: existing.holdingStyle || "中线" }));
    }
  }

  async function handleBuy(e) {
    e.preventDefault();
    if (!form.symbol.trim()) { showToast("请输入代码", "warning"); return; }
    try {
      const resp = await api.addPosition(form);
      showToast(resp.action === "added" ? `加仓成功，均价 ${resp.avgBuyPrice}` : "已添加", "success");
      setShowBuyForm(false); load();
    } catch (e) { showToast(e.message, "error"); }
  }

  function openSell(r) { setShowSellForm(r); setSellForm({ sellPrice: r.currentPrice || "", sellShares: "" }); }

  function openEdit(r) {
    setShowEdit(r);
    setEditForm({
      currentPrice: r.currentPrice || "",
      stockName: r.stockName || "",
      buyDate: r.buyDate || "",
      holdingStyle: r.holdingStyle || "中线",
      notes: r.notes || "",
    });
  }

  async function handleEdit() {
    try {
      await api.updatePosition(showEdit.id, {
        currentPrice: editForm.currentPrice || undefined,
        stockName: editForm.stockName,
        buyDate: editForm.buyDate,
        holdingStyle: editForm.holdingStyle,
        notes: editForm.notes,
      });
      showToast("已更新", "success");
      setShowEdit(null); load();
    } catch (e) { showToast(e.message, "error"); }
  }

  async function handleSell() {
    if (!sellForm.sellPrice || !sellForm.sellShares) { showToast("填写卖出价和股数", "warning"); return; }
    try {
      const resp = await api.sellPosition(showSellForm.id, sellForm.sellPrice, parseInt(sellForm.sellShares));
      showToast(`卖出 ${resp.realizedPnL >= 0 ? "+" : ""}${resp.realizedPnL}${resp.remainingShares === 0 ? " (已清仓)" : `，剩余 ${resp.remainingShares} 股`}`, "success");
      setShowSellForm(null); load();
    } catch (e) { showToast(e.message, "error"); }
  }

  async function handleRefresh() {
    try { const d = await api.refreshPositions(); showToast(`刷新 ${d.updated} 只`, "success"); load(); }
    catch (e) { showToast(e.message, "error"); }
  }

  async function handleDelete(id) { if (!confirm("确定删除？")) return; try { await api.deletePosition(id); load(); } catch {} }

  // ── 做T ──
  async function openTTrade(r) {
    setShowTTrade(r);
    setTForm({ tradeDate: today(), buyPrice: "", sellPrice: "", shares: "", notes: "" });
    try { const d = await api.getTTrades(r.id); setTTradeRecords(d.records || []); setTTradeSummary(d.summary || {}); }
    catch (e) { showToast("加载失败", "error"); setTTradeRecords([]); }
  }

  async function handleAddTTrade(e) {
    e.preventDefault();
    if (!tForm.buyPrice || !tForm.sellPrice || !tForm.shares) { showToast("填写完整", "warning"); return; }
    try {
      const resp = await api.addTTrade({
        positionId: showTTrade.id,
        tradeDate: tForm.tradeDate,
        buyPrice: Number(tForm.buyPrice),
        sellPrice: Number(tForm.sellPrice),
        shares: parseInt(tForm.shares),
        notes: tForm.notes,
      });
      showToast(`做T +${resp.profit}`, "success");
      setTForm({ ...tForm, buyPrice: "", sellPrice: "", shares: "", notes: "" });
      const d = await api.getTTrades(showTTrade.id);
      setTTradeRecords(d.records || []);
      setTTradeSummary(d.summary || {});
    } catch (e) { showToast(e.message, "error"); }
  }

  async function handleDeleteTTrade(id) {
    if (!confirm("确定删除？")) return;
    try { await api.deleteTTrade(id);
      const d = await api.getTTrades(showTTrade.id);
      setTTradeRecords(d.records || []);
      setTTradeSummary(d.summary || {});
    } catch {}
  }

  const c = (v) => v > 0 ? "green" : v < 0 ? "red" : "";
  function fmtPnl(v) {
    const n = Number(v || 0);
    if (n === 0) return "0";
    return (n > 0 ? "+" : "") + Math.round(n).toLocaleString();
  }

  return (
    <div className="page">
      <div className="topbar">
        <h1 className="topbar-title"><Icon name="trending-up" size={22} />持仓记录</h1>
        <div className="topbar-actions">
          <Button variant="ghost" size="sm" icon="refresh" onClick={handleRefresh}>刷新行情</Button>
          <Button variant="primary" size="sm" icon="plus" onClick={openBuy}>添加持仓</Button>
        </div>
      </div>

      <div className="metrics-row">
        <div className="metric-card metric-base"><div className="metric-label">总成本</div><div className="metric-value">{(summary.totalCost || 0).toLocaleString()}</div></div>
        <div className="metric-card metric-info"><div className="metric-label">总市值</div><div className="metric-value">{(summary.totalMarketValue || 0).toLocaleString()}</div></div>
        <div className={`metric-card ${(summary.totalUnrealizedPnl || 0) >= 0 ? "metric-profit" : "metric-loss"}`}>
          <div className="metric-label">未实现盈亏</div>
          <div className={`metric-value ${c(summary.totalUnrealizedPnl)}`}>{fmtPnl(summary.totalUnrealizedPnl)}</div>
        </div>
      </div>
      <div className="metrics-row">
        <div className={`metric-card ${(summary.totalRealizedPnl || 0) >= 0 ? "metric-profit" : "metric-loss"}`}>
          <div className="metric-label">已实现盈亏</div>
          <div className={`metric-value ${c(summary.totalRealizedPnl)}`}>{fmtPnl(summary.totalRealizedPnl)}</div>
        </div>
        <div className="metric-card metric-profit">
          <div className="metric-label">胜率</div>
          <div className="metric-value">{summary.winRate || 0}%</div>
          <div className="metric-desc">胜 {summary.winCount || 0} / 负 {summary.lossCount || 0}</div>
        </div>
        <div className={`metric-card ${(summary.totalPnl || 0) >= 0 ? "metric-profit" : "metric-loss"}`}>
          <div className="metric-label">总盈亏</div>
          <div className={`metric-value ${c(summary.totalPnl)}`}>{fmtPnl(summary.totalPnl)}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2>持仓明细（{records.length}）</h2></div>
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div className="empty-text">加载中…</div>
          : records.length === 0 ? <div className="empty-text">暂无持仓记录</div>
          : (
            <table className="data-table">
              <thead><tr><th>代码</th><th>名称</th><th>均价</th><th>股数</th><th>现价</th><th>市值</th><th>盈亏</th><th>盈亏%</th><th>已实现</th><th>风格</th><th>操作</th></tr></thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id} className="clickable" onClick={() => openEdit(r)}>
                    <td className="record-symbol">{r.symbol}</td>
                    <td>{r.stockName || "-"}</td>
                    <td>{Number(r.avgBuyPrice || r.buyPrice).toFixed(2)}</td>
                    <td>{r.shares}</td>
                    <td>{r.currentPrice ? Number(r.currentPrice).toFixed(2) : "-"}</td>
                    <td>{r.marketValue ? Number(r.marketValue).toFixed(0) : "-"}</td>
                    <td className={`metric-value ${c(r.unrealizedPnl)}`} style={{ fontSize: 12 }}>{r.unrealizedPnl != null ? (r.unrealizedPnl >= 0 ? "+" : "") + Number(r.unrealizedPnl).toFixed(0) : "-"}</td>
                    <td className={`metric-value ${c(r.pnlRate)}`} style={{ fontSize: 12 }}>{r.pnlRate != null ? (r.pnlRate >= 0 ? "+" : "") + Number(r.pnlRate).toFixed(2) + "%" : "-"}</td>
                    <td className={`metric-value ${c(r.realizedPnl)}`} style={{ fontSize: 12 }}>{Number(r.realizedPnl || 0) !== 0 ? (r.realizedPnl >= 0 ? "+" : "") + Number(r.realizedPnl).toFixed(0) : "-"}</td>
                    <td><span className="badge">{r.holdingStyle || "中线"}</span></td>
                    <td style={{ whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>编辑</Button>
                      <Button variant="ghost" size="sm" onClick={() => openSell(r)}>卖出</Button>
                      <Button variant="ghost" size="sm" style={{ color: "var(--accent)" }} onClick={() => openTTrade(r)}>做T</Button>
                      <Button variant="ghost" size="sm" style={{ color: "var(--loss)" }} onClick={() => handleDelete(r.id)}>删除</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 买入弹窗 */}
      {showBuyForm && (
        <div className="modal-overlay" onClick={() => setShowBuyForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3>{records.find(r => r.symbol === form.symbol.trim().toUpperCase()) ? "加仓" : "添加持仓"}</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowBuyForm(false)}>✕</Button>
            </div>
            <form className="modal-body" onSubmit={handleBuy}>
              <div className="form-row cols-2">
                <div className="form-field"><label>股票代码 *</label><input value={form.symbol} onChange={e => handleSymbolChange(e.target.value)} placeholder="如 600519" /></div>
                <div className="form-field"><label>股票名称</label><input value={form.stockName} onChange={e => setForm({ ...form, stockName: e.target.value })} /></div>
              </div>
              {(() => {
                const ex = records.find(r => r.symbol === form.symbol.trim().toUpperCase());
                if (ex) return (
                  <div style={{ marginBottom: 10, padding: "8px 12px", background: "var(--accent-soft)", borderRadius: 8, fontSize: 12 }}>
                    📌 已有持仓：均价 <strong>{Number(ex.avgBuyPrice || ex.buyPrice).toFixed(2)}</strong> · 
                    {ex.shares} 股 · 成本 {Number(ex.totalCost).toFixed(0)}
                    <br />新买入将自动计算加权平均价
                  </div>
                );
                return null;
              })()}
              <div className="form-row cols-3">
                <div className="form-field"><label>买入日</label><input type="date" value={form.buyDate} onChange={e => setForm({ ...form, buyDate: e.target.value })} /></div>
                <div className="form-field"><label>买入价 *</label><input type="number" step="0.01" value={form.buyPrice} onChange={e => setForm({ ...form, buyPrice: e.target.value })} /></div>
                <div className="form-field"><label>股数 *</label><input type="number" value={form.shares} onChange={e => setForm({ ...form, shares: e.target.value })} /></div>
              </div>
              <div className="form-row cols-2">
                <div className="form-field"><label>持有风格</label><select value={form.holdingStyle} onChange={e => setForm({ ...form, holdingStyle: e.target.value })}><option>短线</option><option>中线</option><option>长线</option></select></div>
                <div className="form-field"><label>备注</label><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              </div>
              <div className="modal-footer" style={{ padding: "12px 0 0", borderTop: "1px solid var(--border-subtle)" }}>
                <Button variant="ghost" type="button" onClick={() => setShowBuyForm(false)}>取消</Button>
                <Button variant="primary" type="submit">添加</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 编辑弹窗 */}
      {showEdit && (
        <div className="modal-overlay" onClick={() => setShowEdit(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header"><h3>编辑 {showEdit.symbol}</h3><Button variant="ghost" size="sm" onClick={() => setShowEdit(null)}>✕</Button></div>
            <div className="modal-body">
              <div className="settings-info-row"><span>代码</span><span className="record-symbol">{showEdit.symbol}</span></div>
              <div className="settings-info-row"><span>均价</span><span>{Number(showEdit.avgBuyPrice || showEdit.buyPrice).toFixed(2)}</span></div>
              <div className="settings-info-row"><span>股数</span><span>{showEdit.shares}</span></div>
              <div className="settings-info-row"><span>成本</span><span>{Number(showEdit.totalCost).toFixed(0)}</span></div>
              <div className="form-row cols-2" style={{ marginTop: 12 }}>
                <div className="form-field"><label>股票名称</label><input value={editForm.stockName} onChange={e => setEditForm({ ...editForm, stockName: e.target.value })} placeholder="如 贵州茅台" /></div>
                <div className="form-field"><label>买入日期</label><input type="date" value={editForm.buyDate} onChange={e => setEditForm({ ...editForm, buyDate: e.target.value })} /></div>
              </div>
              <div className="form-row cols-2" style={{ marginTop: 8 }}>
                <div className="form-field"><label>现价（更新盈亏）</label><input type="number" step="0.01" value={editForm.currentPrice} onChange={e => setEditForm({ ...editForm, currentPrice: e.target.value })} /></div>
                <div className="form-field"><label>持有风格</label><select value={editForm.holdingStyle} onChange={e => setEditForm({ ...editForm, holdingStyle: e.target.value })}><option>短线</option><option>中线</option><option>长线</option></select></div>
              </div>
              <div className="form-field" style={{ marginTop: 8 }}><label>备注</label><textarea value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} rows={2} /></div>
            </div>
            <div className="modal-footer">
              <Button variant="ghost" onClick={() => setShowEdit(null)}>取消</Button>
              <Button variant="primary" onClick={handleEdit}>保存</Button>
            </div>
          </div>
        </div>
      )}

      {/* 卖出弹窗 */}
      {showSellForm && (
        <div className="modal-overlay" onClick={() => setShowSellForm(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header"><h3>卖出 {showSellForm.symbol}</h3><Button variant="ghost" size="sm" onClick={() => setShowSellForm(null)}>✕</Button></div>
            <div className="modal-body">
              <div style={{ marginBottom: 12, fontSize: 13, lineHeight: 1.6 }}>
                均价 <strong>{Number(showSellForm.avgBuyPrice || showSellForm.buyPrice).toFixed(2)}</strong> · 持仓 <strong>{showSellForm.shares}</strong> 股 · 现价 <strong>{showSellForm.currentPrice || "-"}</strong>
              </div>
              <div className="form-row cols-2">
                <div className="form-field"><label>卖出价 *</label><input type="number" step="0.01" value={sellForm.sellPrice} onChange={e => setSellForm({ ...sellForm, sellPrice: e.target.value })} /></div>
                <div className="form-field"><label>卖出股数 *</label><input type="number" value={sellForm.sellShares} onChange={e => setSellForm({ ...sellForm, sellShares: e.target.value })} placeholder={`最多 ${showSellForm.shares}`} /></div>
              </div>
              {sellForm.sellPrice && sellForm.sellShares && (
                <div style={{ marginTop: 8, fontSize: 13 }}>
                  预计盈亏：<strong className={c((sellForm.sellPrice - Number(showSellForm.avgBuyPrice || showSellForm.buyPrice)) * sellForm.sellShares)}>
                    {((sellForm.sellPrice - Number(showSellForm.avgBuyPrice || showSellForm.buyPrice)) * sellForm.sellShares) >= 0 ? "+" : ""}
                    {((sellForm.sellPrice - Number(showSellForm.avgBuyPrice || showSellForm.buyPrice)) * sellForm.sellShares).toFixed(0)}
                  </strong>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <Button variant="ghost" onClick={() => setShowSellForm(null)}>取消</Button>
              <Button variant="primary" onClick={handleSell}>确认卖出</Button>
            </div>
          </div>
        </div>
      )}

      {/* 做T弹窗 */}
      {showTTrade && (
        <div className="modal-overlay" onClick={() => setShowTTrade(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>做T · {showTTrade.symbol}</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowTTrade(null)}>✕</Button>
            </div>
            <div className="modal-body">
              {/* 汇总 */}
              {tTradeRecords.length > 0 && (
                <div style={{ marginBottom: 12, padding: "8px 12px", background: "var(--accent-soft)", borderRadius: 8, fontSize: 13 }}>
                  累计 {tTradeSummary.totalTrades || 0} 笔 · 
                  合计 <strong className={(tTradeSummary.totalProfit || 0) >= 0 ? "green" : "red"}>
                    {(tTradeSummary.totalProfit || 0) >= 0 ? "+" : ""}{Math.round(tTradeSummary.totalProfit || 0)}
                  </strong>
                </div>
              )}

              {/* 添加表单 */}
              <form onSubmit={handleAddTTrade}>
                <div className="form-row cols-3" style={{ marginBottom: 8 }}>
                  <div className="form-field"><label>日期</label><input type="date" value={tForm.tradeDate} onChange={e => setTForm({ ...tForm, tradeDate: e.target.value })} /></div>
                  <div className="form-field"><label>买入价</label><input type="number" step="0.01" value={tForm.buyPrice} onChange={e => setTForm({ ...tForm, buyPrice: e.target.value })} placeholder="0.00" /></div>
                  <div className="form-field"><label>卖出价</label><input type="number" step="0.01" value={tForm.sellPrice} onChange={e => setTForm({ ...tForm, sellPrice: e.target.value })} placeholder="0.00" /></div>
                </div>
                <div className="form-row cols-2" style={{ marginBottom: 8 }}>
                  <div className="form-field"><label>股数</label><input type="number" value={tForm.shares} onChange={e => setTForm({ ...tForm, shares: e.target.value })} placeholder="100" /></div>
                  <div className="form-field"><label>备注</label><input value={tForm.notes} onChange={e => setTForm({ ...tForm, notes: e.target.value })} placeholder="可选" /></div>
                </div>
                {tForm.buyPrice && tForm.sellPrice && tForm.shares && (
                  <div style={{ fontSize: 12, marginBottom: 4 }}>
                    预计盈亏：<strong className={(Number(tForm.sellPrice) - Number(tForm.buyPrice)) * Number(tForm.shares) >= 0 ? "green" : "red"}>
                      {((Number(tForm.sellPrice) - Number(tForm.buyPrice)) * Number(tForm.shares) >= 0 ? "+" : "")}{((Number(tForm.sellPrice) - Number(tForm.buyPrice)) * Number(tForm.shares)).toFixed(0)}
                    </strong>
                  </div>
                )}
                <Button variant="primary" type="submit">添加做T记录</Button>
              </form>

              {/* 历史 */}
              {tTradeRecords.length > 0 && (
                <div style={{ marginTop: 12, borderTop: "1px solid var(--border-subtle)", paddingTop: 8 }}>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>历史记录</div>
                  <table className="data-table" style={{ fontSize: 12 }}>
                    <thead><tr><th>日期</th><th>买入</th><th>卖出</th><th>股数</th><th>盈亏</th><th>盈亏%</th><th></th></tr></thead>
                    <tbody>
                      {tTradeRecords.map(t => (
                        <tr key={t.id}>
                          <td>{t.tradeDate}</td>
                          <td>{Number(t.buyPrice).toFixed(2)}</td>
                          <td>{Number(t.sellPrice).toFixed(2)}</td>
                          <td>{t.shares}</td>
                          <td className={Number(t.profit) >= 0 ? "green" : "red"}>
                            {Number(t.profit) >= 0 ? "+" : ""}{Number(t.profit).toFixed(0)}
                          </td>
                          <td className={Number(t.profitRate) >= 0 ? "green" : "red"}>
                            {Number(t.profitRate) >= 0 ? "+" : ""}{Number(t.profitRate).toFixed(2)}%
                          </td>
                          <td><Button variant="ghost" size="sm" style={{ color: "var(--loss)", fontSize: 11 }} onClick={() => handleDeleteTTrade(t.id)}>删</Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
