import { auth } from "../../../../../../auth";
import { getStore } from "../../../../../../lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const session = await auth();
  if (!session?.user) return Response.json({ ok: false, error: "Not signed in" }, { status: 401 });
  const { id, docId } = await params;
  const store = getStore(session);
  const doc = await store.getDoc(id, docId);
  if (!doc) return Response.json({ ok: false, error: "Document not found" }, { status: 404 });
  return Response.json({ ok: true, doc });
}
