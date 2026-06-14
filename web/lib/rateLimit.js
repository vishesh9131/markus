// In-memory fixed-window rate limiter, one window per (bucket, key).
//
// This is abuse protection, not metering: it's per-instance (resets on cold
// start and doesn't coordinate across multiple Render/Netlify instances), so
// keep limits generous. Authenticated routes key by user email; that way one
// user can't throttle another who happens to share an IP.

const buckets = new Map(); // bucket -> Map<key, { count, resetAt }>

function hit(bucket, key, max, windowMs) {
  let m = buckets.get(bucket);
  if (!m) {
    m = new Map();
    buckets.set(bucket, m);
  }
  if (m.size > 20_000) m.clear(); // crude bound on memory
  const now = Date.now();
  const e = m.get(key);
  if (!e || now > e.resetAt) {
    m.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  e.count += 1;
  return e.count > max;
}

/**
 * Returns a 429 Response when (bucket, key) is over `max` per `windowMs`,
 * otherwise null. Usage:
 *   const rl = limit("ws-create", session.user.email, { max: 30, windowMs: 60_000 });
 *   if (rl) return rl;
 */
export function limit(bucket, key, { max, windowMs }) {
  if (!key) key = "anon";
  if (!hit(bucket, key, max, windowMs)) return null;
  return Response.json(
    { ok: false, code: "RATE_LIMIT", error: "Too many requests — please slow down and try again." },
    { status: 429, headers: { "Retry-After": String(Math.ceil(windowMs / 1000)) } }
  );
}
