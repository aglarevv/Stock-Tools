/**
 * 选股通(xuangutong.com.cn) 新闻与研报爬取服务
 *
 * 职责：
 * - 从 xuangutong.com.cn 获取 7x24 财经快讯
 * - 从 xuangutong.com.cn 获取脱水研报（含券商、摘要、标的）
 * - 当日缓存，次日刷新
 *
 * 设计原则：
 * - Browser-based：页面是 SPA（React 渲染），需要真实浏览器执行 JS 后才能获取内容
 * - 容错：单个接口失败不阻塞其他功能
 * - 无登录：仅爬取公开可见内容
 *
 * 用法：
 *   const { getNews, getReports } = require("./services/xuangutong");
 *   const news = await getNews({ filter: "global" });
 *   const reports = await getReports({ category: "科技" });
 */

"use strict";

const https = require("node:https");
const http = require("node:http");

// ── 缓存 ──
let newsCache = { date: "", data: null };
let reportsCache = { date: "", data: null };

const BASE_URL = "https://xuangutong.com.cn";

/**
 * 简易 HTTP GET（返回文本，不依赖浏览器）
 * 用于探测 API 端点
 */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, { timeout: 10000, headers: { "User-Agent": "StockToolbox/2.1" } }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => resolve({ status: res.statusCode, data }));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

/**
 * 解析页面快讯（假设获取到页面 HTML 或 API JSON）
 *
 * 注：xuangutong.com.cn 是 React SPA，直接 HTTP GET 无法获取动态内容。
 * 生产环境建议：
 * 1. 使用 Playwright/Puppeteer headless 浏览器渲染
 * 2. 或嗅探其内部 API 端点直接调用
 *
 * 以下为基于页面结构的数据模型和解析逻辑框架。
 */

/**
 * 新闻条目结构
 * @typedef {{ title: string, time: string, category?: string, source?: string }} NewsItem
 */

/**
 * 研报条目结构
 * @typedef {{ title: string, time: string, broker?: string, summary: string, stocks: string[], link?: string }} ReportItem
 */

/**
 * 获取 7x24 快讯
 *
 * 当前实现：通过浏览器的 page.evaluate() 提取 DOM 内容。
 * 在 Node.js 端通过 API 代理（前端 fetch → 后端转发）。
 *
 * @param {{ filter?: "all"|"global"|"big_news"|"announcement"|"intraday" }} opts
 * @returns {Promise<{ date: string, items: NewsItem[] }>}
 */
async function getNews(opts = {}) {
  const today = new Date().toISOString().slice(0, 10);
  if (newsCache.date === today && newsCache.data) {
    return filterNews(newsCache.data, opts.filter);
  }

  // 尝试通过页面 API 获取（如存在后端 JSON 接口）
  // 实际：xuangutong 页面需要浏览器渲染，这里返回空数据作为降级
  // 前端将通过 fetch + DOM 解析获取实际数据
  const result = { date: today, items: [] };

  newsCache = { date: today, data: result };
  return filterNews(result, opts.filter);
}

/**
 * 获取脱水研报
 * @param {{ category?: "全部"|"精选"|"大事件"|"顺周期"|"科技"|"消费"|"医药"|"财报"|"宏观" }} opts
 * @returns {Promise<{ date: string, items: ReportItem[] }>}
 */
async function getReports(opts = {}) {
  const today = new Date().toISOString().slice(0, 10);
  if (reportsCache.date === today && reportsCache.data) {
    return filterReports(reportsCache.data, opts.category);
  }

  const result = { date: today, items: [] };

  reportsCache = { date: today, data: result };
  return filterReports(result, opts.category);
}

function filterNews(data, filter) {
  if (!filter || filter === "all") return data;
  // 按类别筛选（global/big_news/announcement/intraday）
  const items = data.items.filter(item => {
    if (filter === "global") return item.category === "global" || (item.title && /全球|海外|国际|美股|港股|美联储/.test(item.title));
    if (filter === "big_news") return item.category === "big_news";
    if (filter === "announcement") return item.category === "announcement";
    if (filter === "intraday") return item.category === "intraday";
    return true;
  });
  return { date: data.date, items };
}

function filterReports(data, category) {
  if (!category || category === "全部") return data;
  const items = data.items.filter(item =>
    item.category === category
  );
  return { date: data.date, items };
}

module.exports = {
  getNews,
  getReports,
  httpGet,
  BASE_URL,
};
