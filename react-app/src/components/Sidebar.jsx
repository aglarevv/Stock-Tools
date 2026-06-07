import { useState, useEffect } from "react";
import { api } from "../utils/api.js";
import Icon, { Logo } from "./Icon.jsx";

const NAV = [
  { id: "dashboard", label: "看板", icon: "dashboard" },
  { id: "calculator", label: "交易计划", icon: "calculator" },
  { id: "plan-list", label: "交易记录", icon: "plan-list" },
  { id: "futures", label: "合约计算", icon: "futures" },
  { id: "review-list", label: "复盘记录", icon: "review-list" },
  { id: "review", label: "每日复盘", icon: "review" },
  { id: "indicators", label: "技术指标", icon: "indicators" },
  { id: "news", label: "每日时事", icon: "news" },
];

export default function Sidebar({ active, onNavigate }) {
  const [dbStatus, setDbStatus] = useState("checking");

  useEffect(() => {
    api.health().then((d) => setDbStatus(d.database === "ready" ? "online" : "error")).catch(() => setDbStatus("error"));
    const t = setInterval(() => {
      api.health().then((d) => setDbStatus(d.database === "ready" ? "online" : "error")).catch(() => setDbStatus("error"));
    }, 10000);
    return () => clearInterval(t);
  }, []);

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <Logo size={32} />
        <div><div className="sidebar-logo-title">工具箱</div><div className="sidebar-logo-sub">Toolbox</div></div>
      </div>
      <nav className="tool-nav">
        {NAV.map((item) => (
          <button
            key={item.id}
            className={`tool-nav-item${active === item.id ? " active" : ""}`}
            onClick={() => onNavigate(item.id)}
          >
            <Icon name={item.icon} size={18} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <button
          className={`tool-nav-item${active === "settings" ? " active" : ""}`}
          onClick={() => onNavigate("settings")}
          style={{ width: "100%", justifyContent: "flex-start", marginBottom: 8 }}
        >
          <Icon name="settings" size={18} />
          <span>设置</span>
        </button>
        <button
          className="tool-nav-item"
          onClick={() => { try { window.open("https://aglarevv.github.io/Stock-Tools", "_blank"); } catch {} }}
          style={{ width: "100%", justifyContent: "flex-start", marginBottom: 10 }}
        >
          <Icon name="globe" size={18} />
          <span>官网</span>
        </button>
        <div className="db-status">
          <span className={`db-dot ${dbStatus}`} />
          <span>{dbStatus === "online" ? "已连接" : dbStatus === "error" ? "未连接" : "检测中"}</span>
        </div>
      </div>
    </aside>
  );
}
