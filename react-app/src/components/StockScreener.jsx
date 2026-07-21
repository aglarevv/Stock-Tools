/**
 * StockScreener — 选股器
 *
 * 根据价格、涨跌幅、市盈率、换手率、行业等条件筛选股票。
 * 数据来源：stock-sdk（行业/概念成分股 + 资金流排名）。
 */
import { useState, useCallback, useEffect } from "react";
import { useApi } from "../hooks/useApi.jsx";
import { formatMoney, toNumber } from "../utils/helpers.js";
import Button from "./Button.jsx";
import Icon from "./Icon.jsx";

/** 排序选项 */
const SORT_OPTIONS = [
  { value: "changePercent", label: "涨跌幅" },
  { value: "price", label: "最新价" },
  { value: "pe", label: "市盈率" },
  { value: "volume", label: "成交量" },
  { value: "turnoverRate", label: "换手率" },
  { value: "amount", label: "成交额" },
];

export default function StockScreener({ showToast }) {
  const api = useApi();

  // ── AI 配置 ──
  const [aiConfig, setAiConfig] = useState(null);

  // ── AI 自然语言输入 ──
  const [aiQuery, setAiQuery] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiParsed, setAiParsed] = useState(null); // AI 解析出的条件

  // ── 筛选条件 ──
  const [filters, setFilters] = useState({
    industry: "",
    priceMin: "", priceMax: "",
    changeMin: "", changeMax: "",
    peMin: "", peMax: "",
    turnoverMin: "", turnoverMax: "",
    sortBy: "changePercent",
    sortOrder: "desc",
    limit: 50,
  });

  // ── 行业列表 ──
  const [industries, setIndustries] = useState([]);
  const [loadingIndustries, setLoadingIndustries] = useState(false);

  // ── 结果 ──
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [resultCount, setResultCount] = useState(0);

  // ── 加载 AI 配置 ──
  useEffect(() => {
    (async () => {
      try {
        const data = await api.getSettings();
        const s = data.settings || {};
        if (s.aiKey) {
          setAiConfig({
            url: s.aiUrl,
            key: s.aiKey,
            model: s.aiModel,
            thinking: s.aiThinking !== false && s.aiThinking !== "false",
          });
        }
      } catch { /* ignore */ }
    })();
  }, []);

  // ── 加载行业列表 ──
  useEffect(() => {
    let cancelled = false;
    setLoadingIndustries(true);
    (async () => {
      try {
        const res = await api.getIndustries(undefined, { forceRefresh: false });
        if (cancelled || !res.ok) return;
        setIndustries(res.data || []);
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoadingIndustries(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── 更新筛选条件 ──
  const updateFilter = useCallback((key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
  }, []);

  // ── 执行筛选 ──
  const doScreen = useCallback(async () => {
    setLoading(true);
    setSearched(true);
    try {
      const payload = {};
      if (filters.industry) payload.industry = filters.industry;
      if (filters.priceMin) payload.priceMin = Number(filters.priceMin);
      if (filters.priceMax) payload.priceMax = Number(filters.priceMax);
      if (filters.changeMin) payload.changeMin = Number(filters.changeMin);
      if (filters.changeMax) payload.changeMax = Number(filters.changeMax);
      if (filters.peMin) payload.peMin = Number(filters.peMin);
      if (filters.peMax) payload.peMax = Number(filters.peMax);
      if (filters.turnoverMin) payload.turnoverMin = Number(filters.turnoverMin);
      if (filters.turnoverMax) payload.turnoverMax = Number(filters.turnoverMax);
      payload.sortBy = filters.sortBy;
      payload.sortOrder = filters.sortOrder;
      payload.limit = filters.limit;

      const res = await api.screenStocks(payload);
      if (res.ok) {
        setResults(res.data || []);
        setResultCount((res.data || []).length);
      } else {
        showToast?.(res.error || "筛选失败", "error");
      }
    } catch (e) {
      showToast?.(`筛选失败：${e.message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [filters, api, showToast]);

  // ── AI 智能选股 ──
  const aiScreen = useCallback(async () => {
    const q = aiQuery.trim();
    if (!q) return;
    if (!aiConfig) { showToast?.("请先在设置页配置 AI 接口", "warning"); return; }
    setAiLoading(true);
    setAiParsed(null);
    try {
      const res = await api.aiScreenStocks(q, aiConfig);
      if (res.ok) {
        setResults(res.data || []);
        setResultCount((res.data || []).length);
        setSearched(true);
        if (res.parsedFilters) {
          setAiParsed(res.parsedFilters);
          // 同步解析出的条件到筛选面板
          const pf = res.parsedFilters;
          setFilters({
            industry: pf.industry || "",
            priceMin: pf.priceMin != null ? String(pf.priceMin) : "",
            priceMax: pf.priceMax != null ? String(pf.priceMax) : "",
            changeMin: pf.changeMin != null ? String(pf.changeMin) : "",
            changeMax: pf.changeMax != null ? String(pf.changeMax) : "",
            peMin: pf.peMin != null ? String(pf.peMin) : "",
            peMax: pf.peMax != null ? String(pf.peMax) : "",
            turnoverMin: pf.turnoverMin != null ? String(pf.turnoverMin) : "",
            turnoverMax: pf.turnoverMax != null ? String(pf.turnoverMax) : "",
            sortBy: pf.sortBy || "changePercent",
            sortOrder: pf.sortOrder || "desc",
            limit: 50,
          });
        }
        showToast?.("AI 选股完成", "success");
      } else {
        showToast?.(res.error || "AI 选股失败", "error");
      }
    } catch (e) {
      showToast?.(`AI 选股失败：${e.message}`, "error");
    } finally {
      setAiLoading(false);
    }
  }, [aiQuery, aiConfig, api, showToast]);

  // ── 重置筛选 ──
  const resetFilters = useCallback(() => {
    setFilters({
      industry: "",
      priceMin: "", priceMax: "",
      changeMin: "", changeMax: "",
      peMin: "", peMax: "",
      turnoverMin: "", turnoverMax: "",
      sortBy: "changePercent",
      sortOrder: "desc",
      limit: 50,
    });
    setResults([]);
    setSearched(false);
    setAiParsed(null);
    setAiQuery("");
  }, []);

  // ── 渲染 ──
  const fmtPct = (v) => {
    if (v == null) return "-";
    const n = Number(v);
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(2)}%`;
  };
  const fmtNum = (v, d = 2) => (v != null ? Number(v).toFixed(d) : "-");
  const fmtVolume = (v) => {
    if (v == null) return "-";
    const n = Number(v);
    if (n >= 1e8) return (n / 1e8).toFixed(2) + "亿";
    if (n >= 1e4) return (n / 1e4).toFixed(2) + "万";
    return n.toFixed(0);
  };
  const colorClass = (v) => {
    if (v == null) return "";
    return Number(v) > 0 ? "green" : Number(v) < 0 ? "red" : "";
  };

  return (
    <div className="page">
      {/* ── 顶部栏 ── */}
      <div className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 className="topbar-title">选股器</h1>
          {searched && <span className="badge">{resultCount} 只</span>}
        </div>
        <div className="topbar-actions">
          <Button variant="ghost" onClick={resetFilters}>重置</Button>
          <Button variant="primary" loading={loading} disabled={loading} onClick={doScreen} icon="search">筛选</Button>
        </div>
      </div>

      {/* ── AI 智能选股 ── */}
      {aiConfig && (
        <div className="card" style={{ borderColor: "var(--accent)", borderWidth: 1, borderStyle: "dashed", marginBottom: 12 }}>
          <div className="card-header" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="sparkles" size={18} style={{ color: "var(--accent)" }} />
            <h2 style={{ margin: 0, fontSize: 15 }}>AI 智能选股</h2>
          </div>
          <div className="card-body" style={{ paddingTop: 0 }}>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 8px" }}>
              用自然语言描述选股条件，AI 自动解析并筛选。例如：「市盈率低于30且涨幅超过3%的半导体股」、「今日跌幅超过5%的股票」。
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && aiScreen()}
                placeholder="用自然语言描述你想筛选的条件…"
                style={{ flex: 1 }}
              />
              <Button variant="primary" icon="sparkles" loading={aiLoading} disabled={aiLoading || !aiQuery.trim()} onClick={aiScreen}>
                AI 筛选
              </Button>
            </div>
            {aiParsed && (
              <div style={{ marginTop: 8, padding: "6px 10px", background: "var(--bg-subtle)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--text-secondary)" }}>
                🔍 AI 已解析条件：
                {aiParsed.industry && <span style={{ marginLeft: 6, fontWeight: 600 }}>行业「{aiParsed.industry}」</span>}
                {aiParsed.priceMin != null && <span style={{ marginLeft: 6 }}>价格 ≥ {aiParsed.priceMin}</span>}
                {aiParsed.priceMax != null && <span style={{ marginLeft: 6 }}>价格 ≤ {aiParsed.priceMax}</span>}
                {aiParsed.changeMin != null && <span style={{ marginLeft: 6, color: "var(--profit)" }}>涨幅 ≥ {aiParsed.changeMin}%</span>}
                {aiParsed.changeMax != null && <span style={{ marginLeft: 6, color: "var(--loss)" }}>涨幅 ≤ {aiParsed.changeMax}%</span>}
                {aiParsed.peMin != null && <span style={{ marginLeft: 6 }}>PE ≥ {aiParsed.peMin}</span>}
                {aiParsed.peMax != null && <span style={{ marginLeft: 6 }}>PE ≤ {aiParsed.peMax}</span>}
                {aiParsed.turnoverMin != null && <span style={{ marginLeft: 6 }}>换手 ≥ {aiParsed.turnoverMin}%</span>}
                {aiParsed.turnoverMax != null && <span style={{ marginLeft: 6 }}>换手 ≤ {aiParsed.turnoverMax}%</span>}
                {aiParsed.sortBy && <span style={{ marginLeft: 6, color: "var(--text-muted)" }}>排序：{aiParsed.sortBy} {aiParsed.sortOrder === "asc" ? "↑" : "↓"}</span>}
                {aiParsed.note && (
                  <div style={{ marginTop: 4, color: "var(--warning)", fontWeight: 500 }}>
                    ⚠️ {aiParsed.note}
                  </div>
                )}
                {!aiParsed.industry && aiParsed.priceMin == null && aiParsed.priceMax == null && aiParsed.changeMin == null && aiParsed.changeMax == null && aiParsed.peMin == null && aiParsed.peMax == null && aiParsed.turnoverMin == null && aiParsed.turnoverMax == null && (
                  <span>（全部条件留空，将返回全市场热门股票）</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 筛选条件 ── */}
      <div className="card">
        <div className="card-header"><h2>筛选条件</h2></div>
        <div className="card-body">
          <div className="form-row">
            <div className="form-field" style={{ maxWidth: 280 }}>
              <label>行业板块（可选，留空则全市场）</label>
              <select value={filters.industry} onChange={(e) => updateFilter("industry", e.target.value)} disabled={loadingIndustries}>
                <option value="">全市场</option>
                {industries.map((ind) => (
                  <option key={ind.code || ind.name} value={ind.name}>{ind.name}</option>
                ))}
              </select>
            </div>
            <div className="form-field" style={{ maxWidth: 150 }}>
              <label>排序方式</label>
              <select value={filters.sortBy} onChange={(e) => updateFilter("sortBy", e.target.value)}>
                {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="form-field" style={{ maxWidth: 120 }}>
              <label>排序方向</label>
              <select value={filters.sortOrder} onChange={(e) => updateFilter("sortOrder", e.target.value)}>
                <option value="desc">降序 ↓</option>
                <option value="asc">升序 ↑</option>
              </select>
            </div>
            <div className="form-field" style={{ maxWidth: 100 }}>
              <label>最多显示</label>
              <select value={filters.limit} onChange={(e) => updateFilter("limit", Number(e.target.value))}>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          {/* 数值筛选 */}
          <div className="form-row cols-2" style={{ marginTop: 8 }}>
            <div className="form-field">
              <label>价格区间</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="number" placeholder="最低" value={filters.priceMin} onChange={(e) => updateFilter("priceMin", e.target.value)} style={{ width: 90 }} />
                <span style={{ color: "var(--text-muted)" }}>—</span>
                <input type="number" placeholder="最高" value={filters.priceMax} onChange={(e) => updateFilter("priceMax", e.target.value)} style={{ width: 90 }} />
              </div>
            </div>
            <div className="form-field">
              <label>涨跌幅区间（%）</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="number" placeholder="最低" value={filters.changeMin} onChange={(e) => updateFilter("changeMin", e.target.value)} style={{ width: 90 }} />
                <span style={{ color: "var(--text-muted)" }}>—</span>
                <input type="number" placeholder="最高" value={filters.changeMax} onChange={(e) => updateFilter("changeMax", e.target.value)} style={{ width: 90 }} />
              </div>
            </div>
          </div>
          <div className="form-row cols-2">
            <div className="form-field">
              <label>市盈率区间</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="number" placeholder="最低" value={filters.peMin} onChange={(e) => updateFilter("peMin", e.target.value)} style={{ width: 90 }} />
                <span style={{ color: "var(--text-muted)" }}>—</span>
                <input type="number" placeholder="最高" value={filters.peMax} onChange={(e) => updateFilter("peMax", e.target.value)} style={{ width: 90 }} />
              </div>
            </div>
            <div className="form-field">
              <label>换手率区间（%）</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="number" placeholder="最低" value={filters.turnoverMin} onChange={(e) => updateFilter("turnoverMin", e.target.value)} style={{ width: 90 }} />
                <span style={{ color: "var(--text-muted)" }}>—</span>
                <input type="number" placeholder="最高" value={filters.turnoverMax} onChange={(e) => updateFilter("turnoverMax", e.target.value)} style={{ width: 90 }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 筛选结果 ── */}
      {searched && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-header">
            <h2>筛选结果 {resultCount > 0 ? `（${resultCount} 只）` : ""}</h2>
          </div>
          <div className="card-body" style={{ padding: 0, overflowX: "auto" }}>
            {results.length > 0 ? (
              <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>代码</th>
                    <th style={thStyle}>名称</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>最新价</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>涨跌幅</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>成交量</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>换手率</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>市盈率</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>总市值</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((st, i) => (
                    <tr key={st.code || i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td style={tdStyle}>{st.code}</td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{st.name}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtNum(st.price)}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", color: Number(st.changePercent) > 0 ? "var(--profit)" : Number(st.changePercent) < 0 ? "var(--loss)" : "var(--text-primary)" }}>
                        {fmtPct(st.changePercent)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)" }}>{fmtVolume(st.volume)}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtNum(st.turnoverRate)}%</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtNum(st.pe, 1)}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)" }}>{fmtVolume(st.totalMarketCap)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty-text" style={{ padding: 24 }}>未找到符合条件的股票，请调整筛选条件后重试。</div>
            )}
          </div>
        </div>
      )}

      {/* ── 使用提示 ── */}
      {!searched && (
        <div className="card" style={{ marginTop: 12, borderStyle: "dashed", borderColor: "var(--border-subtle)" }}>
          <div className="card-body" style={{ textAlign: "center", padding: 40 }}>
            <Icon name="search" size={32} style={{ color: "var(--text-muted)", marginBottom: 12 }} />
            <p style={{ color: "var(--text-muted)", margin: 0 }}>
              设置筛选条件后点击「筛选」，从全市场或指定行业中筛选符合条件的股票。
            </p>
            <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "4px 0 0" }}>
              数据来源：实时行情（如需行业筛选，请先选择行业板块）
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle = {
  padding: "10px 12px",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-secondary)",
  textAlign: "left",
  borderBottom: "2px solid var(--border-subtle)",
  whiteSpace: "nowrap",
  background: "var(--bg-subtle)",
};

const tdStyle = {
  padding: "8px 12px",
  fontSize: 13,
  whiteSpace: "nowrap",
};
