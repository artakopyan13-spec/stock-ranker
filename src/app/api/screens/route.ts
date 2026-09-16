import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser } from "@/auth";

export const dynamic = "force-dynamic";

const Body = z.object({ name: z.string().min(1).max(60), filters: z.record(z.string(), z.unknown()) });

export async function GET(): Promise<Response> {
  const user = await currentUser();
  if (!user) return Response.json({ screens: [] });
  const screens = await db().savedScreen.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  return Response.json({ screens: screens.map((s) => ({ id: s.id, name: s.name, filters: JSON.parse(s.filters) })) });
}

export async function POST(req: Request): Promise<Response> {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in to save screens" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "name and filters required" }, { status: 400 });
  const row = await db().savedScreen.create({ data: { userId: user.id, name: parsed.data.name, filters: JSON.stringify(parsed.data.filters) } });
  return Response.json({ screen: { id: row.id, name: row.name, filters: parsed.data.filters } }, { status: 201 });
}

export async function DELETE(req: Request): Promise<Response> {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  await db().savedScreen.deleteMany({ where: { id, userId: user.id } });
  return Response.json({ ok: true });
}
