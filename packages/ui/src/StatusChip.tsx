import Chip, { type ChipProps } from '@mui/material/Chip';
import { alpha, useTheme } from '@mui/material/styles';
import type { StatusTone } from './theme';

export interface StatusChipProps extends Omit<ChipProps, 'color'> {
  tone: StatusTone;
}

/** Soft, tinted chip used for statuses and severities; the label always carries the meaning, not just the color. */
export function StatusChip({ tone, sx, size = 'small', ...props }: StatusChipProps) {
  const theme = useTheme();
  const color = tone === 'neutral' ? theme.palette.text.secondary : theme.palette[tone].main;
  return (
    <Chip
      size={size}
      sx={{
        color,
        backgroundColor: alpha(color, theme.palette.mode === 'light' ? 0.1 : 0.18),
        border: `1px solid ${alpha(color, 0.3)}`,
        ...sx,
      }}
      {...props}
    />
  );
}
