import { useState } from "react";
import Icon from "./Icon.jsx";
import Button from "./Button.jsx";

// ═══════════════════════════════════════════════════════════════
// 基础K线 + 量能柱组件 — 纯 SVG 线条绘制，红涨绿跌
// ═══════════════════════════════════════════════════════════════

const RED = "#dc2626", GREEN = "#16a34a", GRAY = "#6b7280";

/** 单根K线 */
function Candle({ o, h, l, c, x, w, H = 100, yOff = 0 }) {
  const bodyTop = yOff + Math.min(o, c) * H / 100;
  const bodyH = Math.abs(c - o) * H / 100 || 1;
  const cx = x + w / 2;
  const isBull = c > o, isBear = c < o;
  const clr = isBull ? RED : isBear ? GREEN : GRAY;
  const fill = isBull ? RED : isBear ? GREEN : "none";
  return (
    <g>
      <line x1={cx} y1={yOff + h * H / 100} x2={cx} y2={yOff + l * H / 100} stroke={clr} strokeWidth={1.2} strokeLinecap="round" />
      <rect x={x + w * 0.2} y={bodyTop} width={w * 0.6} height={bodyH} rx={isBull || isBear ? 1.2 : 0} fill={fill} stroke={clr} strokeWidth={1.2} />
    </g>
  );
}

/** 一组K线水平排列 */
function Candles({ bars, w = 16, gap = 5, H = 100, yOff = 0 }) {
  return (
    <g>
      {bars.map((b, i) => <Candle key={i} o={b.o} h={b.h} l={b.l} c={b.c} x={i * (w + gap)} w={w} H={H} yOff={yOff} />)}
    </g>
  );
}

/** 量能柱（红涨绿跌）+ 50% 参考线（区分放量/缩量） */
function VolumeBars({ bars, volumes, w = 16, gap = 5, H = 30, yOff = 0, maxV = 100 }) {
  const totalW = bars.length * (w + gap) - gap;
  const refY = yOff + H * 0.5; // 50% 参考线
  return (
    <g>
      {/* 50% 参考线：上方=放量区，下方=缩量区 */}
      <line x1={0} y1={refY} x2={totalW} y2={refY} stroke={GRAY} strokeWidth={0.6} strokeDasharray="4,3" opacity={0.5} />
      <text x={totalW + 2} y={refY - 3} fontSize={6} fill={GRAY} opacity={0.6}>放量</text>
      <text x={totalW + 2} y={refY + 9} fontSize={6} fill={GRAY} opacity={0.6}>缩量</text>
      {bars.map((b, i) => {
        const v = (volumes && volumes[i]) || 50;
        const barH = Math.max(2, v / maxV * H);
        const isBull = b.c > b.o;
        const clr = isBull ? RED : GREEN;
        const x = i * (w + gap);
        return <rect key={i} x={x + w * 0.2} y={yOff + H - barH} width={w * 0.6} height={barH} rx={1} fill={clr} opacity={0.75} />;
      })}
    </g>
  );
}

