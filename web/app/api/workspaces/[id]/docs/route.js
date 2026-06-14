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
    const { id, name, content, pages } = body;

    const all = await store.listWorkspaces();
    const ws = all.find((w) => w.id === wsId);
    if (!ws) return Response.json({ ok: false, error: "Workspace not found" }, { status: 404 });

    const isNew = !id || !ws.docs.some((d) => d.id === id);
    if (isNew && ws.docs.length >= limits.docsPerWorkspace) {
      return Response.json(
        {
          ok: false,
          code: "DOC_LIMIT",
          error: `Free plan allows ${limits.docsPerWorkspace} documents per workspace. Upgrade for unlimited.`,
        },
        { status: 402 }
      );
    }
    // The page cap is advisory: never reject the save (that would throw away the
    // user's writing). We persist the content and just flag when it's over the
    // free limit so the UI can nag toward upgrading.
    const overLimit =
      typeof pages === "number" &&
      Number.isFinite(limits.pagesPerDoc) &&
      pages > limits.pagesPerDoc;

    const doc = await store.saveDoc(wsId, { id, name, content, pages });
    return Response.json({
      ok: true,
      doc,
      ...(overLimit ? { overLimit: true, pageLimit: limits.pagesPerDoc } : {}),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
