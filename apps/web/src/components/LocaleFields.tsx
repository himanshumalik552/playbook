import Autocomplete from '@mui/material/Autocomplete';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { SUPPORTED_CURRENCIES } from '@adpulse/types';
import { type Control, Controller, type FieldPath, type FieldValues } from 'react-hook-form';

export const TIMEZONES: string[] =
  typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['UTC'];

export const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

interface Props<T extends FieldValues> {
  control: Control<T>;
  currencyName: FieldPath<T>;
  timezoneName: FieldPath<T>;
  disabled?: boolean;
}

export function LocaleFields<T extends FieldValues>({
  control,
  currencyName,
  timezoneName,
  disabled,
}: Props<T>) {
  return (
    <>
      <Controller
        name={currencyName}
        control={control}
        render={({ field, fieldState }) => (
          <TextField
            {...field}
            select
            label="Reporting currency"
            error={Boolean(fieldState.error)}
            helperText={fieldState.error?.message ?? 'Used to format monetary values and targets.'}
            disabled={disabled}
            fullWidth
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <MenuItem key={c} value={c}>
                {c}
              </MenuItem>
            ))}
          </TextField>
        )}
      />
      <Controller
        name={timezoneName}
        control={control}
        render={({ field, fieldState }) => (
          <Autocomplete
            options={TIMEZONES}
            value={field.value ?? null}
            onChange={(_e, v) => field.onChange(v ?? '')}
            disabled={disabled}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Reporting timezone"
                error={Boolean(fieldState.error)}
                helperText={fieldState.error?.message ?? 'Days start and end in this timezone.'}
              />
            )}
          />
        )}
      />
    </>
  );
}
