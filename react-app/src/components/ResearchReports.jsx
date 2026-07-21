import { useState, useRef, useEffect } from "react";
import { useApi } from "../hooks/useApi.jsx";
import Icon from "./Icon.jsx";
import Button from "./Button.jsx";

export default function ResearchReports({ navigate, showToast }) {
  const api = useApi();
  const fileInputRef = useRef(null);
  const [tab, setTab] = useState("analyze");
  const [loading, setLoading] = useState(false);

  // 文件
  const [fileList, setFileList] = useState([]);
  const [singleText, setSingleText] = useState("");
  const [singleTitle, setSingleTitle] = useState("");

  // 结果
  const [result, setResult] = useState(null);

  // Skills
  const [skills, setSkills] = useState([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState([]);

  // 编写
  const [writeTopic, setWriteTopic] = useState("");
  const [writtenReport, setWrittenReport] = useState("");

  useEffect(() => { loadSkills(); }, []);

  async function loadSkills() {
    try { const d = await api.listReportSkills(); if (d.skills) setSkills(d.skills); } catch {}
  }

  function addFiles(files) {
    const readers = [...files].map(file => new Promise(resolve => {
      const r = new FileReader();
      r.onload = e => resolve({ name: file.name.replace(/\.[^.]+$/, ""), text: e.target.result, size: file.size });
      r.readAsText(file);
    }));
    Promise.all(readers).then(newFiles => {
      setFileList(prev => [...prev, ...newFiles].slice(0, 10));
      showToast(`已添加 ${newFiles.length} 个文件`, "info");
    });
  }

  function removeFile(idx) { setFileList(prev => prev.filter((_, i) => i !== idx)); }

  function handleFileSelect(e) {
    if (e.target.files?.length) { addFiles(e.target.files); e.target.value = ""; }
  }

  function handleDrop(e) {
    e.preventDefault();
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  }

  async function handleAnalyze() {
    const hasFiles = fileList.length > 0;
    const hasText = singleText.trim().length >= 100;
    if (!hasFiles && !hasText) { showToast("请上传文件或粘贴研报内容（至少100字）", "warn"); return; }

    setLoading(true);
    setResult(null);
    try {
      const settings = await api.getSettings();
      const aiConfig = { url: settings.settings?.aiUrl, key: settings.settings?.aiKey, model: settings.settings?.aiModel, thinking: settings.settings?.aiThinking !== "false" };

      if (hasFiles) {
        const files = fileList.filter(f => f.text.trim().length >= 100);
        if (files.length === 0) { showToast("文件中无有效内容", "error"); setLoading(false); return; }
        const data = await api.analyzeReport(null, null, aiConfig, { files });
        setResult(data);
        loadSkills();
        showToast(`分析完成：${data.fileCount} 份 → ${data.individual?.length || 0} 独立 + 1 融合`, "ok");
      } else {
        const data = await api.analyzeReport(singleText.trim(), singleTitle || "粘贴文本", aiConfig);
        setResult(data);
        loadSkills();
        showToast("方法论提取成功！", "ok");
      }
    } catch (err) { showToast(`分析失败：${err.message}`, "error"); }
    finally { setLoading(false); }
  }

  function toggleSkill(id) {
    setSelectedSkillIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id].slice(0, 5));
  }

  async function handleWrite() {
    if (!writeTopic.trim()) { showToast("请输入研报主题", "warn"); return; }
    if (selectedSkillIds.length === 0) { showToast("请至少选择一个方法论", "warn"); return; }
    setLoading(true);
    setWrittenReport("");
    try {
      const settings = await api.getSettings();
      const aiConfig = { url: settings.settings?.aiUrl, key: settings.settings?.aiKey, model: settings.settings?.aiModel, thinking: settings.settings?.aiThinking !== "false" };
      const data = await api.writeReport(writeTopic.trim(), null, aiConfig, { skillIds: selectedSkillIds });
      setWrittenReport(data.report);
      showToast(`研报完成！融合 ${data.skillCount} 个方法论`, "ok");
    } catch (err) { showToast(`编写失败：${err.message}`, "error"); }
    finally { setLoading(false); }
  }

  async function handleDeleteSkill(id) {
    try { await api.deleteReportSkill(id); loadSkills(); showToast("已删除", "info"); } catch (err) { showToast(err.message, "error"); }
  }

  return (
    <div className="page">
      <div className="topbar">
        <h1 className="topbar-title"><Icon name="book" size={22} />研报分析</h1>
        <div className="tab-bar">
          <button className={`tab-btn${tab === "analyze" ? " active" : ""}`} onClick={() => setTab("analyze")}>📤 分析研报</button>
          <button className={`tab-btn${tab === "write" ? " active" : ""}`} onClick={() => setTab("write")}>✍️ 编写研报</button>
          <button className={`tab-btn${tab === "skills" ? " active" : ""}`} onClick={() => setTab("skills")}>📚 方法论库</button>
        </div>
      </div>

      {/* ═══ Tab: 分析 ═══ */}
      {tab === "analyze" && (
        <div className="card">
          <div className="card-header"><h2>上传研报 → AI 提取分析方法论</h2></div>
          <div className="card-body">
            <div className="dropzone" onDrop={handleDrop} onDragOver={e => e.preventDefault()} onClick={() => fileInputRef.current?.click()}>
              <Icon name="upload" size={28} style={{ opacity: 0.5 }} />
              <p><strong>拖拽研报文件到此（支持多文件）</strong></p>
              <p className="dropzone-hint">TXT/MD 直接读取 · 最多 10 份</p>
              <input ref={fileInputRef} type="file" accept=".txt,.md,.csv" multiple style={{ display: "none" }} onChange={handleFileSelect} />
            </div>

            {fileList.length > 0 && (
              <div className="file-list">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div className="form-field" style={{ margin: 0 }}><label>已加载文件（{fileList.length}/10）</label></div>
                  <Button variant="ghost" size="sm" onClick={() => setFileList([])}>清空</Button>
                </div>
                {fileList.map((f, i) => (
                  <div key={i} className="file-item">
                    <div>
                      <span className="file-item-name">{f.name}</span>
                      <span className="file-item-meta">{f.text.length} 字</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span className="file-item-size">{(f.size / 1024).toFixed(1)}KB</span>
                      <Button variant="ghost" size="sm" style={{ color: "var(--loss)", padding: "2px 6px" }} onClick={() => removeFile(i)}>✕</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--text-muted)" }}>或手动粘贴研报文本</summary>
              <div className="form-field" style={{ marginTop: 8 }}>
                <label>研报标题（可选）</label>
                <input value={singleTitle} onChange={e => setSingleTitle(e.target.value)} placeholder="研报标题" />
              </div>
              <div className="form-field" style={{ marginTop: 8 }}>
                <label>研报内容</label>
                <textarea value={singleText} onChange={e => setSingleText(e.target.value)} placeholder="粘贴研报内容..." style={{ minHeight: 120 }} />
              </div>
            </details>

            <div style={{ marginTop: 12 }}>
              <Button variant="primary" onClick={handleAnalyze} disabled={loading}>
                {loading ? "AI 分析中..." : `🤖 提取方法论${fileList.length > 1 ? `（${fileList.length} 份文件）` : ''}`}
              </Button>
            </div>

            {result && (
              <div className="report-result">
                {result.combined && (
                  <div className="card result-card">
                    <div className="card-header"><h3>🔗 融合方法论：{result.combined.methodology.name}</h3></div>
                    <div className="card-body">
                      <SkillDetail methodology={result.combined.methodology} />
                      <span className="badge" style={{ background: "rgba(22,163,74,0.08)", color: "var(--profit)", marginTop: 8 }}>✅ 已保存：{result.combined.skill.name}</span>
                    </div>
                  </div>
                )}

                {result.methodology && !result.combined && (
                  <div className="card result-card">
                    <div className="card-header"><h3>📋 方法论：{result.methodology.name}</h3></div>
                    <div className="card-body">
                      <SkillDetail methodology={result.methodology} />
                      {result.skill && <span className="badge" style={{ background: "rgba(22,163,74,0.08)", color: "var(--profit)", marginTop: 8 }}>✅ 已保存：{result.skill.name}</span>}
                    </div>
                  </div>
                )}

                {result.individual?.length > 0 && (
                  <details style={{ marginTop: 12 }}>
                    <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                      📑 各文件独立方法论（{result.individual.length}）
                    </summary>
                    {result.individual.map((item, i) => item.methodology && (
                      <div key={i} className="result-card-individual">
                        <h4>{i + 1}. {item.methodology.name}</h4>
                        <div className="source-label">来源：{item.fileName || `文件${i + 1}`}</div>
                        <SkillDetail methodology={item.methodology} compact />
                        {item.skill && <span className="badge" style={{ fontSize: 10, marginTop: 4 }}>✅ {item.skill.name}</span>}
                      </div>
                    ))}
                  </details>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ Tab: 编写 ═══ */}
      {tab === "write" && (
        <div className="card">
          <div className="card-header"><h2>选择方法论 + 主题 → AI 编写研报</h2></div>
          <div className="card-body">
            {skills.length === 0 ? (
              <div className="empty-text">请先在「分析研报」Tab 中上传研报并提取方法论</div>
            ) : (
              <>
                <div className="form-field" style={{ marginBottom: 12 }}>
                  <label>
                    选择分析方法论（可多选融合，最多 5 个）
                    {selectedSkillIds.length > 0 && <span style={{ color: "var(--accent)", marginLeft: 8, textTransform: "none", fontWeight: 400 }}>已选 {selectedSkillIds.length} 个</span>}
                  </label>
                  <div className="skill-chips" style={{ marginTop: 6 }}>
                    {skills.map(s => {
                      const active = selectedSkillIds.includes(s.id);
                      return (
                        <button key={s.id} className={`skill-chip${active ? " active" : ""}`} onClick={() => toggleSkill(s.id)}>
                          {active ? "✓ " : ""}{s.name}
                        </button>
                      );
                    })}
                  </div>
                  {selectedSkillIds.length > 1 && <div className="fusion-note">🔗 将融合 {selectedSkillIds.length} 个方法论视角</div>}
                </div>

                <div className="form-field" style={{ marginBottom: 12 }}>
                  <label>研报主题/标的</label>
                  <input value={writeTopic} onChange={e => setWriteTopic(e.target.value)} placeholder="如：半导体设备国产化、新能源Q3展望、贵州茅台深度" />
                </div>

                <Button variant="primary" onClick={handleWrite} disabled={loading}>
                  {loading ? "AI 编写中..." : "✍️ 编写研报"}
                </Button>

                {writtenReport && (
                  <div className="card result-card" style={{ marginTop: 16 }}>
                    <div className="card-header" style={{ display: "flex", justifyContent: "space-between" }}>
                      <h3>📄 {writeTopic}</h3>
                      <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard?.writeText(writtenReport); showToast("已复制", "info"); }}>📋 复制</Button>
                    </div>
                    <div className="card-body report-text">{writtenReport}</div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══ Tab: 方法论库 ═══ */}
      {tab === "skills" && (
        <div className="card">
          <div className="card-header"><h2>方法论库（{skills.length}）</h2></div>
          <div className="card-body">
            {skills.length === 0 ? (
              <div className="empty-text">暂无保存的方法论，请在「分析研报」中上传研报并提取</div>
            ) : skills.map(s => (
              <div key={s.id} className="card result-card-individual" style={{ border: "1px solid var(--border-subtle)", opacity: 1 }}>
                <div className="card-header" style={{ border: "none", padding: "12px 16px" }}>
                  <h3 style={{ fontSize: 14, textTransform: "none", color: "var(--text-primary)" }}>{s.name}</h3>
                  <Button variant="ghost" size="sm" style={{ color: "var(--loss)" }} onClick={() => handleDeleteSkill(s.id)}>🗑️ 删除</Button>
                </div>
                <div style={{ padding: "0 16px 12px" }}>
                  <SkillDetail methodology={s} />
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>来源：{s.sourceReport} · {new Date(s.createdAt).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SkillDetail({ methodology, compact = false }) {
  const m = methodology;
  if (!m) return null;

  const items = [
    { label: "框架", value: m.framework },
    { label: "定量条件", value: m.selectionLogic?.quantitative?.join("；") },
    { label: "定性条件", value: m.selectionLogic?.qualitative?.join("；") },
    { label: "核心指标", value: m.keyIndicators?.join("、") },
    { label: "输出格式", value: m.outputFormat?.sections?.join(" → ") },
    { label: "信息来源", value: m.dataSources?.join("、") },
    { label: "交叉分析", value: m.crossAnalysis },
    { label: "独特视角", value: m.uniqueAngles?.join("；") },
  ].filter(x => x.value);

  const cls = compact ? "report-detail compact" : "report-detail";
  return (
    <dl className={cls}>
      {items.map((item, i) => (
        <div key={i}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
