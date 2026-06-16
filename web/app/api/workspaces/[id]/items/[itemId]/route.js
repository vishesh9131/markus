import { auth } from "../../../../../../auth";
import { getStore } from "../../../../../../lib/storage";
import { errorResponse, guard } from "../../../../../../lib/apiError";
import { limit } from "../../../../../../lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Operate on any item (doc, image, or folder) by id:
//  PATCH  { name }                              -> rename
//  PATCH  { toFolderId, fromFolderId }          -> move (null = workspace root)
//  POST   { name }                              -> duplicate (docs)
//  DELETE                                       -> delete (folders cascade)
export async function PATCH(request, { params }) {
  const session = await auth();
  const bad = guard(session);
  if (bad) return bad;
  const rl = limit("item-op", session.user.email, { max: 120, windowMs: 60_000 });
  if (rl) return rl;
  try {
    const { id: wsId, itemId } = await params;
    const body = await request.json().catch(() => ({}));
    const store = getStore(session);
    if (typeof body.name === "string" && body.name.trim()) {
      const item = await store.rename(wsId, itemId, body.name.trim().slice(0, 120));
      return Response.json({ ok: true, item });
    }
    if ("toFolderId" in body) {
      await store.move(wsId, itemId, body.toFolderId || null, body.fromFolderId || null);
      return Response.json({ ok: true });
    }
    return Response.json({ ok: false, error: "Nothing to update" }, { status: 400 });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request, { params }) {
  const session = await auth();
  const bad = guard(session);
  if (bad) return bad;
  const rl = limit("item-op", session.user.email, { max: 120, windowMs: 60_000 });
  if (rl) return rl;
  try {
    const { id: wsId, itemId } = await params;
    const { name } = await request.json().catch(() => ({}));
    const store = getStore(session);
    const item = await store.duplicate(wsId, itemId, (name || "Copy").slice(0, 120));
    return Response.json({ ok: true, item });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req, { params }) {
  const session = await auth();
  const bad = guard(session);
  if (bad) return bad;
  const rl = limit("item-op", session.user.email, { max: 120, windowMs: 60_000 });
  if (rl) return rl;
  try {
    const { id: wsId, itemId } = await params;
    const store = getStore(session);
    await store.remove(wsId, itemId);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
