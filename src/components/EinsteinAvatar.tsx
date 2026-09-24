import type { ReactElement } from "react";

/**
 * Wall Street Einstein — a pixel-art "crazy genius trader": wild Einstein hair, manic eyes,
 * suit collar + gold tie. Drawn as a 16×16 pixel grid (crisp SVG rects). Eyes blink; the whole
 * character does a frantic little shake in the `thinking` state. Fixed palette (a mascot).
 */
const ROWS = [
  "..H..HH.HH..H...",
  "..HH.HHHHHH.HH..",
  ".HHHHHHHHHHHHHH.",
  "HHHHHHHHHHHHHHHH",
  ".HHHHSSSSSSHHHH.",
  ".HHHSSSSSSSSHHH.",
  "..HHMMSSSSMMHH..",
  "..HSEEPSSPEESH..",
  "..SSEEPSSPEESS..",
  "..SSSSSSSSSSSS..",
  "..SSsMMMMMMsSS..",
  "..SSSMMMMMMSSS..",
  "...SSKKKKKKSS...",
  "...SJCCTTCCJS...",
  "..JJCCCTTCCCJJ..",
  ".JJJCCTTTTCCJJJ.",
];

const COLORS: Record<string, string> = {
  H: "#ECECF4", // wild hair
  S: "#E7B489", // skin
  s: "#CD9265", // skin shadow
  E: "#FFFFFF", // eye white
  P: "#171026", // pupil
  M: "#D7D7E1", // brows / mustache
  K: "#7E3B3B", // grin
  J: "#191B3C", // jacket
  C: "#F2F2FA", // shirt collar
  T: "#C9A35C", // gold tie
};

const EYE = new Set(["E", "P"]);

export function EinsteinAvatar({ state = "idle", size = 40 }: { state?: "idle" | "thinking"; size?: number }) {
  const base: ReactElement[] = [];
  const eyes: ReactElement[] = [];
  ROWS.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const fill = COLORS[ch];
      if (!fill) continue;
      const rect = <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={fill} />;
      (EYE.has(ch) ? eyes : base).push(rect);
    }
  });
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" className={`rex-avatar${state === "thinking" ? " rex--thinking" : ""}`} role="img" aria-label="Wall Street Einstein">
      {base}
      <g className="rex-eyes">{eyes}</g>
    </svg>
  );
}
