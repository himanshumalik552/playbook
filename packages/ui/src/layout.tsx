import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
}

export function PageHeader({ title, description, actions, breadcrumbs }: PageHeaderProps) {
  return (
    <Box sx={{ mb: 3 }}>
      {breadcrumbs}
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', md: 'flex-end' }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h1">{title}</Typography>
          {description && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }} component="div">
              {description}
            </Typography>
          )}
        </Box>
        {actions && (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
            {actions}
          </Stack>
        )}
      </Stack>
    </Box>
  );
}

export interface SectionCardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** Removes inner padding, e.g. for edge-to-edge tables. */
  flush?: boolean;
  id?: string;
}

export function SectionCard({ title, subtitle, actions, children, flush = false, id }: SectionCardProps) {
  return (
    <Card
      component="section"
      aria-labelledby={title && id ? `${id}-title` : undefined}
      sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      {(title || actions) && (
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={1}
          sx={{ px: 2, pt: 2, pb: flush ? 1.5 : 0 }}
        >
          <Box sx={{ minWidth: 0 }}>
            {title && (
              <Typography variant="h3" component="h2" id={id ? `${id}-title` : undefined}>
                {title}
              </Typography>
            )}
            {subtitle && (
              <Typography variant="caption" color="text.secondary" component="div">
                {subtitle}
              </Typography>
            )}
          </Box>
          {actions && (
            <Stack direction="row" spacing={1} alignItems="center">
              {actions}
            </Stack>
          )}
        </Stack>
      )}
      <Box sx={{ p: flush ? 0 : 2, flexGrow: 1, minWidth: 0 }}>{children}</Box>
    </Card>
  );
}
