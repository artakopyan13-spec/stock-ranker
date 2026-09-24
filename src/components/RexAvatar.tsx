/**
 * Rex — a custom animated character in the brand gradient. Eyes blink and glance around when
 * idle; when `state="thinking"` the pupils dart and the ears perk. Pure SVG + CSS (see globals).
 */
export function RexAvatar({ state = "idle", size = 40 }: { state?: "idle" | "thinking"; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={`rex-avatar${state === "thinking" ? " rex--thinking" : ""}`} role="img" aria-label="Rex">
      <defs>
        <linearGradient id="rexFace" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--gold)" />
          <stop offset="100%" stopColor="var(--purple)" />
        </linearGradient>
      </defs>

      {/* ears */}
      <g className="rex-ears">
        <path d="M18 46 L28 10 L48 34 Z" fill="url(#rexFace)" />
        <path d="M82 46 L72 10 L52 34 Z" fill="url(#rexFace)" />
        <path d="M27 38 L31 20 L41 34 Z" fill="#20153f" opacity="0.5" />
        <path d="M73 38 L69 20 L59 34 Z" fill="#20153f" opacity="0.5" />
      </g>

      {/* face + muzzle */}
      <ellipse cx="50" cy="56" rx="33" ry="31" fill="url(#rexFace)" />
      <ellipse cx="50" cy="68" rx="19" ry="13" fill="#fbfaff" opacity="0.92" />

      {/* eyes */}
      <g className="rex-eyes">
        <ellipse cx="38" cy="52" rx="8.5" ry="9.5" fill="#fbfaff" />
        <ellipse cx="62" cy="52" rx="8.5" ry="9.5" fill="#fbfaff" />
        <circle className="rex-pupil" cx="38" cy="53" r="4.3" fill="#20153f" />
        <circle className="rex-pupil" cx="62" cy="53" r="4.3" fill="#20153f" />
        <circle cx="40" cy="50.5" r="1.5" fill="#fff" />
        <circle cx="64" cy="50.5" r="1.5" fill="#fff" />
      </g>

      {/* nose + smile */}
      <path d="M45 65 Q50 62 55 65 Q52 70 50 71 Q48 70 45 65 Z" fill="#20153f" />
      <path d="M43 73 Q50 78 57 73" stroke="#20153f" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.65" />
    </svg>
  );
}
