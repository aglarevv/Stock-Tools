import { useState, useCallback } from "react";
import Icon from "./Icon.jsx";

const fmt = (v, d = 2) => v != null && isFinite(v) ? Number(v).toFixed(d) : "--";
const cnMarket = (c) => !c ? "" : c.includes("sh") ? "沪" : c.includes("sz") ? "深" : c.includes("bj") ? "北" : c.includes("hk") ? "港" : c.includes("us") ? "美" : "";

export default function StockSearch({ api, showToast }) {
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
    setDetail({ code, name });
    setDetailQuote(null);
    setDetailKline(null);
    setDetailLoading(true);
    try {
      const [qRes, kRes] = await Promise.all([
        api.getMultiMarketQuotes([code]),
        api.getStockKline(code, detailPeriod, 120),
      ]);
      if (qRes.ok && Array.isArray(qRes.data) && qRes.data[0]) setDetailQuote(qRes.data[0]);
      if (kRes.ok) setDetailKline(kRes.data?.klines || []);
    } catch {} finally { setDetailLoading(false); }
  }, [api, detailPeriod]);

  const changePeriod = useCallback((p) => {
    setDetailPeriod(p);
    if (detail?.code) {
      setDetailLoading(true);
      api.getStockKline(detail.code, p, 120).then(r => {
        if (r.ok) setDetailKline(r.data?.klines || []);
      }).catch(() => {}).finally(() => setDetailLoading(false));
    }
  }, [api, detail]);

  return (
    <div className="page">
      <div className="topbar">
        <h1 className="topbar-title">
          <Icon name="search" size={22} style={{ verticalAlign: -4, marginRight: 6 }} />
          股票搜索
        </h1>
      </div>

      <form onSubmit={handleSearch} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          className="input"
          placeholder="输入股票代码/名称/拼音…"
          value={kw}
          onChange={(e) => setKw(e.target.value)}
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "搜索中…" : "搜索"}
        </button>
      </form>

      {/* 搜索结果 */}
      {results && !detail && (
        <div className="card" style={{ padding: 0 }}>
          <div className="card-header" style={{ padding: "10px 14px" }}>
            <span>搜索结果 ({results.length})</span>
          </div>
          <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                <th style={{ padding: "8px 10px", textAlign: "left" }}>代码</th>
                <th style={{ padding: "8px 10px", textAlign: "left" }}>名称</th>
                <th style={{ padding: "8px 10px", textAlign: "right" }}>类型</th>
                <th style={{ padding: "8px 10px", textAlign: "right" }}>最新价</th>
                <th style={{ padding: "8px 10px", textAlign: "right" }}>涨跌幅</th>
                <th style={{ padding: "8px 10px", textAlign: "center" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => {
                const q = quotes?.[r.code];
                return (
                  <tr key={r.code || i} style={{ borderTop: "1px solid var(--border-color)" }}>
                    <td style={{ padding: "8px 10px" }}>
                      <span className="badge">{cnMarket(r.code)}</span>{" "}
                      <span style={{ fontFamily: "monospace", fontSize: 13 }}>{r.code?.replace(/^(sh|sz|bj|hk|us)/, "")}</span>
                    </td>
                    <td style={{ padding: "8px 10px", fontWeight: 500 }}>{r.name || r.code}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 12, color: "var(--text-secondary)" }}>
                      {r.category === "stock" ? "股票" : r.category === "index" ? "指数" : r.category === "etf" ? "ETF" : r.category === "fund" ? "基金" : r.category || ""}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace" }}>
                      {fmt(q?.price || r.price)}
                    </td>
                    <td style={{
                      padding: "8px 10px", textAlign: "right", fontFamily: "monospace",
                      color: (q?.changePercent || 0) >= 0 ? "var(--up-color)" : "var(--down-color)",
                    }}>
                      {fmt(q?.changePercent || r.changePercent)}%
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "center" }}>
                      <button className="btn btn-sm" onClick={() => openStockDetail(r.code, r.name)}>
                        <Icon name="candlestick" size={12} /> K线
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {results?.length === 0 && <p style={{ textAlign: "center", color: "var(--text-secondary)", padding: 40 }}>未找到匹配结果</p>}

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
                  <span style={{ color: (detailQuote.changePercent || 0) >= 0 ? "var(--up-color)" : "var(--down-color)" }}>
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
                <p style={{ textAlign: "center", padding: 40, color: "var(--text-secondary)" }}>加载K线中…</p>
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
                <p style={{ textAlign: "center", padding: 40, color: "var(--text-secondary)" }}>暂无K线数据</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
