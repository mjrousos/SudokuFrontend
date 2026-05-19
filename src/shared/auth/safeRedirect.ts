/**
 * Validates a redirect destination coming from untrusted input (e.g. query
 * parameters) before passing it to router.push().
 *
 * Returns `value` only when it is a safe same-origin relative path.
 * Any external or protocol-relative URL falls back to `fallback` ('/').
 */
export function safeRedirect(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string') return fallback;
  if (!value.startsWith('/')) return fallback;
  // Block protocol-relative URLs: //evil.com
  if (value.startsWith('//')) return fallback;
  // Block backslash variant: /\evil.com (parsed as //evil.com by some UAs)
  if (value.startsWith('/\\')) return fallback;
  // Block any scheme: javascript:, http:, data:, etc.
  if (value.includes(':')) return fallback;
  return value;
}
