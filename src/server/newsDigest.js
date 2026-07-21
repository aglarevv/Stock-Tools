/**
 * 每日时事日报生成器 — RSS 采集 + 3-SOP 分类 + 去重 + 优先级排序
 *
 * 职责：
 * - 解析 OPML，并发拉取所有 RSS 源
 * - 文章去重（基于历史日报已使用链接）
 * - 关键词 + 时间 + 情感综合评分排序
 * - 3-SOP 分类 + 情感标注
 *
 * 用法：
 *   const { generateDailyDigest, computePriority, getWeekLabel, assessSimpleSentiment } = require("./newsDigest");
 *   const digest = await generateDailyDigest(db, { parseOPML, fetchRSS, classifyArticles, sortArticlesBySOP, detectSentiment, assessMarketSentiment }, keywords, resolveOpmlPath);
 */

"use strict";

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

/** 单次日报最多使用的文章数 */
const MAX_ARTICLES_PER_DIGEST = 40;

// 内存缓存（当天有效）
let newsCache = { date: "", data: null };

function getUserOpmlPath() {
  const home = process.env.ELECTRON_USER_DATA || process.env.HOME || os.homedir();
  return path.join(home, ".stock-toolbox", "sources.opml");
}

function resolveOpmlPath() {
  const userPath = getUserOpmlPath();
  if (fs.existsSync(userPath)) return userPath;
  return resolveDefaultOpmlPath();
}

function resolveDefaultOpmlPath() {
  const candidates = [
    path.resolve(__dirname, "sources.opml"),
    path.resolve(__dirname, "..", "sources.opml"),
    path.resolve(__dirname, "..", "..", "sources.opml"),
    path.resolve(__dirname, "..", "..", "..", "sources.opml"),
  ];
  return candidates.find(p => fs.existsSync(p)) || candidates[1];
}

async function generateDailyDigest(db, services, keywords, opmlResolver) {
  const today = new Date().toISOString().slice(0, 10);
  if (newsCache.date === today && newsCache.data) return newsCache.data;

  const { parseOPML, fetchRSS, classifyArticles, sortArticlesBySOP, detectSentiment, assessMarketSentiment } = services;
  const resolveOpml = opmlResolver || resolveOpmlPath;

  const opmlPath = resolveOpml();
  const feeds = parseOPML(opmlPath);
  const articles = [];

  const results = await Promise.allSettled(
    feeds.map((feed) =>
      fetchRSS(feed.xmlUrl).then((items) => ({ feed, items }))
    )
  );
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const { feed, items } = r.value;
    for (const item of items.slice(0, 20)) {
      articles.push({
        source: feed.title,
        category: feed.category,
        title: item.title,
        summary: (item.summary || item.description || "").replace(/<[^>]+>/g, "").slice(0, 300),
        link: item.link,
        date: item.date || item.pubDate,
      });
    }
  }

  const { filterNewArticles } = require("./database");
  const newArticles = await filterNewArticles(db, articles);
  const duplicateCount = articles.length - newArticles.length;
  const dedupedArticles = newArticles.length > 0 ? newArticles : articles;

  for (const a of dedupedArticles) {
    a._priority = computePriority(a, keywords, detectSentiment);
  }
  dedupedArticles.sort((a, b) => b._priority - a._priority);
  const digestArticles = dedupedArticles.slice(0, MAX_ARTICLES_PER_DIGEST);
  for (const a of dedupedArticles) delete a._priority;

  const topics = classifyArticles(digestArticles);

  const allFlat = sortArticlesBySOP(dedupedArticles).map(a => ({
    source: a.source,
    category: a.category,
    title: a.title,
    link: a.link,
    summary: a.summary || "",
    sentiment: detectSentiment(a.title + (a.summary || "")),
  }));

  const digest = {
    date: today,
    totalArticles: articles.length,
    newArticlesCount: newArticles.length,
    duplicateCount,
    hasNewArticles: newArticles.length > 0,
    allArticles: allFlat,
    marketSentiment: assessMarketSentiment(digestArticles),
    topics,
  };

  newsCache = { date: today, data: digest };
  return digest;
}

function computePriority(article, keywords, detectSentiment) {
  const content = (article.title || "") + " " + (article.summary || "");
  let score = 0;
  const articleTime = article.date ? new Date(article.date).getTime() : 0;
  const ageHours = articleTime ? (Date.now() - articleTime) / (1000 * 60 * 60) : 48;
  score += Math.max(0, 100 - ageHours * 2);
  for (const word of keywords.heavy) { if (content.includes(word)) score += 5; }
  for (const word of keywords.important) { if (content.includes(word)) score += 3; }
  for (const word of keywords.watch) { if (content.includes(word)) score += 1; }
  const sentiment = detectSentiment(content);
  if (sentiment !== "中性") score += 2;
  return Math.round(score);
}

function assessSimpleSentiment(articles) {
  let bullish = 0, bearish = 0;
  for (const a of articles) {
    if (a.sentiment === "利好") bullish++;
    else if (a.sentiment === "利空") bearish++;
  }
  if (bullish > bearish * 1.5) return "偏乐观";
  if (bearish > bullish * 1.5) return "偏悲观";
  return "中性";
}

function getWeekLabel(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  return `${d.getFullYear()}年第${weekNum}周`;
}

function clearNewsCache() {
  newsCache = { date: "", data: null };
}

module.exports = {
  generateDailyDigest,
  computePriority,
  assessSimpleSentiment,
  getWeekLabel,
  resolveOpmlPath,
  resolveDefaultOpmlPath,
  getUserOpmlPath,
  clearNewsCache,
  MAX_ARTICLES_PER_DIGEST,
};
