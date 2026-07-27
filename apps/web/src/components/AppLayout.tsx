import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearSession, getRole, getUsername } from '../auth/storage';
import { RoleGate } from './RoleGate';

const DEMO_MODE = (import.meta.env.VITE_DEMO_MODE ?? 'mock').toLowerCase();

export function AppLayout() {
  const navigate = useNavigate();
  const username = getUsername();
  const role = getRole();

  function logout() {
    clearSession();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">涂鸦运维台</div>
        <nav className="nav">
          <NavLink className={({ isActive }) => (isActive ? 'active' : undefined)} to="/devices">
            设备
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? 'active' : undefined)} to="/users">
            用户
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? 'active' : undefined)} to="/alerts">
            告警
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? 'active' : undefined)} to="/commands">
            指令历史
          </NavLink>
          <RoleGate allow={['admin']}>
            <NavLink
              className={({ isActive }) => (isActive ? 'active' : undefined)}
              to="/settings/aliases"
            >
              别名设置
            </NavLink>
          </RoleGate>
        </nav>
        <div className="topbar-right">
          <span className={`badge ${DEMO_MODE === 'live' ? 'live' : 'mock'}`}>
            {DEMO_MODE === 'live' ? 'live' : 'mock'}
          </span>
          <span>
            {username} · {role}
          </span>
          <button type="button" className="btn" onClick={logout}>
            退出
          </button>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
