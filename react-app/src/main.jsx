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

// 内嵌字体（Inter ≈ SF Pro 风格，JetBrains Mono 等宽字体）
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "./styles/global.css";

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

// 挂载 React 应用到 #root 元素
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
