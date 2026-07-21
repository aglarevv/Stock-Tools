/**
 * 工具函数 — 加密 / 配置 / HTTP 辅助 / 数据验证
 *
 * 职责：
 * - 全局配置解析（端口、web root、AI、MySQL）
 * - AES-256-GCM 加解密 API Key
 * - HTTP 响应工具（sendJson / sendError / readJsonBody）
 * - AI URL 标准化
 * - 数据验证与清洗（toFiniteNumber / cleanText / buildTradePlan / buildDailyReview）
 *
 * 设计原则：
 * - 纯函数，无副作用（除 config 和 aiFetchAgent 初始化）
 * - 不依赖数据库或其他服务模块
 *
 * 用法：
 *   const { sendJson, sendError, config } = require("./utils");
 */

"use strict";

const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");

// ── HTTP 请求辅助（兼容旧版 Node.js TLS） ──
const fetch = globalThis.fetch; // Node 18+ 内置
const aiFetchAgent = new https.Agent({
  rejectUnauthorized: false, // 开发环境兼容自签名证书
  keepAlive: true,
});

/**
 * 对 AI 服务的增强 fetch（处理 TLS 兼容性）
 */
async function aiFetch(url, options = {}) {
  const opts = { ...options };
  if (url.startsWith("https://")) {
    opts.agent = aiFetchAgent;
  }
  return fetch(url, opts);
}

// AES-256-GCM 加密配置（用于 API Key 安全存储）
const ENC_ALGO = "aes-256-gcm";
const ENC_PASSPHRASE = "stock-toolbox-local-enc-key-2025";
const ENC_SALT = "toolbox-salt";
const ENC_KEY = crypto.pbkdf2Sync(ENC_PASSPHRASE, ENC_SALT, 100000, 32, "sha256");
const ENC_IV_LEN = 12; // GCM recommended IV length
const ENC_TAG_LEN = 16;

function encryptApiKey(plaintext) {
  if (!plaintext) return "";
  const iv = crypto.randomBytes(ENC_IV_LEN);
  const cipher = crypto.createCipheriv(ENC_ALGO, ENC_KEY, iv);
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted}`;
}

function decryptApiKey(ciphertext) {
  if (!ciphertext || !ciphertext.includes(":")) return ciphertext || "";
  const parts = ciphertext.split(":");
  if (parts.length !== 3) return ciphertext;
  try {
    const iv = Buffer.from(parts[0], "base64");
    const tag = Buffer.from(parts[1], "base64");
    const encrypted = parts[2];
    const decipher = crypto.createDecipheriv(ENC_ALGO, ENC_KEY, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encrypted, "base64", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return ciphertext; // 解密失败返回原文（兼容旧数据）
  }
}

// 标准化 AI API URL（兼容 DeepSeek / OpenAI 等不同提供商的常见写法）
function normalizeAiUrl(rawUrl) {
  let url = (rawUrl || "").trim();
  if (!url) return "https://api.openai.com/v1/chat/completions";

  url = url.replace(/\/+$/, "");

  if (!url.endsWith("/chat/completions")) {
    if (/api\.deepseek\.com/.test(url)) {
      url = url.replace(/\/v1$/, "");
      return `${url}/v1/chat/completions`;
    }
    return `${url}/v1/chat/completions`;
  }

  return url;
}

// 解析静态文件根目录（多级回退）
function resolveWebRoot() {
  if (process.env.WEB_ROOT) {
    const p = path.resolve(process.env.WEB_ROOT);
    if (fs.existsSync(p)) return p;
    console.error(`[server] WEB_ROOT 指定的路径不存在: ${p}`);
  }

  if (process.env.RESOURCES_PATH) {
    const p = path.join(process.env.RESOURCES_PATH, "web");
    if (fs.existsSync(p)) return p;
    console.error(`[server] RESOURCES_PATH/web 不存在: ${p}`);
  }

  const sibling = path.resolve(__dirname, "..", "web");
  if (fs.existsSync(sibling)) return sibling;

  const devPath = path.resolve(__dirname, "..", "..", "react-app", "dist");
  if (fs.existsSync(devPath)) return devPath;

  console.error(`[server] ⚠️  所有 webRoot 回退路径均不存在！静态文件将无法提供。`);
  console.error(`[server]    __dirname = ${__dirname}`);
  return sibling;
}

const config = {
  port: Number(process.env.PORT || 8765),
  webRoot: resolveWebRoot(),
  ai: {
    url: process.env.AI_API_URL || "https://api.openai.com/v1/chat/completions",
    key: process.env.AI_API_KEY || "",
    model: process.env.AI_MODEL || "gpt-4o-mini",
  },
  mysql: {
    host: process.env.MYSQL_HOST || "localhost",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "rootroot",
    database: process.env.MYSQL_DATABASE || "stock_toolbox",
  },
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store, no-cache, must-revalidate",
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, statusCode, message) {
  sendJson(response, statusCode, { error: message });
}

function toFiniteNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${name} must be a finite number`);
  }
  return number;
}

