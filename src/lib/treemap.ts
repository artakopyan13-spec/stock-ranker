export interface TreeItem {
  symbol: string;
  weight: number; // area weight (e.g. market cap)
}
export interface Rect {
  symbol: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Squarified treemap (Bruls et al.) — lays items into a WxH box as rectangles whose areas are
 * proportional to their weight, keeping tiles close to square. Returns rects in the same units as W/H.
 */
export function squarify(items: TreeItem[], W: number, H: number): Rect[] {
  const clean = items.filter((i) => i.weight > 0).sort((a, b) => b.weight - a.weight);
  const total = clean.reduce((s, i) => s + i.weight, 0);
  if (total <= 0 || clean.length === 0) return [];
  const area = W * H;
  const scaled = clean.map((i) => ({ symbol: i.symbol, area: (i.weight / total) * area }));

  const out: Rect[] = [];
  let x = 0;
  let y = 0;
  let w = W;
  let h = H;
  let row: { symbol: string; area: number }[] = [];

  const worst = (r: { area: number }[], side: number): number => {
    const sum = r.reduce((s, i) => s + i.area, 0);
    const max = Math.max(...r.map((i) => i.area));
    const min = Math.min(...r.map((i) => i.area));
    const s2 = sum * sum;
    const side2 = side * side;
    return Math.max((side2 * max) / s2, s2 / (side2 * min));
  };

  const layoutRow = (r: { symbol: string; area: number }[]) => {
    const sum = r.reduce((s, i) => s + i.area, 0);
    if (w >= h) {
      const rw = sum / h;
      let ry = y;
      for (const it of r) {
        const rh = it.area / rw;
        out.push({ symbol: it.symbol, x, y: ry, w: rw, h: rh });
        ry += rh;
      }
      x += rw;
      w -= rw;
    } else {
      const rh = sum / w;
      let rx = x;
      for (const it of r) {
        const rww = it.area / rh;
        out.push({ symbol: it.symbol, x: rx, y, w: rww, h: rh });
        rx += rww;
      }
      y += rh;
      h -= rh;
    }
  };

  const rest = [...scaled];
  while (rest.length) {
    const side = Math.min(w, h);
    const next = rest[0];
    if (row.length === 0 || worst([...row, next], side) <= worst(row, side)) {
      row.push(next);
      rest.shift();
    } else {
      layoutRow(row);
      row = [];
    }
  }
  if (row.length) layoutRow(row);
  return out;
}
