/**
 * DigestRenderer — 日报/周报/月报摘要富文本渲染
 *
 * 纯展示组件：将 AI 生成的摘要文本（含 [来源N] 角标、**粗体**、利好/利空标注）
 * 渲染为带交互的 React 元素。
 */
import Icon from "./Icon.jsx";

/** 主渲染入口：将纯文本摘要渲染为 React 元素 */
export function renderDigest(text, linkMapOverride, flattenArticlesFn) {
  if (!text) return null;
  const linkMap = linkMapOverride || buildLinkMap(flattenArticlesFn);
  const cleaned = text.replace(/^#{1,6}\s+/gm, "");
  const lines = cleaned.split("\n");
  return lines.map((line, li) => {
    if (!line.trim()) return <br key={li} />;
    const segments = parseInlineMarkdown(line, linkMap);
    const isSOP = /^(SOP\s*[123])/.test(line.trim());
    const isKey = /^(结语|展望|核心矛盾|明日|总体)/.test(line.trim());
    return (
      <p key={li} style={{ marginBottom: "0.5em", fontWeight: isSOP ? 700 : "normal", color: isSOP ? "var(--accent)" : isKey ? "var(--text-primary)" : "inherit", fontSize: isSOP ? 15 : 14, borderLeft: isSOP ? "3px solid var(--accent)" : "none", paddingLeft: isSOP ? 10 : 0 }}>
        {segments}
      </p>
    );
  });
}

/** 构建 [来源N] → { title, link, source } 的映射表 */
export function buildLinkMap(flattenArticlesFn) {
  const articles = typeof flattenArticlesFn === "function" ? flattenArticlesFn() : [];
  const map = {};
  articles.forEach((a, i) => { map[i + 1] = { title: a.title, link: a.link, source: a.source }; });
  return map;
}

/** 解析行内标记：[来源N] 角标 + **粗体** + 利好/利空颜色 */
function parseInlineMarkdown(line, linkMap) {
  const parts = line.split(/(\[(?:来源)?\d+\])/g);
  return parts.map((part, i) => {
    const citeM = part.match(/^\[(?:来源)?(\d+)\]$/);
    if (citeM) {
      const num = parseInt(citeM[1]);
      const info = linkMap[num];
      if (info?.link) {
        return (
          <a key={`c${i}`} href={info.link} target="_blank" rel="noopener noreferrer" className="cite-link"
            title={info.title}
            onClick={(e) => { e.preventDefault(); try { window.open(info.link, "_blank"); } catch {} }}
          >[{num}]</a>
        );
      }
      return <span key={`c${i}`} className="cite-muted">[{num}]</span>;
    }
    const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
    if (boldParts.length > 1) {
      return boldParts.map((bp, j) => {
        const bm = bp.match(/^\*\*(.+)\*\*$/);
        if (bm) {
          const txt = bm[1];
          const style = /利好/.test(txt) && !/利空/.test(txt) ? { color: "var(--profit)" } : /利空/.test(txt) && !/利好/.test(txt) ? { color: "var(--loss)" } : {};
          return <strong key={`b${i}${j}`} style={style}>{txt}</strong>;
        }
        return colorizeText(bp, `t${i}${j}`);
      });
    }
    return colorizeText(part, `t${i}`);
  }).flat();
}

/** 给含 利空/利好 的文本片段添加颜色 */
function colorizeText(text, key) {
  const parts = text.split(/(利好|利空)/g);
  if (parts.length <= 1) return <span key={key}>{text}</span>;
  return parts.map((p, j) => {
    if (p === "利好") return <strong key={`${key}-${j}`} style={{ color: "var(--profit)" }}>利好</strong>;
    if (p === "利空") return <strong key={`${key}-${j}`} style={{ color: "var(--loss)" }}>利空</strong>;
    return <span key={`${key}-${j}`}>{p}</span>;
  });
}

/** 摘要底栏：角标说明 + 来源计数 */
export function DigestFooter({ sourceCount }) {
  return (
    <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border-subtle)", fontSize: 11, color: "var(--text-muted)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
      <span>
        <Icon name="paperclip" size={12} style={{ verticalAlign: -1, marginRight: 2 }} />
        点击角标 [N] 跳转原文 · <strong style={{ color: "var(--profit)" }}>利好</strong>/<strong style={{ color: "var(--loss)" }}>利空</strong>已高亮标注
      </span>
      {sourceCount && <span>基于 {sourceCount} 篇来源</span>}
    </div>
  );
}
