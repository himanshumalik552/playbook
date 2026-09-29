import { zodResolver } from '@hookform/resolvers/zod';
import type { FieldValues, Resolver } from 'react-hook-form';
import type { z } from 'zod';

/**
 * zodResolver typed with the schema's input and transformed output. @hookform/resolvers 3.x types the result as the
 * input shape, which is wrong for schemas that coerce or transform (empty strings to null, stripped ids, …).
 */
export function schemaResolver<S extends z.ZodType<FieldValues, z.ZodTypeDef, FieldValues>>(
  schema: S,
): Resolver<z.input<S>, unknown, z.output<S>> {
  return zodResolver(schema) as unknown as Resolver<z.input<S>, unknown, z.output<S>>;
}
