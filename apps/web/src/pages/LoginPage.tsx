import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import { setSession } from '../auth/storage';

type LoginResponse = {
  accessToken: string;
  role: string;
  username: string;
};

/**
 * 仅本地演示。默认与 apps/api/prisma/seed.ts 的 readonly / ChangeMe123! 一致。
 * 可用 VITE_GUEST_USERNAME、VITE_GUEST_PASSWORD 覆盖，不要用于生产。
 */
const GUEST_USERNAME = import.meta.env.VITE_GUEST_USERNAME || 'readonly';
const GUEST_PASSWORD = import.meta.env.VITE_GUEST_PASSWORD || 'ChangeMe123!';

export function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<'form' | 'guest' | null>(null);

  async function loginWith(
    nextUsername: string,
    nextPassword: string,
    source: 'form' | 'guest',
  ) {
    if (pending) return;
    setPending(source);
    setError(null);
    try {
      const res = await api<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: nextUsername, password: nextPassword }),
      });
      setSession(res.accessToken, res.role, res.username);
      navigate('/', { replace: true });
    } catch (err) {
      setError(readableLoginError(err, source === 'guest'));
    } finally {
      setPending(null);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await loginWith(username, password, 'form');
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit} autoComplete="off">
        <div className="brand" style={{ marginBottom: '0.25rem' }}>
          <span className="brand-mark" aria-hidden />
          Ops Console
        </div>
        <h1>涂鸦运维台</h1>
        <p>本地 Demo 登录</p>
        <div className="form-row">
          <label htmlFor="username">用户名</label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
            required
          />
        </div>
        <div className="form-row">
          <label htmlFor="password">密码</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
            required
          />
        </div>
        {error && <p className="error">{error}</p>}
        <div className="login-actions">
          <button className="btn primary" type="submit" disabled={pending !== null}>
            {pending === 'form' ? '登录中…' : '登录'}
          </button>
          <button
            className="btn secondary"
            type="button"
            disabled={pending !== null}
            onClick={() => void loginWith(GUEST_USERNAME, GUEST_PASSWORD, 'guest')}
          >
            {pending === 'guest' ? '登录中…' : '访客一键登录'}
          </button>
        </div>
      </form>
    </div>
  );
}

function readableLoginError(err: unknown, guest: boolean): string {
  if (guest && err instanceof ApiError && (err.status === 401 || err.status === 403)) {
    return '访客登录失败：readonly 账号或演示密码不正确。请确认已执行数据库 seed。';
  }
  if (err instanceof Error && err.message) {
    return guest ? `访客登录失败：${err.message}` : err.message;
  }
  return guest ? '访客登录失败' : '登录失败';
}
