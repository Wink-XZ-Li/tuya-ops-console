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

  it('starts with empty username and password fields', () => {
    renderLogin();
    const username = screen.getByLabelText('用户名');
    const password = screen.getByLabelText('密码');
    expect(username).toHaveValue('');
    expect(password).toHaveValue('');
    expect(username).toHaveAttribute('autocomplete', 'off');
    expect(password).toHaveAttribute('autocomplete', 'off');
  });

  it('guest login uses in-memory credentials and leaves the inputs unchanged', async () => {
    let resolveLogin: (value: {
      accessToken: string;
      role: string;
      username: string;
    }) => void = () => {};
    api.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLogin = resolve;
        }),
    );

    renderLogin();
    const username = screen.getByLabelText('用户名');
    const password = screen.getByLabelText('密码');
    fireEvent.change(username, { target: { value: 'typed-user' } });
    fireEvent.change(password, { target: { value: 'typed-pass' } });
    fireEvent.click(screen.getByRole('button', { name: '访客一键登录' }));

    expect(api).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'readonly', password: 'ChangeMe123!' }),
    });
    expect(username).toHaveValue('typed-user');
    expect(password).toHaveValue('typed-pass');

    resolveLogin({
      accessToken: 'real-token',
      role: 'readonly',
      username: 'readonly',
    });
    expect(await screen.findByText('已进入系统')).toBeInTheDocument();
    expect(getToken()).toBe('real-token');
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
    expect(screen.getByLabelText('用户名')).toHaveValue('');
    expect(screen.getByLabelText('密码')).toHaveValue('');
    expect(screen.queryByText('已进入系统')).not.toBeInTheDocument();
  });

  it('still logs in with the username and password form', async () => {
    api.mockResolvedValue({
      accessToken: 'admin-token',
      role: 'admin',
      username: 'admin',
    });

    renderLogin();
    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'ChangeMe123!' } });
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
