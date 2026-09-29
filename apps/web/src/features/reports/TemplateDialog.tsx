import { REPORT_FREQUENCIES, REPORT_SECTIONS, type ReportTemplateDto } from '@adpulse/types';
import { type ReportTemplateInput, reportTemplateSchema } from '@adpulse/validation';
import { zodResolver } from '@hookform/resolvers/zod';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { FormTextField } from '@/components/form';
import { useMembers } from '@/hooks/common';
import { humanize } from '@/lib/format';

const EMPTY: ReportTemplateInput = {
  name: '',
  description: '',
  frequency: 'WEEKLY',
  sections: REPORT_SECTIONS.map((s) => s.key),
  scheduleEnabled: false,
  recipients: [],
};

interface TemplateDialogProps {
  open: boolean;
  template: ReportTemplateDto | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (values: ReportTemplateInput) => void;
}

export function TemplateDialog({ open, template, pending, onClose, onSubmit }: TemplateDialogProps) {
  const members = useMembers();
  const { control, handleSubmit, reset } = useForm<ReportTemplateInput>({
    resolver: zodResolver(reportTemplateSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    reset(
      template
        ? {
            name: template.name,
            description: template.description ?? '',
            frequency: template.frequency,
            sections: template.sections,
            scheduleEnabled: template.scheduleEnabled,
            recipients: template.recipients,
          }
        : EMPTY,
    );
  }, [open, template, reset]);

  const emails = (members.data ?? []).map((m) => m.email);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="template-dialog-title">
      <form noValidate onSubmit={handleSubmit(onSubmit)}>
        <DialogTitle id="template-dialog-title">
          {template ? 'Edit template' : 'New report template'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <FormTextField control={control} name="name" label="Name" required autoFocus />
            <FormTextField control={control} name="description" label="Description" multiline minRows={2} />
            <FormTextField
              control={control}
              name="frequency"
              label="Frequency"
              select
              disabled={Boolean(template)}
              helperText={template ? 'Frequency cannot change after creation' : undefined}
            >
              {REPORT_FREQUENCIES.map((f) => (
                <MenuItem key={f} value={f}>
                  {humanize(f)}
                </MenuItem>
              ))}
            </FormTextField>
            <Controller
              name="sections"
              control={control}
              render={({ field, fieldState }) => (
                <Stack component="fieldset" sx={{ border: 0, p: 0, m: 0 }}>
                  <FormLabel component="legend">Sections</FormLabel>
                  <Stack sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                    {REPORT_SECTIONS.map((s) => (
                      <FormControlLabel
                        key={s.key}
                        label={s.label}
                        control={
                          <Checkbox
                            size="small"
                            checked={field.value.includes(s.key)}
                            onChange={(e) =>
                              field.onChange(
                                e.target.checked
                                  ? REPORT_SECTIONS.map((x) => x.key).filter(
                                      (k) => k === s.key || field.value.includes(k),
                                    )
                                  : field.value.filter((k) => k !== s.key),
                              )
                            }
                          />
                        }
                      />
                    ))}
                  </Stack>
                  {fieldState.error && <FormHelperText error>{fieldState.error.message}</FormHelperText>}
                </Stack>
              )}
            />
            <Controller
              name="scheduleEnabled"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={
                    <Switch checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />
                  }
                  label="Generate automatically on schedule"
                />
              )}
            />
            <Controller
              name="recipients"
              control={control}
              render={({ field, fieldState }) => (
                <Autocomplete
                  multiple
                  options={emails}
                  value={field.value}
                  onChange={(_e, v) => field.onChange(v)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Recipients"
                      helperText={
                        fieldState.error?.message ??
                        'Organization members who are notified when a scheduled report is ready'
                      }
                      error={Boolean(fieldState.error)}
                    />
                  )}
                />
              )}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={pending}>
            {pending ? 'Saving…' : 'Save template'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
