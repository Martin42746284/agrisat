import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../store/useApp';
import { STATUS_LABEL, STATUS_TONE, ANALYSIS_LABEL, ANALYSIS_TONE } from '../data/constants';
import type { AnalysisStatus, Status } from '../types';

export function Badge({ tone = 'neutral', children }: { tone?: string; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}
export const StatusBadge = ({ status }: { status: Status }) => <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
export const AnalysisBadge = ({ status }: { status: AnalysisStatus }) => <Badge tone={ANALYSIS_TONE[status]}>{ANALYSIS_LABEL[status]}</Badge>;

export function Modal({ title, onClose, children, footer, width = 480 }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: width }}>
        <header className="modal__head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => <div key={t.id} className={`toast toast--${t.tone}`}>{t.msg}</div>)}
    </div>
  );
}

export function ConfidenceBar({ value, threshold }: { value: number; threshold?: number }) {
  const low = threshold !== undefined && value < threshold;
  return (
    <div className="conf" title={`${Math.round(value * 100)} %`}>
      <div className={`conf__fill ${low ? 'conf__fill--low' : ''}`} style={{ width: `${value * 100}%` }} />
    </div>
  );
}

export function Swatch({ color, size = 12 }: { color: string; size?: number }) {
  return <span className="swatch" style={{ background: color, width: size, height: size }} aria-hidden />;
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return <div className="empty"><strong>{title}</strong>{hint && <span>{hint}</span>}</div>;
}
