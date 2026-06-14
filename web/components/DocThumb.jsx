// Placeholder "paper sheet" thumbnail for a .mks document. We don't render real
// PDFs on the dashboard, so this shows the name + faux text lines. `mini` is the
// compact form used inside the 2x2 grid on workspace tiles.
const LINE_WIDTHS = [94, 80, 88, 62, 74, 52, 90, 68];

export default function DocThumb({ name = "", mini = false }) {
  const title = name.replace(/\.mks$/, "");
  const count = mini ? 4 : 7;
  return (
    <div className={`doc-thumb${mini ? " mini" : ""}`} aria-hidden="true">
      {!mini && <div className="doc-thumb-title">{title}</div>}
      <div className="doc-thumb-lines">
        {Array.from({ length: count }).map((_, i) => (
          <span key={i} style={{ width: `${LINE_WIDTHS[i % LINE_WIDTHS.length]}%` }} />
        ))}
      </div>
    </div>
  );
}
