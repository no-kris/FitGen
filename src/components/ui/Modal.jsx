import { Terminal, X } from "lucide-react";

export default function Modal({ children, onClose, isOpen, title }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="flex items-center gap-2 text-xl text-primary font-bold uppercase">
            <Terminal size={20} />
            {title}
          </h3>
          <button onClick={onClose} className="text-muted">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
