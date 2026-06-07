import { useState, useEffect } from "react";
import Icon from "./Icon.jsx";

const S = {
  btn: { width: 46, height: 36, border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "transparent", color: "var(--text-secondary)", outline: "none" },
  bar: { position: "fixed", top: 0, right: 0, zIndex: 10000, display: "flex", height: 36, alignItems: "center", WebkitAppRegion: "no-drag" },
};

export default function TitleBar() {
  const [maxed, setMaxed] = useState(false);
  const api = window.electronAPI;

  useEffect(() => {
    if (!api) return;
    api.isMaximized().then(setMaxed);
    const cleanup = api.onMaximizeChange(setMaxed);
    return () => { if (typeof cleanup === "function") cleanup(); };
  }, []);

  if (!api) return null;

  const btn = (action, iconName, hoverBg) => (
    <button style={S.btn} onClick={action}
      onMouseEnter={(e) => { e.currentTarget.style.background = hoverBg; e.currentTarget.style.color = "#fff"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; }}>
      <Icon name={iconName} size={12} />
    </button>
  );

  return (
    <div style={S.bar}>
      {btn(() => api.minimize(), "minimize", "rgba(0,0,0,0.06)")}
      {btn(() => { maxed ? api.unmaximize() : api.maximize(); }, maxed ? "restore" : "maximize", "rgba(0,0,0,0.06)")}
      {btn(() => api.close(), "close", "#dc2626")}
    </div>
  );
}
