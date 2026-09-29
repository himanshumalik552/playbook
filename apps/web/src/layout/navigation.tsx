import AdminPanelSettingsOutlined from '@mui/icons-material/AdminPanelSettingsOutlined';
import AssessmentOutlined from '@mui/icons-material/AssessmentOutlined';
import CampaignOutlined from '@mui/icons-material/CampaignOutlined';
import DashboardOutlined from '@mui/icons-material/DashboardOutlined';
import GroupOutlined from '@mui/icons-material/GroupOutlined';
import HubOutlined from '@mui/icons-material/HubOutlined';
import LightbulbOutlined from '@mui/icons-material/LightbulbOutlined';
import ManageSearchOutlined from '@mui/icons-material/ManageSearchOutlined';
import NotificationsActiveOutlined from '@mui/icons-material/NotificationsActiveOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import TaskAltOutlined from '@mui/icons-material/TaskAltOutlined';
import TrackChangesOutlined from '@mui/icons-material/TrackChangesOutlined';
import type { Permission } from '@adpulse/types';
import type { ReactElement } from 'react';

export interface NavItem {
  to: string;
  label: string;
  icon: ReactElement;
  permission?: Permission;
  superAdmin?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Performance',
    items: [
      { to: '/dashboard', label: 'Overview', icon: <DashboardOutlined />, permission: 'analytics:read' },
      { to: '/campaigns', label: 'Campaigns', icon: <CampaignOutlined />, permission: 'analytics:read' },
      {
        to: '/search-terms',
        label: 'Search terms',
        icon: <ManageSearchOutlined />,
        permission: 'analytics:read',
      },
    ],
  },
  {
    title: 'Optimize',
    items: [
      { to: '/alerts', label: 'Alerts', icon: <NotificationsActiveOutlined />, permission: 'analytics:read' },
      {
        to: '/recommendations',
        label: 'Recommendations',
        icon: <LightbulbOutlined />,
        permission: 'analytics:read',
      },
      { to: '/actions', label: 'Actions', icon: <TaskAltOutlined />, permission: 'analytics:read' },
      { to: '/reports', label: 'Reports', icon: <AssessmentOutlined />, permission: 'reports:read' },
    ],
  },
  {
    title: 'Configure',
    items: [
      {
        to: '/targets',
        label: 'Targets & rules',
        icon: <TrackChangesOutlined />,
        permission: 'analytics:read',
      },
      { to: '/integrations', label: 'Integrations', icon: <HubOutlined />, permission: 'analytics:read' },
      { to: '/team', label: 'Team & roles', icon: <GroupOutlined />, permission: 'analytics:read' },
      { to: '/settings', label: 'Organization', icon: <SettingsOutlined />, permission: 'analytics:read' },
    ],
  },
  {
    title: 'Platform',
    items: [{ to: '/admin', label: 'Super admin', icon: <AdminPanelSettingsOutlined />, superAdmin: true }],
  },
];
