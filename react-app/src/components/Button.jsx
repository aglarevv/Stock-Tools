/**
 * Button — 统一按钮组件
 *
 * 用法：
 *   <Button variant="primary" onClick={handleSave}>保存</Button>
 *   <Button variant="ghost" icon="refresh" loading />
 *   <Button variant="delete" size="sm" fullWidth>删除</Button>
 *
 * variant:  primary | ghost | delete | preset
 * size:     sm | md (默认)
 * 所有原生 <button> 属性均可透传（type, disabled, onClick 等）
 */

import Icon from "./Icon.jsx";

const VARIANT_CLASS = {
  primary: "btn-primary",
  ghost: "btn-ghost",
  delete: "btn-delete",
  preset: "", // preset 按钮使用独立的 preset-btn 类
};

export default function Button({
  children,
  variant = "ghost",
  size,
  icon,
  iconSize = 16,
  loading = false,
  disabled = false,
  fullWidth = false,
  className = "",
  style = {},
  ...props
}) {
  const cls = [
    "btn",
    VARIANT_CLASS[variant] || "btn-ghost",
    fullWidth ? "btn-full" : "",
    size === "sm" ? "btn-sm" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={cls} disabled={disabled || loading} style={style} {...props}>
      {loading && <span className="btn-spinner" />}
      {!loading && icon && <Icon name={icon} size={iconSize} />}
      {children && <span>{children}</span>}
    </button>
  );
}

/**
 * PresetButton — 策略预设按钮组专用
 * 用于交易计划中的"稳健/均衡/进攻"预设选择
 */
export function PresetButton({ active, children, onClick }) {
  return (
    <button
      className={`preset-btn${active ? " active" : ""}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * TabButton — 标签切换按钮（DailyReview 中的 tab 切换）
 */
export function TabButton({ active, icon, children, onClick }) {
  return (
    <button
      className={`btn ${active ? "btn-primary" : "btn-ghost"}`}
      style={{ borderRadius: 0, border: "none" }}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
