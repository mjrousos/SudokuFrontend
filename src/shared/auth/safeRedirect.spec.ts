import { describe, expect, it } from 'vitest';

import { safeRedirect } from '@/shared/auth/safeRedirect';

describe('safeRedirect', () => {
  it('returns a plain relative path unchanged', () => {
    expect(safeRedirect('/dashboard')).toBe('/dashboard');
    expect(safeRedirect('/profile/settings')).toBe('/profile/settings');
    expect(safeRedirect('/')).toBe('/');
  });

  it('returns a path with query string and hash', () => {
    expect(safeRedirect('/search?q=foo')).toBe('/search?q=foo');
    expect(safeRedirect('/page#section')).toBe('/page#section');
  });

  it('blocks protocol-relative URLs (//)', () => {
    expect(safeRedirect('//evil.com')).toBe('/');
    expect(safeRedirect('//evil.com/phish')).toBe('/');
  });

  it('blocks backslash-variant protocol-relative URLs (/\\)', () => {
    expect(safeRedirect('/\\evil.com')).toBe('/');
  });

  it('blocks javascript: URLs', () => {
    expect(safeRedirect('javascript:alert(1)')).toBe('/');
  });

  it('blocks http:// URLs', () => {
    expect(safeRedirect('http://evil.com')).toBe('/');
    expect(safeRedirect('https://evil.com')).toBe('/');
  });

  it('blocks data: URLs', () => {
    expect(safeRedirect('data:text/html,<h1>hi</h1>')).toBe('/');
  });

  it('blocks non-string inputs', () => {
    expect(safeRedirect(undefined)).toBe('/');
    expect(safeRedirect(null)).toBe('/');
    expect(safeRedirect(42)).toBe('/');
    expect(safeRedirect({})).toBe('/');
    expect(safeRedirect(['//evil.com'])).toBe('/');
  });

  it('blocks empty string', () => {
    expect(safeRedirect('')).toBe('/');
  });

  it('blocks strings that do not start with /', () => {
    expect(safeRedirect('evil.com')).toBe('/');
    expect(safeRedirect('relative/path')).toBe('/');
  });

  it('respects a custom fallback', () => {
    expect(safeRedirect('//evil.com', '/home')).toBe('/home');
    expect(safeRedirect(undefined, '/home')).toBe('/home');
  });
});
