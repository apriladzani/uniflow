export class ApiError extends Error {
  status: number;
  code: string;
  /** Form field the server rejected, when it reports one. */
  field?: string;
  constructor(status: number, code: string, message: string, field?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export function apiUrl(path: string): string {
  return `${apiBaseUrl}${path}`;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (path.startsWith('/workspaces//')) {
    throw new ApiError(400, 'WORKSPACE_REQUIRED', 'Select a workspace before using this feature.');
  }
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(apiUrl(path), {
    ...options,
    credentials: 'include',
    headers,
  });
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, payload.error || 'REQUEST_FAILED', payload.message || `Request failed (HTTP ${response.status}).`, payload.field);
  return payload as T;
}
