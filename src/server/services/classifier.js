/**
 * classifier.js — 文章分类与情感分析服务
 *
 * 职责：SOP 分类、情感检测、市场情绪评估、AI 输出清洗。
 */

/** SOP 分类标签映射 */
const SOP_LABELS = {
  "SOP 1 深度洞察": "SOP1 深度洞察",
  "SOP 2 势能扫描": "SOP2 势能扫描",
  "辅助：区域/垂类": "SOP3 区域/垂类",
};

/** SOP 排序优先级 */
const SOP_ORDER = ["SOP 1 深度洞察", "SOP 2 势能扫描", "辅助：区域/垂类"];

/**
 * 将文章按 SOP 分类分组
 * @param {Array} articles
 * @returns {Array<{name:string, count:number, highlights:Array}>}
 */
function classifyArticles(articles) {
  const topics = {};
  for (const art of articles) {
    let cat = art.category || "综合";
    let matched = null;
    for (const sop of SOP_ORDER) {
      if (cat.includes(sop) || cat.includes((SOP_LABELS[sop] || "").split(" ")[0])) {
        matched = SOP_LABELS[sop] || sop;
        break;
      }
    }
    if (!matched) matched = "综合";
    if (!topics[matched]) topics[matched] = [];
    topics[matched].push(art);
  }

  const ordered = [];
  for (const label of Object.values(SOP_LABELS)) {
    if (topics[label]) ordered.push([label, topics[label]]);
  }
  if (topics["综合"]) ordered.push(["综合", topics["综合"]]);

  return ordered.map(([name, items]) => ({
    name,
    count: items.length,
    highlights: items.slice(0, 15).map(a => ({
      title: a.title,
      source: a.source,
      link: a.link,
      summary: a.summary || "",
      sentiment: detectSentiment(a.title + (a.summary || "")),
    })),
  }));
}

/**
 * 将文章按 SOP 顺序排序（SOP1 → SOP2 → SOP3 → 综合）
 * @param {Array} articles
 * @returns {Array}
 */
function sortArticlesBySOP(articles) {
  const groups = { sop1: [], sop2: [], sop3: [], other: [] };
  for (const a of articles) {
    const cat = a.category || "";
    if (cat.includes("SOP 1") || cat.includes("深度洞察")) groups.sop1.push(a);
    else if (cat.includes("SOP 2") || cat.includes("势能扫描")) groups.sop2.push(a);
    else if (cat.includes("辅助") || cat.includes("区域/垂类")) groups.sop3.push(a);
    else groups.other.push(a);
  }
  return [...groups.sop1, ...groups.sop2, ...groups.sop3, ...groups.other];
}

/** 情感检测关键词 */
const BULLISH_WORDS = ["涨", "利好", "突破", "反弹", "增长", "上升", "扩大", "强劲", "创新高", "牛市", "回暖", "放量"];
const BEARISH_WORDS = ["跌", "利空", "下跌", "暴跌", "衰退", "下滑", "萎缩", "疲软", "创新低", "熊市", "低迷", "缩量", "危机", "制裁", "摩擦"];

/**
 * 检测文本情感
 * @param {string} text
 * @returns {'利好'|'利空'|'中性'}
 */
function detectSentiment(text) {
  let score = 0;
  for (const w of BULLISH_WORDS) if (text.includes(w)) score++;
  for (const w of BEARISH_WORDS) if (text.includes(w)) score--;
  return score > 0 ? "利好" : score < 0 ? "利空" : "中性";
}

/**
 * 评估市场整体情绪
 * @param {Array} articles
 * @returns {{label:string, ratio:string, detail:string}}
 */
function assessMarketSentiment(articles) {
  let bullish = 0, bearish = 0;
  for (const a of articles) {
    const s = detectSentiment(a.title + a.summary);
    if (s === "利好") bullish++;
    else if (s === "利空") bearish++;
  }
  if (bullish > bearish * 1.5) return { label: "偏乐观 😊", ratio: `${bullish}:${bearish}`, detail: `利好 ${bullish} 条 vs 利空 ${bearish} 条，市场情绪偏暖` };
  if (bearish > bullish * 1.5) return { label: "偏悲观 😟", ratio: `${bullish}:${bearish}`, detail: `利空 ${bearish} 条 vs 利好 ${bullish} 条，注意风险` };
  return { label: "中性 😐", ratio: `${bullish}:${bearish}`, detail: `利好 ${bullish} 条，利空 ${bearish} 条，多空均衡` };
}

/**
 * 清洗 AI 输出中的多余内容
 */
function cleanDigest(text) {
  if (!text) return "";
  let cleaned = text;
  cleaned = cleaned.replace(/\n?\*{0,2}(?:注|备注|说明)[：:][^*]*\*{0,2}\s*$/g, "");
  cleaned = cleaned.replace(/\n---[\s\S]*$/g, "");
  cleaned = cleaned.replace(/^---+$/gm, "");
  cleaned = cleaned.replace(/（[^）]*全文[^）]*）\s*/g, "");
  cleaned = cleaned.replace(/\([^)]*全文[^)]*\)\s*/g, "");
  cleaned = cleaned.replace(/^.*?(?:以下|以上)(?:按|是).*?[。\.]\s*$/gm, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

module.exports = {
  classifyArticles,
  sortArticlesBySOP,
  detectSentiment,
  assessMarketSentiment,
  cleanDigest,
};
