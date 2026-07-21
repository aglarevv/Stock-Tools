import { useState } from "react";
import { useApi } from "../hooks/useApi.jsx";
import Icon from "./Icon.jsx";
import Button from "./Button.jsx";

export default function DailyMarketReview({ navigate, showToast }) {
  const api = useApi();
  const [loading, setLoading] = useState(false);
  const [review, setReview] = useState("");
  const [dataContext, setDataContext] = useState(null);

  async function handleGenerate() {
    setLoading(true);
    setReview("");
    setDataContext(null);
    try {
      const settings = await api.getSettings();
      const aiConfig = {
        url: settings.settings?.aiUrl,
        key: settings.settings?.aiKey,
        model: settings.settings?.aiModel,
        thinking: settings.settings?.aiThinking !== "false",
      };
      const data = await api.dailyMarketReview(aiConfig);
      setReview(data.review);
      setDataContext(data.dataContext);
      showToast("复盘报告生成完成！", "ok");
    } catch (err) {
      showToast(`复盘生成失败：${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="topbar">
        <h1 className="topbar-title">
          <Icon name="trending-up" size={22} />
          每日AI复盘
        </h1>
        <span className="badge">新闻+行情→AI分析</span>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <h2>📊 AI 市场综合分析</h2>
        </div>
        <div className="card-body">
          <p style={{ marginBottom: 16, opacity: 0.7, fontSize: 14, lineHeight: 1.6 }}>
            基于选股通最新财经快讯 + A股实时行情数据（上证/深证/创业板指数、热门板块、涨停板、资金流向），
            AI 综合分析当日市场并预判次日走势，同时列出值得关注的标的。
          </p>

          <Button
            variant="primary"
            onClick={handleGenerate}
            disabled={loading}
            style={{ fontSize: 16, padding: "12px 32px" }}
          >
            {loading ? (
              <>⏳ AI 正在分析市场数据...</>
            ) : (
              <>🤖 生成每日复盘报告</>
            )}
          </Button>

          {loading && (
            <div style={{ marginTop: 16, fontSize: 13, opacity: 0.6 }}>
              正在获取：大盘指数 → 热门板块 → 涨停板 → 资金流向 → AI综合分析...
            </div>
          )}
        </div>
      </div>

      {review && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2>📝 复盘报告</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="ghost" size="sm" onClick={() => navigator.clipboard?.writeText(review)}>📋 复制</Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("review", { reviewContent: review })}
              >📝 保存到复盘</Button>
            </div>
          </div>
          <div className="card-body" style={{ whiteSpace: "pre-wrap", lineHeight: 1.9, fontSize: 14 }}>
            {review}
          </div>
        </div>
      )}

      {dataContext && (
        <details className="card" style={{ marginTop: 16, opacity: 0.7 }}>
          <summary className="card-header" style={{ cursor: "pointer" }}>
            <h3>📡 数据上下文（AI 分析所使用的原始数据）</h3>
          </summary>
          <div className="card-body" style={{ fontSize: 12, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
            <div style={{ marginBottom: 12 }}>
              <strong>大盘指数：</strong>
              <pre style={{ marginTop: 4, fontSize: 11 }}>{dataContext.indexSummary || "（暂无）"}</pre>
            </div>
            <div style={{ marginBottom: 12 }}>
              <strong>热门板块：</strong>
              <pre style={{ marginTop: 4, fontSize: 11 }}>{dataContext.sectorSummary || "（暂无）"}</pre>
            </div>
            <div style={{ marginBottom: 12 }}>
              <strong>涨停板：</strong>
              <pre style={{ marginTop: 4, fontSize: 11 }}>{dataContext.ztSummary || "（暂无）"}</pre>
            </div>
            <div>
              <strong>资金流向：</strong>
              <pre style={{ marginTop: 4, fontSize: 11 }}>{dataContext.fundSummary || "（暂无）"}</pre>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
