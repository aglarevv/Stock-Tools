export const formatMoney = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function localDateString(d = new Date()) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function escapeHtml(s) {
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export const defaults = {
  symbol: "自选股", buyPrice: 10, shares: 1000, profitRate: 10, lossRate: 5, feeRate: 0.03,
  tradeDirection: "long", positionPct: 100, tradeNotes: "",
};

export const futuresDefaults = {
  symbol: "BTC", entryPrice: 50000, takeProfitRate: 5, stopLossRate: 2, position: "long", leverage: 1,
};

export const presets = {
  steady: { profitRate: 6, lossRate: 3 },
  balanced: { profitRate: 10, lossRate: 5 },
  aggressive: { profitRate: 18, lossRate: 8 },
};

export const reviewDefaults = (date) => ({
  reviewDate: date, symbol: "自选股", buyPrice: 10, sellPrice: "", shares: 1000, holdingStyle: "短线",
  indexJudgment: "", volumeJudgment: "", sentimentJudgment: "", capitalDirection: "",
  leadingSectors: "", laggingSectors: "", sustainability: "",
  stockStrength: "", volAmpRanking: "", limitAnalysis: "",
  buySignal: "", sellSignal: "", operationReason: "",
  profitAttribution: "", lossAttribution: "", executionNotes: "", improvementPlan: "",
  marketPlan: "", positionPlan: "", newCandidates: "",
  pnlAmount: 0, pnlRate: 0,
});

export function priceAtRate(buyPrice, rate, direction) {
  return Math.max(0, buyPrice * (1 + (direction === "profit" ? 1 : -1) * rate / 100));
}

export function transactionFee(price, shares, feeRate) {
  return price * shares * (feeRate / 100);
}
