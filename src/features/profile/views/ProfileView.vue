<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useAuthStore } from '@/features/auth/store/authStore';
import { ApiError } from '@/shared/api/problemDetails';
import AppButton from '@/shared/ui/AppButton.vue';
import AppSpinner from '@/shared/ui/AppSpinner.vue';
import { useToastStore } from '@/shared/ui/toastStore';

import ChangePasswordForm from '../components/ChangePasswordForm.vue';
import DeleteAccountDialog from '../components/DeleteAccountDialog.vue';
import EditDisplayNameForm from '../components/EditDisplayNameForm.vue';
import { useProfileStore } from '../store/profileStore';

const auth = useAuthStore();
const profileStore = useProfileStore();
const router = useRouter();
const toasts = useToastStore();

const deleteDialogOpen = ref(false);
const errorMessage = computed(() => profileStore.error?.detail ?? profileStore.error?.title ?? null);

async function loadProfile(): Promise<void> {
  try {
    await profileStore.load();
  } catch {
    // The store captures ApiError details for rendering.
  }
}

async function logoutAllSessions(): Promise<void> {
  try {
    await auth.logoutAllSessions();
    toasts.success('Logged out of all sessions.');
  } catch (err) {
    const apiError = err instanceof ApiError ? err : null;
    toasts.warning(
      apiError?.detail ??
        'You were signed out locally, but the server could not confirm every session.',
    );
  } finally {
    await router.push('/login');
  }
}

onMounted(() => {
  void loadProfile();
});
</script>

<template>
  <section class="space-y-8" data-testid="profile-view">
    <header class="space-y-2">
      <h1 class="text-2xl font-semibold">Profile</h1>
      <p class="text-slate-600 dark:text-slate-300">
        Manage your display name, password, and active sessions.
      </p>
    </header>

    <div
      v-if="profileStore.loading && !profileStore.profile"
      class="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
      data-testid="profile-loading"
    >
      <AppSpinner />
      <span>Loading your profile…</span>
    </div>

    <p
      v-else-if="errorMessage && !profileStore.profile"
      class="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
      role="alert"
      data-testid="profile-error"
    >
      Could not load your profile: {{ errorMessage }}
    </p>

    <template v-else-if="profileStore.profile">
      <section class="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div class="space-y-1">
          <h2 class="text-lg font-semibold">Account details</h2>
          <p class="text-sm text-slate-600 dark:text-slate-300">
            Your email is read-only, but you can update the public display name shown in the app.
          </p>
        </div>

        <div class="rounded-lg bg-slate-50 px-4 py-3 dark:bg-slate-800/70">
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Email
          </div>
          <div class="mt-1 text-sm font-medium" data-testid="profile-email">
            {{ profileStore.profile.email }}
          </div>
        </div>

        <EditDisplayNameForm :display-name="profileStore.profile.displayName" />
      </section>

      <section class="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div class="space-y-1">
          <h2 class="text-lg font-semibold">Password</h2>
          <p class="text-sm text-slate-600 dark:text-slate-300">
            Update your password to keep your account secure.
          </p>
        </div>

        <ChangePasswordForm />
      </section>

      <section class="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div class="space-y-1">
          <h2 class="text-lg font-semibold">Sessions</h2>
          <p class="text-sm text-slate-600 dark:text-slate-300">
            Sign out every device using your current account.
          </p>
        </div>

        <div class="flex justify-end">
          <AppButton variant="secondary" data-testid="logout-all-sessions" @click="logoutAllSessions">
            Log out all sessions
          </AppButton>
        </div>
      </section>

      <section class="space-y-4 rounded-xl border border-rose-200 bg-rose-50/50 p-6 shadow-sm dark:border-rose-900 dark:bg-rose-950/20">
        <div class="space-y-1">
          <h2 class="text-lg font-semibold text-rose-700 dark:text-rose-300">Danger zone</h2>
          <p class="text-sm text-rose-700/80 dark:text-rose-200/80">
            Deleting your account is permanent and cannot be undone.
          </p>
        </div>

        <div class="flex justify-end">
          <AppButton variant="danger" data-testid="open-delete-account" @click="deleteDialogOpen = true">
            Delete account…
          </AppButton>
        </div>
      </section>

      <DeleteAccountDialog
        :open="deleteDialogOpen"
        :display-name="profileStore.profile.displayName"
        @close="deleteDialogOpen = false"
      />
    </template>
  </section>
</template>
