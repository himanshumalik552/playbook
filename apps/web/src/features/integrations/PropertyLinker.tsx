import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import { errorMessage } from '@/api/client';
import { QueryState } from '@/components/QueryState';
import { useAdAccounts, useAvailableProperties, useSelectProperties } from './api';

/** Link GA4 properties to ad accounts so landing-page sessions can be joined with ad clicks. */
export function PropertyLinker({ connectionId, onSaved }: { connectionId: string; onSaved: () => void }) {
  const properties = useAvailableProperties(connectionId);
  const accounts = useAdAccounts();
  const save = useSelectProperties(connectionId);
  const { enqueueSnackbar } = useSnackbar();
  const [links, setLinks] = useState<Map<string, string | null>>(new Map());

  useEffect(() => {
    if (properties.data)
      setLinks(new Map(properties.data.filter((p) => p.linked).map((p) => [p.propertyId, p.adAccountId])));
  }, [properties.data]);

  const toggle = (propertyId: string, on: boolean) =>
    setLinks((prev) => {
      const next = new Map(prev);
      if (on) next.set(propertyId, null);
      else next.delete(propertyId);
      return next;
    });

  const submit = () =>
    save.mutate(
      [...links].map(([propertyId, adAccountId]) => ({ propertyId, adAccountId })),
      {
        onSuccess: () => {
          enqueueSnackbar('Analytics properties saved', { variant: 'success' });
          onSaved();
        },
        onError: (e) => enqueueSnackbar(errorMessage(e), { variant: 'error' }),
      },
    );

  return (
    <QueryState
      query={properties}
      isEmpty={(d) => d.length === 0}
      empty={<Alert severity="info">No GA4 properties are accessible with this Google login.</Alert>}
    >
      {(data) => (
        <Stack spacing={1.5}>
          {data.map((p) => {
            const checked = links.has(p.propertyId);
            return (
              <Stack
                key={p.propertyId}
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                alignItems={{ sm: 'center' }}
              >
                <Stack direction="row" alignItems="center" sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Checkbox
                    checked={checked}
                    onChange={(e) => toggle(p.propertyId, e.target.checked)}
                    slotProps={{ input: { 'aria-label': `Link ${p.name}` } }}
                  />
                  <Stack sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>
                      {p.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Property {p.propertyId} · {p.timezone}
                    </Typography>
                  </Stack>
                </Stack>
                <TextField
                  select
                  size="small"
                  label="Ad account"
                  disabled={!checked}
                  value={links.get(p.propertyId) ?? ''}
                  onChange={(e) =>
                    setLinks((prev) => new Map(prev).set(p.propertyId, e.target.value || null))
                  }
                  sx={{ minWidth: 220 }}
                >
                  <MenuItem value="">Any account</MenuItem>
                  {(accounts.data ?? [])
                    .filter((a) => !a.isManager)
                    .map((a) => (
                      <MenuItem key={a.id} value={a.id}>
                        {a.name}
                      </MenuItem>
                    ))}
                </TextField>
              </Stack>
            );
          })}
          <Stack direction="row" justifyContent="flex-end">
            <Button variant="contained" onClick={submit} disabled={save.isPending}>
              Save properties
            </Button>
          </Stack>
        </Stack>
      )}
    </QueryState>
  );
}
