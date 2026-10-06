import type { SeatId } from "@/lib/committee/schema";

/** Each seat's blocky pixel-character look: a shirt/top colour + a distinguishing accessory. */
const LOOK: Record<SeatId, { top: string; skin: string; acc: "glasses" | "hardhat" | "visor" | "horns" | "tie" }> = {
  research: { top: "#3b82f6", skin: "#f0c9a0", acc: "glasses" },
  risk: { top: "#f59e0b", skin: "#f0c9a0", acc: "hardhat" },
  macro: { top: "#14b8a6", skin: "#f0c9a0", acc: "visor" },
  devil: { top: "#ef4444", skin: "#eaa49a", acc: "horns" },
  capital: { top: "#a855f7", skin: "#f0c9a0", acc: "tie" },
};

/** A small 8-bit style avatar for a committee seat. Pure SVG, crisp pixels, theme-independent. */
export function SeatAvatar({ seat, size = 40, className }: { seat: SeatId; size?: number; className?: string }) {
  const l = LOOK[seat] ?? LOOK.research;
  const eye = "#23252b";
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} style={{ shapeRendering: "crispEdges", display: "block" }} aria-hidden="true">
      {/* body / shirt */}
      <rect x="3" y="13" width="10" height="3" fill={l.top} />
      <rect x="6" y="13" width="4" height="1" fill={l.skin} />
      {/* ears */}
      <rect x="3" y="8" width="1" height="2" fill={l.skin} />
      <rect x="12" y="8" width="1" height="2" fill={l.skin} />
      {/* head */}
      <rect x="4" y="3" width="8" height="9" fill={l.skin} />
      {/* hair / top band (seat colour) */}
      {l.acc !== "hardhat" && <rect x="4" y="3" width="8" height="2" fill={l.top} />}
      {/* eyes + mouth */}
      <rect x="6" y="7" width="1" height="2" fill={eye} />
      <rect x="9" y="7" width="1" height="2" fill={eye} />
      <rect x="6" y="10" width="4" height="1" fill="#b06a55" />

      {l.acc === "glasses" && (
        <>
          <rect x="5" y="6" width="3" height="3" fill="none" stroke={eye} strokeWidth="0.6" />
          <rect x="8" y="6" width="3" height="3" fill="none" stroke={eye} strokeWidth="0.6" />
          <rect x="8" y="7" width="0.6" height="0.6" fill={eye} />
        </>
      )}
      {l.acc === "hardhat" && (
        <>
          <rect x="4" y="2" width="8" height="3" fill={l.top} />
          <rect x="3" y="5" width="10" height="1" fill={l.top} />
          <rect x="7" y="2" width="2" height="1" fill="#fde68a" />
        </>
      )}
      {l.acc === "visor" && <rect x="4" y="5" width="8" height="2" fill={l.top} opacity="0.85" />}
      {l.acc === "horns" && (
        <>
          <rect x="4" y="1" width="1" height="2" fill="#7f1d1d" />
          <rect x="11" y="1" width="1" height="2" fill="#7f1d1d" />
          <rect x="3" y="2" width="1" height="1" fill="#7f1d1d" />
          <rect x="12" y="2" width="1" height="1" fill="#7f1d1d" />
        </>
      )}
      {l.acc === "tie" && (
        <>
          <rect x="7" y="13" width="2" height="1" fill="#fbbf24" />
          <rect x="7.5" y="14" width="1" height="2" fill="#fbbf24" />
        </>
      )}
    </svg>
  );
}
