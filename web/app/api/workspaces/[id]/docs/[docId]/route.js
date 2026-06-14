import { auth } from "../../../../../../auth";
import { getStore } from "../../../../../../lib/storage";
import { errorResponse, guard } from "../../../../../../lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const session = await auth();
  const bad = guard(session);
  if (bad) return bad;
  try {
    const { id, docId } = await params;
    const store = getStore(session);
    const doc = await store.getDoc(id, docId);
    if (!doc) return Response.json({ ok: false, error: "Document not found" }, { status: 404 });
    return Response.json({ ok: true, doc });
  } catch (e) {
    return errorResponse(e);
  }
}
