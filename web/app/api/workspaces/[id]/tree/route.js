import { auth } from "../../../../../auth";
import { getStore } from "../../../../../lib/storage";
import { errorResponse, guard } from "../../../../../lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The workspace's one-level file tree: root docs/images + folders (each with its
// own docs/images). Used by the editor file rail and the document chooser.
export async function GET(_req, { params }) {
  const session = await auth();
  const bad = guard(session);
  if (bad) return bad;
  try {
    const { id: wsId } = await params;
    const store = getStore(session);
    const tree = await store.tree(wsId);
    return Response.json({ ok: true, tree });
  } catch (e) {
    return errorResponse(e);
  }
}
