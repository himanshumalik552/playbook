import TextField, { type TextFieldProps } from '@mui/material/TextField';
import { type Control, Controller, type FieldPath, type FieldValues } from 'react-hook-form';

type FormTextFieldProps<T extends FieldValues, C, O extends FieldValues> = Omit<TextFieldProps, 'name'> & {
  name: FieldPath<T>;
  control: Control<T, C, O>;
  /** Store an empty input as null (optional selects, dates and ids the API expects to be null or valid). */
  emptyAsNull?: boolean;
};

/** MUI TextField bound to react-hook-form, with the validation message as helper text. */
export function FormTextField<T extends FieldValues, C = unknown, O extends FieldValues = T>({
  name,
  control,
  helperText,
  type,
  emptyAsNull = false,
  ...props
}: FormTextFieldProps<T, C, O>) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <TextField
          {...props}
          {...field}
          type={type}
          value={field.value ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') field.onChange(emptyAsNull ? null : '');
            else field.onChange(type === 'number' ? Number(raw) : raw);
          }}
          error={Boolean(fieldState.error)}
          helperText={fieldState.error?.message ?? helperText}
          fullWidth={props.fullWidth ?? true}
        />
      )}
    />
  );
}
