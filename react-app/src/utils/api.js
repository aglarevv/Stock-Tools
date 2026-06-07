/**
 * API 客户端 — 封装所有后端接口调用
 *
 * - 开发模式（localhost）使用相对路径，由 Vite 代理到 127.0.0.1:8765
 * - 生产模式（Electron/WKWebView）使用绝对路径 http://127.0.0.1:8765
 * - 禁用 HTTP 缓存，确保设置读/写始终获取最新数据
 */

// 根据当前 hostname 自动选择 API 基础路径
const API_BASE = window.location.hostname === "localhost"
  ? "" : "http://127.0.0.1:8765";

/**
 * 通用请求函数
 * @param {string} method - HTTP 方法（GET/POST/DELETE）
 * @param {string} path - API 路径（如 /api/health）
 * @param {object} [body] - 请求体（仅 POST）
 * @returns {Promise<object>} 解析后的 JSON 响应
 */
async function request(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" }, cache: "no-store" };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data;
}

// 导出所有 API 方法
export const api = {
  /** 健康检查 + 数据库状态 */
  health: () => request("GET", "/api/health"),
  /** 看板统计数据 */
  dashboard: () => request("GET", "/api/dashboard"),

  // ── 交易计划 ──
  getTradePlans: (limit = 8) => request("GET", `/api/trade-plans?limit=${limit}`),
  saveTradePlan: (plan) => request("POST", "/api/trade-plans", plan),
  deleteTradePlan: (id) => request("DELETE", `/api/trade-plans?id=${id}`),

  // ── 复盘记录 ──
  getReviews: (params = {}) => {
    const q = new URLSearchParams();
    q.set("limit", params.limit || 50);
    if (params.id) q.set("id", params.id);
    if (params.symbol) q.set("symbol", params.symbol);
    if (params.dateFrom) q.set("dateFrom", params.dateFrom);
    if (params.dateTo) q.set("dateTo", params.dateTo);
    return request("GET", `/api/daily-reviews?${q}`);
  },
  saveReview: (review) => request("POST", "/api/daily-reviews", review),
  deleteReview: (id) => request("DELETE", `/api/daily-reviews?id=${id}`),

  // ── 应用设置 ──
  getSettings: () => request("GET", "/api/settings"),
  saveSettings: (settings) => request("POST", "/api/settings", { settings }),

  // ── AI 对话 ──
  aiChat: (reviewData, messages, aiConfig) =>
    request("POST", "/api/ai/chat", { reviewData, messages, aiConfig }),

  // ── 每日时事 ──
  dailyNews: () => request("GET", "/api/daily-news"),
  /** AI 生成每日日报摘要，传入 articles 数组和 aiConfig */
  dailyDigest: (articles, aiConfig) => request("POST", "/api/ai/daily-digest", { articles, aiConfig }),
  /** 获取历史日报列表 */
  dailyDigests: () => request("GET", "/api/daily-digests"),
  /** 按日期查询单日日报 */
  dailyDigestByDate: (date) => request("GET", `/api/daily-digest?date=${encodeURIComponent(date)}`),

  // ── 周报/月报精选 ──
  /** AI 生成周报精选摘要 */
  weeklyDigest: (aiConfig) => request("POST", "/api/ai/weekly-digest", { aiConfig }),
  /** AI 生成月报精选摘要 */
  monthlyDigest: (aiConfig) => request("POST", "/api/ai/monthly-digest", { aiConfig }),
  /** 获取历史周报/月报列表 */
  periodicDigests: (type) => request("GET", `/api/periodic-digests${type ? `?type=${type}` : ""}`),
  /** 按 ID 查询单条周报/月报详情 */
  periodicDigestById: (id) => request("GET", `/api/periodic-digest?id=${id}`),

  // ── RSS 源管理 ──
  /** 读取当前 OPML 配置内容 */
  getSourcesOpml: () => request("GET", "/api/sources/opml"),
  /** 读取捆绑的默认 OPML 配置（忽略用户自定义） */
  getDefaultSourcesOpml: () => request("GET", "/api/sources/opml?default=true"),
  /** 保存/上传 OPML 配置 */
  saveSourcesOpml: (content) => request("POST", "/api/sources/opml", { content }),
};
