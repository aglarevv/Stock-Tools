import Icon from "./Icon.jsx";
import Button from "./Button.jsx";

/**
 * 通用确认对话框 —— 替代原生 confirm()，避免 Electron 焦点丢失
 *
 * 用法：
 *   <ConfirmDialog open={showConfirm} title="删除确认"
 *     message="确定删除该记录？"
 *     onConfirm={() => { doDelete(); setShowConfirm(false); }}
 *     onCancel={() => setShowConfirm(false)} />
 */
export default function ConfirmDialog({ open, title = "确认操作", message, onConfirm, onCancel }) {
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3><Icon name="alert-triangle" size={18} style={{ verticalAlign: -3, marginRight: 6 }} />{title}</h3>
        </div>
        <div className="modal-body">
          <p style={{ margin: 0, lineHeight: 1.6 }}>{message}</p>
        </div>
        <div className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" onClick={onCancel}>取消</Button>
          <Button variant="delete" onClick={onConfirm}>确认删除</Button>
        </div>
      </div>
    </div>
  );
}
