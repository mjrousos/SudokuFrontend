import { createHttpClient, type HttpClient, type AuthProvider } from './httpClient';
import { etagCache } from './etagCache';

// A single client instance, wired in by the auth store on creation. Until
// the store is created, calls throw a helpful error instead of silently
// returning unauthenticated requests.

let clientInstance: HttpClient | null = null;

export function installHttpClient(authProvider: AuthProvider): HttpClient {
  clientInstance = createHttpClient({ authProvider, cache: etagCache });
  return clientInstance;
}

export function getHttpClient(): HttpClient {
  if (!clientInstance) {
    throw new Error(
      'HTTP client has not been installed yet. The auth store should call installHttpClient() during setup.',
    );
  }
  return clientInstance;
}

// Test-only: reset the singleton between specs.
export function __resetHttpClientForTests(): void {
  clientInstance = null;
  etagCache.clear();
}
