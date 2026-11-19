import { defineStore } from 'pinia';
import { ref } from 'vue';

import { metaApi } from '../api/metaApi';

/**
 * Holds the backend build version for display in low-noise chrome (the footer).
 *
 * The version is non-critical metadata, so failures are swallowed rather than
 * surfaced: on error (or a malformed/empty payload) `failed` flips to true and
 * `backendVersion` stays null, letting the UI simply omit the marker instead of
 * showing a disruptive error.
 */
export const useMetaStore = defineStore('meta', () => {
  const backendVersion = ref<string | null>(null);
  const loading = ref(false);
  const failed = ref(false);

  // De-dupes concurrent loads and lets awaiters share one request.
  let inFlight: Promise<void> | null = null;

  async function loadBackendVersion(): Promise<void> {
    // Already resolved successfully — the version doesn't change at runtime.
    if (backendVersion.value !== null) return;
    if (inFlight) return inFlight;

    loading.value = true;
    failed.value = false;

    inFlight = metaApi
      .version()
      .then((res) => {
        const value = typeof res?.version === 'string' ? res.version.trim() : '';
        if (value.length > 0) {
          backendVersion.value = value;
        } else {
          failed.value = true;
        }
      })
      .catch(() => {
        // Non-critical: keep the version hidden rather than propagating.
        failed.value = true;
      })
      .finally(() => {
        loading.value = false;
        inFlight = null;
      });

    return inFlight;
  }

  function reset(): void {
    backendVersion.value = null;
    loading.value = false;
    failed.value = false;
    inFlight = null;
  }

  return {
    backendVersion,
    loading,
    failed,
    loadBackendVersion,
    reset,
  };
});
