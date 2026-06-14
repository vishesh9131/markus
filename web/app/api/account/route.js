import { auth } from "../../../auth";
import { getStore } from "../../../lib/storage";
import { clearLedger } from "../../../lib/ledger";
import { errorResponse, guard } from "../../../lib/apiError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Permanently delete the signed-in user's data: every workspace, document, and
// the account file (all in their own Drive), plus their billing ledger record.
export async function DELETE() {
  const session = await auth();
  const bad = guard(session);
  if (bad) return bad;
  try {
    const store = getStore(session);
    await store.deleteEverything();
    await clearLedger(session.user.email);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
