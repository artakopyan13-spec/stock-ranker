"use client";

type Row = { email: string; verified: boolean; requests: number; createdAt: string };

/** Download the captured emails as a CSV, generated client-side from the rows. */
export function EmailsCsvButton({ rows }: { rows: Row[] }) {
  const download = () => {
    const header = "email,verified,requests,first_seen\n";
    const body = rows
      .map((r) => `${csv(r.email)},${r.verified},${r.requests},${r.createdAt}`)
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stock-ranker-emails-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  return (
    <button type="button" onClick={download} disabled={rows.length === 0} className="btn btn-primary text-sm">
      Download CSV
    </button>
  );
}

function csv(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
