import { auth } from "../../../../auth";
import { getStore } from "../../../../lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const session = await auth();
  if (!session?.user) return Response.json({ ok: false, error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  const store = getStore(session);
  const all = await store.listWorkspaces();
  const ws = all.find((w) => w.id === id);
  if (!ws) return Response.json({ ok: false, error: "Workspace not found" }, { status: 404 });
  return Response.json({ ok: true, workspace: ws });
}

export async function DELETE(_req, { params }) {
  const session = await auth();
  if (!session?.user) return Response.json({ ok: false, error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  const store = getStore(session);
  await store.deleteWorkspace(id);
  return Response.json({ ok: true });
}
