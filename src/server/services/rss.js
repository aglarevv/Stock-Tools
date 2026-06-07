/**
 * rss.js — RSS 采集与解析服务
 *
 * 职责：OPML 解析、RSS 拉取、文章提取。
 */

// 懒加载：仅在需要时 require
let _feedparser = null;
let _nodeFetch = null;
function getFeedParser() {
  if (!_feedparser) _feedparser = require("feedparser");
  return _feedparser;
}
function getNodeFetch() {
  if (!_nodeFetch) _nodeFetch = require("node-fetch");
  return _nodeFetch;
}

/**
 * 解析 OPML 文件，提取 RSS 源列表
 * @param {string} filePath - OPML 文件路径
 * @returns {Array<{title:string, xmlUrl:string, category:string}>}
 */
function parseOPML(filePath) {
  const fs = require("fs");
  const feeds = [];
  try {
    const xml = fs.readFileSync(filePath, "utf-8");
    const outlineRegex = /<outline[^>]*text="([^"]*)"[^>]*xmlUrl="([^"]*)"[^>]*\/?>/gi;
    let currentCat = "综合";
    const lines = xml.split("\n");
    for (const line of lines) {
      const catMatch = line.match(/<outline text="([^"]+)"[^>]*>\s*$/);
      if (catMatch && !line.includes("xmlUrl")) {
        currentCat = catMatch[1];
        continue;
      }
      const match = outlineRegex.exec(line);
      outlineRegex.lastIndex = 0;
      if (match) {
        feeds.push({ title: match[1], xmlUrl: match[2], category: currentCat });
      }
    }
  } catch { /* OPML 解析失败 */ }
  return feeds;
}

/**
 * 拉取单个 RSS 源
 * @param {string} url - RSS feed URL
 * @returns {Promise<Array<{title, summary, link, date}>>}
 */
function fetchRSS(url) {
  const fetch = getNodeFetch();
  const FeedParser = getFeedParser();
  return new Promise((resolve) => {
    const items = [];
    const parser = new FeedParser();
    const timeout = setTimeout(() => { resolve(items); }, 8000);

    try {
      fetch(url, { timeout: 5000, headers: { "User-Agent": "Toolbox/2.0" } })
        .then((res) => {
          if (!res.ok) { clearTimeout(timeout); resolve(items); return; }
          res.body.pipe(parser);
        })
        .catch(() => { clearTimeout(timeout); resolve(items); });

      parser.on("readable", () => {
        let item;
        while ((item = parser.read())) {
          items.push({
            title: item.title || "",
            summary: item.summary || item.description || "",
            link: item.link || "",
            date: item.date || item.pubDate || "",
          });
        }
      });
      parser.on("end", () => { clearTimeout(timeout); resolve(items); });
      parser.on("error", () => { clearTimeout(timeout); resolve(items); });
    } catch { clearTimeout(timeout); resolve(items); }
  });
}

module.exports = { parseOPML, fetchRSS };
