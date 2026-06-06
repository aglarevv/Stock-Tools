import { useState, useEffect } from "react";
import { api } from "../utils/api.js";

const NAV = [
  { id: "dashboard", label: "看板", svg: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>' },
  { id: "calculator", label: "交易计划", svg: '<path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/>' },
  { id: "plan-list", label: "交易记录", svg: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>' },
  { id: "futures", label: "合约计算", svg: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>' },
  { id: "review-list", label: "复盘记录", svg: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>' },
  { id: "review", label: "每日复盘", svg: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>' },
  { id: "indicators", label: "技术指标", svg: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>' },
  { id: "news", label: "每日时事", svg: '<path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>' },
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
        <svg width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="url(#g)"/><path d="M9 12h6l-3 8h4l-4 8 6-14H12L9 12Z" fill="#fff" opacity="0.9"/><defs><linearGradient id="g" x1="0" y1="0" x2="32" y2="32"><stop stopColor="#6366f1"/><stop offset="1" stopColor="#8b5cf6"/></linearGradient></defs></svg>
        <div><div className="sidebar-logo-title">工具箱</div><div className="sidebar-logo-sub">Toolbox</div></div>
      </div>
      <nav className="tool-nav">
        {NAV.map((item) => (
          <button key={item.id} className={`tool-nav-item${active === item.id ? " active" : ""}`} onClick={() => onNavigate(item.id)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: item.svg }} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <button className={`tool-nav-item${active === "settings" ? " active" : ""}`} onClick={() => onNavigate("settings")} style={{ width: "100%", justifyContent: "flex-start", marginBottom: 8 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
          <span>设置</span>
        </button>
        <button className="tool-nav-item" onClick={() => { try { window.open("https://aglarevv.github.io/Stock-Tools", "_blank"); } catch {} }} style={{ width: "100%", justifyContent: "flex-start", marginBottom: 10 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
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
