import { useEffect, useMemo, useRef, useState } from 'react';

export type MultiSelectOption = {
  value: string;
  label: string;
  meta?: string;
};

type Props = {
  label: string;
  hint?: string;
  options: MultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  emptyText?: string;
};

export function MultiSelect({
  label,
  hint,
  options,
  value,
  onChange,
  placeholder = '全部',
  emptyText = '无匹配项',
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => new Set(value), [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.value.toLowerCase().includes(q) ||
        o.label.toLowerCase().includes(q) ||
        (o.meta?.toLowerCase().includes(q) ?? false),
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle(code: string) {
    if (selected.has(code)) {
      onChange(value.filter((v) => v !== code));
    } else {
      onChange([...value, code]);
    }
  }

  const summary =
    value.length === 0
      ? placeholder
      : value.length <= 2
        ? value.join(', ')
        : `已选 ${value.length} 项`;

  return (
    <div className="field ms" ref={rootRef}>
      <label className="field-label">
        {label}
        {hint ? <span className="hint">{hint}</span> : null}
      </label>
      <button
        type="button"
        className="btn ms-trigger"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="ms-trigger-label mono">{summary}</span>
        <svg className={`ms-chevron${open ? ' open' : ''}`} viewBox="0 0 24 24" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="ms-panel" role="listbox" aria-multiselectable>
          <input
            className="ms-search"
            placeholder="搜索…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="ms-list">
            {filtered.length === 0 ? (
              <div className="ms-empty">{emptyText}</div>
            ) : (
              filtered.map((o) => (
                <label key={o.value} className="ms-option">
                  <input
                    type="checkbox"
                    checked={selected.has(o.value)}
                    onChange={() => toggle(o.value)}
                  />
                  <span className="ms-option-text">
                    <span className="ms-option-code">{o.label}</span>
                    {o.meta ? <span className="ms-option-meta">{o.meta}</span> : null}
                  </span>
                </label>
              ))
            )}
          </div>
          <div className="ms-footer">
            <span className="ms-count">{value.length}/{options.length}</span>
            <button type="button" className="btn ghost" onClick={() => onChange([])}>
              清空
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
