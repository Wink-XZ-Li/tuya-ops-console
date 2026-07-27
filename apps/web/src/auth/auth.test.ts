import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearSession,
  getRole,
  getToken,
  getUsername,
  isLoggedIn,
  setSession,
} from './storage';

describe('auth storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores and clears token/role/username', () => {
    expect(isLoggedIn()).toBe(false);
    setSession('tok', 'admin', 'admin');
    expect(getToken()).toBe('tok');
    expect(getRole()).toBe('admin');
    expect(getUsername()).toBe('admin');
    expect(isLoggedIn()).toBe(true);
    clearSession();
    expect(getToken()).toBeNull();
    expect(isLoggedIn()).toBe(false);
  });
});
