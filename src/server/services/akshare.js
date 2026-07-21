/**
 * AKShare 数据桥接 — Node.js 封装
 *
 * 通过子进程调用 Python 脚本获取数据，作为 stockSdk 的降级方案。
 * 所有方法签名与 stockSdk 保持一致，返回 { ok, data/error }。
 */

const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");

// ── 跨平台 Python 自动检测 ──
function findPython() {
  const isWin = process.platform === "win32";
  const candidates = [
    "/opt/homebrew/bin/python3.11",  // macOS Apple Silicon (Homebrew)
    "/opt/homebrew/bin/python3.12",
    "/opt/homebrew/bin/python3.10",
    "/usr/local/bin/python3",
    "/usr/bin/python3",
    // PATH 命令：Windows 优先 python，macOS/Linux 优先 python3
    ...(isWin ? ["python", "python3"] : ["python3", "python"]),
  ];
  // 先尝试绝对路径
  for (const bin of candidates) {
    if (path.isAbsolute(bin)) {
      try { fs.accessSync(bin, fs.constants.X_OK); return bin; } catch {}
    }
  }
  // PATH 命令：按优先级返回第一个
  for (const bin of candidates) {
    if (!path.isAbsolute(bin)) return bin;
  }
  return isWin ? "python" : "python3";
}
const PYTHON_BIN = findPython();
const BRIDGE_SCRIPT = path.join(__dirname, "akshare_bridge.py");

/**
 * 调用 Python 桥接脚本
 * @param {object} payload - 发送给 Python 的 JSON 请求
 * @param {number} [timeout=30000] - 超时（毫秒）
 * @returns {Promise<{ok: boolean, data?: any, error?: string}>}
 */
function callBridge(payload, timeout = 30000) {
  return new Promise((resolve) => {
    const child = execFile(
      PYTHON_BIN,
      [BRIDGE_SCRIPT, JSON.stringify(payload)],
      { timeout, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          if (err.killed) {
            return resolve({ ok: false, error: "AKShare 请求超时" });
          }
          return resolve({ ok: false, error: `AKShare 调用失败: ${err.message}` });
        }
        try {
          const result = JSON.parse(stdout.trim());
          resolve(result);
        } catch {
          resolve({ ok: false, error: `AKShare 响应解析失败: ${stdout.slice(0, 200)}` });
        }
      }
    );
  });
}

const akshare = {
  /** 健康检查 */
  async health() {
    return callBridge({ action: "health" }, 10000);
  },

  /**
   * 获取A股历史K线
   * @param {string} symbol - 纯数字代码（如 "000001"）
   * @param {object} options
   * @param {string} [options.period="daily"] - daily/weekly/monthly
   * @param {string} [options.startDate] - 开始日期 YYYYMMDD
   * @param {string} [options.endDate] - 结束日期 YYYYMMDD
   */
  async getStockKline(symbol, options = {}) {
    const clean = String(symbol).replace(/^sh|sz|bj|hk|us/gi, "");
    return callBridge({
      action: "kline",
      symbol: clean,
      period: options.period || "daily",
      start: options.startDate || undefined,
      end: options.endDate || undefined,
    });
  },

  /**
   * 批量获取A股实时行情
   * @param {string[]} symbols - 股票代码数组
   */
  async getMultiMarketQuotes(symbols) {
    return callBridge({ action: "quote", symbols }, 20000);
  },

  /**
   * 搜索股票
   * @param {string} keyword - 搜索关键词
   */
  async searchStock(keyword) {
    return callBridge({ action: "search", keyword }, 15000);
  },

  // ── 板块数据 ──

  /** 获取行业板块列表 */
  async getIndustries(topN) {
    return callBridge({ action: "industries", topN }, 20000);
  },

  /** 获取概念板块列表 */
  async getConcepts(topN) {
    return callBridge({ action: "concepts", topN }, 20000);
  },

  /** 获取热门板块（行业+概念） */
  async getHotSectors(topN) {
    return callBridge({ action: "hotSectors", topN }, 20000);
  },

  /** 搜索板块 */
  async searchSectors(keyword) {
    return callBridge({ action: "searchSectors", keyword }, 15000);
  },

  /** 获取板块成分股 */
  async getBoardStocks(symbol, boardType) {
    return callBridge({ action: "boardStocks", symbol, boardType }, 20000);
  },

  /** 获取涨停板池 */
  async getZTPool(ztType, date) {
    return callBridge({ action: "ztPool", ztType, date }, 15000);
  },

  /** 获取个股资金流向排名 */
  async getFundFlowRank(indicator) {
    return callBridge({ action: "fundFlowRank", indicator }, 20000);
  },

  /** 获取板块资金流向排名 */
  async getSectorFundFlowRank(indicator, sectorType) {
    return callBridge({ action: "sectorFundFlowRank", indicator, sectorType }, 20000);
  },

  /** 随机获取一只A股的K线（训练用） */
  async getRandomKline(count = 500) {
    return callBridge({ action: "randomKline", count }, 30000);
  },
};

module.exports = akshare;
