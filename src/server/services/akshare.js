/** AKShare Node.js 桥接 — 仅保留前端仍使用的接口 */
"use strict";
const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");

const BUNDLED_BIN = (() => {
  const ext = process.platform === "win32" ? ".exe" : "";
  for (const d of [__dirname, path.join(__dirname, ".."), process.resourcesPath ? path.join(process.resourcesPath, "server", "services") : "", process.resourcesPath ? path.join(process.resourcesPath, "server") : ""]) {
    if (d && fs.existsSync(path.join(d, "akshare_bridge" + ext))) return path.join(d, "akshare_bridge" + ext);
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

const BRIDGE_SCRIPT = path.join(__dirname, "akshare_bridge.py");
const PYTHON_BIN = BUNDLED_BIN ? null : findPython();

function callBridge(payload, timeout = 30000) {
  return new Promise((resolve) => {
    const useBin = BUNDLED_BIN;
    const child = useBin
      ? execFile(useBin, [JSON.stringify(payload)], { timeout, maxBuffer: 10 * 1024 * 1024 })
      : execFile(PYTHON_BIN, [BRIDGE_SCRIPT, JSON.stringify(payload)], { timeout, maxBuffer: 10 * 1024 * 1024 });
    let stdout = "";
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.on("error", (err) => {
      if (!useBin) findFallbackBinary(payload, resolve, err);
      else resolve({ ok: false, error: `AKShare 调用失败: ${err.message}` });
    });
    child.on("close", (code) => {
      if (code !== 0 && !BUNDLED_BIN && (stdout.includes("Python was not found") || stdout.includes("No such file"))) {
        findFallbackBinary(payload, resolve, new Error(stdout));
        return;
      }
      try { resolve(JSON.parse(stdout)); }
      catch { resolve({ ok: false, error: `AKShare 解析失败: ${stdout.slice(0, 200)}` }); }
    });
  });
}

function findFallbackBinary(payload, resolve, err) {
  const ext = process.platform === "win32" ? ".exe" : "";
  for (const d of [__dirname, path.join(__dirname, ".."), process.resourcesPath ? path.join(process.resourcesPath, "server", "services") : "", process.resourcesPath ? path.join(process.resourcesPath, "server") : ""]) {
    if (!d) continue;
    const bin = path.join(d, "akshare_bridge" + ext);
    if (fs.existsSync(bin)) {
      const child = execFile(bin, [JSON.stringify(payload)], { timeout: 30000, maxBuffer: 10 * 1024 * 1024 });
      let out = "";
      child.stdout.on("data", d => out += d.toString());
      child.on("close", () => { try { resolve(JSON.parse(out)); } catch { resolve({ ok: false, error: `AKShare 调用失败: ${err.message}` }); } });
      child.on("error", () => resolve({ ok: false, error: `AKShare 调用失败: ${err.message}` }));
      return;
    }
  }
  resolve({ ok: false, error: `AKShare 调用失败: ${err.message}` });
}

const akshare = {
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
module.exports = akshare;
