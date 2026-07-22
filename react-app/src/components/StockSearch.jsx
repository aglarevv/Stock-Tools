import { useState, useCallback } from "react";
import { useApi } from "../hooks/useApi.jsx";
import Icon from "./Icon.jsx";

const fmt = (v, d = 2) => v != null && isFinite(v) ? Number(v).toFixed(d) : "--";
const cnMarket = (c) => !c ? "" : c.includes("sh") ? "沪" : c.includes("sz") ? "深" : c.includes("bj") ? "北" : c.includes("hk") ? "港" : c.includes("us") ? "美" : "";
const pctClass = (v) => { if (v == null || isNaN(Number(v))) return ""; return Number(v) >= 0 ? "up" : "down"; };

export default function StockSearch({ navigate, showToast }) {
  const api = useApi();
  const [kw, setKw] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [quotes, setQuotes] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailQuote, setDetailQuote] = useState(null);
  const [detailKline, setDetailKline] = useState(null);
  const [detailPeriod, setDetailPeriod] = useState("daily");
  const [detailLoading, setDetailLoading] = useState(false);

  const handleSearch = useCallback(async (e) => {
    e?.preventDefault();
    if (!kw.trim()) return;
    setLoading(true);
    setQuotes(null);
    setDetail(null);
    try {
      const res = await api.stockSearch(kw.trim());
      const data = res.ok ? res.data : [];
      setResults(data);
      const codes = data.filter(r => r.category === "stock" || r.category === "index").map(r => r.code).filter(Boolean);
      if (codes.length > 0) {
        try {
          const qRes = await api.getMultiMarketQuotes(codes);
          if (qRes.ok && Array.isArray(qRes.data)) {
            const m = {};
            for (const q of qRes.data) if (q.code) m[q.code] = q;
            setQuotes(m);
          }
        } catch {}
      }
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, [kw, api]);

  const openStockDetail = useCallback(async (code, name) => {
    if (!code) return;
    const cleanCode = code.replace(/^(sh|sz|bj|hk|us)/, "");
    setDetail({ code: cleanCode, name });
    setDetailQuote(null);
    setDetailKline(null);
    setDetailLoading(true);
    try {
      const [qRes, kRes] = await Promise.all([
        api.getMultiMarketQuotes([code]),
        api.getStockKline(cleanCode, detailPeriod),
      ]);
      if (qRes.ok && Array.isArray(qRes.data) && qRes.data[0]) setDetailQuote(qRes.data[0]);
      if (kRes.ok) setDetailKline(kRes.data?.klines || kRes.data || []);
    } catch {} finally { setDetailLoading(false); }
  }, [api, detailPeriod]);

  const changePeriod = useCallback((p) => {
    setDetailPeriod(p);
    if (detail?.code) {
      setDetailLoading(true);
      api.getStockKline(detail.code, p).then(r => {
        if (r.ok) setDetailKline(r.data?.klines || r.data || []);
      }).catch(() => {}).finally(() => setDetailLoading(false));
    }
  }, [api, detail]);

  return (
    <div className="page">
      <style>{`
        .search-bar { display:flex; gap:8px; margin-bottom:16px; }
        .search-input-wrap { flex:1; position:relative; }
        .search-input-wrap input {
          width:100%; padding:8px 36px 8px 12px;
          border:1px solid var(--border-default); border-radius:var(--radius-md);
          font-size:14px; font-family:var(--font-sans);
          background:var(--bg-input); color:var(--text-primary);
          outline:none; transition:border-color .15s; box-sizing:border-box;
        }
        .search-input-wrap input:focus { border-color:var(--accent); box-shadow:0 0 0 2px var(--accent-glow); }
        .search-input-wrap .search-icon {
          position:absolute; right:10px; top:50%; transform:translateY(-50%);
          color:var(--text-muted); pointer-events:none;
        }
        .search-result-item {
          display:flex; align-items:center; justify-content:space-between;
          padding:10px 14px; background:var(--bg-card); border-radius:var(--radius-sm);
          box-shadow:var(--shadow-card); margin-bottom:6px; cursor:pointer;
          transition:all .12s; border:1px solid transparent;
        }
        .search-result-item:hover { border-color:var(--accent); }
        .search-result-left { display:flex; align-items:center; gap:10px; }
        .search-result-name { font-weight:600; font-size:14px; color:var(--text-primary); }
        .search-result-code { font-size:11px; color:var(--text-muted); font-family:var(--font-mono); }
        .search-result-market { font-size:10px; background:var(--bg-hover); padding:1px 6px; border-radius:4px; color:var(--text-secondary); }
        .search-result-type { font-size:10px; background:var(--accent-soft); padding:1px 6px; border-radius:4px; color:var(--accent); }
        .search-result-item.stock-result { flex-wrap:wrap; gap:8px; }
        .search-result-quote { display:flex; align-items:center; gap:10px; flex-shrink:0; }
        .quote-price { font-size:17px; font-weight:700; font-family:var(--font-mono); color:var(--text-primary); min-width:60px; text-align:right; }
        .quote-change { font-size:14px; font-weight:600; font-family:var(--font-mono); min-width:70px; text-align:right; }
        .quote-change.up { color:var(--loss); }
        .quote-change.down { color:var(--profit); }
        .quote-change-amt { font-size:12px; font-family:var(--font-mono); min-width:50px; text-align:right; }
        .quote-change-amt.up { color:var(--loss); }
        .quote-change-amt.down { color:var(--profit); }
        .empty-hint { text-align:center; padding:40px 20px; color:var(--text-muted); font-size:14px; }
      `}</style>

      <div className="topbar">
        <h1 className="topbar-title">
          <Icon name="search" size={22} style={{ verticalAlign: -4, marginRight: 6 }} />
          股票搜索
        </h1>
      </div>

      <form onSubmit={handleSearch} className="search-bar">
        <div className="search-input-wrap">
          <input
            type="text"
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            placeholder="输入股票代码/名称/拼音搜索…"
            autoFocus
          />
          <span className="search-icon"><Icon name="search" size={16} /></span>
        </div>
        <button className="btn btn-primary" type="submit" disabled={loading || !kw.trim()}>
          {loading ? "搜索中…" : "搜索"}
        </button>
      </form>

      {/* 搜索结果 */}
      {results !== null && (
        <div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 10 }}>
            找到 {results.length} 个结果
          </div>
          {results.length === 0 ? (
            <div className="empty-hint">未找到匹配结果</div>
          ) : (
            results.map((r, i) => {
              const q = quotes?.[r.code];
              const chg = q?.changePercent ?? r.changePercent;
              return (
                <div
                  key={r.code || i}
                  className="search-result-item stock-result"
                  onClick={() => openStockDetail(r.code, r.name)}
                >
                  <div className="search-result-left" style={{ minWidth: 0 }}>
                    <div>
                      <div className="search-result-name">{r.name}</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
                        <span className="search-result-code">{r.code?.replace(/^(sh|sz|bj|hk|us)/, "")}</span>
                        {cnMarket(r.code) && <span className="search-result-market">{cnMarket(r.code)}</span>}
                        {r.category && (
                          <span className="search-result-type">
                            {r.category === "stock" ? "股票" : r.category === "index" ? "指数" : r.category === "fund" ? "基金" : r.category}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* 实时行情 */}
                  <div className="search-result-quote">
                    {q ? (
                      <>
                        <div className="quote-price">{fmt(q.price)}</div>
                        <div className={`quote-change ${pctClass(chg)}`}>
                          {chg != null ? (chg >= 0 ? "+" : "") + fmt(chg) + "%" : "--"}
                        </div>
                        <div className={`quote-change-amt ${pctClass(q.change)}`}>
                          {q.change != null ? (q.change >= 0 ? "+" : "") + fmt(q.change) : "--"}
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>--</div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 股票详情弹窗 */}
      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <div className="modal-header">
              <h3>{detail.name} ({detail.code})</h3>
              <button className="btn btn-sm" onClick={() => setDetail(null)}>✕</button>
            </div>
            <div className="modal-body">
              {detailQuote && (
                <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 14 }}>
                  <span>最新价: <b style={{ fontFamily: "monospace" }}>{detailQuote.price}</b></span>
                  <span className={`quote-change ${pctClass(detailQuote.changePercent)}`}>
                    涨跌幅: <b>{fmt(detailQuote.changePercent)}%</b>
                  </span>
                  <span>最高: <b>{detailQuote.high}</b> / 最低: <b>{detailQuote.low}</b></span>
                  <span>成交量: <b>{fmt(detailQuote.volume, 0)}</b></span>
                </div>
              )}
              <div className="tab-bar" style={{ marginBottom: 8 }}>
                {["daily", "weekly", "monthly"].map(p => (
                  <button key={p} className={`tab-btn${detailPeriod === p ? " active" : ""}`} onClick={() => changePeriod(p)}>
                    {p === "daily" ? "日K" : p === "weekly" ? "周K" : "月K"}
                  </button>
                ))}
              </div>
              {detailLoading ? (
                <p className="empty-hint">加载K线中…</p>
              ) : detailKline?.length > 0 ? (
                <div style={{ maxHeight: 400, overflow: "auto", fontSize: 12 }}>
                  <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ position: "sticky", top: 0, background: "var(--card-bg)", zIndex: 1 }}>
                        <th style={{ padding: "6px 8px" }}>日期</th>
                        <th style={{ padding: "6px 8px" }}>开盘</th>
                        <th style={{ padding: "6px 8px" }}>收盘</th>
                        <th style={{ padding: "6px 8px" }}>最高</th>
                        <th style={{ padding: "6px 8px" }}>最低</th>
                        <th style={{ padding: "6px 8px" }}>成交量</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailKline.slice().reverse().map((k, i) => (
                        <tr key={i} style={{ borderTop: "1px solid var(--border-color)" }}>
                          <td style={{ padding: "4px 8px" }}>{k.date}</td>
                          <td style={{ padding: "4px 8px", fontFamily: "monospace" }}>{k.open}</td>
                          <td style={{ padding: "4px 8px", fontFamily: "monospace", color: (k.close - k.open) >= 0 ? "var(--up-color)" : "var(--down-color)" }}>{k.close}</td>
                          <td style={{ padding: "4px 8px", fontFamily: "monospace" }}>{k.high}</td>
                          <td style={{ padding: "4px 8px", fontFamily: "monospace" }}>{k.low}</td>
                          <td style={{ padding: "4px 8px", fontFamily: "monospace" }}>{k.volume}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="empty-hint">暂无K线数据</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
