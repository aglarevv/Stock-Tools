/**
 * KLineTraining — K线训练游戏（完整版）
 *
 * 模式：现货做多 / 合约多空杠杆
 * 功能：
 *   - 方向键控制K线前进后退，当前K线画布最右侧
 *   - EMA20 指标线 · 可设置止盈止损自动平仓
 *   - 斐波那契回撤画图工具
 *   - 模拟资金账户（分仓支持）· 每局记录持久化保存
 *   - 模块切换不丢失状态
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { useApi } from "../hooks/useApi.jsx";
import Button from "./Button.jsx";
import Icon from "./Icon.jsx";

// ── 常量 ──
const INITIAL_CANDLES = 5;
const CANDLE_W = 8;
const CANDLE_GAP = 3;
const STEP = CANDLE_W + CANDLE_GAP;
const CHART_PAD = { top: 32, right: 20, bottom: 24, left: 62 };
const VOL_HEIGHT = 50;
const CANVAS_HEIGHT = 420;
const INITIAL_CAPITAL = 1000000;

function calcEMA(data, period = 20) {
  if (!data || data.length === 0) return [];
  const multiplier = 2 / (period + 1);
  const values = [];
  let ema = data[0].close;
  for (let i = 0; i < data.length; i++) {
    ema = (data[i].close - ema) * multiplier + ema;
    values.push(ema);
  }
  return values;
}

// ── 斐波那契层级编辑器子组件 ──
function FibEditor({ value, onChange, onClose }) {
  const [text, setText] = useState(value.join("\n"));
  const [error, setError] = useState("");
  function handleConfirm() {
    const vals = text.split("\n").map(v => parseFloat(v)).filter(v => !isNaN(v));
    if (vals.length < 2) { setError("至少需要2个有效数值"); return; }
    onChange(vals);
    onClose();
  }
  return (
    <div>
      <textarea value={text} onChange={e => { setText(e.target.value); setError(""); }}
        rows={8}
        style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 13, padding: 8,
          border: "1px solid var(--border-default)", borderRadius: 6,
          background: "var(--bg-input)", color: "var(--text-primary)", resize: "vertical" }} />
      {error && <div style={{ color: "var(--loss)", fontSize: 11, marginTop: 4 }}>{error}</div>}
      <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)" }}>
        每行一个数值，正负小数均可，最少2行<br />
        默认：0 / 23.6 / 38.2 / 50 / 61.8 / 100
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
        <Button variant="ghost" size="sm" onClick={() => setText("0\n23.6\n38.2\n50\n61.8\n100")}>恢复默认</Button>
        <Button variant="primary" size="sm" onClick={handleConfirm}>确认</Button>
      </div>
    </div>
  );
}

const FIB_RAINBOW = ["#ef4444","#f97316","#eab308","#22c55e","#3b82f6","#6366f1","#a855f7"];
function saveCache(state) {
  try { window.__KLINE_TRAIN_CACHE__ = state; } catch {}
}
function loadCache() {
  try { return window.__KLINE_TRAIN_CACHE__ || null; } catch { return null; }
}
function clearCache() {
  try { window.__KLINE_TRAIN_CACHE__ = null; } catch {}
}

export default function KLineTraining({ showToast }) {
  const api = useApi();
  const canvasRef = useRef(null);
  const [mode, setMode] = useState("spot");
  const [leverage, setLeverage] = useState(2);
  const [loading, setLoading] = useState(false);
  const [stock, setStock] = useState(null);
  const [revealIdx, setRevealIdx] = useState(0);
  const [positions, setPositions] = useState([]);
  const [trades, setTrades] = useState([]);
  const [capital, setCapital] = useState(INITIAL_CAPITAL);
  const [gameLog, setGameLog] = useState([]);
  const [sessionCount, setSessionCount] = useState(0);
  const [hoverCandle, setHoverCandle] = useState(null);
  // 下单参数
  const [orderQty, setOrderQty] = useState(1);
  const [limitPrice, setLimitPrice] = useState("");
  const [tpPrice, setTpPrice] = useState("");
  const [slPrice, setSlPrice] = useState("");
  // 画图工具
  const [drawingTool, setDrawingTool] = useState("none"); // none | fib | trend | horizontal
  const [drawings, setDrawings] = useState([]); // { type, points[{idx,price}], id }
  const [pendingPoint, setPendingPoint] = useState(null);
  const dragRef = useRef(null); // { point, isDragging } during drag preview
  const [showHistory, setShowHistory] = useState(false);
  const [historySessions, setHistorySessions] = useState([]);
  const [showStartPage, setShowStartPage] = useState(true); // 启动页
  const [loadingMsg, setLoadingMsg] = useState(""); // 加载进度文字
  const [previewTick, setPreviewTick] = useState(0); // 拖拽预览刷新计数器
  const [fibLevels, setFibLevels] = useState([0, 23.6, 38.2, 50, 61.8, 100]); // 斐波那契可编辑层级
  const [showFibEditor, setShowFibEditor] = useState(false);
  const [showEma, setShowEma] = useState(false);
  const [klineCount, setKlineCount] = useState(500);
  const [priceCage, setPriceCage] = useState(false); // 价格笼子 ±2%
  const [dragDrawing, setDragDrawing] = useState(null);
  const [editTPSL, setEditTPSL] = useState(null); // { id, key: 'tpPrice'|'slPrice' }

  // ── refs 用于跨渲染周期保存最新值（解决缓存闭包陈旧问题） ──
  const stateRef = useRef({});
  // 当前局session_id
  const sessionIdRef = useRef("");
  // 是否已保存当前局
  const savedRef = useRef(false);

  const klines = stock?.klines || [];
  const totalVisible = revealIdx + 1;
  const emaValues = useRef([]);

  // EMA
  useEffect(() => {
    if (klines.length > 0) emaValues.current = calcEMA(klines, 20);
  }, [klines]);

  // ── 从缓存恢复 / 每渲染更新ref ──
  useEffect(() => {
    const cached = loadCache();
    if (cached && cached.stock) {
      setStock(cached.stock);
      setRevealIdx(cached.revealIdx || 0);
      setPositions(cached.positions || []);
      setTrades(cached.trades || []);
      setCapital(cached.capital ?? INITIAL_CAPITAL);
      setGameLog(cached.gameLog || []);
      setSessionCount(cached.sessionCount || 0);
      setMode(cached.mode || "spot");
      setLeverage(cached.leverage || 2);
      setDrawings(cached.drawings || []);
      setShowStartPage(false);
      sessionIdRef.current = cached.sessionId || "";
      savedRef.current = cached.saved || false;
    } else {
      setShowStartPage(true);
    }
    return () => {
      saveCache({ ...stateRef.current });
    };
  }, []);

  // 每次渲染后更新ref（确保卸载时存的是最新值）
  useEffect(() => {
    stateRef.current = {
      stock, revealIdx, positions, trades, capital, gameLog, sessionCount,
      mode, leverage, drawings, sessionId: sessionIdRef.current, saved: savedRef.current,
    };
  });

  // ── 保存当前局 ──
  async function saveSession() {
    if (savedRef.current || trades.length === 0) return;
    savedRef.current = true; // 立即标记，防止并发重复保存
    const session_id = sessionIdRef.current || `kt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    sessionIdRef.current = session_id;
    const wins = trades.filter(t => t.pnl > 0);
    try {
      await api.saveKlineSession({
        session_id, mode, stock_code: stock?.code || "", stock_name: stock?.name || "",
        total_klines: klines.length, trades_count: trades.length, win_count: wins.length,
        win_rate: trades.length > 0 ? Math.round((wins.length / trades.length) * 10000) / 100 : 0,
        total_pnl: Math.round(trades.reduce((s, t) => s + t.pnl, 0) * 100) / 100,
        start_capital: INITIAL_CAPITAL, end_capital: Math.round(capital * 100) / 100,
        leverage: mode === "spot" ? 1 : leverage, detail_json: JSON.stringify(trades.slice(-50)),
      });
    } catch {}
  }

  // ── 键盘事件 ──
  useEffect(() => {
    function handleKey(e) {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        advanceCandles(e.shiftKey ? 10 : 1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setRevealIdx(prev => Math.max(INITIAL_CANDLES - 1, prev - (e.shiftKey ? 10 : 1)));
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [klines.length, positions]);

  function advanceCandles(n) {
    setRevealIdx(prev => {
      const next = Math.min(prev + n, klines.length - 1);
      // 检查止盈止损（用ref获取最新positions）
      for (const pos of positionsRef.current) {
        const cur = klines[next]?.close || 0;
        const tp = pos.tpPrice;
        const sl = pos.slPrice;
        if (tp != null || sl != null) {
          if (pos.side === "long") {
            // 多头：TP=价格上涨到tpPrice, SL=价格下跌到slPrice
            if (tp != null && cur >= tp) {
              showToast(`止盈触发 多头 @ ${cur.toFixed(2)}`, "success");
              closePosition(pos.id);
            } else if (sl != null && cur <= sl) {
              showToast(`止损触发 多头 @ ${cur.toFixed(2)}`, "error");
              closePosition(pos.id);
            }
          } else {
            // 空头：TP=价格下跌到tpPrice, SL=价格上涨到slPrice
            if (tp != null && cur <= tp) {
              showToast(`止盈触发 空头 @ ${cur.toFixed(2)}`, "success");
              closePosition(pos.id);
            } else if (sl != null && cur >= sl) {
              showToast(`止损触发 空头 @ ${cur.toFixed(2)}`, "error");
              closePosition(pos.id);
            }
          }
        }
      }
      if (next >= klines.length - 1) {
        showToast("全部K线已展示完毕", "info");
        saveSession();
      }
      return next;
    });
  }

  // Wait - the positions inside advanceCandles closure is stale
  // Let me use a ref for positions
  const positionsRef = useRef([]);
  useEffect(() => { positionsRef.current = positions; }, [positions]);
  const tpPriceRef = useRef("");
  const slPriceRef = useRef("");
  useEffect(() => { tpPriceRef.current = tpPrice; }, [tpPrice]);
  useEffect(() => { slPriceRef.current = slPrice; }, [slPrice]);

  // ── 加载 ──
  async function loadRandom() {
    setLoading(true);
    setLoadingMsg("正在获取股票列表…");
    // 自动保存上一局
    if (trades.length > 0 && !savedRef.current) await saveSession();
    try {
      setLoadingMsg("正在下载K线数据…");
      const res = await api.getRandomKline(klineCount);
      if (!res.ok) { showToast(res.error || "获取失败", "error"); setLoading(false); setLoadingMsg(""); return; }
      const d = res.data;
      if (!d.klines || d.klines.length < 100) {
        showToast("K线数据不足，重试…", "warning");
        setLoadingMsg("数据不足，重新获取…");
        return loadRandom();
      }
      setLoadingMsg("数据处理中…");
      setStock(d);
      setRevealIdx(INITIAL_CANDLES - 1);
      setPositions([]);
      setTrades([]);
      setCapital(INITIAL_CAPITAL);
      setSessionCount(prev => prev + 1);
      setDrawings([]);
      sessionIdRef.current = `kt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      savedRef.current = false;
      setGameLog([{ text: `第${sessionCount + 1}局 · ${d.name}(${d.code}) · ${d.klines.length}根K线`, type: "info" }]);
      setShowStartPage(false);
      setLoading(false);
      setLoadingMsg("");
    } catch (e) { showToast(e.message, "error"); }
    setLoading(false);
  }

  // ── 开仓 ──
  function openPosition(side) {
    const k = klines[revealIdx];
    const price = limitPrice ? Number(limitPrice) : k.close;
    const qty = Math.max(1, orderQty);
    const cost = price * 100 * qty;
    if (cost > capital) {
      showToast(`资金不足！需要 ${cost.toFixed(0)}，可用 ${capital.toFixed(0)}`, "warning");
      return;
    }
    // 价格笼子校验
    if (priceCage) {
      const curPrice = klines[revealIdx].close;
      const pct = ((price - curPrice) / curPrice) * 100;
      if (Math.abs(pct) > 2) {
        showToast(`价格笼子限价：±2% (${curPrice.toFixed(2)})，当前${price.toFixed(2)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`, "warning");
        return;
      }
    }
    const pos = {
      id: Date.now(), side, entryIdx: revealIdx, entryPrice: price, shares: 100 * qty,
      tpPrice: tpPrice ? Number(tpPrice) : null,
      slPrice: slPrice ? Number(slPrice) : null,
    };
    setPositions(prev => [...prev, pos]);
    setCapital(prev => prev - cost);
    const priceLabel = limitPrice ? `限价${price.toFixed(2)}` : `市价${price.toFixed(2)}`;
    const sideLabel = mode === "spot" ? "买入" : (side === "long" ? "做多" : "做空");
    let log = `${sideLabel} ${qty}手 ${priceLabel}（第${revealIdx + 1}根）`;
    if (pos.tpPrice) log += ` TP:${pos.tpPrice}`;
    if (pos.slPrice) log += ` SL:${pos.slPrice}`;
    addLog(log, "long");
  }

  // ── 平仓 ──
  function closePosition(posId) {
    const k = klines[revealIdx];
    const exitPrice = k.close;
    const targetPositions = posId ? positions.filter(p => p.id === posId) : positions;
    if (targetPositions.length === 0) { showToast("无持仓", "warning"); return; }

    let newTrades = [];
    let remainingCapital = 0;

    targetPositions.forEach(pos => {
      const isShort = pos.side === "short";
      let pnl, pnlPct;
      if (mode === "spot") {
        pnl = (exitPrice - pos.entryPrice) * pos.shares;
        pnlPct = ((exitPrice - pos.entryPrice) / pos.entryPrice) * 100;
      } else {
        const multiplier = isShort ? -1 : 1;
        pnl = (exitPrice - pos.entryPrice) * multiplier * leverage * pos.shares;
        pnlPct = ((exitPrice - pos.entryPrice) / pos.entryPrice) * multiplier * leverage * 100;
      }
      newTrades.push({
        side: pos.side, entryIdx: pos.entryIdx, entryPrice: pos.entryPrice,
        exitIdx: revealIdx, exitPrice, pnl: Math.round(pnl * 100) / 100,
        pnlPct: Math.round(pnlPct * 100) / 100, leverage: mode === "contract" ? leverage : 1, mode,
      });
      remainingCapital += pos.entryPrice * pos.shares + pnl;
    });

    setTrades(prev => [...prev, ...newTrades]);
    setCapital(prev => prev + remainingCapital);
    setPositions(prev => posId ? prev.filter(p => p.id !== posId) : prev.filter(p => !targetPositions.find(tp => tp.id === p.id)));
    savedRef.current = false;

    newTrades.forEach(t => {
      const sideLabel = t.side === "long" ? (mode === "spot" ? "买入" : "做多") : "做空";
      addLog(`平${sideLabel} ${t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(0)}元 (${t.pnlPct >= 0 ? "+" : ""}${t.pnlPct.toFixed(2)}%)`, t.pnl >= 0 ? "profit" : "loss");
    });
  }

  function closeAll() {
    if (positions.length === 0) { showToast("无持仓", "warning"); return; }
    closePosition(null);
  }

  function addLog(text, type) {
    setGameLog(prev => [...prev, { text, type }]);
  }

  function resetCapital() {
    setCapital(INITIAL_CAPITAL);
    showToast(`资金已重置为 ¥${(INITIAL_CAPITAL / 10000).toFixed(0)}万`, "success");
  }

  // ── 统计 ──
  const stats = (() => {
    if (trades.length === 0) return { count: 0, wins: 0, winRate: 0, totalPnl: 0, maxWin: 0, maxLoss: 0 };
    const wins = trades.filter(t => t.pnl > 0);
    const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
    return {
      count: trades.length, wins: wins.length,
      winRate: Math.round((wins.length / trades.length) * 100),
      totalPnl: Math.round(totalPnl * 100) / 100,
      maxWin: Math.round(Math.max(0, ...trades.map(t => t.pnl)) * 100) / 100,
      maxLoss: Math.round(Math.min(0, ...trades.map(t => t.pnl)) * 100) / 100,
    };
  })();

  const floatingPnl = (() => {
    if (positions.length === 0) return 0;
    const cur = klines[revealIdx]?.close || 0;
    return positions.reduce((sum, pos) => {
      const raw = pos.side === "long" ? cur - pos.entryPrice : pos.entryPrice - cur;
      return sum + (mode === "contract" ? raw * leverage * pos.shares : raw * pos.shares);
    }, 0);
  })();

  // ── Canvas 绘制 ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || klines.length === 0) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    const ema = emaValues.current;
    const parent = canvas.parentElement;
    const viewW = parent ? parent.clientWidth : 800;

    canvas.style.width = `${viewW}px`;
    canvas.style.height = `${CANVAS_HEIGHT + VOL_HEIGHT}px`;
    canvas.width = viewW * dpr;
    canvas.height = (CANVAS_HEIGHT + VOL_HEIGHT) * dpr;
    ctx.scale(dpr, dpr);

    const maxCandlesInView = Math.floor((viewW - CHART_PAD.left - CHART_PAD.right) / STEP);
    const viewEnd = Math.min(totalVisible, revealIdx + 1);
    const viewStart = Math.max(0, viewEnd - maxCandlesInView);

    let minP = Infinity, maxP = -Infinity, maxV = 0;
    for (let i = viewStart; i < viewEnd; i++) {
      const k = klines[i];
      if (k.low < minP) minP = k.low;
      if (k.high > maxP) maxP = k.high;
      if (k.volume > maxV) maxV = k.volume;
      if (ema[i] != null) {
        if (ema[i] < minP) minP = ema[i];
        if (ema[i] > maxP) maxP = ema[i];
      }
    }
    const priceRange = maxP - minP || 1;
    const pad = priceRange * 0.08;
    minP -= pad;
    maxP += pad;

    const chartH = CANVAS_HEIGHT - CHART_PAD.top - CHART_PAD.bottom;
    const volBottom = CANVAS_HEIGHT + VOL_HEIGHT;

    function priceY(p) { return CHART_PAD.top + chartH * (1 - (p - minP) / (maxP - minP)); }
    function candleX(i) { return CHART_PAD.left + (i - viewStart) * STEP + CANDLE_GAP; }

    ctx.clearRect(0, 0, viewW, CANVAS_HEIGHT + VOL_HEIGHT);
    const bgColor = getComputedStyle(document.documentElement).getPropertyValue("--bg-card").trim() || "#1a1a24";
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, viewW, CANVAS_HEIGHT + VOL_HEIGHT);

    // 网格
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const y = CHART_PAD.top + (chartH / 4) * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(viewW, y); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "10px monospace";
      ctx.textAlign = "right";
      ctx.fillText((maxP - (maxP - minP) * i / 4).toFixed(2), CHART_PAD.left - 6, y + 4);
    }

    // 十字虚线（悬停时）
    if (hoverCandle != null && hoverCandle >= viewStart && hoverCandle < viewEnd) {
      const cx = candleX(hoverCandle) + CANDLE_W / 2;
      const cy = priceY(klines[hoverCandle].close);
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      // 横线
      ctx.beginPath(); ctx.moveTo(CHART_PAD.left, cy); ctx.lineTo(viewW, cy); ctx.stroke();
      // 竖线
      ctx.beginPath(); ctx.moveTo(cx, CHART_PAD.top); ctx.lineTo(cx, CANVAS_HEIGHT + VOL_HEIGHT); ctx.stroke();
      ctx.setLineDash([]);
      // 交叉点圆
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
    }

    // EMA20均线（可选）
    if (showEma && ema.length > 0) {
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let started = false;
      for (let i = viewStart; i < viewEnd; i++) {
        if (ema[i] == null) continue;
        const x = candleX(i) + CANDLE_W / 2;
        const y = priceY(ema[i]);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // 画图：遍历所有已保存的drawing
    drawings.forEach(d => {
      if (d.type === "fib" && d.points.length === 2) {
        const p0 = d.points[0], p1 = d.points[1];
        const fy0 = priceY(p0.price), fy1 = priceY(p1.price);
        const isUp = p1.price > p0.price;
        const fx0 = candleX(p0.idx), fx1 = candleX(p1.idx);
        const fibX = Math.min(fx0, fx1);
        const fibW = Math.abs(fx1 - fx0) + CANDLE_W;
        const fibColors = FIB_RAINBOW.map(c => c + "22");
        for (let li = 0; li < fibLevels.length; li++) {
          const lvl = fibLevels[li] / 100;
          const y = fy0 + (fy1 - fy0) * (isUp ? 1 - lvl : lvl);
          if (li < fibLevels.length - 1) {
            const nextLvl = fibLevels[li + 1] / 100;
            const nextY = fy0 + (fy1 - fy0) * (isUp ? 1 - nextLvl : nextLvl);
            ctx.fillStyle = fibColors[li];
            ctx.fillRect(fibX - CANDLE_GAP, Math.min(y, nextY), fibW + CANDLE_GAP * 2, Math.abs(nextY - y));
          }
          ctx.strokeStyle = FIB_RAINBOW[li % FIB_RAINBOW.length];
          ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.moveTo(fibX - CANDLE_GAP, y); ctx.lineTo(fibX + fibW, y); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = FIB_RAINBOW[li % FIB_RAINBOW.length];
          ctx.font = "9px monospace"; ctx.textAlign = "left";
          const labelPrice = isUp ? p0.price + (p1.price - p0.price) * lvl : p0.price - (p0.price - p1.price) * lvl;
          ctx.fillText(`${fibLevels[li]}% ${labelPrice.toFixed(2)}`, fibX + fibW + 4, y + 3);
        }
      }
      if (d.type === "trend" && d.points.length === 2) {
        const p0 = d.points[0], p1 = d.points[1];
        const x0 = candleX(p0.idx) + CANDLE_W / 2, y0 = priceY(p0.price);
        const x1 = candleX(p1.idx) + CANDLE_W / 2, y1 = priceY(p1.price);
        ctx.strokeStyle = "rgba(147,51,234,0.8)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        // 锚点
        ctx.fillStyle = "rgba(147,51,234,0.8)";
        ctx.beginPath(); ctx.arc(x0, y0, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x1, y1, 4, 0, Math.PI * 2); ctx.fill();
      }
      if (d.type === "fib" && d.points.length === 2) {
        // 在两端绘制锚点
        const p0 = d.points[0], p1 = d.points[1];
        const x0 = candleX(p0.idx) + CANDLE_W / 2, y0 = priceY(p0.price);
        const x1 = candleX(p1.idx) + CANDLE_W / 2, y1 = priceY(p1.price);
        ctx.fillStyle = "rgba(99,102,241,0.9)";
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x0, y0, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(x1, y1, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      if (d.type === "horizontal" && d.points.length === 1) {
        const y = priceY(d.points[0].price);
        ctx.strokeStyle = "rgba(220,38,38,0.6)";
        ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(viewW, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(220,38,38,0.8)";
        ctx.font = "9px monospace"; ctx.textAlign = "left";
        ctx.fillText(`── ${d.points[0].price.toFixed(2)}`, 4, y - 2);
      }
    });

    // 待放置的pending点 + 拖拽预览线
    if (pendingPoint) {
      const x0 = candleX(pendingPoint.idx) + CANDLE_W / 2;
      const y0 = priceY(pendingPoint.price);
      // 起始点标记
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 1.5; ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(x0, y0, 5, 0, Math.PI * 2); ctx.stroke();
      // 拖拽预览
      const dp = dragRef.current;
      if (dp && dp.point) {
        const x1 = candleX(dp.point.idx) + CANDLE_W / 2;
        const y1 = priceY(dp.point.price);
        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.beginPath(); ctx.arc(x1, y1, 4, 0, Math.PI * 2); ctx.fill();
      }
    }

    // K线
    for (let i = viewStart; i < viewEnd; i++) {
      const k = klines[i];
      const x = candleX(i);
      const o = priceY(k.open);
      const c = priceY(k.close);
      const hh = priceY(k.high);
      const ll = priceY(k.low);
      const isUp = k.close >= k.open;

      ctx.strokeStyle = isUp ? "#16a34a" : "#dc2626";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + CANDLE_W / 2, hh); ctx.lineTo(x + CANDLE_W / 2, ll); ctx.stroke();
      const top = Math.min(o, c), bottom = Math.max(o, c);
      ctx.fillStyle = isUp ? "#16a34a" : "#dc2626";
      ctx.fillRect(x, top, CANDLE_W, Math.max(bottom - top, 1));

      if (i > revealIdx) {
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(x - CANDLE_GAP, CHART_PAD.top, STEP, chartH);
      }
      if (i === revealIdx) {
        ctx.strokeStyle = "rgba(99,102,241,0.6)";
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(x - CANDLE_GAP, CHART_PAD.top, STEP, chartH);
        ctx.setLineDash([]);
      }
    }

    // 持仓标记 (B)
    positions.forEach(pos => {
      if (pos.entryIdx < viewStart || pos.entryIdx >= viewEnd) return;
      const x = candleX(pos.entryIdx) + CANDLE_W / 2;
      const y = priceY(pos.entryPrice);
      ctx.fillStyle = pos.side === "long" ? "#16a34a" : "#dc2626";
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 8px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("B", x, y + 3);
    });

    // 平仓标记 (S)
    trades.forEach(t => {
      const ei = t.entryIdx;
      const xi = t.exitIdx;
      if (ei >= viewStart && ei < viewEnd) {
        const x = candleX(ei) + CANDLE_W / 2;
        const y = priceY(t.entryPrice);
        ctx.fillStyle = t.pnl >= 0 ? "rgba(22,163,74,0.5)" : "rgba(220,38,38,0.5)";
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      }
      if (xi >= viewStart && xi < viewEnd) {
        const x = candleX(xi) + CANDLE_W / 2;
        const y = priceY(t.exitPrice);
        ctx.fillStyle = "#dc2626";
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("S", x, y + 4);
      }
    });

    // 成交量
    for (let i = viewStart; i < viewEnd; i++) {
      const k = klines[i];
      const x = candleX(i) + 1;
      const vh = (k.volume / (maxV || 1)) * VOL_HEIGHT * 0.85;
      ctx.fillStyle = k.close >= k.open ? "rgba(22,163,74,0.25)" : "rgba(220,38,38,0.25)";
      ctx.fillRect(x, volBottom - vh, CANDLE_W - 2, vh);
    }

    // 日期
    const labelStep = Math.max(1, Math.floor((viewEnd - viewStart) / 8));
    for (let i = viewStart; i < viewEnd; i += labelStep) {
      const x = candleX(i) + CANDLE_W / 2;
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "9px monospace";
      ctx.textAlign = "center";
      ctx.fillText((klines[i].date || "").slice(5, 10), x, CANVAS_HEIGHT + VOL_HEIGHT - 4);
    }

    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "9px monospace";
    ctx.textAlign = "right";
    ctx.fillText("Vol", viewW - CHART_PAD.right + 10, CANVAS_HEIGHT - 2);
  }, [klines, totalVisible, positions, trades, hoverCandle, revealIdx, emaValues, drawings, pendingPoint, previewTick, fibLevels, showEma, dragDrawing]);

  // ── 辅助：获取鼠标位置的K线索引和价格 ──
  function getHoverInfo(e) {
    const canvas = canvasRef.current;
    if (!canvas || klines.length === 0) return null;
    const rect = canvas.getBoundingClientRect();
    const chartH = CANVAS_HEIGHT - CHART_PAD.top - CHART_PAD.bottom;
    const maxCandlesInView = Math.floor((canvas.clientWidth - CHART_PAD.left - CHART_PAD.right) / STEP);
    const viewEnd = Math.min(totalVisible, revealIdx + 1);
    const viewStart = Math.max(0, viewEnd - maxCandlesInView);
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top - CHART_PAD.top;
    const idx = Math.round((mx - CHART_PAD.left - CANDLE_W / 2) / STEP);
    const actualIdx = viewStart + idx;
    if (actualIdx < 0 || actualIdx >= klines.length || actualIdx > revealIdx) return null;
    // 价格从Y坐标反算（不再吸附到收盘价）
    let minP = Infinity, maxP = -Infinity;
    const ema = emaValues.current;
    for (let i = viewStart; i < viewEnd; i++) {
      if (klines[i].low < minP) minP = klines[i].low;
      if (klines[i].high > maxP) maxP = klines[i].high;
      if (ema[i] != null) { if (ema[i] < minP) minP = ema[i]; if (ema[i] > maxP) maxP = ema[i]; }
    }
    const priceRange = maxP - minP || 1;
    const pad = priceRange * 0.08;
    minP -= pad; maxP += pad;
    const price = maxP - (my / chartH) * (maxP - minP);
    return { idx: actualIdx, price: Math.round(price * 100) / 100 };
  }

  // ── 检测鼠标是否靠近某画图锚点 ──
  function findNearDrawPoint(e) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const viewEnd2 = Math.min(totalVisible, revealIdx + 1);
    const maxC = Math.floor((canvas.clientWidth - CHART_PAD.left - CHART_PAD.right) / STEP);
    const vs = Math.max(0, viewEnd2 - maxC);
    const chartH2 = CANVAS_HEIGHT - CHART_PAD.top - CHART_PAD.bottom;
    let minP2 = Infinity, maxP2 = -Infinity;
    for (let i = vs; i < viewEnd2; i++) {
      if (klines[i].low < minP2) minP2 = klines[i].low;
      if (klines[i].high > maxP2) maxP2 = klines[i].high;
    }
    const pr2 = maxP2 - minP2 || 1;
    const pad2 = pr2 * 0.08;
    minP2 -= pad2; maxP2 += pad2;
    for (const d of drawings) {
      for (let pi = 0; pi < d.points.length; pi++) {
        const pt = d.points[pi];
        const px = CHART_PAD.left + (pt.idx - vs) * STEP + CANDLE_W / 2;
        const py = CHART_PAD.top + chartH2 * (1 - (pt.price - minP2) / (maxP2 - minP2));
        if (Math.sqrt((mx - px) ** 2 + (my - py) ** 2) < 10) return { id: d.id, pointIdx: pi };
      }
    }
    return null;
  }

  const handleMouseDown = useCallback((e) => {
    // 任何模式下都能拖拽已有画图锚点
    const near = findNearDrawPoint(e);
    if (near) { setDragDrawing(near); return; }
    if (drawingTool === "none" || !stock) return;
    const info = getHoverInfo(e);
    if (!info) return;
    if (drawingTool === "horizontal") {
      setDrawings(prev => [...prev, { type: drawingTool, points: [info], id: Date.now() }]);
      return;
    }
    setPendingPoint(info);
    dragRef.current = { point: info, isDragging: true };
  }, [drawingTool, stock, drawings, klines, totalVisible, revealIdx]);

  const handleMouseMove = useCallback((e) => {
    if (klines.length === 0) return;
    if (dragDrawing) {
      const info = getHoverInfo(e);
      if (info) {
        setDrawings(prev => prev.map(d =>
          d.id === dragDrawing.id
            ? { ...d, points: d.points.map((p, i) => i === dragDrawing.pointIdx ? info : p) }
            : d
        ));
        setPreviewTick(t => t + 1);
      }
      return;
    }
    if (dragRef.current?.isDragging) {
      const info = getHoverInfo(e);
      if (info) { dragRef.current.point = info; setPreviewTick(t => t + 1); }
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const maxCandlesInView = Math.floor((canvas.clientWidth - CHART_PAD.left - CHART_PAD.right) / STEP);
    const viewEnd = Math.min(totalVisible, revealIdx + 1);
    const viewStart = Math.max(0, viewEnd - maxCandlesInView);
    const idx = Math.round((mx - CHART_PAD.left - CANDLE_W / 2) / STEP);
    setHoverCandle(idx >= 0 && idx < totalVisible ? viewStart + idx : null);
  }, [klines, totalVisible, revealIdx, dragDrawing]);

  const handleMouseUp = useCallback((e) => {
    if (dragDrawing) { setDragDrawing(null); return; }
    if (!pendingPoint || drawingTool === "horizontal") return;
    const info = getHoverInfo(e);
    if (info && dragRef.current) {
      setDrawings(prev => [...prev, { type: drawingTool, points: [pendingPoint, info], id: Date.now() }]);
    }
    setPendingPoint(null);
    dragRef.current = null;
  }, [pendingPoint, drawingTool, dragDrawing]);

  // ── 历史记录 ──
  async function loadHistory() {
    try {
      const res = await api.getKlineSessions();
      if (res.ok) setHistorySessions(res.data || []);
    } catch {}
    setShowHistory(true);
  }

  // ── 初始加载 ──
  useEffect(() => {
    // 缓存恢复由上面的 useEffect 处理
  }, []);

  return (
    <div className="page" tabIndex={-1} style={{ outline: "none" }}>
      {/* ── 启动页 ── */}
      {showStartPage && !stock && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 500, gap: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 8, color: "var(--accent)" }}><Icon name="candlestick" size={48} /></div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>K线训练</h2>
          {loading ? (
            <div style={{ textAlign: "center", gap: 12, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div className="btn-spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{loadingMsg || "加载中…"}</div>
            </div>
          ) : (<>
          <p style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 360, textAlign: "center", lineHeight: 1.6 }}>
            从A股真实数据中随机抽取K线，模拟交易训练<br />
            支持现货做多 / 合约多空杠杆 · 止盈止损自动平仓
          </p>
          <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
            <Button variant="primary" size="sm" style={{ padding: "12px 32px", fontSize: 15 }} onClick={loadRandom}>
              <Icon name="dice" size={18} /> 开始训练
            </Button>
            <Button variant="ghost" size="sm" style={{ padding: "12px 32px", fontSize: 15 }} onClick={loadHistory}>
              <Icon name="history" size={18} /> 查看历史
            </Button>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 12 }}>
            方向键 ← → 移动K线 · Shift加速 · 画图工具自由拖拽
          </div>
          </>
          )}
        </div>
      )}

      {/* ── 主界面 ── */}
      {(!showStartPage || stock) && (<>
      <div className="topbar">
        <h1 className="topbar-title"><Icon name="candlestick" size={22} /> K线训练</h1>
        <div className="topbar-actions">
          <Button variant="ghost" size="sm" onClick={loadRandom} disabled={loading}>
            {loading ? "加载中…" : <><Icon name="dice" size={14} /> 新一局</>}
          </Button>
          <Button variant="ghost" size="sm" onClick={loadHistory}><Icon name="history" size={14} /> 历史</Button>
        </div>
      </div>

      {/* ── 资金/模式/杠杆 ── */}
      <div className="filter-row">
        <div className="metric-card metric-base" style={{ padding: "6px 14px", margin: 0, display: "flex", gap: 16, alignItems: "center" }}>
          <div><span style={{ fontSize: 10, color: "var(--text-muted)" }}>资金</span>
            <span style={{ fontWeight: 700, fontFamily: "var(--font-mono)", fontSize: 15, color: capital >= 0 ? "var(--profit)" : "var(--loss)", marginLeft: 4 }}>¥{capital.toFixed(0)}</span>
          </div>
          <div style={{ width: 1, height: 20, background: "var(--border-subtle)" }} />
          <div><span style={{ fontSize: 10, color: "var(--text-muted)" }}>浮动</span>
            <span style={{ fontWeight: 700, fontFamily: "var(--font-mono)", fontSize: 15, color: floatingPnl >= 0 ? "var(--profit)" : "var(--loss)", marginLeft: 4 }}>
              {floatingPnl >= 0 ? "+" : ""}{floatingPnl.toFixed(0)}
            </span>
          </div>
          <div style={{ width: 1, height: 20, background: "var(--border-subtle)" }} />
          <div><span style={{ fontSize: 10, color: "var(--text-muted)" }}>总资产</span>
            <span style={{ fontWeight: 700, fontFamily: "var(--font-mono)", fontSize: 15, marginLeft: 4 }}>¥{(capital + floatingPnl).toFixed(0)}</span>
          </div>
          <Button variant="ghost" size="sm" style={{ fontSize: 9, padding: "2px 8px" }} onClick={resetCapital}><Icon name="refresh" size={12} /> 重置</Button>
        </div>
        <div className="tab-bar">
          <button className={`tab-btn${mode === "spot" ? " active" : ""}`} onClick={() => setMode("spot")}>现货</button>
          <button className={`tab-btn${mode === "contract" ? " active" : ""}`} onClick={() => setMode("contract")}>合约</button>
        </div>
        {mode === "contract" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            <span style={{ color: "var(--text-muted)" }}>杠杆</span>
            <input type="range" min={1} max={10} step={1} value={leverage}
              onChange={e => setLeverage(Number(e.target.value))} style={{ width: 70 }} />
            <span style={{ fontWeight: 600, fontFamily: "var(--font-mono)", fontSize: 13 }}>{leverage}x</span>
          </div>
        )}
        <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-secondary)", display: "flex", gap: 8, alignItems: "center" }}>
          {stock && `${stock.name} ${stock.code} · ${revealIdx + 1}/${klines.length}`}
          <select value={klineCount} onChange={e => setKlineCount(Number(e.target.value))}
            style={{ fontSize: 10, fontFamily: "var(--font-mono)", padding: "2px 4px", border: "1px solid var(--border-subtle)", borderRadius: 4, background: "var(--bg-input)", color: "var(--text-secondary)" }}>
            <option value={500}>500根</option>
            <option value={1000}>1000根</option>
            <option value={1500}>1500根</option>
            <option value={2000}>2000根</option>
            <option value={3000}>3000根</option>
          </select>
        </div>
      </div>

      {/* ── 交易统计 ── */}
      {trades.length > 0 && (
        <div className="metrics-row" style={{ marginBottom: 0 }}>
          <div className="metric-card metric-base" style={{ padding: "8px 14px" }}>
            <div className="metric-label">交易</div>
            <div className="metric-value" style={{ fontSize: 16 }}>{stats.count}</div>
            <div className="metric-desc">开 {positions.length + trades.length} / 平 {trades.length}</div>
          </div>
          <div className={`metric-card ${stats.winRate >= 50 ? "metric-profit" : "metric-loss"}`} style={{ padding: "8px 14px" }}>
            <div className="metric-label">胜率</div>
            <div className="metric-value" style={{ fontSize: 16 }}>{stats.winRate}%</div>
            <div className="metric-desc">{stats.wins}胜 {stats.count - stats.wins}负</div>
          </div>
          <div className={`metric-card ${stats.totalPnl >= 0 ? "metric-profit" : "metric-loss"}`} style={{ padding: "8px 14px" }}>
            <div className="metric-label">累计盈亏</div>
            <div className={`metric-value ${stats.totalPnl >= 0 ? "green" : "red"}`} style={{ fontSize: 16 }}>
              {stats.totalPnl >= 0 ? "+" : ""}{stats.totalPnl}
            </div>
          </div>
        </div>
      )}

      {/* ── 主区域：画图工具栏 + K线图 + 交易面板 ── */}
      <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
        {/* 画图工具条 */}
        {stock && (
          <div className="card" style={{ width: 40, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 0", gap: 4 }}>
            {[
              { id: "none", icon: "↖", tip: "鼠标" },
              { id: "fib", icon: "F", tip: "斐波那契" },
              { id: "trend", icon: "╱", tip: "趋势线" },
              { id: "horizontal", icon: "─", tip: "水平线" },
            ].map(t => (
              <button key={t.id} onClick={() => { setDrawingTool(t.id === drawingTool ? "none" : t.id); setPendingPoint(null); }}
                title={t.tip}
                style={{
                  width: 30, height: 30, borderRadius: 4, border: "1px solid var(--border-subtle)",
                  background: drawingTool === t.id ? "var(--accent)" : "transparent",
                  color: drawingTool === t.id ? "#fff" : "var(--text-secondary)",
                  cursor: "pointer", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "var(--font-mono)",
                }}>
                {t.icon}
              </button>
            ))}
            {drawings.length > 0 && (
            <button onClick={() => { setDrawings([]); setPendingPoint(null); }}
              title="清除画图"
              style={{
                width: 30, height: 30, borderRadius: 4, border: "1px solid var(--loss)",
                background: "transparent", color: "var(--loss)", cursor: "pointer",
                fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center",
                marginTop: 4,
              }}>
              ✕
            </button>
            )}
            {drawingTool === "fib" && (
            <button onClick={() => setShowFibEditor(true)}
              title="编辑斐波那契层级"
              style={{
                width: 30, height: 30, borderRadius: 4, border: "1px solid var(--accent)",
                background: "var(--accent-soft)", color: "var(--accent)", cursor: "pointer",
                fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center",
              }}>
              %
            </button>
            )}
            </div>
        )}

        {/* K线图 */}
        <div className="card" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {stock && (
            <div style={{ padding: "6px 14px", borderBottom: "1px solid var(--border-subtle)", fontSize: 11, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", background: "var(--accent-soft)" }}>
              <div><span style={{ color: "var(--text-muted)" }}>📅 </span><strong>{klines[revealIdx]?.date || "-"}</strong></div>
              <div><span style={{ color: "var(--text-muted)" }}>O </span><strong>{klines[revealIdx]?.open.toFixed(2)}</strong></div>
              <div><span style={{ color: "var(--text-muted)" }}>H </span><strong style={{ color: "var(--profit)" }}>{klines[revealIdx]?.high.toFixed(2)}</strong></div>
              <div><span style={{ color: "var(--text-muted)" }}>L </span><strong style={{ color: "var(--loss)" }}>{klines[revealIdx]?.low.toFixed(2)}</strong></div>
              <div><span style={{ color: "var(--text-muted)" }}>C </span><strong className={(() => { const k = klines[revealIdx]; if (!k) return ""; return k.close >= k.open ? "green" : "red"; })()}>{klines[revealIdx]?.close.toFixed(2)}</strong></div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ color: "var(--text-muted)", fontSize: 10, cursor: "pointer", userSelect: "none" }}
                  onClick={() => setShowEma(!showEma)}>
                  <span style={{ opacity: showEma ? 1 : 0.4 }}>EMA20</span>
                </span>
                <strong style={{ color: "#f59e0b" }}>{emaValues.current[revealIdx]?.toFixed(2) || "-"}</strong>
              </div>
            </div>
          )}
          <div className="card-body" style={{ padding: 0, overflow: "hidden" }}>
            {!stock ? (
              <div className="empty-text" style={{ height: 420, display: "flex", alignItems: "center", justifyContent: "center" }}>加载中…</div>
            ) : (
              <canvas ref={canvasRef} onMouseMove={handleMouseMove} onMouseLeave={() => { setHoverCandle(null); }}
                onMouseDown={handleMouseDown} onMouseUp={handleMouseUp}
                style={{ cursor: drawingTool !== "none" ? "crosshair" : "default", display: "block", width: "100%" }} />
            )}
          </div>
          {stock && (
            <div style={{ padding: "4px 14px", borderTop: "1px solid var(--border-subtle)", fontSize: 10, display: "flex", gap: 14, alignItems: "center", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              <span>涨跌: <strong className={(() => { const k = klines[revealIdx]; if (!k) return ""; return k.close >= k.open ? "green" : "red"; })()}>
                {(() => { const k = klines[revealIdx]; if (!k) return "-"; const chg = ((k.close - k.open) / k.open * 100); return (chg >= 0 ? "+" : "") + chg.toFixed(2) + "%"; })()}
              </strong></span>
              <span>振幅: <strong>{klines[revealIdx]?.amplitude?.toFixed(2) || "-"}%</strong></span>
              <span>量: <strong>{klines[revealIdx] ? (klines[revealIdx].volume / 10000).toFixed(0) + "万" : "-"}</strong></span>
              <span style={{ marginLeft: "auto" }}>← → 移动</span>
            </div>
          )}
          {/* Hover tooltip bar (始终占位) */}
          <div style={{ padding: "4px 14px", borderTop: "1px solid var(--border-subtle)", fontSize: 11, display: "flex", gap: 16, alignItems: "center", background: hoverCandle != null ? "var(--bg-hover)" : "transparent", flexWrap: "wrap", minHeight: 28 }}>
            {hoverCandle != null && klines[hoverCandle] ? (
              <>
                <span style={{ color: "var(--text-muted)" }}>📅 {klines[hoverCandle].date}</span>
                <span>O: <strong>{klines[hoverCandle].open.toFixed(2)}</strong></span>
                <span>H: <strong style={{ color: "var(--profit)" }}>{klines[hoverCandle].high.toFixed(2)}</strong></span>
                <span>L: <strong style={{ color: "var(--loss)" }}>{klines[hoverCandle].low.toFixed(2)}</strong></span>
                <span>C: <strong className={klines[hoverCandle].close >= klines[hoverCandle].open ? "green" : "red"}>{klines[hoverCandle].close.toFixed(2)}</strong></span>
                <span>量: <strong>{(klines[hoverCandle].volume / 10000).toFixed(0)}万</strong></span>
                {emaValues.current[hoverCandle] != null && (
                  <span>EMA20: <strong style={{ color: "#f59e0b" }}>{emaValues.current[hoverCandle].toFixed(2)}</strong></span>
                )}
              </>
            ) : (
              <span style={{ color: "var(--text-muted)", opacity: 0.3 }}>鼠标悬停K线查看详情</span>
            )}
          </div>
        </div>

        {/* 交易面板 */}
        {stock && (
          <div className="card" style={{ width: 280, flexShrink: 0, display: "flex", flexDirection: "column" }}>
            <div className="card-body" style={{ padding: "12px 14px" }}>
              <div className="form-field" style={{ marginBottom: 6 }}>
                <label style={{ fontSize: 9 }}>手数</label>
                <input type="number" min={1} value={orderQty}
                  onChange={e => setOrderQty(Math.max(1, Number(e.target.value) || 1))}
                  style={{ fontFamily: "var(--font-mono)", fontSize: 12, minHeight: 28, padding: "0 8px" }} />
              </div>
              <div className="form-field" style={{ marginBottom: 6 }}>
                <label style={{ fontSize: 9 }}>限价（空=市价）</label>
                <input type="number" step="0.01" value={limitPrice}
                  onChange={e => setLimitPrice(e.target.value)}
                  placeholder={`${klines[revealIdx]?.close.toFixed(2) || ""}`}
                  style={{ fontFamily: "var(--font-mono)", fontSize: 12, minHeight: 28, padding: "0 8px" }} />
              </div>
              <div className="form-field" style={{ marginBottom: 6 }}>
                <label style={{ fontSize: 9, color: "var(--profit)" }}>止盈 TP</label>
                <input type="number" step="0.01" value={tpPrice}
                  onChange={e => setTpPrice(e.target.value)} placeholder="自动平仓"
                  style={{ fontFamily: "var(--font-mono)", fontSize: 12, minHeight: 28, padding: "0 8px", borderColor: "var(--profit)" }} />
              </div>
              <div className="form-field" style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 9, color: "var(--loss)" }}>止损 SL</label>
                <input type="number" step="0.01" value={slPrice}
                  onChange={e => setSlPrice(e.target.value)} placeholder="自动平仓"
                  style={{ fontFamily: "var(--font-mono)", fontSize: 12, minHeight: 28, padding: "0 8px", borderColor: "var(--loss)" }} />
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <label style={{ fontSize: 9, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                  <input type="checkbox" checked={priceCage} onChange={e => setPriceCage(e.target.checked)} />
                  <span style={{ color: priceCage ? "var(--accent)" : "var(--text-muted)" }}>价格笼子 ±2%</span>
                </label>
              </div>
              <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                <Button variant="primary" size="sm" style={{ flex: 1, fontSize: 11 }} onClick={() => openPosition("long")}>
                  <Icon name="trending-up" size={14} /> {mode === "spot" ? "买入" : "做多"}
                </Button>
                {mode === "contract" && (
                  <Button variant="ghost" size="sm" style={{ flex: 1, fontSize: 11, color: "var(--loss)", borderColor: "var(--loss)" }} onClick={() => openPosition("short")}>
                    <Icon name="trending-down" size={14} /> 做空
                  </Button>
                )}
              </div>
              {positions.length > 0 && (
                <Button variant="ghost" size="sm" style={{ width: "100%", fontSize: 11, color: "var(--warning)", marginBottom: 8 }} onClick={closeAll}>
                  <Icon name="lock" size={12} /> 全平 ({positions.length}仓)
                </Button>
              )}
              <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 8, marginBottom: 4 }}>
                <div style={{ display: "flex", gap: 3 }}>
                  <Button variant="ghost" size="sm" style={{ flex: 1, fontSize: 9, padding: "3px 4px" }}
                    onClick={() => advanceCandles(1)} disabled={revealIdx >= klines.length - 1}>→1</Button>
                  <Button variant="ghost" size="sm" style={{ flex: 1, fontSize: 9, padding: "3px 4px" }}
                    onClick={() => advanceCandles(10)} disabled={revealIdx >= klines.length - 1}>→10</Button>
                  <Button variant="ghost" size="sm" style={{ flex: 1, fontSize: 9, padding: "3px 4px" }}
                    onClick={() => setRevealIdx(Math.min(revealIdx + 50, klines.length - 1))} disabled={revealIdx >= klines.length - 1}>→50</Button>
                  <Button variant="ghost" size="sm" style={{ flex: 1, fontSize: 9, padding: "3px 4px" }}
                    onClick={() => setRevealIdx(klines.length - 1)} disabled={revealIdx >= klines.length - 1}>→末</Button>
                </div>
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center" }}>
                K线 {revealIdx + 1}/{klines.length} · 1手≈¥{((klines[revealIdx]?.close || 0) * 100).toFixed(0)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 持仓列表 ── */}
      {positions.length > 0 && (
        <div className="card">
          <div className="card-header"><h2><Icon name="pin" size={14} /> 持仓 ({positions.length})</h2></div>
          <div className="card-body" style={{ padding: 0 }}>
            <table className="data-table" style={{ fontSize: 11 }}>
              <thead><tr><th>方向</th><th>开仓价</th><th>现价</th><th>浮动</th><th>TP/SL</th><th></th></tr></thead>
              <tbody>
                {positions.map(p => {
                  const cur = klines[revealIdx]?.close || 0;
                  const raw = p.side === "long" ? cur - p.entryPrice : p.entryPrice - cur;
                  const pnl = mode === "contract" ? raw * leverage * p.shares : raw * p.shares;
                  return (
                    <tr key={p.id}>
                      <td><span className={p.side === "long" ? "green" : "red"}><Icon name="trending-up" size={10} />多</span></td>
                      <td>{p.entryPrice.toFixed(2)}</td>
                      <td>{cur.toFixed(2)}</td>
                      <td className={pnl >= 0 ? "green" : "red"}>{pnl >= 0 ? "+" : ""}{pnl.toFixed(0)}</td>
                      <td style={{ fontSize: 10 }}>
                        {p.tpPrice != null ? <span style={{ color: "var(--profit)", cursor: "pointer" }} onClick={() => setEditTPSL({ id: p.id, key: "tpPrice" })}>▲{p.tpPrice}</span> : <span style={{ color: "var(--text-muted)", cursor: "pointer", opacity: 0.5 }} onClick={() => setEditTPSL({ id: p.id, key: "tpPrice" })}>TP</span>}
                        {p.tpPrice != null && p.slPrice != null ? " " : ""}
                        {p.slPrice != null ? <span style={{ color: "var(--loss)", cursor: "pointer" }} onClick={() => setEditTPSL({ id: p.id, key: "slPrice" })}>▼{p.slPrice}</span> : <span style={{ color: "var(--text-muted)", cursor: "pointer", opacity: 0.5, marginLeft: 4 }} onClick={() => setEditTPSL({ id: p.id, key: "slPrice" })}>SL</span>}
                        {editTPSL?.id === p.id && (
                          <input
                            type="number" step="0.01"
                            autoFocus
                            defaultValue={p[editTPSL.key] || ""}
                            onBlur={e => {
                              const val = e.target.value ? Number(e.target.value) : null;
                              setPositions(prev => prev.map(pos => pos.id === p.id ? { ...pos, [editTPSL.key]: val } : pos));
                              setEditTPSL(null);
                            }}
                            onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditTPSL(null); }}
                            style={{ width: 60, fontSize: 10, fontFamily: "var(--font-mono)", padding: "1px 4px", marginLeft: 2, border: "1px solid var(--accent)", borderRadius: 3, background: "var(--bg-input)", color: "var(--text-primary)" }}
                            onClick={e => e.stopPropagation()}
                          />
                        )}
                      </td>
                      <td><Button variant="ghost" size="sm" style={{ color: "var(--loss)", fontSize: 10 }} onClick={() => closePosition(p.id)}>平</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 操作日志 + 交易记录 ── */}
      <div className="content-grid">
        <div className="card">
          <div className="card-header"><h2><Icon name="clipboard-list" size={14} /> 操作日志</h2></div>
          <div className="card-body" style={{ maxHeight: 200, overflowY: "auto", padding: "6px 14px" }}>
            {gameLog.length === 0 ? <div className="empty-text">暂无</div> : (
              gameLog.map((log, i) => (
                <div key={i} style={{
                  fontSize: 11, padding: "3px 0", borderBottom: "1px solid var(--border-subtle)",
                  color: log.type === "profit" ? "var(--profit)" : log.type === "loss" ? "var(--loss)"
                    : log.type === "long" ? "var(--accent)" : "var(--text-secondary)"
                }}>{log.text}</div>
              ))
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h2><Icon name="bar-chart-2" size={14} /> 交易记录 ({trades.length})</h2></div>
          <div className="card-body" style={{ maxHeight: 200, overflowY: "auto", padding: 0 }}>
            {trades.length === 0 ? <div className="empty-text">暂无</div> : (
              <table className="data-table" style={{ fontSize: 10 }}>
                <thead><tr><th>#</th><th>方向</th><th>开仓</th><th>平仓</th><th>盈亏</th><th>%</th></tr></thead>
                <tbody>
                  {[...trades].reverse().map((t, i) => (
                    <tr key={i}>
                      <td>{trades.length - i}</td>
                      <td><span className={t.side === "long" ? "green" : "red"}>{t.side === "long" ? "多" : "空"}</span></td>
                      <td>{t.entryPrice.toFixed(2)}</td>
                      <td>{t.exitPrice.toFixed(2)}</td>
                      <td className={t.pnl >= 0 ? "green" : "red"}>{t.pnl >= 0 ? "+" : ""}{t.pnl.toFixed(0)}</td>
                      <td className={t.pnlPct >= 0 ? "green" : "red"}>{t.pnlPct >= 0 ? "+" : ""}{t.pnlPct.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      </>
      )}

      {/* ── 斐波那契层级编辑器 ── */}
      {showFibEditor && (
        <div className="modal-overlay" onClick={() => setShowFibEditor(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3><Icon name="calculator" size={18} /> 斐波那契层级</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowFibEditor(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                每行一个数值，按回车换行
              </p>
              <FibEditor value={fibLevels} onChange={v => setFibLevels(v)} onClose={() => setShowFibEditor(false)} />
            </div>
          </div>
        </div>
      )}

      {/* ── 历史记录弹窗 ── */}
      {showHistory && (
        <div className="modal-overlay" onClick={() => setShowHistory(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700, maxHeight: "80vh" }}>
            <div className="modal-header">
              <h3><Icon name="history" size={18} /> 训练历史记录</h3>
              <Button variant="ghost" size="sm" onClick={() => { if (confirm("确认清除全部历史？")) { api.deleteKlineSession(); setHistorySessions([]); } }} style={{ fontSize: 10, color: "var(--loss)" }}>清除全部</Button>
              <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)}>✕</Button>
            </div>
            <div className="modal-body" style={{ padding: 0, maxHeight: "calc(80vh - 60px)", overflowY: "auto" }}>
              {historySessions.length === 0 ? (
                <div className="empty-text" style={{ padding: 24 }}>暂无记录</div>
              ) : (
                <table className="data-table" style={{ fontSize: 11 }}>
                  <thead><tr><th>时间</th><th>股票</th><th>模式</th><th>杠杆</th><th>交易</th><th>胜率</th><th>盈亏</th><th>本金</th><th>余额</th></tr></thead>
                  <tbody>
                    {historySessions.map(s => (
                      <tr key={s.id}>
                        <td style={{ whiteSpace: "nowrap" }}>{(s.created_at || "").slice(0, 16)}</td>
                        <td>{s.stock_name || s.stock_code}</td>
                        <td>{s.mode === "contract" ? "合约" : "现货"}</td>
                        <td>{s.leverage}x</td>
                        <td>{s.trades_count}</td>
                        <td className={s.win_rate >= 50 ? "green" : "red"}>{s.win_rate}%</td>
                        <td className={Number(s.total_pnl) >= 0 ? "green" : "red"}>{Number(s.total_pnl) >= 0 ? "+" : ""}{Number(s.total_pnl).toFixed(0)}</td>
                        <td>{Number(s.start_capital).toFixed(0)}</td>
                        <td>{Number(s.end_capital).toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
