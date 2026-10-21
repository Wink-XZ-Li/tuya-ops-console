import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearSession, getRole, getUsername } from '../auth/storage';
import { RoleGate } from './RoleGate';

const DEMO_MODE = (import.meta.env.VITE_DEMO_MODE ?? 'mock').toLowerCase();

function IconDashboard() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="3.5" width="7" height="4.5" rx="1" />
      <rect x="13.5" y="10.5" width="7" height="10" rx="1" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
    </svg>
  );
}

function IconDevices() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <path d="M9 17h6" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c0-2.8 2.5-5 5.5-5s5.5 2.2 5.5 5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M20.5 19c0-2.2-1.6-4-3.8-4.6" />
    </svg>
  );
}

function IconAlerts() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 4l8 14H4l8-14z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="16.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconCommands() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden>
      <path d="M5 7l5 5-5 5" />
      <path d="M12 17h7" />
    </svg>
  );
}

function IconAnalytics() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 15v-4" />
      <path d="M12 15V8" />
      <path d="M16 15v-6" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.2M12 18.8V21M4.9 6.5l1.6 1.6M17.5 17.9l1.6 1.6M3 12h2.2M18.8 12H21M4.9 17.5l1.6-1.6M17.5 6.1l1.6-1.6" />
    </svg>
  );
}

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
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-bits" aria-hidden>
            <i />
            <i />
            <i className="on" />
            <i />
            <i className="on" />
            <i />
          </span>
          涂鸦运维台
        </div>
        <nav className="nav">
          <div className="nav-label">总览</div>
          <NavLink className={({ isActive }) => (isActive ? 'active' : undefined)} to="/" end>
            <IconDashboard />
            看板
          </NavLink>
          <div className="nav-label">分析</div>
          <NavLink
            className={({ isActive }) => (isActive ? 'active' : undefined)}
            to="/analytics/users"
          >
            <IconAnalytics />
            用户分析
          </NavLink>
          <NavLink
            className={({ isActive }) => (isActive ? 'active' : undefined)}
            to="/analytics/devices"
          >
            <IconAnalytics />
            设备分析
          </NavLink>
          <NavLink
            className={({ isActive }) => (isActive ? 'active' : undefined)}
            to="/analytics/faults"
          >
            <IconAlerts />
            故障分析
          </NavLink>
          <NavLink
            className={({ isActive }) => (isActive ? 'active' : undefined)}
            to="/analytics/reports"
          >
            <IconDashboard />
            报表
          </NavLink>
          <div className="nav-label">台账</div>
          <NavLink className={({ isActive }) => (isActive ? 'active' : undefined)} to="/devices">
            <IconDevices />
            设备
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? 'active' : undefined)} to="/users">
            <IconUsers />
            用户
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? 'active' : undefined)} to="/alerts">
            <IconAlerts />
            告警
          </NavLink>
          <NavLink className={({ isActive }) => (isActive ? 'active' : undefined)} to="/commands">
            <IconCommands />
            指令历史
          </NavLink>
          <RoleGate allow={['admin']}>
            <NavLink
              className={({ isActive }) => (isActive ? 'active' : undefined)}
              to="/settings/aliases"
            >
              <IconSettings />
              别名设置
            </NavLink>
          </RoleGate>
        </nav>
        <div className="sidebar-foot">
          <span className={`badge ${DEMO_MODE === 'live' ? 'live' : 'mock'}`}>
            {DEMO_MODE === 'live' ? 'live' : 'mock'}
          </span>
          <span className="mono sidebar-user">
            {username} · {role}
          </span>
          <button type="button" className="btn" onClick={logout}>
            退出
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>中国区设备</span>
          <span>
            {username} · {role}
          </span>
        </header>
        <div className="sheet">
          <main className="main">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
