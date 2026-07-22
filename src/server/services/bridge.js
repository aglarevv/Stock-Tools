/** Python 桥接 — 数据源: biyingapi (股票/板块) + baostock (日K线) */
"use strict";
const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");

const BUNDLED_BIN = (() => {
  const ext = process.platform === "win32" ? ".exe" : "";
  const candidates = [__dirname, path.join(__dirname, ".."),
    process.resourcesPath ? path.join(process.resourcesPath, "server", "services") : "",
    process.resourcesPath ? path.join(process.resourcesPath, "server") : ""];
  for (const d of candidates) {
    if (!d) continue;
    const p = path.join(d, "stock_bridge" + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
})();

function findPython() {
  const isWin = process.platform === "win32";
  const candidates = isWin
    ? ["python", "python3", "py"]
    : ["/opt/homebrew/bin/python3.11", "/opt/homebrew/bin/python3.12", "/opt/homebrew/bin/python3.10", "/usr/local/bin/python3", "/usr/bin/python3", "python3", "python"];
  for (const bin of candidates) {
    if (path.isAbsolute(bin)) { try { fs.accessSync(bin, fs.constants.X_OK); return bin; } catch {} }
  }
  return isWin ? "python" : "python3";
}

function findBridgeScript() {
  const candidates = [__dirname, path.join(__dirname, ".."),
    process.resourcesPath ? path.join(process.resourcesPath, "server", "services") : "",
    process.resourcesPath ? path.join(process.resourcesPath, "server") : ""];
  for (const d of candidates) {
    if (!d) continue;
    const p = path.join(d, "stock_bridge.py");
    if (fs.existsSync(p)) return p;
  }
  return path.join(__dirname, "stock_bridge.py");
}

const BRIDGE_SCRIPT = findBridgeScript();
const PYTHON_BIN = BUNDLED_BIN ? null : findPython();

function callBridge(payload, timeout = 30000) {
  return new Promise((resolve) => {
    const useBin = BUNDLED_BIN;
    const opts = { timeout, maxBuffer: 10 * 1024 * 1024, encoding: "utf-8" };
    const child = useBin
      ? execFile(useBin, [JSON.stringify(payload)], opts)
      : execFile(PYTHON_BIN, [BRIDGE_SCRIPT, JSON.stringify(payload)], opts);
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr && (child.stderr.on("data", (d) => { stderr += d; }));
    function tryResolve() {
      if (stdout.trim()) {
        try { resolve(JSON.parse(stdout)); return; } catch {}
      }
      let errMsg = stderr || stdout.slice(0, 200) || "无输出";
      resolve({ ok: false, error: `Python 桥接调用失败: ${errMsg}` });
    }
    let errMsg = "";
    child.on("error", (err) => { errMsg = err.message; });
    child.on("close", (code) => { tryResolve(); });
  });
}

const bridge = {
  async health() { return callBridge({ action: "health" }, 10000); },
  async getStockKline(symbol, options = {}) {
    return callBridge({ action: "kline", symbol, period: options.period || "daily", start: options.startDate, end: options.endDate }, 30000);
  },
  async getMultiMarketQuotes(symbols) { return callBridge({ action: "quote", symbols }, 20000); },
  async searchStock(keyword) { return callBridge({ action: "search", keyword }, 15000); },
  async getIndustries(topN) { return callBridge({ action: "industries", topN }, 20000); },
  async searchSectors(keyword) { return callBridge({ action: "searchSectors", keyword }, 15000); },
  async getRandomKline(count = 500) { return callBridge({ action: "randomKline", count }, 30000); },
};
module.exports = bridge;
