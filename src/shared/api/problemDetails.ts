import type { ProblemDetails } from './types';

export interface ApiErrorOptions {
  status: number;
  title: string;
  detail?: string | undefined;
  type?: string | undefined;
  fieldErrors?: Record<string, string[]> | undefined;
  cause?: unknown;
}

/**
 * Normalised representation of a non-2xx HTTP response. Created by
 * `parseApiError` and thrown by the HTTP client so views never need to
 * touch raw `fetch` errors or response bodies.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly title: string;
  readonly detail: string | undefined;
  readonly type: string | undefined;
  readonly fieldErrors: Record<string, string[]> | undefined;

  constructor(opts: ApiErrorOptions) {
    const message = opts.detail ?? opts.title ?? `HTTP ${opts.status}`;
    super(message, opts.cause ? { cause: opts.cause } : undefined);
    this.name = 'ApiError';
    this.status = opts.status;
    this.title = opts.title;
    this.detail = opts.detail;
    this.type = opts.type;
    this.fieldErrors = opts.fieldErrors;
  }
}

/**
 * Parse an HTTP error Response into an ApiError. Handles:
 *   - RFC 7807 application/problem+json bodies
 *   - Validation errors with `errors: { field: [msg, …] }`
 *   - Plain JSON or plain text fallbacks
 *
 * Returns even if the body is empty or invalid; never throws.
 */
export async function parseApiError(response: Response): Promise<ApiError> {
  const status = response.status;
  const contentType = response.headers.get('content-type') ?? '';
  const isJson =
    contentType.includes('application/json') ||
    contentType.includes('application/problem+json');

  let body: unknown = undefined;
  try {
    // .text() then JSON.parse so an empty body doesn't blow up .json().
    const raw = await response.text();
    if (raw.length > 0) {
      body = isJson ? JSON.parse(raw) : raw;
    }
  } catch {
    // Unparseable; fall through with body=undefined.
  }

  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const pd = body as ProblemDetails;
    return new ApiError({
      status,
      title: pd.title ?? response.statusText ?? `HTTP ${status}`,
      detail: pd.detail ?? undefined,
      type: pd.type ?? undefined,
      fieldErrors: pd.errors ?? undefined,
    });
  }

  return new ApiError({
    status,
    title: response.statusText || `HTTP ${status}`,
    detail: typeof body === 'string' && body.length > 0 ? body : undefined,
  });
}
