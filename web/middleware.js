export { auth as middleware } from "./auth";

export const config = {
  // run the auth check on guarded app + API routes (skip static/_next)
  matcher: ["/studio/:path*", "/api/workspaces/:path*", "/api/billing/:path*"],
};
