/**
 * ESM resolve hook: neutralize the Next-internal `server-only` / `client-only`
 * marker modules so server modules (lib/db, services) can be imported under a
 * plain Node/tsx runtime (mirrors the vitest `server-only` alias). Used only by
 * scripts/cache-invalidation.mts — never shipped in the app build.
 */
export async function resolve(specifier, context, next) {
  if (specifier === 'server-only' || specifier === 'client-only') {
    return { url: 'data:text/javascript,export%20default%20{}', shortCircuit: true };
  }
  return next(specifier, context);
}
