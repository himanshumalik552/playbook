import { describe, expect, it } from 'vitest';
import { ACTION_WORKFLOW, hasPermission, PERMISSIONS, ROLE_PERMISSIONS } from '../src';

describe('role permissions', () => {
  it('grants viewers read-only access', () => {
    expect(hasPermission('VIEWER', 'analytics:read')).toBe(true);
    expect(hasPermission('VIEWER', 'reports:read')).toBe(true);
    expect(hasPermission('VIEWER', 'reports:generate')).toBe(false);
    expect(hasPermission('VIEWER', 'actions:create')).toBe(false);
    expect(hasPermission('VIEWER', 'alerts:update')).toBe(false);
  });

  it('lets analysts create reports, recommendations and actions but not approve', () => {
    expect(hasPermission('ANALYST', 'reports:generate')).toBe(true);
    expect(hasPermission('ANALYST', 'recommendations:create')).toBe(true);
    expect(hasPermission('ANALYST', 'actions:create')).toBe(true);
    expect(hasPermission('ANALYST', 'recommendations:decide')).toBe(false);
    expect(hasPermission('ANALYST', 'targets:manage')).toBe(false);
  });

  it('lets marketing managers approve, assign and configure targets but not manage members', () => {
    expect(hasPermission('MARKETING_MANAGER', 'recommendations:decide')).toBe(true);
    expect(hasPermission('MARKETING_MANAGER', 'actions:assign')).toBe(true);
    expect(hasPermission('MARKETING_MANAGER', 'targets:manage')).toBe(true);
    expect(hasPermission('MARKETING_MANAGER', 'members:manage')).toBe(false);
    expect(hasPermission('MARKETING_MANAGER', 'integrations:manage')).toBe(false);
  });

  it('gives organization admins everything except system administration', () => {
    const adminPerms = ROLE_PERMISSIONS.ORGANIZATION_ADMIN;
    expect(adminPerms.has('members:manage')).toBe(true);
    expect(adminPerms.has('integrations:manage')).toBe(true);
    expect(adminPerms.has('admin:system')).toBe(false);
  });

  it('gives super admins every permission', () => {
    for (const permission of PERMISSIONS) {
      expect(hasPermission('SUPER_ADMIN', permission)).toBe(true);
    }
  });

  it('denies when role is missing', () => {
    expect(hasPermission(null, 'analytics:read')).toBe(false);
    expect(hasPermission(undefined, 'analytics:read')).toBe(false);
  });

  it('defines terminal workflow states', () => {
    expect(ACTION_WORKFLOW.EVALUATED).toHaveLength(0);
    expect(ACTION_WORKFLOW.CANCELLED).toHaveLength(0);
    expect(ACTION_WORKFLOW.BACKLOG).toContain('PLANNED');
    expect(ACTION_WORKFLOW.COMPLETED).toContain('EVALUATED');
  });
});
