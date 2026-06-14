"use client";

function IconGallery() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="2.5" width="12" height="11" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
function IconGrid() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
function IconCompact() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="3.6" height="3.6" rx="0.8" stroke="currentColor" strokeWidth="1.2" />
      <rect x="6.2" y="1.5" width="3.6" height="3.6" rx="0.8" stroke="currentColor" strokeWidth="1.2" />
      <rect x="10.9" y="1.5" width="3.6" height="3.6" rx="0.8" stroke="currentColor" strokeWidth="1.2" />
      <rect x="1.5" y="6.2" width="3.6" height="3.6" rx="0.8" stroke="currentColor" strokeWidth="1.2" />
      <rect x="6.2" y="6.2" width="3.6" height="3.6" rx="0.8" stroke="currentColor" strokeWidth="1.2" />
      <rect x="10.9" y="6.2" width="3.6" height="3.6" rx="0.8" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
function IconList() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="3" cy="4" r="1" fill="currentColor" />
      <circle cx="3" cy="8" r="1" fill="currentColor" />
      <circle cx="3" cy="12" r="1" fill="currentColor" />
      <path d="M6 4h8M6 8h8M6 12h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

const VIEWS = [
  { id: "gallery", label: "Gallery", Icon: IconGallery },
  { id: "grid", label: "Grid", Icon: IconGrid },
  { id: "compact", label: "Compact", Icon: IconCompact },
  { id: "list", label: "List", Icon: IconList },
];

export default function ViewToolbar({ view, onView, sort, onSort, sorts }) {
  return (
    <div className="view-toolbar">
      <label className="view-sort">
        <select value={sort} onChange={(e) => onSort(e.target.value)} aria-label="Sort by">
          {sorts.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </label>
      <div className="view-toggle" role="group" aria-label="View">
        {VIEWS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`view-btn${view === id ? " active" : ""}`}
            onClick={() => onView(id)}
            title={label}
            aria-label={label}
            aria-pressed={view === id}
          >
            <Icon />
          </button>
        ))}
      </div>
    </div>
  );
}
