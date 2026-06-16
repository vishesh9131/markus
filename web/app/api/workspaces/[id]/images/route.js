import { auth } from "../../../../../auth";
import { getStore } from "../../../../../lib/storage";
import { errorResponse, guard } from "../../../../../lib/apiError";
import { limit } from "../../../../../lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Netlify functions cap request payloads ~6 MB and base64 inflates ~33%,
// so keep the raw image under ~4 MB.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

// Upload an image into a workspace (stored alongside the .mks docs in Drive).
export async function POST(request, { params }) {
  const session = await auth();
  const bad = guard(session);
  if (bad) return bad;
  const rl = limit("image-upload", session.user.email, { max: 60, windowMs: 60_000 });
  if (rl) return rl;
  try {
    const { id: wsId } = await params;
    const { name, base64, mime, folderId } = await request.json().catch(() => ({}));
    if (!name || !base64) return Response.json({ ok: false, error: "Missing image data" }, { status: 400 });
    if (!/^image\//.test(mime || "")) return Response.json({ ok: false, error: "Only image files are allowed" }, { status: 400 });
    if (base64.length * 0.75 > MAX_IMAGE_BYTES) return Response.json({ ok: false, error: "Image too large (max 4 MB)" }, { status: 413 });
    const safe = name.replace(/[^\w.\-]/g, "_").slice(0, 80) || "image.png";
    const store = getStore(session);
    const image = await store.uploadImage(wsId, { name: safe, base64, mime, folderId });
    return Response.json({ ok: true, image });
  } catch (e) {
    return errorResponse(e);
  }
}
