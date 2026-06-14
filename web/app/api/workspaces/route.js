import { auth } from "../../../auth";
import { getStore } from "../../../lib/storage";
import { getAccount } from "../../../lib/accounts";
import { limitsFor } from "../../../lib/quota";
import { errorResponse, guard } from "../../../lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const bad = guard(session);
  if (bad) return bad;
  try {
    const store = getStore(session);
    const account = await getAccount(store, session.user.email);
    const workspaces = await store.listWorkspaces();
    const { name, email, image } = session.user;
    return Response.json({
      ok: true,
      user: { name, email, image },
      account,
      backend: store.backend,
      limits: limitsFor(account.tier),
      workspaces,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  const session = await auth();
  const bad = guard(session);
  if (bad) return bad;
  try {
    const store = getStore(session);
    const account = await getAccount(store, session.user.email);
    const limits = limitsFor(account.tier);

    const { name } = await request.json().catch(() => ({}));
    const clean = (name || "").trim() || "Untitled workspace";

    const existing = await store.listWorkspaces();
    if (existing.length >= limits.workspaces) {
      return Response.json(
        {
          ok: false,
          error: `Free plan is limited to ${limits.workspaces} workspaces. Upgrade for unlimited.`,
          code: "WORKSPACE_LIMIT",
        },
        { status: 402 }
      );
    }
    const ws = await store.createWorkspace(clean);
    return Response.json({ ok: true, workspace: ws });
  } catch (e) {
    return errorResponse(e);
  }
}