function toOptionalNumber(value, name) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return toFiniteNumber(value, name);
}

function cleanText(value, fallback = "", maxLength = 2000) {
  const text = String(value ?? fallback).trim();
  return (text || fallback).slice(0, maxLength);
}

function todayDateString() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

async function readJsonBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 20 * 1024 * 1024) {
      throw new Error("请求体过大（最大 15MB）");
    }
  }
  return body ? JSON.parse(body) : {};
}

function buildTradePlan(input) {
  const symbol = String(input.symbol || "自选股").trim().slice(0, 64) || "自选股";
  const buyPrice = Math.max(0, toFiniteNumber(input.buyPrice, "buyPrice"));
  const shares = Math.max(0, Math.floor(toFiniteNumber(input.shares, "shares")));
  const profitRate = Math.max(0, toFiniteNumber(input.profitRate, "profitRate"));
  const lossRate = Math.max(0, toFiniteNumber(input.lossRate, "lossRate"));
  const feeRate = Math.max(0, toFiniteNumber(input.feeRate, "feeRate"));
  const takeProfitPrice = buyPrice * (1 + profitRate / 100);
  const stopLossPrice = Math.max(0, buyPrice * (1 - lossRate / 100));
  const buyFee = buyPrice * shares * (feeRate / 100);
  const takeProfitFee = takeProfitPrice * shares * (feeRate / 100);
  const stopLossFee = stopLossPrice * shares * (feeRate / 100);
  const positionCost = buyPrice * shares + buyFee;
  const expectedProfit = (takeProfitPrice - buyPrice) * shares - buyFee - takeProfitFee;
  const expectedLoss = (buyPrice - stopLossPrice) * shares + buyFee + stopLossFee;
  const riskReward = lossRate > 0 ? profitRate / lossRate : 0;

  if (buyPrice <= 0) {
    throw new Error("买入价必须大于 0");
  }

  const tradeDirection = String(input.tradeDirection || "long").trim() === "short" ? "short" : "long";
  const positionPct = Math.min(100, Math.max(1, Math.floor(toFiniteNumber(input.positionPct, "positionPct"))));
  const tradeNotes = cleanText(input.tradeNotes, "", 2000);

  return {
    symbol, buyPrice, shares, profitRate, lossRate, feeRate,
    stopLossPrice, takeProfitPrice, positionCost,
    expectedProfit, expectedLoss, riskReward,
    tradeDirection, positionPct, tradeNotes,
  };
}

