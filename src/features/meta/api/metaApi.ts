import { getHttpClient } from '@/shared/api/client';
import type { BackendVersionResponse } from '@/shared/api/types';

// Backend meta endpoints. `version` is intentionally anonymous: it's public
// build metadata, so we don't attach an Authorization header (which also keeps
// it from participating in the refresh-on-401 flow). The path is relative to
// the client's `/api/v1` base, resolving to `GET /api/v1/version`.
export const metaApi = {
  version: async (signal?: AbortSignal): Promise<BackendVersionResponse> => {
    return getHttpClient().get<BackendVersionResponse>('/version', {
      anonymous: true,
      signal,
    });
  },
};
