/**
 * Custom line-art symbols for the product features — unique to Stock Ranker, drawn to a shared
 * 24×24 grid so they sit consistently in their tinted badges. Color comes from the parent (currentColor).
 */
export function FeatureIcon({ name, size = 24 }: { name: string; size?: number }) {
  const p = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (name) {
    // Investment committee — five analysts converging on a chair's verdict.
    case "committee":
      return (
        <svg {...p}>
          <path d="M12 12 L12 4.6 M12 12 L18.6 9.9 M12 12 L16 18.1 M12 12 L8 18.1 M12 12 L5.4 9.9" opacity="0.45" />
          <circle cx="12" cy="4.6" r="1.5" />
          <circle cx="18.6" cy="9.9" r="1.5" />
          <circle cx="16" cy="18.1" r="1.5" />
          <circle cx="8" cy="18.1" r="1.5" />
          <circle cx="5.4" cy="9.9" r="1.5" />
          <circle cx="12" cy="12" r="2.7" />
          <path d="M10.9 12 L11.7 12.9 L13.3 11" strokeWidth="1.3" />
        </svg>
      );
    // Portfolio X-ray — a holdings card with a health pulse read across it.
    case "xray":
      return (
        <svg {...p}>
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <path d="M6 12.5 H9 L10.6 8.6 L13.1 16.4 L14.7 12.5 H18" />
        </svg>
      );
    // Ask this stock — a chat bubble reading the bars.
    case "ask":
      return (
        <svg {...p}>
          <rect x="3" y="4" width="18" height="12.5" rx="3" />
          <path d="M8 16.5 V20 L12 16.5" />
          <path d="M9 12 V9 M12 12 V7.5 M15 12 V10.2" />
        </svg>
      );
    // Track record — a self-grading trend with marked calls.
    case "track":
      return (
        <svg {...p}>
          <path d="M4 4 V20 H20" opacity="0.55" />
          <path d="M6.5 16 L10 11.8 L13 13.6 L18 6.8" />
          <circle cx="6.5" cy="16" r="1.3" />
          <circle cx="10" cy="11.8" r="1.3" />
          <circle cx="13" cy="13.6" r="1.3" />
          <circle cx="18" cy="6.8" r="1.3" />
        </svg>
      );
    // Time machine — a clock with a rewind sweep.
    case "time":
      return (
        <svg {...p}>
          <path d="M20 12.5 A 8 8 0 1 0 12 20.5" />
          <path d="M20.4 8 L20 12.6 L15.6 11.4" strokeWidth="1.4" />
          <path d="M12 8.6 V12.6 L14.7 13.9" />
        </svg>
      );
    // Screener & compare — a funnel narrowing the universe.
    case "screener":
      return (
        <svg {...p}>
          <path d="M3.5 5 H20.5 L14 12.6 V19 L10 17 V12.6 Z" />
        </svg>
      );
    default:
      return null;
  }
}
