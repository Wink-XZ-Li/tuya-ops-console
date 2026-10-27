import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { getRole, getToken, getUsername } from '../auth/storage';
import { LoginPage } from './LoginPage';

const api = vi.hoisted(() => vi.fn());

vi.mock('../api/client', () => {
  class ApiError extends Error {
    status: number;
    body: unknown;

    constructor(status: number, body: unknown) {
      super(
        typeof body === 'object' && body && 'message' in body
          ? String((body as { message: unknown }).message)
          : `HTTP ${status}`,
      );
      this.status = status;
      this.body = body;
    }
  }

  return { api, ApiError };
});

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div>已进入系统</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    localStorage.clear();
    api.mockReset();
  });

  it('logs in as readonly through the login API when 访客一键登录 is clicked', async () => {
    api.mockResolvedValue({
      accessToken: 'real-token',
      role: 'readonly',
      username: 'readonly',
    });

    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: '访客一键登录' }));

    expect(await screen.findByText('已进入系统')).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'readonly', password: 'ChangeMe123!' }),
    });
    expect(getToken()).toBe('real-token');
    expect(getRole()).toBe('readonly');
    expect(getUsername()).toBe('readonly');
  });

  it('shows a readable error and does not store a token when guest login fails', async () => {
    api.mockRejectedValue(new ApiError(401, { message: 'Invalid credentials' }));

    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: '访客一键登录' }));

    expect(
      await screen.findByText(
        '访客登录失败：readonly 账号或演示密码不正确。请确认已执行数据库 seed。',
      ),
    ).toBeInTheDocument();
    expect(getToken()).toBeNull();
    expect(screen.queryByText('已进入系统')).not.toBeInTheDocument();
  });

  it('still logs in with the username and password form', async () => {
    api.mockResolvedValue({
      accessToken: 'admin-token',
      role: 'admin',
      username: 'admin',
    });

    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByText('已进入系统')).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'ChangeMe123!' }),
    });
    expect(getToken()).toBe('admin-token');
    expect(getRole()).toBe('admin');
  });
});
