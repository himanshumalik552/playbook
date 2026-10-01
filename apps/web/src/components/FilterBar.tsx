import FilterAltOffOutlined from '@mui/icons-material/FilterAltOffOutlined';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import { useEffect, useState } from 'react';
import { useFilterOptions } from '@/hooks/common';
import type { MetricFilterPatch, MetricFilters } from '@/hooks/useMetricFilters';
import { DATE_PRESETS, type DatePreset, isValidRange, matchPreset, presetRange } from '@/lib/dates';
import { useOrg } from '@/providers/org';

type FilterControl = 'account' | 'campaigns' | 'device' | 'location' | 'objective' | 'compare';

interface FilterBarProps {
  filters: MetricFilters;
  onChange: (patch: MetricFilterPatch) => void;
  onReset?: () => void;
  activeCount?: number;
  controls?: FilterControl[];
}

const ALL: FilterControl[] = ['account', 'campaigns', 'device', 'location', 'objective', 'compare'];

function DateRangeControl({ filters, onChange }: Pick<FilterBarProps, 'filters' | 'onChange'>) {
  const { settings } = useOrg();
  const timeZone = settings?.timezone ?? 'UTC';
  const preset = matchPreset(filters, timeZone) ?? 'custom';
  const [draft, setDraft] = useState({ from: filters.from, to: filters.to });

  useEffect(() => setDraft({ from: filters.from, to: filters.to }), [filters.from, filters.to]);

  const commit = (next: { from: string; to: string }) => {
    setDraft(next);
    if (isValidRange(next.from, next.to)) onChange(next);
  };
  const invalid = !isValidRange(draft.from, draft.to);

  return (
    <>
      <TextField
        select
        label="Date range"
        value={preset}
        onChange={(e) =>
          e.target.value !== 'custom' && onChange(presetRange(e.target.value as DatePreset, timeZone))
        }
        sx={{ minWidth: 160 }}
      >
        {DATE_PRESETS.map((p) => (
          <MenuItem key={p.value} value={p.value}>
            {p.label}
          </MenuItem>
        ))}
        <MenuItem value="custom" disabled={preset !== 'custom'}>
          Custom range
        </MenuItem>
      </TextField>
      <TextField
        type="date"
        label="From"
        value={draft.from}
        onChange={(e) => commit({ ...draft, from: e.target.value })}
        error={invalid}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: draft.to } }}
      />
      <TextField
        type="date"
        label="To"
        value={draft.to}
        onChange={(e) => commit({ ...draft, to: e.target.value })}
        error={invalid}
        helperText={invalid ? 'Pick a valid range (max. 2 years)' : undefined}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: draft.from } }}
      />
    </>
  );
}

export function FilterBar({ filters, onChange, onReset, activeCount = 0, controls = ALL }: FilterBarProps) {
  const options = useFilterOptions();
  const show = (c: FilterControl) => controls.includes(c);
  const data = options.data;
  const campaigns = (data?.campaigns ?? []).filter(
    (c) => !filters.adAccountId || c.adAccountId === filters.adAccountId,
  );
  const selectedCampaigns = campaigns.filter((c) => filters.campaignIds.includes(c.value));

  return (
    <Card component="section" aria-label="Filters" sx={{ p: 1.5, mb: 2.5 }}>
      <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" alignItems="flex-start">
        <DateRangeControl filters={filters} onChange={onChange} />
        {show('account') && (
          <TextField
            select
            label="Account"
            value={filters.adAccountId ?? ''}
            onChange={(e) => onChange({ adAccountId: e.target.value || null, campaignIds: [] })}
            sx={{ minWidth: 180 }}
            disabled={options.isPending}
          >
            <MenuItem value="">All accounts</MenuItem>
            {(data?.adAccounts ?? []).map((a) => (
              <MenuItem key={a.value} value={a.value}>
                {a.label}
              </MenuItem>
            ))}
          </TextField>
        )}
        {show('campaigns') && (
          <Autocomplete
            multiple
            size="small"
            limitTags={1}
            options={campaigns}
            value={selectedCampaigns}
            loading={options.isPending}
            getOptionLabel={(o) => o.label}
            isOptionEqualToValue={(a, b) => a.value === b.value}
            onChange={(_e, value) => onChange({ campaignIds: value.map((v) => v.value) })}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Campaigns"
                placeholder={selectedCampaigns.length ? '' : 'All campaigns'}
              />
            )}
            sx={{ minWidth: 240, maxWidth: 360 }}
          />
        )}
        {show('device') && (
          <TextField
            select
            label="Device"
            value={filters.device ?? ''}
            onChange={(e) => onChange({ device: (e.target.value || null) as MetricFilters['device'] })}
            sx={{ minWidth: 130 }}
          >
            <MenuItem value="">All devices</MenuItem>
            {(data?.devices ?? []).map((d) => (
              <MenuItem key={d.value} value={d.value}>
                {d.label}
              </MenuItem>
            ))}
          </TextField>
        )}
        {show('location') && (
          <Autocomplete
            size="small"
            options={data?.locations ?? []}
            value={(data?.locations ?? []).find((l) => l.value === filters.locationId) ?? null}
            getOptionLabel={(o) => o.label}
            isOptionEqualToValue={(a, b) => a.value === b.value}
            onChange={(_e, value) => onChange({ locationId: value?.value ?? null })}
            renderInput={(params) => <TextField {...params} label="Location" placeholder="All locations" />}
            sx={{ minWidth: 180 }}
          />
        )}
        {show('objective') && (
          <TextField
            select
            label="Objective"
            value={filters.objective ?? ''}
            onChange={(e) => onChange({ objective: (e.target.value || null) as MetricFilters['objective'] })}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">All objectives</MenuItem>
            {(data?.objectives ?? []).map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
        )}
        {show('compare') && (
          <FormControlLabel
            sx={{ ml: 0, mt: 0.5 }}
            control={
              <Switch checked={filters.compare} onChange={(e) => onChange({ compare: e.target.checked })} />
            }
            label="Compare to previous period"
          />
        )}
        {onReset && activeCount > 0 && (
          <Button startIcon={<FilterAltOffOutlined />} onClick={onReset} sx={{ mt: 0.25 }}>
            Clear filters ({activeCount})
          </Button>
        )}
      </Stack>
    </Card>
  );
}
