import { ReactNode } from 'react';
import { getRole, Role } from '../auth/storage';

const ROLE_RANK: Record<Role, number> = {
  readonly: 1,
  operator: 2,
  admin: 3,
};

type Props = {
  allow: Role[];
  children: ReactNode;
  fallback?: ReactNode;
};

export function RoleGate({ allow, children, fallback = null }: Props) {
  const role = getRole();
  if (!role || !allow.includes(role)) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
}

export function hasMinRole(min: Role): boolean {
  const role = getRole();
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[min];
}
