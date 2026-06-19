import { auth } from "../../../../../auth";
import { getStore } from "../../../../../lib/storage";
import { getAccount } from "../../../../../lib/accounts";
import { limitsFor } from "../../../../../lib/quota";
import { errorResponse, guard } from "../../../../../lib/apiError";
import { limit } from "../../../../../lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Save (create or update) a .mks doc in a workspace, enforcing free-tier quota.
export async function POST(request, { params }) {
  const session = await auth();
  const bad = guard(session);
  if (bad) return bad;
  // High ceiling: autosave is frequent and a 429 here must never cost a user
  // their writing. This only catches a runaway/abusive client.
  const rl = limit("doc-save", session.user.email, { max: 240, windowMs: 60_000 });
  if (rl) return rl;
  try {
    const { id: wsId } = await params;
    const store = getStore(session);
    const account = await getAccount(store, session.user.email);
    const limits = limitsFor(account.tier);

    const body = await request.json().catch(() => ({}));
    const { id, name, content, pages, folderId } = body;

    // Only the doc-count quota needs a listing, and only when creating a new doc
    // on a limited (free) plan. Autosave (id present) and premium skip it — the
    // old code listed every workspace on every save, which timed out and
    // surfaced as "network error" when creating files.
    const isNew = !id;
    if (isNew && Number.isFinite(limits.docsPerWorkspace)) {
      const count = await store.countDocs(wsId);
      if (count >= limits.docsPerWorkspace) {
        return Response.json(
          {
            ok: false,
            code: "DOC_LIMIT",
            error: `Free plan allows ${limits.docsPerWorkspace} documents per workspace. Upgrade for unlimited.`,
          },
          { status: 402 }
        );
      }
    }
    // The page cap is advisory: never reject the save (that would throw away the
    // user's writing). We persist the content and just flag when it's over the
    // free limit so the UI can nag toward upgrading.
    const overLimit =
      typeof pages === "number" &&
      Number.isFinite(limits.pagesPerDoc) &&
      pages > limits.pagesPerDoc;

    const doc = await store.saveDoc(wsId, { id, name, content, pages, folderId });
    return Response.json({
      ok: true,
      doc,
      ...(overLimit ? { overLimit: true, pageLimit: limits.pagesPerDoc } : {}),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
