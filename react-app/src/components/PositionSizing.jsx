/**
 * PositionSizing — 仓位管理（固定比例开仓）
 *
 * 使用总账户的一定比例资金开仓。
 * 公式：
 *   开仓金额   = 总资金 × 开仓比例
 *   可买股数   = floor(开仓金额 / 开仓价) 向下取整至一手（A股100股）
 *   实际占用   = 股数 × 开仓价
 *   止损亏损   = 股数 × (开仓价 - 止损价)
 *   实际亏损率 = 止损亏损 / 总资金
 */
import { useState } from "react";
import Button from "./Button.jsx";
import Icon from "./Icon.jsx";
const ROUND_LOTS = { ashare: 100, usstock: 1, hkstock: 1 };

export default function PositionSizing() {
  const [form, setForm] = useState({
    capital: "100000",
    entryPrice: "",
    stopLoss: "",
    openPct: "2",          // 开仓比例 %
    board: "ashare",
  });

  const [result, setResult] = useState(null);

  function handleChange(key, value) {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      setResult(compute(next));
      return next;
    });
  }

  function compute(f) {
    const capital = Number(f.capital);
    const entry = Number(f.entryPrice);
    const stop = Number(f.stopLoss);
    const openPct = Number(f.openPct);
    const lot = ROUND_LOTS[f.board] || 100;

    if (!capital || !entry || !openPct) return null;
    if (openPct <= 0 || openPct > 100) return { error: "开仓比例应在 1–100 之间" };

    const openAmount = capital * (openPct / 100);          // 计划开仓金额
    const rawShares = Math.floor(openAmount / entry);      // 按开仓金额算最多可买股数
    const shares = Math.floor(rawShares / lot) * lot;      // 向下取整至整手

    const positionValue = shares * entry;                  // 实际占用资金
    const capitalRemaining = capital - positionValue;

    let riskAmount = null;
    let riskPct = null;
    let stopLossPct = null;
    if (stop && entry > stop) {
      const riskPerShare = entry - stop;
      riskAmount = shares * riskPerShare;                  // 触发止损会亏多少
      riskPct = (riskAmount / capital) * 100;              // 占总资金比例
      stopLossPct = (riskPerShare / entry) * 100;          // 止损幅度
    }

    return {
      shares,
      positionValue,
      openAmount,
      openPct,
      capitalRemaining,
      capitalUsagePct: (positionValue / capital) * 100,
      riskAmount,
      riskPct,
      stopLossPct,
      board: f.board,
    };
  }

  return (
    <div className="page">
      <div className="topbar">
        <h1 className="topbar-title"><Icon name="calculator" size={22} /> 仓位管理</h1>
      </div>

      <div className="content-grid">
        {/* 输入区 */}
        <div className="card">
          <div className="card-header"><h2>参数设置</h2></div>
          <div className="card-body">
            <div className="form-row cols-2">
              <div className="form-field">
                <label>总资金（元）</label>
                <input
                  type="number"
                  value={form.capital}
                  onChange={e => handleChange("capital", e.target.value)}
                />
              </div>
              <div className="form-field">
                <label>开仓比例</label>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <input
                    type="number"
                    step="0.1"
                    value={form.openPct}
                    onChange={e => handleChange("openPct", e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>%</span>
                </div>
              </div>
            </div>

            <div className="form-row cols-2">
              <div className="form-field">
                <label>开仓价</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.entryPrice}
                  onChange={e => handleChange("entryPrice", e.target.value)}
                  placeholder="如 50.00"
                />
              </div>
              <div className="form-field">
                <label>止损价（可选）</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.stopLoss}
                  onChange={e => handleChange("stopLoss", e.target.value)}
                  placeholder="用于计算止损亏损"
                />
              </div>
            </div>

            <div className="form-field" style={{ marginTop: 4 }}>
              <label>交易市场</label>
              <div className="preset-group">
                {[
                  { id: "ashare", label: "A股（整百）" },
                  { id: "usstock", label: "美股（整数股）" },
                  { id: "hkstock", label: "港股（整手）" },
                ].map(b => (
                  <button
                    key={b.id}
                    className={`preset-btn${form.board === b.id ? " active" : ""}`}
                    onClick={() => handleChange("board", b.id)}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 结果区 */}
        <div className="card">
          <div className="card-header"><h2>计算结果</h2></div>
          <div className="card-body">
            {result === null ? (
              <div className="empty-text">填写参数后自动计算</div>
            ) : result.error ? (
              <div style={{ padding: 12, background: "var(--loss-soft)", borderRadius: 8, color: "var(--loss)", fontSize: 13, fontWeight: 500 }}>
                ⚠️ {result.error}
              </div>
            ) : result.shares === 0 ? (
              <div style={{ padding: 12, background: "var(--warning)", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 500 }}>
                ⚠️ {result.openAmount.toFixed(0)} 元不够买一手（{result.board === "ashare" ? "A股需要" : "一手"}至少 {(ROUND_LOTS[result.board] || 100) * Number(form.entryPrice)} 元）
              </div>
            ) : (
              <>
                {/* 核心结果 */}
                <div className="metrics-row" style={{ marginBottom: 16 }}>
                  <div className="metric-card metric-base">
                    <div className="metric-label">建议买入</div>
                    <div className="metric-value" style={{ fontSize: 32 }}>
                      {result.shares.toLocaleString()}
                    </div>
                    <div className="metric-desc">股</div>
                  </div>
                  <div className="metric-card metric-profit">
                    <div className="metric-label">占用资金</div>
                    <div className="metric-value">{result.positionValue.toLocaleString()}</div>
                    <div className="metric-desc">
                      {result.capitalUsagePct.toFixed(1)}% 总资金
                    </div>
                  </div>
                  <div className="metric-card metric-info">
                    <div className="metric-label">剩余资金</div>
                    <div className="metric-value">{result.capitalRemaining.toLocaleString()}</div>
                    <div className="metric-desc">
                      计划开仓 {result.openAmount.toFixed(0)} 元（{result.openPct}%）
                    </div>
                  </div>
                </div>

                {/* 止损相关 */}
                {result.riskAmount != null && (
                  <div style={{ padding: "12px 16px", background: "var(--loss-soft)", borderRadius: 8, marginBottom: 16, fontSize: 13, lineHeight: 1.8 }}>
                    <strong style={{ color: "var(--loss)" }}>📉 止损参考（止损价 {Number(form.stopLoss).toFixed(2)}）</strong>
                    <div style={{ display: "flex", gap: 24, marginTop: 4 }}>
                      <div>
                        <span style={{ color: "var(--text-muted)" }}>每股亏损：</span>
                        <strong>{(Number(form.entryPrice) - Number(form.stopLoss)).toFixed(2)} 元</strong>
                      </div>
                      <div>
                        <span style={{ color: "var(--text-muted)" }}>总亏损：</span>
                        <strong className="red">{result.riskAmount.toFixed(0)} 元</strong>
                      </div>
                      <div>
                        <span style={{ color: "var(--text-muted)" }}>占资金：</span>
                        <strong className="red">{result.riskPct.toFixed(2)}%</strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* 详细数据 */}
                <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 12 }}>
                  <table className="data-table">
                    <tbody>
                      <tr>
                        <td style={{ color: "var(--text-secondary)" }}>开仓金额</td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>{result.openAmount.toFixed(0)} 元</td>
                      </tr>
                      <tr>
                        <td style={{ color: "var(--text-secondary)" }}>实际占用</td>
                        <td style={{ textAlign: "right" }}>{result.positionValue.toFixed(0)} 元（{result.capitalUsagePct.toFixed(1)}%）</td>
                      </tr>
                      {result.riskPct != null && (
                        <>
                          <tr>
                            <td style={{ color: "var(--text-secondary)" }}>止损幅度</td>
                            <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>
                              {result.stopLossPct.toFixed(2)}%
                            </td>
                          </tr>
                          <tr>
                            <td style={{ color: "var(--text-secondary)" }}>止损亏损</td>
                            <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--loss)" }}>
                              {result.riskAmount.toFixed(0)} 元（{result.riskPct.toFixed(2)}%）
                            </td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* 盈亏参考 */}
                <div style={{ marginTop: 16, padding: "12px 16px", background: "var(--accent-soft)", borderRadius: 8, fontSize: 13, lineHeight: 1.7 }}>
                  <strong>盈亏参考</strong>
                  <div>💹 涨 1% 盈利：{(result.shares * Number(form.entryPrice) * 0.01).toFixed(0)} 元</div>
                  {result.riskAmount != null && (
                    <div>📉 跌至止损：{result.riskAmount.toFixed(0)} 元（占资金 {result.riskPct.toFixed(2)}%）</div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 使用说明 */}
      <div className="card">
        <div className="card-header"><h2>使用说明</h2></div>
        <div className="card-body">
          <div className="method-step">
            <div className="step-num">1</div>
            <div>
              <strong>确定开仓比例</strong>
              <p>用总账户的百分之几资金开仓？例如 100 万账户，开仓比例 2%，就是用 2 万元买入</p>
            </div>
          </div>
          <div className="method-step">
            <div className="step-num">2</div>
            <div>
              <strong>设置止损（可选）</strong>
              <p>输入止损价后自动计算触发止损时的实际亏损金额和占总资金比例</p>
            </div>
          </div>
          <div className="method-step">
            <div className="step-num">3</div>
            <div>
              <strong>计算股数</strong>
              <p>可买股数 = floor(开仓金额 / 开仓价)，A股向下取整至 100 股（一手）</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
