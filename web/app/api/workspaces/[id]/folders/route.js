import { auth } from "../../../../../auth";
import { getStore } from "../../../../../lib/storage";
import { errorResponse, guard } from "../../../../../lib/apiError";
import { limit } from "../../../../../lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Create a folder inside a workspace (one level).
export async function POST(request, { params }) {
  const session = await auth();
  const bad = guard(session);
  if (bad) return bad;
  const rl = limit("folder-create", session.user.email, { max: 60, windowMs: 60_000 });
  if (rl) return rl;
  try {
    const { id: wsId } = await params;
    const { name } = await request.json().catch(() => ({}));
    const clean = (name || "").trim().replace(/[/\\]/g, "-").slice(0, 80);
    if (!clean) return Response.json({ ok: false, error: "Folder name required" }, { status: 400 });
    const store = getStore(session);
    const folder = await store.createFolder(wsId, clean);
    return Response.json({ ok: true, folder });
  } catch (e) {
    return errorResponse(e);
  }
}
