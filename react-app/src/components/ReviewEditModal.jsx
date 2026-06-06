/**
 * ReviewEditModal — 复盘版块编辑弹窗
 *
 * 纯展示组件：渲染指定版块的所有编辑字段。
 * 关闭逻辑（保存/丢弃）由父组件通过 onClose 控制。
 */
export default function ReviewEditModal({ sectionConfig, review, onFieldChange, onClose }) {
  if (!sectionConfig) return null;

  return (
    <div className="modal-overlay" onClick={() => onClose(true)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>{sectionConfig.title}</h2>
          <button className="btn btn-ghost" onClick={() => onClose(true)}>
            ✕ 关闭（丢弃修改）
          </button>
        </div>
        <div className="modal-body">
          {sectionConfig.fields.map((f) => (
            <div className="form-row" key={f.key}>
              <div className={`form-field ${f.accent ? `accent-${f.accent}` : ""}`}>
                <label>{f.label}</label>
                <textarea
                  className={review[f.key] ? "filled" : ""}
                  value={review[f.key] || ""}
                  onChange={(e) => onFieldChange(f.key, e.target.value)}
                  rows="2"
                  placeholder={f.placeholder}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={() => onClose(false)}>
            💾 保存并关闭
          </button>
        </div>
      </div>
    </div>
  );
}
