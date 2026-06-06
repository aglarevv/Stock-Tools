import { useState, useEffect } from "react";

const S = {
  btn: { width:46,height:36,border:"none",cursor:"pointer",display:"inline-flex",alignItems:"center",justifyContent:"center",background:"transparent",color:"var(--text-secondary)",outline:"none" },
  bar: { position:"fixed",top:0,right:0,zIndex:10000,display:"flex",height:36,alignItems:"center",WebkitAppRegion:"no-drag" },
};

const Icons = {
  min: <svg width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="5.5" width="10" height="1" fill="currentColor"/></svg>,
  max: <svg width="12" height="12" viewBox="0 0 12 12"><rect x="1.5" y="1.5" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1" fill="none"/></svg>,
  rst: <svg width="12" height="12" viewBox="0 0 12 12"><rect x="2" y="0" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1" fill="var(--bg-card)"/><rect x="0" y="3" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1" fill="var(--bg-card)"/></svg>,
  cls: <svg width="12" height="12" viewBox="0 0 12 12"><line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1.4"/><line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" strokeWidth="1.4"/></svg>,
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

  const btn = (action, icon, hoverBg) => (
    <button style={S.btn} onClick={action}
      onMouseEnter={(e) => { e.currentTarget.style.background = hoverBg; e.currentTarget.style.color = "#fff"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; }}>
      {icon}
    </button>
  );

  return (
    <div style={S.bar}>
      {btn(() => api.minimize(), Icons.min, "rgba(0,0,0,0.06)")}
      {btn(() => { maxed ? api.unmaximize() : api.maximize(); }, maxed ? Icons.rst : Icons.max, "rgba(0,0,0,0.06)")}
      {btn(() => api.close(), Icons.cls, "#dc2626")}
    </div>
  );
}
