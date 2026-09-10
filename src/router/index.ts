import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

import DefaultLayout from '@/layouts/DefaultLayout.vue';
import AuthLayout from '@/layouts/AuthLayout.vue';
import HomeView from '@/features/home/HomeView.vue';
import NotFoundView from '@/features/home/NotFoundView.vue';

import LoginView from '@/features/auth/views/LoginView.vue';
import RegisterView from '@/features/auth/views/RegisterView.vue';
import ForgotPasswordView from '@/features/auth/views/ForgotPasswordView.vue';
import ResetPasswordView from '@/features/auth/views/ResetPasswordView.vue';
import ConfirmEmailView from '@/features/auth/views/ConfirmEmailView.vue';

import NewGameView from '@/features/game/views/NewGameView.vue';
import PlayView from '@/features/game/views/PlayView.vue';
import DailyView from '@/features/daily/views/DailyView.vue';
import LeaderboardsView from '@/features/leaderboards/views/LeaderboardsView.vue';
import ProfileView from '@/features/profile/views/ProfileView.vue';
import StatsView from '@/features/stats/views/StatsView.vue';

import { authGuard } from './guards';

// IMPORTANT: when defining /leaderboards routes, the literal `/daily` segment
// MUST be declared before the dynamic `:difficulty` segment. Vue Router matches
// in declaration order, so a `:difficulty` route declared first would swallow
// the path `/leaderboards/daily` and bind `difficulty = "daily"`.
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: DefaultLayout,
    children: [
      { path: '', name: 'home', component: HomeView },
      { path: 'play', name: 'play.new', component: NewGameView },
      {
        path: 'play/:gameId',
        name: 'play.game',
        component: PlayView,
        props: true,
      },
      { path: 'daily', name: 'daily', component: DailyView },
      {
        path: 'leaderboards',
        name: 'leaderboards.default',
        redirect: { name: 'leaderboards.byDifficulty', params: { difficulty: 'Easy' } },
      },
      // ⚠️ /leaderboards/daily MUST come before /leaderboards/:difficulty.
      { path: 'leaderboards/daily', name: 'leaderboards.daily', component: LeaderboardsView, props: { kind: 'daily' } },
      {
        path: 'leaderboards/:difficulty',
        name: 'leaderboards.byDifficulty',
        component: LeaderboardsView,
        props: (route) => ({ kind: 'difficulty', difficulty: route.params.difficulty }),
      },
      { path: 'profile', name: 'profile', component: ProfileView, meta: { requiresAuth: true } },
      { path: 'stats', name: 'stats', component: StatsView, meta: { requiresAuth: true } },
      { path: 'users/:userId/stats', name: 'stats.public', component: StatsView, props: true },
    ],
  },
  {
    path: '/',
    component: AuthLayout,
    children: [
      { path: 'login', name: 'login', component: LoginView, meta: { guestOnly: true } },
      { path: 'register', name: 'register', component: RegisterView, meta: { guestOnly: true } },
      { path: 'forgot-password', name: 'forgot-password', component: ForgotPasswordView, meta: { guestOnly: true } },
      { path: 'reset-password', name: 'reset-password', component: ResetPasswordView, meta: { guestOnly: true } },
      { path: 'confirm-email', name: 'confirm-email', component: ConfirmEmailView },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: NotFoundView,
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(authGuard);
