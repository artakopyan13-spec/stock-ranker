import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/auth";
import { db } from "@/lib/db";
import { ago } from "@/lib/format";
import { EmailsCsvButton } from "@/components/EmailsCsvButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Emails" };

export default async function AdminEmailsPage() {
  const admin = await currentUser();
  if (!admin) redirect("/signin");
  if (admin.role !== "admin") notFound();

  const prisma = db();
  // One row per email (the table's @id guarantees no duplicates), newest first.
  const leads = await prisma.emailLead.findMany({ orderBy: { createdAt: "desc" }, take: 5000 });
  const verified = leads.filter((l) => l.verifiedAt).length;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Emails</h1>
        <nav className="flex gap-3 text-sm text-muted">
          <Link href="/admin">Admin</Link>
          <Link href="/admin/users">Users</Link>
        </nav>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="card-2 p-3"><span className="text-2xl font-semibold text-gold">{leads.length}</span> <span className="text-xs text-muted">unique emails</span></div>
        <div className="card-2 p-3"><span className="text-2xl font-semibold">{verified}</span> <span className="text-xs text-muted">verified (signed in)</span></div>
        <div className="ml-auto"><EmailsCsvButton rows={leads.map((l) => ({ email: l.email, verified: Boolean(l.verifiedAt), requests: l.requests, createdAt: l.createdAt.toISOString() }))} /></div>
      </div>

      <div className="card overflow-x-auto">
        <table className="tbl w-full text-sm min-w-[560px]">
          <thead><tr><th>Email</th><th>Status</th><th>First seen</th><th>Requests</th></tr></thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.email}>
                <td className="font-mono text-xs">{l.email}</td>
                <td>{l.verifiedAt ? <span className="chip chip-green">verified</span> : <span className="chip chip-muted">pending</span>}</td>
                <td className="text-xs text-muted">{ago(l.createdAt)}</td>
                <td className="text-xs">{l.requests}</td>
              </tr>
            ))}
            {leads.length === 0 && <tr><td colSpan={4} className="text-muted">No emails captured yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-dim">Every email anyone submits at sign-in is captured here once (deduplicated). “Verified” means they entered a valid code and signed in.</p>
    </div>
  );
}
