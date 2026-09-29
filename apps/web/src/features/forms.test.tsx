import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '@/api/client';
import { useAuth } from '@/providers/AuthProvider';
import { useOrg } from '@/providers/OrgProvider';
import { byUrl } from '@/test/fixtures';
import { orgValue, renderWithProviders } from '@/test/utils';
import { SignInPage } from './auth/SignInPage';
import { OrganizationTargets } from './targets/OrganizationTargets';
import { TeamPage } from './team/TeamPage';

// jsdom's AbortSignal is not accepted by Node's Request, which data-router navigations construct.
const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useNavigate: () => navigate,
}));
vi.mock('@/providers/OrgProvider', () => ({ useOrg: vi.fn() }));
vi.mock('@/providers/AuthProvider', () => ({ useAuth: vi.fn(), ME_QUERY_KEY: ['me'] }));
vi.mock('@/api/client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  api: { get: vi.fn(), page: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const auth = (overrides: Partial<ReturnType<typeof useAuth>> = {}) =>
  ({
    user: {
      id: 'usr_admin',
      email: 'admin@example.com',
      name: 'Avery Admin',
      emailVerified: true,
      systemRole: 'USER',
      hasPassword: true,
      memberships: [],
      featureFlags: {},
    },
    loading: false,
    isSuperAdmin: false,
    signIn: vi.fn(),
    register: vi.fn(),
    signOut: vi.fn(),
    refreshUser: vi.fn(),
    ...overrides,
  }) as ReturnType<typeof useAuth>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useOrg).mockReturnValue(orgValue('ORGANIZATION_ADMIN'));
  vi.mocked(useAuth).mockReturnValue(auth());
});

describe('SignInPage', () => {
  it('validates input before contacting the server', async () => {
    const signIn = vi.fn();
    vi.mocked(useAuth).mockReturnValue(auth({ signIn }));
    renderWithProviders(<SignInPage />, { route: '/sign-in' });
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('shows the server error for rejected credentials', async () => {
    const signIn = vi
      .fn()
      .mockRejectedValue(new ApiError('Invalid email or password', 401, 'INVALID_CREDENTIALS'));
    vi.mocked(useAuth).mockReturnValue(auth({ signIn }));
    renderWithProviders(<SignInPage />, { route: '/sign-in' });
    await userEvent.type(screen.getByLabelText(/email/i), 'analyst@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(signIn).toHaveBeenCalledWith({ email: 'analyst@example.com', password: 'wrong-password' });
  });

  it('redirects to a safe next path after signing in', async () => {
    const signIn = vi.fn().mockResolvedValue({ memberships: [{ organizationId: 'o' }], systemRole: 'USER' });
    vi.mocked(useAuth).mockReturnValue(auth({ signIn }));
    renderWithProviders(<SignInPage />, { route: '/sign-in?next=//evil.example' });
    await userEvent.type(screen.getByLabelText(/email/i), 'analyst@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/dashboard', { replace: true }));
  });
});

describe('OrganizationTargets', () => {
  const data = {
    targets: [],
    defaults: { CPA: 50, ROAS: 3, CTR: 2, CONVERSION_RATE: 3, SPEND_PACING_TOLERANCE: 15 },
  };

  it('rejects percentages above 100 and saves valid targets', async () => {
    vi.mocked(api.put).mockResolvedValue({});
    renderWithProviders(<OrganizationTargets data={data} />);
    const ctr = screen.getByLabelText('Minimum CTR');
    await userEvent.type(ctr, '150');
    await userEvent.click(screen.getByRole('button', { name: 'Save targets' }));
    expect(await screen.findByText('Percentages cannot exceed 100')).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();

    await userEvent.clear(ctr);
    await userEvent.type(ctr, '2.5');
    await userEvent.type(screen.getByLabelText('Target CPA'), '45');
    await userEvent.click(screen.getByRole('button', { name: 'Save targets' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
    expect(api.put).toHaveBeenCalledWith('/targets', { scope: 'ORGANIZATION', metric: 'CPA', value: 45 });
    expect(api.put).toHaveBeenCalledWith('/targets', { scope: 'ORGANIZATION', metric: 'CTR', value: 2.5 });
  });

  it('is read-only for roles without targets:manage', () => {
    vi.mocked(useOrg).mockReturnValue(orgValue('ANALYST'));
    renderWithProviders(<OrganizationTargets data={data} />);
    expect(screen.getByLabelText('Target CPA')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save targets' })).not.toBeInTheDocument();
  });
});

describe('TeamPage permissions', () => {
  const members = [
    {
      id: 'mem_1',
      userId: 'usr_admin',
      name: 'Avery Admin',
      email: 'admin@example.com',
      role: 'ORGANIZATION_ADMIN',
      joinedAt: '2026-01-01T00:00:00Z',
      lastLoginAt: null,
    },
    {
      id: 'mem_2',
      userId: 'usr_view',
      name: 'Vic Viewer',
      email: 'viewer@example.com',
      role: 'VIEWER',
      joinedAt: '2026-01-02T00:00:00Z',
      lastLoginAt: null,
    },
  ];

  beforeEach(() => {
    vi.mocked(api.get).mockImplementation(byUrl({ '/memberships': members, '/invitations': [] }));
  });

  it('lets admins invite, change roles and remove other members', async () => {
    renderWithProviders(<TeamPage />);
    const table = await screen.findByRole('table', { name: 'Members' });
    await within(table).findByText('Vic Viewer');
    expect(screen.getByRole('button', { name: 'Invite' })).toBeInTheDocument();
    expect(within(table).getByRole('combobox', { name: 'Role for Vic Viewer' })).toBeInTheDocument();
    expect(within(table).getAllByRole('button', { name: 'Remove' })).toHaveLength(1);
    expect(await screen.findByText('No pending invitations')).toBeInTheDocument();
  });

  it('shows a read-only member list to viewers', async () => {
    vi.mocked(useOrg).mockReturnValue(orgValue('VIEWER'));
    renderWithProviders(<TeamPage />);
    const table = await screen.findByRole('table', { name: 'Members' });
    await within(table).findByText('Vic Viewer');
    expect(screen.queryByRole('button', { name: 'Invite' })).not.toBeInTheDocument();
    expect(within(table).queryByRole('combobox')).not.toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Pending invitations' })).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith('/invitations');
  });

  it('validates the invitation email', async () => {
    renderWithProviders(<TeamPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Invite' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/email/i), 'not-an-email');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send invitation' }));
    expect(await within(dialog).findByText('Enter a valid email address')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});
