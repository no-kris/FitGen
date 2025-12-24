import { Terminal } from "lucide-react";

export default function Modal({ children, onClose, isOpen, title }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="flex items-center justify-between mb-4">
          <h3 className="flex items-center gap-2 text-lg font-bold uppercase">
            <Terminal size={20} />
            {title}
          </h3>
          {onClose && (
            <button onClick={onClose} className="text-muted">
              <X size={20} />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
