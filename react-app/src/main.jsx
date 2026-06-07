/**
 * React 应用入口
 *
 * - 内嵌 Inter + JetBrains Mono 字体（离线可用）
 * - WKWebView 输入补丁：劫持 value setter 确保粘贴触发 onChange
 * - React.StrictMode 开发环境下双次渲染检测副作用
 */
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { api } from "./utils/api.js";

// 内嵌字体（Inter ≈ SF Pro 风格，JetBrains Mono 等宽字体）
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "./styles/global.css";

// ── 启动时读取保存的主题并立即应用（避免闪烁） ──
(async () => {
  try {
    const data = await api.getSettings();
    const theme = data?.settings?.theme || "light";
    document.documentElement.setAttribute("data-theme", theme);
  } catch {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();

// ── 检测操作系统平台，用于 CSS 字体渲染优化 ──
// Windows 上使用 -webkit-font-smoothing: auto 避免字体模糊
(function detectPlatform() {
  const platform = navigator.platform?.toLowerCase() || "";
  if (platform.includes("win")) {
    document.documentElement.setAttribute("data-platform", "win32");
  } else if (platform.includes("mac")) {
    document.documentElement.setAttribute("data-platform", "mac");
  }
})();

// WKWebView 输入补丁：劫持 input/textarea 的 value setter
// 确保任何值变更（含粘贴）都派发 input/change 事件 → React onChange 被触发
requestAnimationFrame(() => {
  function patch(proto) {
    const native = Object.getOwnPropertyDescriptor(proto, "value");
    if (!native) return;
    Object.defineProperty(proto, "value", {
      get: native.get,
      set(v) {
        native.set.call(this, v);
        this.dispatchEvent(new Event("input", { bubbles: true }));
        this.dispatchEvent(new Event("change", { bubbles: true }));
      },
    });
  }
  patch(HTMLInputElement.prototype);
  patch(HTMLTextAreaElement.prototype);
});

// ── 粘贴兼容补丁 ──
// 部分环境（macOS WKWebView、某些浏览器）原生粘贴后不会触达 React 合成事件。
// 此处不拦截 paste（让原生行为正常执行），仅在 paste 后确保 input 事件被派发。
document.addEventListener("paste", function () {
  const el = document.activeElement;
  if (!el || (el.tagName !== "TEXTAREA" && el.tagName !== "INPUT")) return;
  // 延迟到浏览器完成原生粘贴后再派发事件
  requestAnimationFrame(function () {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}, false);

// 挂载 React 应用到 #root 元素
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
