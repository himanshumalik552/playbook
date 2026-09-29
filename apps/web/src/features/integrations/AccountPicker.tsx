import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import { StatusChip } from '@adpulse/ui';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import { errorMessage } from '@/api/client';
import { QueryState } from '@/components/QueryState';
import { useAccessibleAccounts, useSelectAccounts } from './api';

interface AccountPickerProps {
  connectionId: string;
  onSaved?: (queued: number) => void;
  saveLabel?: string;
}

/** Choose which Google Ads accounts to import. Manager (MCC) accounts have no metrics of their own. */
export function AccountPicker({ connectionId, onSaved, saveLabel = 'Save selection' }: AccountPickerProps) {
  const accounts = useAccessibleAccounts(connectionId);
  const save = useSelectAccounts(connectionId);
  const { enqueueSnackbar } = useSnackbar();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (accounts.data) setSelected(new Set(accounts.data.filter((a) => a.selected).map((a) => a.customerId)));
  }, [accounts.data]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = () =>
    save.mutate([...selected], {
      onSuccess: (result) => {
        enqueueSnackbar(
          result.initialSyncsQueued > 0
            ? `Saved. Importing history for ${result.initialSyncsQueued} new account(s).`
            : 'Account selection saved',
          { variant: 'success' },
        );
        onSaved?.(result.initialSyncsQueued);
      },
      onError: (e) => enqueueSnackbar(errorMessage(e), { variant: 'error' }),
    });

  return (
    <QueryState
      query={accounts}
      isEmpty={(d) => d.length === 0}
      empty={<Alert severity="info">No accounts are accessible with this Google login.</Alert>}
    >
      {(data) => (
        <Stack spacing={2}>
          <List dense disablePadding aria-label="Accessible Google Ads accounts">
            {data.map((a) => {
              const id = `account-${a.customerId}`;
              return (
                <ListItem key={a.customerId} disablePadding>
                  <ListItemButton onClick={() => toggle(a.customerId)} disabled={a.isManager} dense>
                    <ListItemIcon sx={{ minWidth: 40 }}>
                      <Checkbox
                        edge="start"
                        checked={selected.has(a.customerId)}
                        tabIndex={-1}
                        disableRipple
                        slotProps={{ input: { 'aria-labelledby': id } }}
                      />
                    </ListItemIcon>
                    <ListItemText
                      id={id}
                      primary={a.name}
                      secondary={`${a.customerId.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')} · ${a.currencyCode} · ${a.timezone}`}
                    />
                    {a.isManager && <StatusChip tone="neutral" label="Manager account" />}
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button variant="contained" onClick={submit} disabled={save.isPending || selected.size === 0}>
              {saveLabel}
            </Button>
          </Stack>
        </Stack>
      )}
    </QueryState>
  );
}
