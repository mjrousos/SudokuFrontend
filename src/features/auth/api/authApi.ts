import type {
  AuthTokenResponse,
  ChangePasswordRequest,
  ConfirmEmailRequest,
  LoginRequest,
  LogoutRequest,
  PasswordResetConfirm,
  PasswordResetRequest,
  RefreshRequest,
  RegisterRequest,
  RegisterResponse,
  UpdateProfileRequest,
  UserProfileResponse,
} from '@/shared/api/types';
import { getHttpClient } from '@/shared/api/client';

const base = '/auth';

export const authApi = {
  register: (req: RegisterRequest, signal?: AbortSignal) =>
    getHttpClient().post<RegisterResponse, RegisterRequest>(`${base}/register`, req, {
      anonymous: true,
      signal,
    }),

  confirmEmail: (req: ConfirmEmailRequest, signal?: AbortSignal) =>
    getHttpClient().post<void, ConfirmEmailRequest>(`${base}/confirm-email`, req, {
      anonymous: true,
      signal,
    }),

  login: (req: LoginRequest, signal?: AbortSignal) =>
    getHttpClient().post<AuthTokenResponse, LoginRequest>(`${base}/login`, req, {
      anonymous: true,
      signal,
    }),

  // noRefresh: avoid infinite loops if the refresh itself returns 401.
  refresh: (req: RefreshRequest, signal?: AbortSignal) =>
    getHttpClient().post<AuthTokenResponse, RefreshRequest>(`${base}/refresh`, req, {
      anonymous: true,
      noRefresh: true,
      signal,
    }),

  logout: (req: LogoutRequest, signal?: AbortSignal) =>
    getHttpClient().post<void, LogoutRequest>(`${base}/logout`, req, {
      anonymous: true,
      signal,
    }),

  logoutAll: (signal?: AbortSignal) =>
    getHttpClient().post<void>(`${base}/logout-all`, undefined, { signal }),

  requestPasswordReset: (req: PasswordResetRequest, signal?: AbortSignal) =>
    getHttpClient().post<void, PasswordResetRequest>(
      `${base}/password-reset/request`,
      req,
      { anonymous: true, signal },
    ),

  confirmPasswordReset: (req: PasswordResetConfirm, signal?: AbortSignal) =>
    getHttpClient().post<void, PasswordResetConfirm>(
      `${base}/password-reset/confirm`,
      req,
      { anonymous: true, signal },
    ),
};

const usersBase = '/users';

export const userProfileApi = {
  me: (signal?: AbortSignal) =>
    getHttpClient().get<UserProfileResponse>(`${usersBase}/me`, { signal }),

  updateMe: (req: UpdateProfileRequest, signal?: AbortSignal) =>
    getHttpClient().put<UserProfileResponse, UpdateProfileRequest>(
      `${usersBase}/me`,
      req,
      { signal },
    ),

  changePassword: (req: ChangePasswordRequest, signal?: AbortSignal) =>
    getHttpClient().post<void, ChangePasswordRequest>(`${usersBase}/me/password`, req, {
      signal,
    }),

  deleteMe: (signal?: AbortSignal) =>
    getHttpClient().delete<void>(`${usersBase}/me`, { signal }),
};
