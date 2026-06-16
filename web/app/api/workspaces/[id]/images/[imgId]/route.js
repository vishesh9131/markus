import { auth } from "../../../../../../auth";
import { getStore } from "../../../../../../lib/storage";
import { errorResponse, guard } from "../../../../../../lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Return an image's bytes (base64) so the browser can preview it and forward it
// to the cross-origin compiler with a compile request.
export async function GET(_req, { params }) {
  const session = await auth();
  const bad = guard(session);
  if (bad) return bad;
  try {
    const { id: wsId, imgId } = await params;
    const store = getStore(session);
    const image = await store.getImage(wsId, imgId);
    if (!image) return Response.json({ ok: false, error: "Image not found" }, { status: 404 });
    return Response.json({ ok: true, name: image.name, mime: image.mime, base64: image.base64 });
  } catch (e) {
    return errorResponse(e);
  }
}
