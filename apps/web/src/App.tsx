import { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { isLoggedIn } from './auth/storage';
import { AppLayout } from './components/AppLayout';
import { RoleGate } from './components/RoleGate';
import { AlertsPage } from './pages/AlertsPage';
import { CommandHistoryPage } from './pages/CommandHistoryPage';
import { DashboardPage } from './pages/DashboardPage';
import { DeviceDetailPage } from './pages/DeviceDetailPage';
import { DevicesAnalyticsPage } from './pages/DevicesAnalyticsPage';
import { DevicesPage } from './pages/DevicesPage';
import { FaultsAnalyticsPage } from './pages/FaultsAnalyticsPage';
import { LoginPage } from './pages/LoginPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsAliasesPage } from './pages/SettingsAliasesPage';
import { UsersAnalyticsPage } from './pages/UsersAnalyticsPage';
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
        element={isLoggedIn() ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="dashboard" element={<Navigate to="/" replace />} />
        <Route path="analytics/users" element={<UsersAnalyticsPage />} />
        <Route path="analytics/devices" element={<DevicesAnalyticsPage />} />
        <Route path="analytics/faults" element={<FaultsAnalyticsPage />} />
        <Route path="analytics/reports" element={<ReportsPage />} />
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
        element={<Navigate to={isLoggedIn() ? '/' : '/login'} replace />}
      />
    </Routes>
  );
}
