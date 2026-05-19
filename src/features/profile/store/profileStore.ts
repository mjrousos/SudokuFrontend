import { defineStore } from 'pinia';
import { ref } from 'vue';

import { userProfileApi } from '@/features/auth/api/authApi';
import { useAuthStore } from '@/features/auth/store/authStore';
import { ApiError } from '@/shared/api/problemDetails';
import type {
  ChangePasswordRequest,
  UserProfileResponse,
} from '@/shared/api/types';

export const useProfileStore = defineStore('profile', () => {
  const profile = ref<UserProfileResponse | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const changingPassword = ref(false);
  const deleting = ref(false);
  const error = ref<ApiError | null>(null);

  let inFlightLoad: Promise<UserProfileResponse> | null = null;

  async function load(): Promise<UserProfileResponse> {
    if (loading.value && inFlightLoad) {
      return inFlightLoad;
    }

    loading.value = true;
    error.value = null;

    inFlightLoad = userProfileApi
      .me()
      .then((response) => {
        profile.value = response;
        return response;
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError) {
          error.value = err;
        }
        throw err;
      })
      .finally(() => {
        loading.value = false;
        inFlightLoad = null;
      });

    return inFlightLoad;
  }

  async function updateDisplayName(displayName: string): Promise<UserProfileResponse> {
    saving.value = true;
    error.value = null;

    try {
      const updated = await userProfileApi.updateMe({ displayName });
      profile.value = updated;
      useAuthStore().mergeProfile(updated);
      return updated;
    } catch (err) {
      if (err instanceof ApiError) {
        error.value = err;
      }
      throw err;
    } finally {
      saving.value = false;
    }
  }

  async function changePassword(
    request: ChangePasswordRequest,
  ): Promise<void> {
    changingPassword.value = true;
    error.value = null;

    try {
      await userProfileApi.changePassword(request);
    } catch (err) {
      if (err instanceof ApiError) {
        error.value = err;
      }
      throw err;
    } finally {
      changingPassword.value = false;
    }
  }

  async function deleteAccount(): Promise<void> {
    deleting.value = true;
    error.value = null;

    try {
      await userProfileApi.deleteMe();
      profile.value = null;
      // Keep logout/navigation in the caller so the UI can decide what to show
      // after the delete completes.
    } catch (err) {
      if (err instanceof ApiError) {
        error.value = err;
      }
      throw err;
    } finally {
      deleting.value = false;
    }
  }

  function reset(): void {
    profile.value = null;
    loading.value = false;
    saving.value = false;
    changingPassword.value = false;
    deleting.value = false;
    error.value = null;
    inFlightLoad = null;
  }

  return {
    profile,
    loading,
    saving,
    changingPassword,
    deleting,
    error,
    load,
    updateDisplayName,
    changePassword,
    deleteAccount,
    reset,
  };
});
