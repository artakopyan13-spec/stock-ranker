type Segment = { label: string; count: number; pct: number };

const COLORS = ["var(--gold)", "var(--purple)", "var(--green)", "var(--red)", "#5AC8C8", "var(--muted)"];

/** A donut (conic-gradient circle) + legend showing each answer's share by %. */
export function AnswerDonut({ title, total, segments }: { title: string; total: number; segments: Segment[] }) {
  const stops = segments
    .map((s, i) => {
      const start = segments.slice(0, i).reduce((a, x) => a + x.pct, 0);
      return `${COLORS[i % COLORS.length]} ${start}% ${start + s.pct}%`;
    })
    .join(", ");

  return (
    <div className="card p-4">
      <div className="text-sm font-semibold mb-3">{title}</div>
      {total === 0 ? (
        <div className="text-xs text-muted">No answers yet.</div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="relative shrink-0" style={{ width: 96, height: 96 }}>
            <div style={{ width: 96, height: 96, borderRadius: "50%", background: `conic-gradient(${stops})` }} />
            <div className="absolute inset-0 m-auto rounded-full bg-card flex flex-col items-center justify-center" style={{ width: 58, height: 58 }}>
              <span className="text-base font-semibold leading-none">{total}</span>
              <span className="text-[0.6rem] text-muted">answers</span>
            </div>
          </div>
          <ul className="space-y-1.5 text-xs flex-1">
            {segments.map((s, i) => (
              <li key={s.label} className="flex items-center gap-2">
                <span className="inline-block shrink-0 rounded-sm" style={{ width: 10, height: 10, background: COLORS[i % COLORS.length] }} />
                <span className="text-text">{s.label}</span>
                <span className="text-muted ml-auto font-medium">{Math.round(s.pct)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
