// Turn an exception into a clean JSON response (never an empty 500). Auth/Drive
// token failures become RELOGIN so the UI can prompt a fresh sign-in.
export function errorResponse(e) {
  const msg = String(e?.message || e || "Server error");
  // Missing Drive permission → re-prompt the Drive checkbox, not a generic relogin.
  if (/insufficient|scope|drive\.file|ACCESS_TOKEN_SCOPE|PERMISSION_DENIED/i.test(msg)) {
    return Response.json(
      { ok: false, code: "DRIVE_SCOPE", error: "Markus needs permission to save files in your Google Drive." },
      { status: 403 }
    );
  }
  const authish = /invalid_grant|invalid credentials|unauthorized|401|403|token|auth/i.test(msg);
  if (authish) {
    return Response.json(
      { ok: false, code: "RELOGIN", error: "Your session expired — please sign in again." },
      { status: 401 }
    );
  }
  return Response.json({ ok: false, error: msg }, { status: 500 });
}

// Common pre-flight checks shared by the studio API routes.
export function guard(session) {
  if (!session?.user) return Response.json({ ok: false, error: "Not signed in" }, { status: 401 });
  if (session.error === "RefreshFailed") {
    return Response.json(
      { ok: false, code: "RELOGIN", error: "Your session expired — please sign in again." },
      { status: 401 }
    );
  }
  if (session.googleAccessToken && session.driveGranted === false) {
    return Response.json(
      { ok: false, code: "DRIVE_SCOPE", error: "Markus needs permission to save files in your Google Drive." },
      { status: 403 }
    );
  }
  return null;
}
