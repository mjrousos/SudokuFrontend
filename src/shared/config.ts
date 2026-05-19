// Centralized runtime configuration. Read from Vite env at build time so
// the bundle is self-contained per environment.

const RAW_API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

// Trim trailing slash so callers can always concatenate "/api/v1/...".
export const API_BASE_URL = RAW_API_BASE.replace(/\/+$/, '');

export const API_V1 = `${API_BASE_URL}/api/v1`;