function buildDailyReview(input) {
  const reviewDate = /^\d{4}-\d{2}-\d{2}$/.test(String(input.reviewDate || ""))
    ? String(input.reviewDate)
    : todayDateString();

  let trades = [];
  if (Array.isArray(input.trades)) {
    trades = input.trades
      .filter((t) => t && typeof t === "object" && t.symbol)
      .map((t) => ({
        symbol: cleanText(t.symbol, "", 64),
        buyPrice: Math.max(0, toFiniteNumber(t.buyPrice, "buyPrice")),
        sellPrice: t.sellPrice !== "" && t.sellPrice != null ? Math.max(0, Number(t.sellPrice)) : null,
        shares: Math.max(0, Math.floor(toFiniteNumber(t.shares, "shares"))),
        holdingStyle: cleanText(t.holdingStyle, "短线", 64),
      }))
      .filter((t) => t.symbol && t.buyPrice > 0);
  }

  if (trades.length === 0) {
    const symbol = cleanText(input.symbol, "自选股", 64);
    const buyPrice = Math.max(0, toFiniteNumber(input.buyPrice, "buyPrice"));
    if (buyPrice > 0 && symbol && symbol !== "自选股") {
      trades = [{
        symbol,
        buyPrice,
        sellPrice: input.sellPrice !== "" && input.sellPrice != null ? Math.max(0, Number(input.sellPrice)) : null,
        shares: Math.max(0, Math.floor(toFiniteNumber(input.shares, "shares"))),
        holdingStyle: cleanText(input.holdingStyle, "短线", 64),
      }];
    }
  }

  const primarySymbol = trades.length > 0 ? trades[0].symbol : cleanText(input.symbol, "自选股", 64);
  const primaryBuyPrice = trades.length > 0 ? trades[0].buyPrice : Math.max(0, toFiniteNumber(input.buyPrice, "buyPrice"));
  const primarySellPrice = trades.length > 0 ? trades[0].sellPrice : (input.sellPrice !== "" && input.sellPrice != null ? Math.max(0, Number(input.sellPrice)) : null);
  const primaryShares = trades.length > 0 ? trades[0].shares : Math.max(0, Math.floor(toFiniteNumber(input.shares, "shares")));
  const primaryHoldingStyle = trades.length > 0 ? trades[0].holdingStyle : cleanText(input.holdingStyle, "短线", 64);

  let totalPnlAmount = 0;
  let totalBuyValue = 0;
  for (const t of trades) {
    const tBuy = t.buyPrice * t.shares;
    totalBuyValue += tBuy;
    if (t.sellPrice !== null) {
      totalPnlAmount += (t.sellPrice - t.buyPrice) * t.shares;
    }
  }
  const pnlRate = totalBuyValue > 0 ? (totalPnlAmount / totalBuyValue) * 100 : 0;

  if (trades.length > 0 && trades.some((t) => t.buyPrice <= 0)) {
    throw new Error("买入价格必须大于 0");
  }

  const text = (key) => cleanText(input[key], "", 5000);

  return {
    reviewDate, symbol: primarySymbol, buySignal: cleanText(input.buySignal, "", 2000),
    holdingStyle: primaryHoldingStyle, sellSignal: cleanText(input.sellSignal, "", 2000),
    buyPrice: primaryBuyPrice, sellPrice: primarySellPrice, shares: primaryShares,
    pnlAmount: totalPnlAmount, pnlRate,
    trades,
    indexJudgment: text("indexJudgment"),
    volumeJudgment: text("volumeJudgment"),
    sentimentJudgment: text("sentimentJudgment"),
    capitalDirection: text("capitalDirection"),
    leadingSectors: text("leadingSectors"),
    laggingSectors: text("laggingSectors"),
    sustainability: text("sustainability"),
    stockStrength: text("stockStrength"),
    volAmpRanking: text("volAmpRanking"),
    limitAnalysis: text("limitAnalysis"),
    operationReason: text("operationReason"),
    profitAttribution: text("profitAttribution"),
    lossAttribution: text("lossAttribution"),
    executionNotes: text("executionNotes"),
    improvementPlan: text("improvementPlan"),
    marketPlan: text("marketPlan"),
    positionPlan: text("positionPlan"),
    newCandidates: text("newCandidates"),
  };
}

module.exports = {
  aiFetch,
  encryptApiKey,
  decryptApiKey,
  normalizeAiUrl,
  resolveWebRoot,
  config,
  mimeTypes,
  sendJson,
  sendError,
  toFiniteNumber,
  toOptionalNumber,
  cleanText,
  todayDateString,
  readJsonBody,
  buildTradePlan,
  buildDailyReview,
};
