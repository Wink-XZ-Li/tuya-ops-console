import { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { isLoggedIn } from './auth/storage';
import { AppLayout } from './components/AppLayout';
import { RoleGate } from './components/RoleGate';
import { AlertsPage } from './pages/AlertsPage';
import { CommandHistoryPage } from './pages/CommandHistoryPage';
import { DeviceDetailPage } from './pages/DeviceDetailPage';
import { DevicesPage } from './pages/DevicesPage';
import { LoginPage } from './pages/LoginPage';
import { SettingsAliasesPage } from './pages/SettingsAliasesPage';
import { UserDetailPage, UsersPage } from './pages/UsersPage';

function RequireAuth({ children }: { children: ReactNode }) {
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function AdminOnly({ children }: { children: ReactNode }) {
  return (
    <RoleGate allow={['admin']} fallback={<p className="error">需要 admin 角色</p>}>
      {children}
    </RoleGate>
  );
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={isLoggedIn() ? <Navigate to="/devices" replace /> : <LoginPage />}
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/devices" replace />} />
        <Route path="devices" element={<DevicesPage />} />
        <Route path="devices/:deviceId" element={<DeviceDetailPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="users/:tuyaUid" element={<UserDetailPage />} />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="commands" element={<CommandHistoryPage />} />
        <Route
          path="settings/aliases"
          element={
            <AdminOnly>
              <SettingsAliasesPage />
            </AdminOnly>
          }
        />
      </Route>
      <Route
        path="*"
        element={<Navigate to={isLoggedIn() ? '/devices' : '/login'} replace />}
      />
    </Routes>
  );
}
