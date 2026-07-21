/**
 * SectorBoard — 板块看板组件
 *
 * 功能：
 * - 热门行业 / 概念板块展示（涨幅前N）
 * - 板块搜索（名称/代码模糊匹配）
 * - 板块详情 + 成分股列表
 * - 股票搜索（代码/名称/拼音）
 *
 * 设计原则：
 * - 高内聚：所有板块/股票浏览逻辑集中在本组件
 * - 低耦合：仅依赖 useApi() hook，不直接依赖 SDK 或后端实现
 * - 子视图通过本地状态切换，不污染路由
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useApi } from "../hooks/useApi.jsx";
import Icon from "./Icon.jsx";

// ── 工具函数 ──
const fmt = (v, digits = 2) => {
  if (v == null || !isFinite(v)) return "--";
  return Number(v).toFixed(digits);
};

const fmtMoney = (v) => {
  if (v == null || !isFinite(v)) return "--";
  const abs = Math.abs(v);
  if (abs >= 1e12) return (v / 1e12).toFixed(2) + "万亿";
  if (abs >= 1e8) return (v / 1e8).toFixed(2) + "亿";
  if (abs >= 1e4) return (v / 1e4).toFixed(2) + "万";
  return v.toFixed(2);
};

const fmtVol = (v) => {
  if (v == null || !isFinite(v)) return "--";
  if (v >= 1e8) return (v / 1e8).toFixed(2) + "亿手";
  if (v >= 1e4) return (v / 1e4).toFixed(2) + "万手";
  return Math.round(v) + "手";
};

const cnMarket = (code) => {
  if (!code) return "";
  if (code.startsWith("sh")) return "沪";
  if (code.startsWith("sz")) return "深";
  if (code.startsWith("bj")) return "北";
  if (code.startsWith("hk")) return "港";
  if (code.startsWith("us")) return "美";
  return "";
};

// ── 变化率颜色 ──
const pctColor = (v) => {
  if (v == null || !isFinite(v)) return "";
  if (v > 0) return "var(--profit)";
  if (v < 0) return "var(--loss)";
  return "";
};

const pctClass = (v) => {
  if (v == null || !isFinite(v)) return "";
  return v > 0 ? "up" : v < 0 ? "down" : "";
};

// ── TAB 配置 ──
const TABS = [
  { id: "hot", label: "热门板块", icon: "trending-up" },
  { id: "industries", label: "行业板块", icon: "dashboard" },
  { id: "concepts", label: "概念板块", icon: "globe" },
  { id: "search", label: "搜索", icon: "search" },
  { id: "market-events", label: "市场异动", icon: "news" },
  { id: "fund-flows", label: "资金流向", icon: "arrow-right" },
  { id: "northbound", label: "北向资金", icon: "globe" },
];

// ═══════════════════════════════════════════════════════════════════
// 主组件
// ═══════════════════════════════════════════════════════════════════
export default function SectorBoard({ navigate, showToast }) {
  const api = useApi();
  const [activeTab, setActiveTab] = useState("hot");

  // 热门板块数据
  const [hotData, setHotData] = useState(null);
  const [hotLoading, setHotLoading] = useState(false);

  // 行业列表
  const [industries, setIndustries] = useState([]);
  const [indLoading, setIndLoading] = useState(false);

  // 概念列表
  const [concepts, setConcepts] = useState([]);
  const [conLoading, setConLoading] = useState(false);

  // 搜索
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchMode, setSearchMode] = useState("sector"); // "sector" | "stock"
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchQuotes, setSearchQuotes] = useState(null); // 股票搜索后加载的行情数据

  // 板块详情
  const [detailSymbol, setDetailSymbol] = useState(null);
  const [detailType, setDetailType] = useState(null); // "industry" | "concept"
  const [detailStocks, setDetailStocks] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 股票详情弹窗
  const [stockDetail, setStockDetail] = useState(null); // { code, name } — 打开股票详情
  const [stockDetailQuote, setStockDetailQuote] = useState(null);
  const [stockDetailKline, setStockDetailKline] = useState(null); // K线数据
  const [stockDetailPeriod, setStockDetailPeriod] = useState("daily"); // K线周期
  const [stockDetailTimeline, setStockDetailTimeline] = useState(null); // 分时数据
  const [stockDetailLoading, setStockDetailLoading] = useState(false);

  // 市场异动
  const [ztType, setZtType] = useState("zt");
  const [ztData, setZtData] = useState(null);
  const [changeType, setChangeType] = useState("large_buy");
  const [changesData, setChangesData] = useState(null);
  const [eventLoading, setEventLoading] = useState(false);

  // 资金流向
  const [fundFlowRank, setFundFlowRank] = useState(null);
  const [fundFlowIndicator, setFundFlowIndicator] = useState("today");
  const [sectorFlowRank, setSectorFlowRank] = useState(null);
  const [flowLoading, setFlowLoading] = useState(false);

  // 北向资金
  const [northData, setNorthData] = useState(null);
  const [northLoading, setNorthLoading] = useState(false);

  // ── 加载热门板块 ──
  const loadHotSectors = useCallback(async (forceRefresh = false) => {
    setHotLoading(true);
    try {
      const res = await api.getHotSectors(10, { forceRefresh });
      if (res.ok) setHotData(res.data);
    } catch {
      /* 静默失败 */
    } finally {
      setHotLoading(false);
    }
  }, [api]);

  // ── 加载行业列表 ──
  const loadIndustries = useCallback(async (forceRefresh = false) => {
    setIndLoading(true);
    try {
      const res = await api.getIndustries(undefined, { forceRefresh });
      if (res.ok) setIndustries(res.data);
    } catch {
      /* 静默失败 */
    } finally {
      setIndLoading(false);
    }
  }, [api]);

  // ── 加载概念列表 ──
  const loadConcepts = useCallback(async (forceRefresh = false) => {
    setConLoading(true);
    try {
      const res = await api.getConcepts(undefined, { forceRefresh });
      if (res.ok) setConcepts(res.data);
    } catch {
      /* 静默失败 */
    } finally {
      setConLoading(false);
    }
  }, [api]);

  // ── 初始加载 ──
  useEffect(() => {
    loadHotSectors();
  }, [loadHotSectors]);

  // ── Tab 切换懒加载 ──
  useEffect(() => {
    if (activeTab === "industries" && industries.length === 0) loadIndustries();
    if (activeTab === "concepts" && concepts.length === 0) loadConcepts();
    if (activeTab === "market-events" && !ztData) loadZTPool();
    if (activeTab === "fund-flows" && !fundFlowRank) loadFundFlowRank();
    if (activeTab === "northbound" && !northData) loadNorthData();
  }, [activeTab, industries.length, concepts.length, ztData, fundFlowRank, northData, loadIndustries, loadConcepts]);

  // ── 加载涨停板 ──
  const loadZTPool = useCallback(async (type = "zt") => {
    setEventLoading(true);
    try {
      const res = await api.getZTPool(type);
      if (res.ok) setZtData(res.data);
    } catch { /* ignore */ }
    finally { setEventLoading(false); }
  }, [api]);

  // ── 加载盘口异动 ──
  const loadChanges = useCallback(async (type = "large_buy") => {
    setEventLoading(true);
    try {
      const res = await api.getStockChanges(type);
      if (res.ok) setChangesData(res.data);
    } catch { /* ignore */ }
    finally { setEventLoading(false); }
  }, [api]);

  // ── 加载资金流排名 ──
  const loadFundFlowRank = useCallback(async (indicator = "today") => {
    setFlowLoading(true);
    try {
      const [rankRes, sectorRes] = await Promise.all([
        api.getFundFlowRank(indicator),
        api.getSectorFundFlowRank(indicator, "industry"),
      ]);
      if (rankRes.ok) setFundFlowRank(rankRes.data);
      if (sectorRes.ok) setSectorFlowRank(sectorRes.data);
    } catch { /* ignore */ }
    finally { setFlowLoading(false); }
  }, [api]);

  // ── 加载北向数据 ──
  const loadNorthData = useCallback(async () => {
    setNorthLoading(true);
    try {
      const [summaryRes, rankRes] = await Promise.all([
        api.getNorthboundSummary(),
        api.getNorthboundRank("all", "5day"),
      ]);
      setNorthData({
        summary: summaryRes.ok ? summaryRes.data : [],
        rank: rankRes.ok ? rankRes.data : [],
      });
    } catch { /* ignore */ }
    finally { setNorthLoading(false); }
  }, [api]);

  // ── 搜索板块 ──
  const handleSectorSearch = useCallback(
    async (e, forceRefresh = false) => {
      e?.preventDefault();
      if (!searchKeyword.trim()) return;
      setSearchLoading(true);
      try {
        const res = await api.searchSectors(searchKeyword.trim(), { forceRefresh });
        setSearchResults(res.ok ? res.data : []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    },
    [searchKeyword, api],
  );

  // ── 搜索股票 ──
  const handleStockSearch = useCallback(
    async (e) => {
      e?.preventDefault();
      if (!searchKeyword.trim()) return;
      setSearchLoading(true);
      setSearchQuotes(null);
      try {
        const res = await api.stockSearch(searchKeyword.trim());
        const results = res.ok ? res.data : [];
        setSearchResults(results);

        // 自动拉取股票类结果的实时行情（多市场）
        const stockCodes = results
          .filter((r) => r.category === "stock" || r.category === "index")
          .map((r) => r.code)
          .filter(Boolean);
        if (stockCodes.length > 0) {
          try {
            const qRes = await api.getMultiMarketQuotes(stockCodes);
            if (qRes.ok && Array.isArray(qRes.data)) {
              const quoteMap = {};
              for (const q of qRes.data) {
                if (q.code) quoteMap[q.code] = q;
              }
              setSearchQuotes(quoteMap);
            }
          } catch {
            /* 行情拉取失败不影响搜索结果显示 */
          }
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    },
    [searchKeyword, api],
  );

  // ── 打开股票详情 ──
  const openStockDetail = useCallback(
    async (code, name) => {
      setStockDetail({ code, name });
      setStockDetailQuote(null);
      setStockDetailKline(null);
      setStockDetailTimeline(null);
      setStockDetailPeriod("daily");
      setStockDetailLoading(true);

      // 通过名称搜索获取正确的股票代码（仅当原始代码缺失市场前缀时）
      let resolvedCode = code;
      if (!cnMarket(code)) {
        try {
          const searchRes = await api.stockSearch(name);
          if (searchRes.ok && Array.isArray(searchRes.data)) {
            const stockResults = searchRes.data.filter(
              (r) => r.category === "stock" || r.category === "index",
            );
            if (stockResults.length > 0) {
              const exactMatch = stockResults.find((r) => r.name === name);
              resolvedCode = (exactMatch || stockResults[0]).code;
              setStockDetail({ code: resolvedCode, name });
            }
          }
        } catch {
          // 搜索失败降级使用原始代码
        }
      }

      // 并行请求行情、K线、分时，互不阻塞
      const [quoteResult, klineResult, timelineResult] = await Promise.allSettled([
        api.getMultiMarketQuotes([resolvedCode]),
        api.getStockKline(resolvedCode, "daily"),
        api.getStockTimeline(resolvedCode),
      ]);

      let hasQuote = false;
      let hasKline = false;

      if (quoteResult.status === "fulfilled" && quoteResult.value.ok) {
        const data = quoteResult.value.data;
        if (Array.isArray(data) && data.length > 0) {
          setStockDetailQuote(data[0]);
          hasQuote = true;
        }
      }
      if (klineResult.status === "fulfilled" && klineResult.value.ok) {
        const data = klineResult.value.data;
        if (Array.isArray(data)) {
          setStockDetailKline(data);
          hasKline = true;
        }
      }
      if (timelineResult.status === "fulfilled" && timelineResult.value.ok) {
        const data = timelineResult.value.data;
        if (data) setStockDetailTimeline(data);
      }

      if (!hasQuote && !hasKline) {
        showToast?.("行情数据加载失败，请检查网络或交易时段", "error");
      } else if (!hasQuote) {
        showToast?.("实时行情暂不可用（可能非交易时段），K线数据已加载", "warning");
      }
      setStockDetailLoading(false);
    },
    [api, showToast],
  );

  // ── 切换K线周期 ──
  const changeKlinePeriod = useCallback(
    async (period) => {
      if (!stockDetail) return;
      setStockDetailPeriod(period);
      if (period === "timeline") return; // 分时数据已加载
      setStockDetailKline(null);
      try {
        const kRes = await api.getStockKline(stockDetail.code, period);
        if (kRes.ok && Array.isArray(kRes.data)) {
          setStockDetailKline(kRes.data);
        }
      } catch {
        /* 静默失败 */
      }
    },
    [stockDetail, api],
  );

  // ── 关闭股票详情 ──
  const closeStockDetail = useCallback(() => {
    setStockDetail(null);
    setStockDetailQuote(null);
    setStockDetailKline(null);
    setStockDetailTimeline(null);
  }, []);

  // ── 打开板块详情 ──
  const openDetail = useCallback(
    async (symbol, type) => {
      setDetailSymbol(symbol);
      setDetailType(type);
      setDetailStocks(null);
      setDetailLoading(true);
      try {
        const fetcher = type === "industry" ? api.getIndustryStocks : api.getConceptStocks;
        const res = await fetcher(symbol);
        setDetailStocks(res.ok ? res.data : []);
      } catch {
        setDetailStocks([]);
      } finally {
        setDetailLoading(false);
      }
    },
    [api],
  );

  // ── 关闭详情 ──
  const closeDetail = useCallback(() => {
    setDetailSymbol(null);
    setDetailType(null);
    setDetailStocks(null);
  }, []);

  // ── 渲染 ──
  return (
    <div className="page">
      {/* 顶栏 */}
      <div className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 className="topbar-title">
            <Icon name="trending-up" size={22} style={{ verticalAlign: -4, marginRight: 6 }} />
            股市板块
          </h1>
          <span className="badge">实时行情</span>
        </div>
      </div>

      {/* Tab 导航 */}
      <div className="tab-bar" style={{ marginBottom: 16 }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn${activeTab === tab.id ? " active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <Icon name={tab.icon} size={14} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── 热门板块 ── */}
      {activeTab === "hot" && (
        <HotSectorsView
          hotData={hotData}
          loading={hotLoading}
          onRefresh={loadHotSectors}
          onOpenDetail={openDetail}
        />
      )}

      {/* ── 行业板块 ── */}
      {activeTab === "industries" && (
        <BoardListView
          data={industries}
          loading={indLoading}
          type="industry"
          onOpenDetail={openDetail}
          onRefresh={loadIndustries}
        />
      )}

      {/* ── 概念板块 ── */}
      {activeTab === "concepts" && (
        <BoardListView
          data={concepts}
          loading={conLoading}
          type="concept"
          onOpenDetail={openDetail}
          onRefresh={loadConcepts}
        />
      )}

      {/* ── 搜索 ── */}
      {activeTab === "search" && (
        <SearchView
          keyword={searchKeyword}
          onKeywordChange={setSearchKeyword}
          mode={searchMode}
          onModeChange={setSearchMode}
          results={searchResults}
          quotes={searchQuotes}
          loading={searchLoading}
          onSectorSearch={handleSectorSearch}
          onStockSearch={handleStockSearch}
          onOpenDetail={openDetail}
          onOpenStockDetail={openStockDetail}
        />
      )}

      {/* ── 市场异动 ── */}
      {activeTab === "market-events" && (
        <MarketEventsView
          ztType={ztType} ztData={ztData}
          changeType={changeType} changesData={changesData}
          loading={eventLoading}
          onZtTypeChange={(t) => { setZtType(t); loadZTPool(t); }}
          onChangeTypeChange={(t) => { setChangeType(t); loadChanges(t); }}
          onRefresh={() => loadZTPool(ztType)}
          onOpenStockDetail={openStockDetail}
        />
      )}

      {/* ── 资金流向 ── */}
      {activeTab === "fund-flows" && (
        <FundFlowsView
          fundFlowRank={fundFlowRank}
          sectorFlowRank={sectorFlowRank}
          indicator={fundFlowIndicator}
          loading={flowLoading}
          onIndicatorChange={(i) => { setFundFlowIndicator(i); loadFundFlowRank(i); }}
          onRefresh={() => loadFundFlowRank(fundFlowIndicator)}
        />
      )}

      {/* ── 北向资金 ── */}
      {activeTab === "northbound" && (
        <NorthboundView
          northData={northData}
          loading={northLoading}
          onRefresh={loadNorthData}
        />
      )}

      {/* ── 板块详情弹窗 ── */}
      {detailSymbol && (
        <DetailModal
          symbol={detailSymbol}
          type={detailType}
          stocks={detailStocks}
          loading={detailLoading}
          onClose={closeDetail}
        />
      )}

      {/* ── 股票详情弹窗 ── */}
      {stockDetail && (
        <StockDetailModal
          code={stockDetail.code}
          name={stockDetail.name}
          quote={stockDetailQuote}
          kline={stockDetailKline}
          klinePeriod={stockDetailPeriod}
          timeline={stockDetailTimeline}
          loading={stockDetailLoading}
          onPeriodChange={changeKlinePeriod}
          onClose={closeStockDetail}
        />
      )}

      {/* ── 底部样式补充 ── */}
      <style>{`
        .tab-bar {
          display: flex;
          gap: 4px;
          background: var(--bg-card);
          border-radius: var(--radius-md);
          padding: 4px;
          box-shadow: var(--shadow-card);
        }
        .tab-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: var(--radius-sm);
          border: none;
          background: transparent;
          color: var(--text-secondary);
          font-size: 13px;
          font-family: var(--font-sans);
          cursor: pointer;
          transition: all 0.15s var(--ease-out);
          white-space: nowrap;
        }
        .tab-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .tab-btn.active { background: var(--accent); color: #fff; }

        /* 板块卡片网格 */
        .sector-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 12px;
        }
        .sector-card {
          background: var(--bg-card);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-card);
          padding: 14px 16px;
          cursor: pointer;
          transition: all 0.15s var(--ease-out);
          border: 1px solid transparent;
        }
        .sector-card:hover {
          border-color: var(--accent);
          box-shadow: 0 0 0 2px var(--accent-glow);
        }
        .sector-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }
        .sector-card-name {
          font-weight: 600;
          font-size: 14px;
          color: var(--text-primary);
        }
        .sector-card-code {
          font-size: 11px;
          color: var(--text-muted);
          font-family: var(--font-mono);
        }
        .sector-card-pct {
          font-size: 18px;
          font-weight: 700;
          font-family: var(--font-mono);
        }
        .sector-card-pct.up { color: var(--loss); }
        .sector-card-pct.down { color: var(--profit); }
        .sector-card-row {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: var(--text-secondary);
          margin-top: 4px;
        }
        .sector-card-row span {
          color: var(--text-primary);
          font-weight: 500;
        }

        /* 板块列表（行业/概念） */
        .board-list-section {
          margin-bottom: 16px;
        }
        .board-list-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }
        .board-list-header h3 {
          font-size: 15px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
        }
        .board-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .board-table th {
          text-align: left;
          padding: 8px 10px;
          color: var(--text-muted);
          font-weight: 500;
          font-size: 11px;
          text-transform: uppercase;
          border-bottom: 1px solid var(--border-subtle);
          white-space: nowrap;
        }
        .board-table td {
          padding: 8px 10px;
          border-bottom: 1px solid var(--border-subtle);
          white-space: nowrap;
        }
        .board-table tr.clickable { cursor: pointer; }
        .board-table tr.clickable:hover { background: var(--bg-hover); }
        .board-table .name-cell {
          font-weight: 500;
          color: var(--text-primary);
          max-width: 120px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .board-table .code-cell {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--text-muted);
        }
        .board-table .num-cell { text-align: right; font-family: var(--font-mono); }
        .board-table .pct-up { color: var(--loss); font-weight: 600; }
        .board-table .pct-down { color: var(--profit); font-weight: 600; }
        .board-table .sortable-th:hover { color: var(--accent); }

        /* 搜索区 */
        .search-bar {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
        }
        .search-input-wrap {
          flex: 1;
          position: relative;
        }
        .search-input-wrap input {
          width: 100%;
          padding: 8px 36px 8px 12px;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          font-size: 14px;
          font-family: var(--font-sans);
          background: var(--bg-input);
          color: var(--text-primary);
          outline: none;
          transition: border-color 0.15s;
          box-sizing: border-box;
        }
        .search-input-wrap input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 2px var(--accent-glow);
        }
        .search-input-wrap .search-icon {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
          pointer-events: none;
        }

        /* 搜索结果 */
        .search-result-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          background: var(--bg-card);
          border-radius: var(--radius-sm);
          box-shadow: var(--shadow-card);
          margin-bottom: 6px;
          cursor: pointer;
          transition: all 0.12s;
          border: 1px solid transparent;
        }
        .search-result-item:hover { border-color: var(--accent); }
        .search-result-left { display: flex; align-items: center; gap: 10px; }
        .search-result-name { font-weight: 600; font-size: 14px; color: var(--text-primary); }
        .search-result-code { font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); }
        .search-result-market { font-size: 10px; background: var(--bg-hover); padding: 1px 6px; border-radius: 4px; color: var(--text-secondary); }
        .search-result-type { font-size: 10px; background: var(--accent-soft); padding: 1px 6px; border-radius: 4px; color: var(--accent); }

        /* 详情弹窗 */
        .detail-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.4);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000;
        }
        .detail-modal {
          background: var(--bg-card);
          border-radius: var(--radius-lg);
          box-shadow: 0 8px 40px rgba(0,0,0,0.2);
          width: 90%; max-width: 900px; max-height: 85vh;
          display: flex; flex-direction: column;
          overflow: hidden;
        }
        .detail-modal-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-subtle);
        }
        .detail-modal-header h3 {
          font-size: 16px; margin: 0; color: var(--text-primary);
        }
        .detail-modal-body {
          flex: 1; overflow-y: auto; padding: 16px 20px;
        }
        .detail-modal-body .board-table th {
          position: sticky; top: 0; background: var(--bg-card); z-index: 1;
        }

        /* 空态 */
        .empty-hint {
          text-align: center; padding: 40px 20px; color: var(--text-muted); font-size: 14px;
        }

        /* ── 股票搜索结果行情展示 ── */
        .search-result-item.stock-result {
          flex-wrap: wrap;
          gap: 8px;
        }
        .search-result-quote {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }
        .quote-price {
          font-size: 17px;
          font-weight: 700;
          font-family: var(--font-mono);
          color: var(--text-primary);
          min-width: 60px;
          text-align: right;
        }
        .quote-change {
          font-size: 14px;
          font-weight: 600;
          font-family: var(--font-mono);
          min-width: 70px;
          text-align: right;
        }
        .quote-change.up { color: var(--loss); }
        .quote-change.down { color: var(--profit); }
        .quote-change-amt {
          font-size: 12px;
          font-family: var(--font-mono);
          min-width: 50px;
          text-align: right;
        }
        .quote-change-amt.up { color: var(--loss); }
        .quote-change-amt.down { color: var(--profit); }
        .quote-extra {
          font-size: 11px;
          color: var(--text-muted);
          white-space: nowrap;
        }

        /* ── 股票详情弹窗 ── */
        .stock-detail-grid {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .stock-detail-price-card {
          background: var(--bg-hover);
          border-radius: var(--radius-lg);
          padding: 20px 24px;
          text-align: center;
        }
        .sd-price-main {
          display: flex;
          align-items: baseline;
          justify-content: center;
          gap: 4px;
        }
        .sd-price {
          font-size: 36px;
          font-weight: 700;
          font-family: var(--font-mono);
          color: var(--text-primary);
          line-height: 1;
        }
        .sd-currency {
          font-size: 14px;
          color: var(--text-muted);
          font-weight: 400;
        }
        .sd-change {
          margin-top: 6px;
          font-size: 18px;
          font-weight: 600;
          font-family: var(--font-mono);
        }
        .sd-change.up { color: var(--loss); }
        .sd-change.down { color: var(--profit); }
        .sd-change-amt {
          font-size: 14px;
          font-weight: 500;
        }
        .sd-change-amt.up { color: var(--loss); }
        .sd-change-amt.down { color: var(--profit); }
        .sd-section-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
          padding: 6px 0 2px;
          border-bottom: 1px solid var(--border-subtle);
          margin-top: 4px;
        }
        .sd-info-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 6px 16px;
        }
        .sd-info-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 4px 0;
        }
        .sd-info-label {
          font-size: 12px;
          color: var(--text-muted);
        }
        .sd-info-value {
          font-size: 13px;
          font-weight: 500;
          font-family: var(--font-mono);
          color: var(--text-primary);
          text-align: right;
        }
        .sd-bidask {
          display: flex;
          gap: 8px;
        }
        .sd-ask-side, .sd-bid-side {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .sd-bidask-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 12px;
          font-family: var(--font-mono);
        }
        .ask-row { background: rgba(22,163,74,0.04); }
        .bid-row { background: rgba(220,38,38,0.04); }
        .sd-bidask-label {
          width: 28px;
          color: var(--text-muted);
          font-size: 10px;
          text-align: center;
        }
        .sd-bidask-price {
          flex: 1;
          font-weight: 600;
          font-size: 13px;
        }
        .sd-bidask-vol {
          color: var(--text-muted);
          font-size: 11px;
        }
        .sd-update-time {
          text-align: center;
          font-size: 11px;
          color: var(--text-muted);
          padding-top: 8px;
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 子组件：热门板块视图
// ═══════════════════════════════════════════════════════════════════
function HotSectorsView({ hotData, loading, onRefresh, onOpenDetail }) {
  if (loading && !hotData) {
    return <div className="empty-hint">加载中…</div>;
  }

  if (!hotData || (!hotData.industries.length && !hotData.concepts.length)) {
    return (
      <div className="empty-hint">
        <div style={{ marginBottom: 12 }}>暂无数据</div>
        <button className="btn btn-ghost" onClick={() => onRefresh(true)}>
          <Icon name="refresh" size={14} />
          <span>刷新</span>
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* 行业板块 Top 10 */}
      {hotData.industries.length > 0 && (
        <div className="board-list-section">
          <div className="board-list-header">
            <h3>热门行业板块（涨幅前10）</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => onRefresh(true)}>
              <Icon name="refresh" size={12} />
            </button>
          </div>
          <div className="sector-grid">
            {hotData.industries.map((b) => (
              <SectorCard key={b.code} board={b} onClick={() => onOpenDetail(b.code, "industry")} />
            ))}
          </div>
        </div>
      )}

      {/* 概念板块 Top 10 */}
      {hotData.concepts.length > 0 && (
        <div className="board-list-section">
          <div className="board-list-header">
            <h3>热门概念板块（涨幅前10）</h3>
          </div>
          <div className="sector-grid">
            {hotData.concepts.map((b) => (
              <SectorCard key={b.code} board={b} onClick={() => onOpenDetail(b.code, "concept")} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 子组件：板块卡片
// ═══════════════════════════════════════════════════════════════════
function SectorCard({ board, onClick }) {
  return (
    <div className="sector-card" onClick={onClick}>
      <div className="sector-card-header">
        <div>
          <div className="sector-card-name">{board.name}</div>
          <div className="sector-card-code">{board.code}</div>
        </div>
        <div className={`sector-card-pct ${pctClass(board.changePercent)}`}>
          {board.changePercent != null
            ? (board.changePercent > 0 ? "+" : "") + board.changePercent.toFixed(2) + "%"
            : "--"}
        </div>
      </div>
      <div className="sector-card-row">
        <span>领涨</span>
        <span>{board.leadingStock || "--"}</span>
      </div>
      <div className="sector-card-row">
        <span>领涨涨幅</span>
        <span style={{ color: pctColor(board.leadingStockChangePercent) }}>
          {board.leadingStockChangePercent != null
            ? (board.leadingStockChangePercent > 0 ? "+" : "") + board.leadingStockChangePercent.toFixed(2) + "%"
            : "--"}
        </span>
      </div>
      <div className="sector-card-row">
        <span>上涨/下跌</span>
        <span>
          <span style={{ color: "var(--loss)" }}>{board.riseCount ?? "--"}</span>
          {" / "}
          <span style={{ color: "var(--profit)" }}>{board.fallCount ?? "--"}</span>
        </span>
      </div>
      <div className="sector-card-row">
        <span>换手率</span>
        <span>{board.turnoverRate != null ? board.turnoverRate.toFixed(2) + "%" : "--"}</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 子组件：板块列表视图（行业 / 概念）
// ═══════════════════════════════════════════════════════════════════
function BoardListView({ data, loading, type, onOpenDetail, onRefresh }) {
  const label = type === "industry" ? "行业板块" : "概念板块";

  if (loading && data.length === 0) {
    return <div className="empty-hint">加载中…</div>;
  }

  if (!data || data.length === 0) {
    return (
      <div className="empty-hint">
        <div style={{ marginBottom: 12 }}>暂无{label}数据</div>
        <button className="btn btn-ghost" onClick={() => onRefresh(true)}>
          <Icon name="refresh" size={14} />
          <span>刷新</span>
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="board-list-header">
        <h3>📊 {label}（共 {data.length} 个，按涨幅排序）</h3>
        <button className="btn btn-ghost btn-sm" onClick={() => onRefresh(true)}>
          <Icon name="refresh" size={12} />
        </button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="board-table">
          <thead>
            <tr>
              <th>排名</th>
              <th>名称</th>
              <th>代码</th>
              <th className="num-cell">最新价</th>
              <th className="num-cell">涨跌幅</th>
              <th className="num-cell">涨跌额</th>
              <th className="num-cell">换手率</th>
              <th className="num-cell">上涨</th>
              <th className="num-cell">下跌</th>
              <th>领涨股</th>
            </tr>
          </thead>
          <tbody>
            {data.map((b) => (
              <tr key={b.code} className="clickable" onClick={() => onOpenDetail(b.code, type)}>
                <td className="num-cell" style={{ color: "var(--text-muted)" }}>{b.rank}</td>
                <td className="name-cell" title={b.name}>{b.name}</td>
                <td className="code-cell">{b.code}</td>
                <td className="num-cell">{fmt(b.price)}</td>
                <td className={`num-cell ${pctClass(b.changePercent)}`}>
                  {b.changePercent != null
                    ? (b.changePercent > 0 ? "+" : "") + b.changePercent.toFixed(2) + "%"
                    : "--"}
                </td>
                <td className={`num-cell ${pctClass(b.change)}`}>
                  {b.change != null ? (b.change > 0 ? "+" : "") + fmt(b.change) : "--"}
                </td>
                <td className="num-cell">{b.turnoverRate != null ? b.turnoverRate.toFixed(2) + "%" : "--"}</td>
                <td className="num-cell" style={{ color: "var(--loss)" }}>{b.riseCount ?? "--"}</td>
                <td className="num-cell" style={{ color: "var(--profit)" }}>{b.fallCount ?? "--"}</td>
                <td className="name-cell" title={b.leadingStock}>{b.leadingStock || "--"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 子组件：搜索视图
// ═══════════════════════════════════════════════════════════════════
function SearchView({
  keyword, onKeywordChange, mode, onModeChange,
  results, quotes, loading, onSectorSearch, onStockSearch, onOpenDetail, onOpenStockDetail,
}) {
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [mode]);

  const handleSearch = mode === "sector" ? onSectorSearch : onStockSearch;

  return (
    <div>
      {/* 搜索模式切换 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, cursor: "pointer", color: "var(--text-secondary)" }}>
          <input
            type="radio"
            checked={mode === "sector"}
            onChange={() => { onModeChange("sector"); onKeywordChange(""); }}
          />
          搜索板块
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, cursor: "pointer", color: "var(--text-secondary)" }}>
          <input
            type="radio"
            checked={mode === "stock"}
            onChange={() => { onModeChange("stock"); onKeywordChange(""); }}
          />
          搜索股票
        </label>
      </div>

      {/* 搜索框 */}
      <form onSubmit={handleSearch} className="search-bar">
        <div className="search-input-wrap">
          <input
            ref={inputRef}
            type="text"
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            placeholder={mode === "sector" ? "输入板块名称或代码搜索…" : "输入股票代码/名称/拼音搜索…"}
          />
          <span className="search-icon">
            <Icon name="search" size={16} />
          </span>
        </div>
        <button className="btn btn-primary" type="submit" disabled={loading || !keyword.trim()}>
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
          ) : mode === "sector" ? (
            /* 板块搜索结果 */
            results.map((b) => (
              <div
                key={`${b.boardType}-${b.code}`}
                className="search-result-item"
                onClick={() => onOpenDetail(b.code, b.boardType)}
              >
                <div className="search-result-left">
                  <div>
                    <div className="search-result-name">{b.name}</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                      <span className="search-result-code">{b.code}</span>
                      <span className="search-result-type">
                        {b.boardType === "industry" ? "行业" : "概念"}
                      </span>
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className={`sector-card-pct ${pctClass(b.changePercent)}`} style={{ fontSize: 15 }}>
                    {b.changePercent != null
                      ? (b.changePercent > 0 ? "+" : "") + b.changePercent.toFixed(2) + "%"
                      : "--"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    领涨: {b.leadingStock || "--"}
                  </div>
                </div>
              </div>
            ))
          ) : (
            /* 股票搜索结果（含实时行情） */
            results.map((r, i) => {
              const quote = quotes?.[r.code];
              return (
                <div
                  key={r.code || i}
                  className="search-result-item stock-result"
                  onClick={() => (r.category === "stock" || r.category === "index")
                    ? onOpenStockDetail?.(r.code, r.name)
                    : null}
                  style={{ cursor: (r.category === "stock" || r.category === "index") ? "pointer" : "default" }}
                >
                  <div className="search-result-left">
                    <div style={{ minWidth: 0 }}>
                      <div className="search-result-name">{r.name}</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
                        <span className="search-result-code">{r.code}</span>
                        {cnMarket(r.code) && (
                          <span className="search-result-market">{cnMarket(r.code)}</span>
                        )}
                        {r.category && (
                          <span className="search-result-type">
                            {r.category === "stock" ? "股票" : r.category === "index" ? "指数" : r.category === "fund" ? "基金" : r.category}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* 实时行情数据 */}
                  <div className="search-result-quote">
                    {quote ? (
                      <>
                        <div className="quote-price">{fmt(quote.price)}</div>
                        <div className={`quote-change ${pctClass(quote.changePercent)}`}>
                          {quote.changePercent != null
                            ? (quote.changePercent > 0 ? "+" : "") + quote.changePercent.toFixed(2) + "%"
                            : "--"}
                        </div>
                        <div className={`quote-change-amt ${pctClass(quote.change)}`}>
                          {quote.change != null
                            ? (quote.change > 0 ? "+" : "") + fmt(quote.change)
                            : "--"}
                        </div>
                        <div className="quote-extra">
                          量 {fmtVol(quote.volume)} | 额 {fmtMoney(quote.amount)}
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {loading ? "加载中…" : r.market}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 初始提示 */}
      {results === null && (
        <div className="empty-hint">
          {mode === "sector"
            ? "输入行业或概念板块名称/代码进行搜索"
            : "输入股票代码（如 600519）、名称（如 贵州茅台）或拼音缩写（如 gzmt）进行搜索"}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 子组件：板块详情弹窗
// ═══════════════════════════════════════════════════════════════════
function DetailModal({ symbol, type, stocks, loading, onClose }) {
  const label = type === "industry" ? "行业" : "概念";

  // 点击遮罩关闭
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  // ESC 关闭
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="detail-overlay" onClick={handleOverlayClick}>
      <div className="detail-modal">
        <div className="detail-modal-header">
          <h3>
            📋 {symbol} — {label}板块成分股
          </h3>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding: "4px 8px" }}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="detail-modal-body">
          {loading ? (
            <div className="empty-hint">加载成分股数据…</div>
          ) : !stocks || stocks.length === 0 ? (
            <div className="empty-hint">暂无成分股数据</div>
          ) : (
            <table className="board-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>代码</th>
                  <th>名称</th>
                  <th className="num-cell">最新价</th>
                  <th className="num-cell">涨跌幅</th>
                  <th className="num-cell">涨跌额</th>
                  <th className="num-cell">成交量</th>
                  <th className="num-cell">成交额</th>
                  <th className="num-cell">换手率</th>
                  <th className="num-cell">市盈率</th>
                  <th className="num-cell">市净率</th>
                </tr>
              </thead>
              <tbody>
                {stocks.map((s) => (
                  <tr key={s.code}>
                    <td style={{ color: "var(--text-muted)", fontSize: 12 }}>{s.rank}</td>
                    <td className="code-cell">{s.code}</td>
                    <td className="name-cell" title={s.name}>{s.name}</td>
                    <td className="num-cell">{fmt(s.price)}</td>
                    <td className={`num-cell ${pctClass(s.changePercent)}`}>
                      {s.changePercent != null
                        ? (s.changePercent > 0 ? "+" : "") + s.changePercent.toFixed(2) + "%"
                        : "--"}
                    </td>
                    <td className={`num-cell ${pctClass(s.change)}`}>
                      {s.change != null ? (s.change > 0 ? "+" : "") + fmt(s.change) : "--"}
                    </td>
                    <td className="num-cell">{fmtVol(s.volume)}</td>
                    <td className="num-cell">{fmtMoney(s.amount)}</td>
                    <td className="num-cell">{s.turnoverRate != null ? s.turnoverRate.toFixed(2) + "%" : "--"}</td>
                    <td className="num-cell">{s.pe != null ? fmt(s.pe, 1) : "--"}</td>
                    <td className="num-cell">{s.pb != null ? fmt(s.pb, 1) : "--"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 子组件：股票详情弹窗
// ═══════════════════════════════════════════════════════════════════
function StockDetailModal({ code, name, quote, kline, klinePeriod, timeline, loading, onPeriodChange, onClose }) {
  // 点击遮罩关闭
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  // ESC 关闭
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const hasQuote = quote && quote.code;
  const currency = quote?.currency === "HKD" ? "港元" : quote?.currency === "USD" ? "美元" : "元";
  const isHK = quote?.market === "hk";
  const isUS = quote?.market === "us";

  return (
    <div className="detail-overlay" onClick={handleOverlayClick}>
      <div className="detail-modal" style={{ maxWidth: 800 }}>
        <div className="detail-modal-header">
          <h3>
            <Icon name="trending-up" size={18} style={{ verticalAlign: -3, marginRight: 6 }} />
            {name} <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 400 }}>{code}</span>
          </h3>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding: "4px 8px" }}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="detail-modal-body">
          {loading ? (
            <div className="empty-hint">加载行情数据…</div>
          ) : (
            <div className="stock-detail-grid">
              {/* 价格区域（有行情数据时显示） */}
              {hasQuote ? (
                <>
                  <div className="stock-detail-price-card">
                    <div className="sd-price-main">
                      <span className="sd-price">{fmt(quote.price)}</span>
                      <span className="sd-currency">{currency}</span>
                    </div>
                    <div className={`sd-change ${pctClass(quote.changePercent)}`}>
                      {quote.changePercent != null
                        ? (quote.changePercent > 0 ? "+" : "") + quote.changePercent.toFixed(2) + "%"
                        : "--"}
                      {" "}
                      <span className={`sd-change-amt ${pctClass(quote.change)}`}>
                        {quote.change != null
                          ? (quote.change > 0 ? "+" : "") + fmt(quote.change)
                          : "--"}
                      </span>
                    </div>
                  </div>

              {/* 交易数据 */}
              <div className="sd-info-grid">
                <StockInfoItem label="今开" value={fmt(quote.open)} />
                <StockInfoItem label="昨收" value={fmt(quote.prevClose)} />
                <StockInfoItem label="最高" value={fmt(quote.high)} color={pctColor(quote.high > quote.prevClose ? 1 : -1)} />
                <StockInfoItem label="最低" value={fmt(quote.low)} color={pctColor(quote.low < quote.prevClose ? -1 : 1)} />
                <StockInfoItem label="成交量" value={fmtVol(quote.volume)} />
                <StockInfoItem label="成交额" value={fmtMoney(quote.amount)} />
                <StockInfoItem label="换手率" value={quote.turnoverRate != null ? quote.turnoverRate.toFixed(2) + "%" : "--"} />
                <StockInfoItem label="振幅" value={quote.amplitude != null ? quote.amplitude.toFixed(2) + "%" : "--"} />
                <StockInfoItem label="量比" value={quote.volumeRatio != null ? quote.volumeRatio.toFixed(2) : "--"} />
                <StockInfoItem label="均价" value={fmt(quote.avgPrice)} />
              </div>

              {/* 估值数据 */}
              <div className="sd-section-title">估值指标</div>
              <div className="sd-info-grid">
                <StockInfoItem label="市盈率(动)" value={quote.peDynamic != null ? fmt(quote.peDynamic, 2) : "--"} />
                <StockInfoItem label="市盈率(静)" value={quote.peStatic != null ? fmt(quote.peStatic, 2) : "--"} />
                <StockInfoItem label="市盈率(TTM)" value={quote.pe != null ? fmt(quote.pe, 2) : "--"} />
                <StockInfoItem label="市净率" value={quote.pb != null ? fmt(quote.pb, 2) : "--"} />
                <StockInfoItem label="总市值" value={fmtMoney(quote.totalMarketCap)} />
                <StockInfoItem label="流通市值" value={fmtMoney(quote.circulatingMarketCap)} />
              </div>

              {/* 盘口 */}
              {quote.bid && quote.bid.length > 0 && quote.ask && quote.ask.length > 0 && (
                <>
                  <div className="sd-section-title">五档盘口</div>
                  <div className="sd-bidask">
                    {/* 卖盘 */}
                    <div className="sd-ask-side">
                      {[...quote.ask].reverse().map((a, i) => (
                        <div key={`ask-${i}`} className="sd-bidask-row ask-row">
                          <span className="sd-bidask-label">卖{5 - i}</span>
                          <span className="sd-bidask-price" style={{ color: "var(--profit)" }}>{fmt(a.price)}</span>
                          <span className="sd-bidask-vol">{fmtVol(a.volume)}</span>
                        </div>
                      ))}
                    </div>
                    {/* 买盘 */}
                    <div className="sd-bid-side">
                      {quote.bid.map((b, i) => (
                        <div key={`bid-${i}`} className="sd-bidask-row bid-row">
                          <span className="sd-bidask-label">买{i + 1}</span>
                          <span className="sd-bidask-price" style={{ color: "var(--loss)" }}>{fmt(b.price)}</span>
                          <span className="sd-bidask-vol">{fmtVol(b.volume)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* 涨跌停 */}
              {(quote.limitUp != null || quote.limitDown != null) && (
                <>
                  <div className="sd-section-title">涨跌停价格</div>
                  <div className="sd-info-grid">
                    <StockInfoItem label="涨停价" value={quote.limitUp != null ? fmt(quote.limitUp) : "--"} color="var(--loss)" />
                    <StockInfoItem label="跌停价" value={quote.limitDown != null ? fmt(quote.limitDown) : "--"} color="var(--profit)" />
                  </div>
                </>
              )}

              {/* 52周高低 */}
              {(quote.high52w != null || quote.low52w != null) && (
                <>
                  <div className="sd-section-title">52周高低</div>
                  <div className="sd-info-grid">
                    <StockInfoItem label="52周最高" value={quote.high52w != null ? fmt(quote.high52w) : "--"} color="var(--loss)" />
                    <StockInfoItem label="52周最低" value={quote.low52w != null ? fmt(quote.low52w) : "--"} color="var(--profit)" />
                  </div>
                </>
              )}
                </>
              ) : (
                <div className="empty-hint" style={{ padding: 10 }}>暂无行情数据（可能非交易时段）</div>
              )}

              {/* K线图 + 周期切换（独立于行情数据，有K线即显示） */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div className="sd-section-title" style={{ borderBottom: "none", marginTop: 0, flex: 1 }}>
                  {klinePeriod === "timeline" ? "分时走势" : klinePeriod === "weekly" ? "周K线" : klinePeriod === "monthly" ? "月K线" : "日K线"}
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {["timeline", "daily", "weekly", "monthly"].map((p) => (
                    <button
                      key={p}
                      className={`btn btn-ghost btn-sm`}
                      style={{ fontSize: 11, padding: "2px 8px", fontWeight: klinePeriod === p ? 700 : 400, color: klinePeriod === p ? "var(--accent)" : undefined }}
                      onClick={() => onPeriodChange?.(p)}
                    >
                      {p === "timeline" ? "分时" : p === "daily" ? "日线" : p === "weekly" ? "周线" : "月线"}
                    </button>
                  ))}
                </div>
              </div>
              {klinePeriod === "timeline" ? (
                timeline && timeline.data && timeline.data.length > 0 ? (
                  <TimelineChart data={timeline.data} preClose={timeline.preClose} />
                ) : (
                  <div className="empty-hint" style={{ padding: 20 }}>暂无分时数据（非交易时段）</div>
                )
              ) : (
                kline && kline.length > 0 ? (
                  <KlineChart data={kline} />
                ) : (
                  <div className="empty-hint" style={{ padding: 20 }}>暂无K线数据</div>
                )
              )}

              {/* 更新时间 */}
              {hasQuote && (
                <div className="sd-update-time">
                  数据更新时间：{quote.time || "--"}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 股票详情信息条目 */
function StockInfoItem({ label, value, color }) {
  return (
    <div className="sd-info-item">
      <span className="sd-info-label">{label}</span>
      <span className="sd-info-value" style={color ? { color } : undefined}>{value}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 子组件：K线图（纯 SVG）
// ═══════════════════════════════════════════════════════════════════
function KlineChart({ data }) {
  if (!data || data.length === 0) return null;

  // 取最近 N 根K线
  const MAX_BARS = 80;
  const bars = data.slice(-MAX_BARS);
  const n = bars.length;

  // 布局参数
  const W = 700;
  const H = 260;
  const PAD_TOP = 10;
  const PAD_BOTTOM = 50; // 底部留给成交量
  const PAD_LEFT = 50;
  const PAD_RIGHT = 10;
  const CHART_H = H - PAD_TOP - PAD_BOTTOM;
  const VOL_H = 40;
  const VOL_Y = H - VOL_H - 2;

  const barW = Math.max(1, (W - PAD_LEFT - PAD_RIGHT) / n * 0.7);
  const gap = (W - PAD_LEFT - PAD_RIGHT) / n;

  // 价格范围
  const allHigh = bars.reduce((m, b) => Math.max(m, b.high ?? 0), 0);
  const allLow = bars.reduce((m, b) => Math.min(m, b.low ?? Infinity), Infinity);
  const priceRange = allHigh - allLow || 1;

  const priceY = (p) => PAD_TOP + CHART_H - ((p - allLow) / priceRange) * CHART_H;

  // 成交量范围
  const maxVol = bars.reduce((m, b) => Math.max(m, b.volume ?? 0), 0);

  const volY = (v) => VOL_Y + VOL_H - ((v / (maxVol || 1)) * VOL_H);

  // Y轴刻度标签
  const yTicks = 5;
  const yTickVals = Array.from({ length: yTicks }, (_, i) =>
    allLow + (priceRange / (yTicks - 1)) * i
  );

  return (
    <div style={{ overflowX: "auto", padding: "8px 0" }}>
      <svg width={W} height={H} style={{ display: "block", fontFamily: "var(--font-mono)" }}>
        {/* 水平网格线 */}
        {yTickVals.map((v, i) => (
          <g key={`grid-${i}`}>
            <line
              x1={PAD_LEFT} y1={priceY(v)} x2={W - PAD_RIGHT} y2={priceY(v)}
              stroke="var(--border-subtle)" strokeWidth={0.5}
            />
            <text
              x={PAD_LEFT - 6} y={priceY(v) + 4}
              textAnchor="end" fontSize={10} fill="var(--text-muted)"
            >
              {fmt(v, 2)}
            </text>
          </g>
        ))}

        {/* K线柱体 */}
        {bars.map((b, i) => {
          const x = PAD_LEFT + i * gap + (gap - barW) / 2;
          const open = b.open ?? 0;
          const close = b.close ?? 0;
          const high = b.high ?? 0;
          const low = b.low ?? 0;
          const isUp = close >= open;
          const color = isUp ? "var(--loss)" : "var(--profit)";

          const yOpen = priceY(open);
          const yClose = priceY(close);
          const bodyH = Math.max(1, Math.abs(yClose - yOpen));
          const bodyY = Math.min(yOpen, yClose);

          return (
            <g key={b.date || i}>
              {/* 影线 */}
              <line
                x1={x + barW / 2} y1={priceY(high)}
                x2={x + barW / 2} y2={priceY(low)}
                stroke={color} strokeWidth={1}
              />
              {/* 实体 */}
              <rect
                x={x} y={bodyY}
                width={Math.max(1, barW)} height={bodyH}
                fill={color} stroke={color} strokeWidth={0.5}
              />
              {/* 成交量 */}
              <rect
                x={x} y={volY(b.volume ?? 0)}
                width={Math.max(1, barW)} height={Math.max(1, VOL_H - (volY(b.volume ?? 0) - VOL_Y))}
                fill={color} opacity={0.35}
              />
            </g>
          );
        })}

        {/* 成交量基线 */}
        <line
          x1={PAD_LEFT} y1={VOL_Y + VOL_H} x2={W - PAD_RIGHT} y2={VOL_Y + VOL_H}
          stroke="var(--border-subtle)" strokeWidth={0.5}
        />
        <text
          x={W / 2} y={H - 2}
          textAnchor="middle" fontSize={9} fill="var(--text-muted)"
        >
          成交量
        </text>
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 子组件：分时走势图（纯 SVG）
// ═══════════════════════════════════════════════════════════════════
function TimelineChart({ data, preClose }) {
  if (!data || data.length < 2) return null;

  const W = 700;
  const H = 200;
  const PAD_TOP = 10;
  const PAD_BOTTOM = 30;
  const PAD_LEFT = 50;
  const PAD_RIGHT = 10;
  const CHART_W = W - PAD_LEFT - PAD_RIGHT;
  const CHART_H = H - PAD_TOP - PAD_BOTTOM;

  const prices = data.map((d) => d.price).filter((v) => v != null && isFinite(v));
  const maxP = Math.max(...prices);
  const minP = Math.min(...prices);
  const range = (maxP - minP) || 1;
  const y = (p) => PAD_TOP + CHART_H - ((p - minP) / range) * CHART_H;

  const closeVal = preClose ?? data[0]?.price ?? 0;
  const yClose = closeVal ? y(closeVal) : null;

  const points = data
    .map((d, i) => {
      if (d.price == null || !isFinite(d.price)) return "";
      const x = PAD_LEFT + (i / (data.length - 1)) * CHART_W;
      return `${x},${y(d.price)}`;
    })
    .filter(Boolean)
    .join(" ");

  const avgPoints = data
    .map((d, i) => {
      if (d.avgPrice == null || !isFinite(d.avgPrice)) return "";
      const x = PAD_LEFT + (i / (data.length - 1)) * CHART_W;
      return `${x},${y(d.avgPrice)}`;
    })
    .filter(Boolean)
    .join(" ");

  const ticks = 4;
  const tickVals = Array.from({ length: ticks }, (_, i) => minP + (range / (ticks - 1)) * i);

  return (
    <div style={{ overflowX: "auto", padding: "8px 0" }}>
      <svg width={W} height={H} style={{ display: "block", fontFamily: "var(--font-mono)" }}>
        {yClose != null && (
          <line
            x1={PAD_LEFT} y1={yClose} x2={W - PAD_RIGHT} y2={yClose}
            stroke="var(--text-muted)" strokeWidth={0.5} strokeDasharray="4,3"
          />
        )}
        {tickVals.map((v, i) => (
          <g key={i}>
            <line x1={PAD_LEFT} y1={y(v)} x2={W - PAD_RIGHT} y2={y(v)} stroke="var(--border-subtle)" strokeWidth={0.5} />
            <text x={PAD_LEFT - 6} y={y(v) + 4} textAnchor="end" fontSize={9} fill="var(--text-muted)">{fmt(v, 2)}</text>
          </g>
        ))}
        {avgPoints && <polyline points={avgPoints} fill="none" stroke="var(--warning)" strokeWidth={1} opacity={0.7} />}
        {points && <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth={1.5} />}
        {[0, Math.floor(data.length / 2), data.length - 1].map((idx) => {
          const d = data[idx];
          if (!d) return null;
          const x = PAD_LEFT + (idx / (data.length - 1)) * CHART_W;
          return <text key={idx} x={x} y={H - 6} textAnchor="middle" fontSize={9} fill="var(--text-muted)">{d.time?.slice(-5) || ""}</text>;
        })}
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 子组件：市场异动视图（涨停板 + 盘口异动）
// ═══════════════════════════════════════════════════════════════════
function MarketEventsView({ ztType, ztData, changeType, changesData, loading, onZtTypeChange, onChangeTypeChange, onRefresh, onOpenStockDetail }) {
  const [subTab, setSubTab] = useState("zt");
  const [ztSortKey, setZtSortKey] = useState("changePercent");
  const [ztSortDir, setZtSortDir] = useState("desc");
  const [chSortKey, setChSortKey] = useState("_price");
  const [chSortDir, setChSortDir] = useState("desc");

  // 预处理盘口异动数据：注入解析后的可排序数值字段
  const augmentedChanges = useMemo(() => {
    if (!changesData) return [];
    return changesData.map((row) => {
      const p = parseChangeInfo(row.info || "");
      return {
        ...row,
        _price: p._price ?? 0,
        _changePct: p._changePct ?? 0,
        _volume: p._volume ?? 0,
        _priceDisp: p.price || "--",
        _changePctDisp: p.changePct || "--",
        _changePctClass: p.pctClass || "",
        _volumeDisp: p.volume || "--",
      };
    });
  }, [changesData]);

  const ZT_TYPES = [
    { id: "zt", label: "涨停股" }, { id: "dt", label: "跌停股" },
    { id: "strong", label: "强势股" }, { id: "broken", label: "炸板股" },
  ];

  const CHANGE_TYPES = [
    { id: "large_buy", label: "大笔买入" }, { id: "large_sell", label: "大笔卖出" },
    { id: "rocket_launch", label: "火箭发射" }, { id: "high_dive", label: "高台跳水" },
    { id: "limit_up_seal", label: "封涨停" },
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button className={`tab-btn${subTab === "zt" ? " active" : ""}`} onClick={() => setSubTab("zt")}>涨停板</button>
        <button className={`tab-btn${subTab === "changes" ? " active" : ""}`} onClick={() => { setSubTab("changes"); onChangeTypeChange("large_buy"); }}>盘口异动</button>
      </div>
      {subTab === "zt" && (
        <div>
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
            {ZT_TYPES.map((t) => (
              <button key={t.id} className="btn btn-ghost btn-sm" style={{ fontWeight: ztType === t.id ? 700 : 400, color: ztType === t.id ? "var(--accent)" : undefined }} onClick={() => onZtTypeChange(t.id)}>{t.label}</button>
            ))}
            <span style={{ color: "var(--border-subtle)", margin: "0 2px" }}>|</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>排序：</span>
            {[
              { key: "changePercent", label: "涨跌幅" },
              { key: "continuousBoardCount", label: "连板数" },
              { key: "price", label: "价格" },
              { key: "amount", label: "成交额" },
            ].map((s) => (
              <button
                key={s.key}
                className="btn btn-ghost btn-sm"
                style={{ fontSize: 11, fontWeight: ztSortKey === s.key ? 700 : 400, color: ztSortKey === s.key ? "var(--accent)" : undefined }}
                onClick={() => {
                  if (ztSortKey === s.key) setZtSortDir((d) => d === "asc" ? "desc" : "asc");
                  else { setZtSortKey(s.key); setZtSortDir("desc"); }
                }}
              >
                {s.label}{ztSortKey === s.key ? (ztSortDir === "asc" ? "↑" : "↓") : ""}
              </button>
            ))}
            <button className="btn btn-ghost btn-sm" onClick={onRefresh} style={{ marginLeft: "auto" }}><Icon name="refresh" size={12} /></button>
          </div>
          {loading ? <div className="empty-hint">加载中…</div> : !ztData || ztData.length === 0 ? <div className="empty-hint">暂无数据</div> :
            <SimpleTable data={ztData} pageSize={30} sortKey={ztSortKey} sortDir={ztSortDir} onRowClick={(row) => onOpenStockDetail?.(row.code, row.name)} cols={[
              { key: "name", label: "名称", className: "name-cell" },
              { key: "code", label: "代码", className: "code-cell", sortable: false, format: (v) => <span>{v}{cnMarket(v) ? <span className="search-result-market" style={{ marginLeft: 4 }}>{cnMarket(v)}</span> : null}</span> },
              { key: "price", label: "最新价", className: "num-cell", format: (v) => fmt(v) },
              { key: "changePercent", label: "涨跌幅", className: "num-cell", format: (v) => v != null ? (v > 0 ? "+" : "") + v.toFixed(2) + "%" : "--", pctKey: true },
              { key: "continuousBoardCount", label: "连板", className: "num-cell", format: (v) => v ?? "--" },
              { key: "industry", label: "行业", format: (v) => v || "--", sortable: false },
            ]} />
          }
        </div>
      )}
      {subTab === "changes" && (
        <div>
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
            {CHANGE_TYPES.map((t) => (
              <button key={t.id} className="btn btn-ghost btn-sm" style={{ fontWeight: changeType === t.id ? 700 : 400, color: changeType === t.id ? "var(--accent)" : undefined }} onClick={() => onChangeTypeChange(t.id)}>{t.label}</button>
            ))}
            <span style={{ color: "var(--border-subtle)", margin: "0 2px" }}>|</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>排序：</span>
            {[
              { key: "_price", label: "价格" },
              { key: "_changePct", label: "涨跌幅" },
              { key: "_volume", label: "成交量" },
            ].map((s) => (
              <button
                key={s.key}
                className="btn btn-ghost btn-sm"
                style={{ fontSize: 11, fontWeight: chSortKey === s.key ? 700 : 400, color: chSortKey === s.key ? "var(--accent)" : undefined }}
                onClick={() => {
                  if (chSortKey === s.key) setChSortDir((d) => d === "asc" ? "desc" : "asc");
                  else { setChSortKey(s.key); setChSortDir("desc"); }
                }}
              >
                {s.label}{chSortKey === s.key ? (chSortDir === "asc" ? "↑" : "↓") : ""}
              </button>
            ))}
          </div>
          {loading ? <div className="empty-hint">加载中…</div> : augmentedChanges.length === 0 ? <div className="empty-hint">暂无异动数据</div> :
            <SimpleTable
              data={augmentedChanges}
              pageSize={30}
              sortKey={chSortKey}
              sortDir={chSortDir}
              onRowClick={(row) => onOpenStockDetail?.(row.code, row.name)}
              cols={[
                { key: "time", label: "时间", sortable: false },
                { key: "name", label: "名称", className: "name-cell" },
                { key: "code", label: "代码", className: "code-cell", sortable: false },
                { key: "_priceDisp", label: "价格", className: "num-cell" },
                { key: "_changePctDisp", label: "涨跌幅", className: "num-cell", pctKey: "_changePct" },
                { key: "_volumeDisp", label: "成交量", className: "num-cell" },
                { key: "changeTypeLabel", label: "异动类型", sortable: false },
              ]}
            />
          }
        </div>
      )}
    </div>
  );
}

/** 解析盘口异动的 info 字段（兼容原始 CSV 与可读格式） */
function parseChangeInfo(info) {
  const text = (info || "").trim();
  const result = { price: "", changePct: "", volume: "", label: "", pctClass: "", _price: 0, _changePct: 0, _volume: 0 };

  // ── 格式2（优先）：原始 CSV 数值（如 "0.097411,32.22000,0.097411v"） ──
  if (text.includes(",")) {
    const parts = text.split(",");
    const nums = parts.map((p) => parseFloat(p)).filter((n) => isFinite(n));

    if (nums.length >= 2) {
      const small = nums.filter((n) => Math.abs(n) < 1);
      const large = nums.filter((n) => Math.abs(n) >= 1);

      if (large.length > 0) {
        const p = Math.max(...large);
        result.price = p.toFixed(2);
        result._price = p;
      }

      if (small.length > 0) {
        const pct = small.reduce((a, b) => Math.abs(a) < Math.abs(b) ? a : b);
        result.changePct = (pct >= 0 ? "+" : "") + (pct * 100).toFixed(2) + "%";
        result._changePct = pct * 100;
        result.pctClass = pct >= 0 ? "pct-up" : "pct-down";
      } else if (nums.length >= 2) {
        // 无小数时，用第2个数值估算涨跌幅
        const maybePct = nums[1];
        if (Math.abs(maybePct) < 100) {
          result.changePct = (maybePct >= 0 ? "+" : "") + maybePct.toFixed(2) + "%";
          result._changePct = maybePct;
          result.pctClass = maybePct >= 0 ? "pct-up" : "pct-down";
        }
      }

      const volPart = parts.find((p) => /v/i.test(p));
      if (volPart) {
        const volNum = parseFloat(volPart);
        if (isFinite(volNum) && volNum > 0) {
          result.volume = volNum < 10000 ? Math.round(volNum) + "手" : (volNum / 10000).toFixed(1) + "万手";
          result._volume = volNum;
        }
      }
    }

    // 从 text 中提取中文异动关键词作为 label 兜底
    const labels = ["大笔买入", "大笔卖出", "火箭发射", "快速反弹", "加速下跌", "高台跳水",
      "封涨停板", "封跌停板", "竞价上涨", "竞价下跌", "60日新高", "60日新低"];
    for (const l of labels) { if (text.includes(l)) { result.label = l; break; } }

    return result;
  }

  // ── 格式1：可读文本（如 "14:35 成交5000手 价格12.34 大笔买入"） ──
  const volMatch = text.match(/(\d[\d,]*)手/);
  if (volMatch) {
    const v = Number(volMatch[1].replace(/,/g, ""));
    result.volume = v.toLocaleString() + "手";
    result._volume = v;
  }

  const priceMatch = text.match(/价格(\d+\.?\d*)/);
  if (priceMatch) { result.price = priceMatch[1]; result._price = parseFloat(priceMatch[1]); }

  const pctMatch = text.match(/(涨幅|跌幅)(\d+\.?\d*)%/);
  if (pctMatch) {
    const isUp = pctMatch[1] === "涨幅";
    const pv = parseFloat(pctMatch[2]);
    result.changePct = (isUp ? "+" : "-") + pctMatch[2] + "%";
    result._changePct = isUp ? pv : -pv;
    result.pctClass = isUp ? "pct-up" : "pct-down";
  }

  const rangeMatch = text.match(/从(\d+\.?\d*).*?(拉升至|下跌至)(\d+\.?\d*)/);
  if (rangeMatch) {
    result.price = rangeMatch[1] + "→" + rangeMatch[3];
    result._price = parseFloat(rangeMatch[3]);
  }

  const sealMatch = text.match(/封单(\d+)手/);
  if (sealMatch) {
    const sv = Number(sealMatch[1]);
    result.volume = sv.toLocaleString() + "手（封单）";
    result._volume = sv;
  }

  const labels = ["大笔买入", "大笔卖出", "火箭发射", "快速反弹", "加速下跌", "高台跳水",
    "封涨停板", "封跌停板", "竞价上涨", "竞价下跌", "60日新高", "60日新低"];
  for (const l of labels) { if (text.includes(l)) { result.label = l; break; } }

  return result;
}

// ═══════════════════════════════════════════════════════════════════
// 资金流向视图
// ═══════════════════════════════════════════════════════════════════
function FundFlowsView({ fundFlowRank, sectorFlowRank, indicator, loading, onIndicatorChange, onRefresh }) {
  const INDICATORS = [{ id: "today", label: "今日" }, { id: "3day", label: "3日" }, { id: "5day", label: "5日" }, { id: "10day", label: "10日" }];
  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {INDICATORS.map((t) => (
          <button key={t.id} className="btn btn-ghost btn-sm" style={{ fontWeight: indicator === t.id ? 700 : 400, color: indicator === t.id ? "var(--accent)" : undefined }} onClick={() => onIndicatorChange(t.id)}>{t.label}</button>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={onRefresh}><Icon name="refresh" size={12} /></button>
      </div>
      {loading ? <div className="empty-hint">加载中…</div> : (
        <div>
          {fundFlowRank && fundFlowRank.length > 0 && (
            <div className="board-list-section">
              <div className="board-list-header"><h3>📊 个股资金流排名（主力净流入 Top 20）</h3></div>
              <SimpleTable data={fundFlowRank.slice(0, 20)} cols={[
                { key: "name", label: "名称", className: "name-cell" }, { key: "code", label: "代码", className: "code-cell" },
                { key: "price", label: "最新价", className: "num-cell", format: (v) => fmt(v) },
                { key: "changePercent", label: "涨跌幅", className: "num-cell", format: (v) => v != null ? (v > 0 ? "+" : "") + v.toFixed(2) + "%" : "--", pctKey: true },
                { key: "mainNetInflow", label: "主力净流入", className: "num-cell", format: (v) => fmtMoney(v), pctKey: true },
              ]} />
            </div>
          )}
          {sectorFlowRank && sectorFlowRank.length > 0 && (
            <div className="board-list-section">
              <div className="board-list-header"><h3>🏭 行业板块资金流排名 Top 15</h3></div>
              <SimpleTable data={sectorFlowRank.slice(0, 15)} cols={[
                { key: "name", label: "名称", className: "name-cell" },
                { key: "changePercent", label: "涨跌幅", className: "num-cell", format: (v) => v != null ? (v > 0 ? "+" : "") + v.toFixed(2) + "%" : "--", pctKey: true },
                { key: "mainNetInflow", label: "主力净流入", className: "num-cell", format: (v) => fmtMoney(v), pctKey: true },
                { key: "topStockName", label: "领涨股", className: "name-cell" },
              ]} />
            </div>
          )}
          {(!fundFlowRank || fundFlowRank.length === 0) && (!sectorFlowRank || sectorFlowRank.length === 0) && <div className="empty-hint">暂无资金流数据</div>}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 北向资金视图
// ═══════════════════════════════════════════════════════════════════
function NorthboundView({ northData, loading, onRefresh }) {
  return (
    <div>
      <div className="board-list-header"><h3>沪深港通资金动向</h3><button className="btn btn-ghost btn-sm" onClick={onRefresh}><Icon name="refresh" size={12} /></button></div>
      {loading ? <div className="empty-hint">加载中…</div> : !northData ? <div className="empty-hint">暂无数据</div> : (
        <div>
          {northData.summary && northData.summary.length > 0 && (
            <div className="board-list-section">
              <div className="board-list-header"><h3><Icon name="review" size={16} style={{ verticalAlign: -2, marginRight: 4 }} /> 市场汇总</h3></div>
              <SimpleTable data={northData.summary} cols={[
                { key: "boardName", label: "通道", className: "name-cell" }, { key: "direction", label: "方向" },
                { key: "netBuyAmount", label: "净买额", className: "num-cell", format: (v) => fmtMoney(v), pctKey: true },
                { key: "netInflow", label: "净流入", className: "num-cell", format: (v) => fmtMoney(v), pctKey: true },
              ]} />
            </div>
          )}
          {northData.rank && northData.rank.length > 0 && (
            <div className="board-list-section">
              <div className="board-list-header"><h3>🏆 北向持股排行（5日 Top 20）</h3></div>
              <SimpleTable data={northData.rank.slice(0, 20)} cols={[
                { key: "name", label: "名称", className: "name-cell" }, { key: "code", label: "代码", className: "code-cell" },
                { key: "holdMarketValue", label: "持股市值", className: "num-cell", format: (v) => fmtMoney(v) },
                { key: "holdRatioFloat", label: "占流通股", className: "num-cell", format: (v) => v != null ? v.toFixed(2) + "%" : "--" },
              ]} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 通用简单表格（支持点击行、排序、分页） */
function SimpleTable({ data, cols, onRowClick, sortKey, sortDir, onSort, pageSize }) {
  const [page, setPage] = useState(1);

  // 排序
  const sorted = sortKey
    ? [...data].sort((a, b) => {
        const va = a[sortKey] ?? 0;
        const vb = b[sortKey] ?? 0;
        const dir = sortDir === "desc" ? -1 : 1;
        return (va > vb ? 1 : va < vb ? -1 : 0) * dir;
      })
    : data;

  // 分页
  const total = sorted.length;
  const ps = pageSize || 0;
  const totalPages = ps > 0 ? Math.ceil(total / ps) : 1;
  const displayData = ps > 0 ? sorted.slice((page - 1) * ps, page * ps) : sorted;
  const safeRow = (row, i) => `${row.code || row.name || "row"}-${i}`;

  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table className="board-table">
          <thead><tr>
            {cols.map((c) => (
              <th
                key={c.key}
                className={`${c.className || ""}${onSort && c.sortable !== false ? " sortable-th" : ""}`}
                onClick={() => onSort && c.sortable !== false ? onSort(c.key) : null}
                style={onSort && c.sortable !== false ? { cursor: "pointer", userSelect: "none" } : undefined}
              >
                {c.label}
                {onSort && sortKey === c.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
              </th>
            ))}
          </tr></thead>
          <tbody>
            {displayData.map((row, i) => (
              <tr
                key={safeRow(row, i)}
                className={onRowClick ? "clickable" : ""}
                onClick={() => onRowClick?.(row)}
              >
                {cols.map((c) => {
                  const raw = row[c.key] ?? "--";
                  const val = c.format ? c.format(raw, row) : raw;
                  const cls = c.pctKey ? (typeof c.pctKey === "string" ? pctClass(row[c.pctKey]) : pctClass(row[c.key])) : "";
                  return <td key={c.key} className={`${c.className || ""} ${cls ? "pct-" + cls : ""}`.trim()}>{typeof val === "object" ? val : String(val)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* 分页器 */}
      {ps > 0 && totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 10, fontSize: 13 }}>
          <button
            className="btn btn-ghost btn-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ‹ 上一页
          </button>
          <span style={{ color: "var(--text-muted)" }}>
            {page} / {totalPages}（共 {total} 条）
          </span>
          <button
            className="btn btn-ghost btn-sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            下一页 ›
          </button>
        </div>
      )}
    </div>
  );
}
