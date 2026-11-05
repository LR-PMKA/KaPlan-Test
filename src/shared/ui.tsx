/** Wiederverwendbare Oberflächenbausteine im hellen Apple-Stil. */
import { useEffect } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { Icon } from './icons';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function CardHeader({
  titel,
  sub,
  actions,
}: {
  titel: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="card-header">
      <div style={{ minWidth: 0 }}>
        <h2>{titel}</h2>
        {sub ? <div className="sub">{sub}</div> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </div>
  );
}

export function Stat({
  wert,
  label,
  ton = '',
  onClick,
}: {
  wert: ReactNode;
  label: string;
  ton?: '' | 'red' | 'orange' | 'green' | 'blue';
  onClick?: () => void;
}) {
  const inhalt = (
    <div className={`stat ${ton}`}>
      <div className="stat-value">{wert}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
  if (onClick) {
    return (
      <button type="button" className="card card-click" onClick={onClick}>
        {inhalt}
      </button>
    );
  }
  return <div className="card">{inhalt}</div>;
}

export function Badge({
  children,
  ton = '',
}: {
  children: ReactNode;
  ton?: '' | 'green' | 'orange' | 'red' | 'blue' | 'purple' | 'gelb';
}) {
  return <span className={`badge ${ton}`}>{children}</span>;
}

export function Field({
  label,
  hint,
  children,
  full = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`field ${full ? 'full' : ''}`}>
      <label>{label}</label>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <input
      className="input"
      value={value}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      {...rest}
    />
  );
}

export function TextArea({
  value,
  onChange,
  mono = false,
  inputRef,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  /** Zugriff auf das Feld, etwa um an der Schreibmarke einzufügen. */
  inputRef?: React.Ref<HTMLTextAreaElement>;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>) {
  return (
    <textarea
      ref={inputRef}
      className={`textarea ${mono ? 'mono' : ''}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    />
  );
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
      {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={o.value === value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Search({
  value,
  onChange,
  placeholder = 'Suchen',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search">
      <span style={{ display: 'flex', color: 'var(--text-tertiary)' }}>
        <Icon name="suche" size={14} />
      </span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {value ? (
        <button type="button" className="btn-icon" onClick={() => onChange('')} aria-label="Suche leeren">
          ✕
        </button>
      ) : null}
    </div>
  );
}

export function Modal({
  titel,
  sub,
  children,
  footer,
  onClose,
  wide = false,
}: {
  titel: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-header">
          <div style={{ minWidth: 0 }}>
            <h2>{titel}</h2>
            {sub ? <div className="sub">{sub}</div> : null}
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Schließen">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({
  icon = 'plan',
  titel,
  text,
  action,
}: {
  icon?: string;
  titel: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon" style={{ display: 'flex', justifyContent: 'center' }}>
        <Icon name={icon} size={30} strokeWidth={1.3} />
      </div>
      <h3>{titel}</h3>
      {text ? <p>{text}</p> : null}
      {action}
    </div>
  );
}

/** Fortschrittsbalken. Immer in der Hausfarbe – der Status steht daneben. */
export function Progress({ wert }: { wert: number }) {
  return (
    <div className="progress" title={`${wert}%`}>
      <div style={{ width: `${Math.min(100, Math.max(0, wert))}%` }} />
    </div>
  );
}

export function Avatar({ name, farbe }: { name: string; farbe?: string }) {
  const initialen = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((t) => t[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <div
      className="avatar"
      style={farbe ? { background: `${farbe}1f`, color: farbe } : undefined}
      title={name}
    >
      {initialen || '?'}
    </div>
  );
}

export function Callout({
  ton = '',
  icon = 'ℹ︎',
  children,
}: {
  ton?: '' | 'warn' | 'error';
  icon?: string;
  children: ReactNode;
}) {
  return (
    <div className={`callout ${ton}`}>
      <span className="callout-icon">{icon}</span>
      <div>{children}</div>
    </div>
  );
}

export function ConfirmDialog({
  titel,
  text,
  bestaetigenLabel = 'Löschen',
  abbrechenLabel = 'Abbrechen',
  ton = 'rot',
  onConfirm,
  onClose,
}: {
  titel: string;
  text: string;
  bestaetigenLabel?: string;
  abbrechenLabel?: string;
  /** „rot“ für Löschvorgänge, „blau“ für gewöhnliche Rückfragen. */
  ton?: 'rot' | 'blau';
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      titel={titel}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {abbrechenLabel}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={ton === 'rot' ? { background: 'var(--red)' } : undefined}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {bestaetigenLabel}
          </button>
        </>
      }
    >
      <p className="muted">{text}</p>
    </Modal>
  );
}
