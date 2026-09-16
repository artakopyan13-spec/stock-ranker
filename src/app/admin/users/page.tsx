import { redirect } from "next/navigation";
import { isAdmin } from "@/auth";
import { db } from "@/lib/db";
import { startOfUtcDay } from "@/lib/quota/spend";
import { setUserBanned, setUserQuota } from "@/lib/admin-actions";
import { ago } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  if (!(await isAdmin())) redirect("/signin");
  const prisma = db();
  const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  const since = startOfUtcDay();
  const usageByUser = await prisma.usageLog.groupBy({ by: ["userId"], _count: true, _sum: { usd: true }, where: { kind: "analysis", createdAt: { gte: since } } });
  const usage = new Map(usageByUser.map((u) => [u.userId, { count: u._count, usd: u._sum.usd ?? 0 }]));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Users ({users.length})</h1>
      <div className="card overflow-x-auto">
        <table className="tbl w-full text-sm min-w-[760px]">
          <thead><tr><th>Email</th><th>Role</th><th>Joined</th><th>Today</th><th>Quota</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => {
              const t = usage.get(u.id);
              return (
                <tr key={u.id}>
                  <td>{u.email ?? u.id}</td>
                  <td>{u.role === "admin" ? <span className="chip chip-gold">admin</span> : "user"}</td>
                  <td className="text-xs text-muted">{ago(u.createdAt)}</td>
                  <td className="text-xs">{t ? `${t.count} · $${t.usd.toFixed(2)}` : "—"}</td>
                  <td>
                    <form action={setUserQuota} className="flex gap-1 items-center">
                      <input type="hidden" name="userId" value={u.id} />
                      <input name="quota" defaultValue={u.dailyQuota ?? ""} placeholder="default" className="w-16 py-1 text-xs" />
                      <button className="btn btn-ghost py-1 px-2 text-xs">set</button>
                    </form>
                  </td>
                  <td>{u.banned ? <span className="chip chip-red">banned</span> : <span className="chip chip-green">active</span>}</td>
                  <td>
                    <form action={setUserBanned}>
                      <input type="hidden" name="userId" value={u.id} />
                      <input type="hidden" name="banned" value={u.banned ? "false" : "true"} />
                      <button className="btn btn-ghost py-1 px-2 text-xs">{u.banned ? "unban" : "ban"}</button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && <tr><td colSpan={7} className="text-muted">No users yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
