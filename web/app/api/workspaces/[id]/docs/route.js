import { auth } from "../../../../../auth";
import { getStore } from "../../../../../lib/storage";
import { getAccount } from "../../../../../lib/accounts";
import { limitsFor } from "../../../../../lib/quota";
import { errorResponse, guard } from "../../../../../lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Save (create or update) a .mks doc in a workspace, enforcing free-tier quota.
export async function POST(request, { params }) {
  const session = await auth();
  const bad = guard(session);
  if (bad) return bad;
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
    if (typeof pages === "number" && pages > limits.pagesPerDoc) {
      return Response.json(
        {
          ok: false,
          code: "PAGE_LIMIT",
          error: `Free plan caps documents at ${limits.pagesPerDoc} pages (this one is ${pages}). Upgrade for unlimited.`,
        },
        { status: 402 }
      );
    }

    const doc = await store.saveDoc(wsId, { id, name, content, pages });
    return Response.json({ ok: true, doc });
  } catch (e) {
    return errorResponse(e);
  }
}