/** 组合图：K线（上）+ 量能柱（下，含放量/缩量参考线） */
function KlineWithVolume({ bars, volumes, w = 18, gap = 4, kH = 60, vH = 32, maxV = 100 }) {
  const totalW = bars.length * (w + gap) - gap;
  const svgW = Math.max(68, totalW + 28);  // 右侧留空给"放量/缩量"标签
  const svgH = kH + vH + 6;
  return (
    <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} style={{ overflow: "visible" }}>
      <Candles bars={bars} w={w} gap={gap} H={kH} yOff={0} />
      <line x1={0} y1={kH + 1} x2={totalW} y2={kH + 1} stroke="var(--border-subtle)" strokeWidth={0.8} strokeDasharray="3,2" />
      <VolumeBars bars={bars} volumes={volumes} w={w} gap={gap} H={vH} yOff={kH + 4} maxV={maxV} />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════
// 形态定义（含量能配合分析）
// ═══════════════════════════════════════════════════════════════

const PATTERNS = [
  {
    name: "十字星", en: "Doji", dir: "neutral",
    desc: "开盘≈收盘，上下影线较长。多空均衡。",
    volumeNote: "若伴随放量 → 多空分歧加剧，次日方向决定短期走势；若缩量 → 市场观望，方向不明。",
    bars: [{ o: 50, h: 25, l: 75, c: 50 }],
    vols: [80],
    maxV: 100,
  },
  {
    name: "长十字星", en: "Long-Legged Doji", dir: "neutral",
    desc: "上下影线均很长，多空激烈博弈后平手，反转信号更强。",
    volumeNote: "高位长十字星+天量 → 大概率见顶，应减仓；低位+地量 → 底部蓄力，关注突破。",
    bars: [{ o: 50, h: 15, l: 85, c: 50 }],
    vols: [95],
    maxV: 100,
  },
  {
    name: "锤子线", en: "Hammer", dir: "bullish",
    desc: "下影线≥实体2倍，几乎无上影线。跌势末端看涨反转。",
    volumeNote: "放量锤子线 → 抄底盘涌入，反转概率大增；缩量 → 信号较弱，需次日确认。",
    bars: [{ o: 68, h: 70, l: 95, c: 58 }],
    vols: [90],
    maxV: 100,
  },
  {
    name: "倒锤子", en: "Inverted Hammer", dir: "bullish",
    desc: "上影线≥实体2倍，几乎无下影线。跌势末端看涨反转。",
    volumeNote: "放量倒锤子 → 多头试探性进攻，次日高开则确认；缩量 → 可能只是下跌中继。",
    bars: [{ o: 52, h: 15, l: 50, c: 42 }],
    vols: [70],
    maxV: 100,
  },
  {
    name: "吊颈线", en: "Hanging Man", dir: "bearish",
    desc: "形似锤子线但出现在涨势末端。看跌反转。",
    volumeNote: "高位吊颈线+巨量 → 主力出货信号，应果断离场；缩量吊颈 → 警惕但可观望。",
    bars: [{ o: 66, h: 68, l: 95, c: 56 }],
    vols: [95],
    maxV: 100,
  },
  {
    name: "射击之星", en: "Shooting Star", dir: "bearish",
    desc: "上影线≥实体2倍，几乎无下影线。涨势末端看跌反转。",
    volumeNote: "放量射击之星 → 多头衰竭+空头反扑，反转确认度高；缩量 → 回调幅度可能有限。",
    bars: [{ o: 58, h: 15, l: 55, c: 50 }],
    vols: [85],
    maxV: 100,
  },
  {
    name: "看涨吞没", en: "Bullish Engulfing", dir: "bullish",
    desc: "阴线+大阳线完全覆盖前一根。强烈看涨反转。",
    volumeNote: "第二根阳线放量覆盖 → 多头强力反击，信号可靠；缩量覆盖 → 力度存疑，谨慎跟进。",
    bars: [{ o: 72, h: 78, l: 48, c: 55 }, { o: 48, h: 82, l: 25, c: 72 }],
    vols: [40, 90],
    maxV: 100,
  },
  {
    name: "看跌吞没", en: "Bearish Engulfing", dir: "bearish",
    desc: "阳线+大阴线完全覆盖前一根。强烈看跌反转。",
    volumeNote: "第二根阴线放量吞没 → 空头强势，及时离场；缩量吞没 → 可能是洗盘，观察后续。",
    bars: [{ o: 30, h: 52, l: 22, c: 50 }, { o: 70, h: 78, l: 25, c: 28 }],
    vols: [35, 88],
    maxV: 100,
  },
  {
    name: "启明星", en: "Morning Star", dir: "bullish",
    desc: "长阴→十字星/小K线→长阳。三K线底部反转。",
    volumeNote: "第三根阳线放量切入阴线一半以上 → 反转确立，可加仓；缩量 → 反弹力度弱，轻仓试探。",
    bars: [{ o: 72, h: 78, l: 52, c: 56 }, { o: 48, h: 55, l: 44, c: 48 }, { o: 42, h: 60, l: 24, c: 64 }],
    vols: [55, 30, 85],
    maxV: 100,
  },
  {
    name: "黄昏星", en: "Evening Star", dir: "bearish",
    desc: "长阳→十字星/小K线→长阴。三K线顶部反转。",
    volumeNote: "第三根阴线放量切入阳线一半以下 → 顶部确认，减仓；缩量 → 调整后可能再度上攻。",
    bars: [{ o: 36, h: 55, l: 28, c: 54 }, { o: 56, h: 60, l: 50, c: 56 }, { o: 64, h: 70, l: 35, c: 40 }],
    vols: [45, 25, 80],
    maxV: 100,
  },
  {
    name: "红三兵", en: "Three White Soldiers", dir: "bullish",
    desc: "连续三根递增红色阳线，实体长影线短。强势上涨延续。",
    volumeNote: "量能递增（价涨量增）→ 上涨动能充足，持股待涨；量能递减 → 上攻乏力，警惕回调。",
    bars: [{ o: 56, h: 60, l: 40, c: 68 }, { o: 44, h: 52, l: 32, c: 54 }, { o: 32, h: 42, l: 20, c: 40 }],
    vols: [45, 65, 88],
    maxV: 100,
  },
  {
    name: "三只乌鸦", en: "Three Black Crows", dir: "bearish",
    desc: "连续三根递增绿色阴线，实体长影线短。强势下跌延续。",
    volumeNote: "量能递增（价跌量增）→ 恐慌抛售，不宜接飞刀；量能递减 → 抛压减轻，关注止跌。",
    bars: [{ o: 50, h: 55, l: 36, c: 38 }, { o: 60, h: 65, l: 48, c: 50 }, { o: 70, h: 75, l: 58, c: 60 }],
    vols: [50, 70, 90],
    maxV: 100,
  },
  {
    name: "上升三法", en: "Rising Three Methods", dir: "bullish",
    desc: "红色长阳+三根绿色小阴线（不破长阳底）+红色长阳突破。五K线上涨中继。",
    volumeNote: "整理期缩量+突破阳线放量 → 标准的上涨中继，加仓良机；整理期放量 → 警惕出货。",
    bars: [{ o: 38, h: 62, l: 30, c: 58 }, { o: 46, h: 48, l: 42, c: 44 }, { o: 44, h: 46, l: 40, c: 42 }, { o: 44, h: 44, l: 40, c: 42 }, { o: 28, h: 40, l: 18, c: 48 }],
    vols: [85, 25, 20, 22, 90],
    maxV: 100,
  },
  {
    name: "下降三法", en: "Falling Three Methods", dir: "bearish",
    desc: "绿色长阴+三根红色小阳线（不破长阴顶）+绿色长阴破位。五K线下跌中继。",
    volumeNote: "整理期缩量+破位阴线放量 → 下跌中继确认，止损；整理期放量 → 可能是底部换手。",
    bars: [{ o: 48, h: 52, l: 30, c: 32 }, { o: 40, h: 44, l: 38, c: 42 }, { o: 42, h: 42, l: 38, c: 44 }, { o: 42, h: 46, l: 40, c: 44 }, { o: 60, h: 54, l: 40, c: 52 }],
    vols: [80, 22, 25, 20, 88],
    maxV: 100,
  },
];

export default function TechnicalIndicators() {
  const [filter, setFilter] = useState("all"); // all | bullish | bearish | neutral

  const filtered = PATTERNS.filter(p => filter === "all" || p.dir === filter);

  return (
    <div className="page">
      <div className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 className="topbar-title">
            <Icon name="indicators" size={22} style={{ verticalAlign: -4, marginRight: 6 }} />
            技术指标
          </h1>
          <span className="badge">K线形态 · 量价配合</span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ display: "flex", gap: 20, alignItems: "center", fontSize: 12, flexWrap: "wrap" }}>
          <span style={{fontWeight:600}}>图例：</span>
          <span><span style={{display:"inline-block",width:18,height:10,background:RED,borderRadius:2,verticalAlign:"middle",marginRight:4}}/> 红色阳线（涨）</span>
          <span><span style={{display:"inline-block",width:18,height:10,background:GREEN,borderRadius:2,verticalAlign:"middle",marginRight:4}}/> 绿色阴线（跌）</span>
          <span><span style={{display:"inline-block",width:18,height:1,borderTop:"1.5px solid "+GRAY,verticalAlign:"middle",marginRight:4}}/> 十字星</span>
          <span style={{color:"var(--text-muted)"}}>|</span>
          <span style={{color:"var(--text-muted)",fontSize:11}}>上区=K线 &nbsp; 虚线下方=量能柱 &nbsp; 量柱越高=成交量越大</span>
        </div>
      </div>

      {/* 筛选栏 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>筛选：</span>
        {[
          { key: "all", label: "全部", count: PATTERNS.length },
          { key: "bullish", label: "看涨", count: PATTERNS.filter(p => p.dir === "bullish").length, icon: "trending-up" },
          { key: "bearish", label: "看跌", count: PATTERNS.filter(p => p.dir === "bearish").length, icon: "trending-down" },
          { key: "neutral", label: "中性", count: PATTERNS.filter(p => p.dir === "neutral").length, icon: "minus" },
        ].map(f => (
          <Button key={f.key} variant={filter === f.key ? "primary" : "ghost"} size="sm" icon={f.icon}
            onClick={() => setFilter(f.key)}>
            {f.label} ({f.count})
          </Button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16 }}>
        {filtered.map((p, i) => (
          <div className="card" key={i}>
            <div className="card-header">
              <h2>{p.name} <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)" }}>{p.en}</span></h2>
              <span className="badge" style={{
                background: p.dir === "bullish" ? "rgba(220,38,38,0.08)" : p.dir === "bearish" ? "rgba(22,163,74,0.08)" : "var(--accent-soft)",
                color: p.dir === "bullish" ? RED : p.dir === "bearish" ? GREEN : "var(--accent)",
                fontSize: 10,
              }}>
                {p.dir === "bullish" ? <><Icon name="trending-up" size={12} style={{ verticalAlign: -1 }} /> 看涨</> : p.dir === "bearish" ? <><Icon name="trending-down" size={12} style={{ verticalAlign: -1 }} /> 看跌</> : <><Icon name="minus" size={12} style={{ verticalAlign: -1 }} /> 中性</>}
              </span>
            </div>
            <div className="card-body">
              <div style={{ display: "flex", gap: 14 }}>
                {/* K线 + 量能图 */}
                <div style={{ flexShrink: 0, background: "var(--bg-hover)", borderRadius: "var(--radius-sm)", padding: 6, display: "flex", alignItems: "center" }}>
                  <KlineWithVolume bars={p.bars} volumes={p.vols} maxV={p.maxV} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 6 }}>{p.desc}</p>
                  <p style={{ fontSize: 11, lineHeight: 1.5, color: "var(--accent)", fontWeight: 500, marginBottom: 4 }}>
                    <Icon name="bar-chart" size={12} style={{ verticalAlign: -1, marginRight: 2 }} /> 量能分析：{p.volumeNote}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
