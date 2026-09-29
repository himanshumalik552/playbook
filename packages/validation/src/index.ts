import {
  ACTION_PRIORITIES,
  ACTION_STATUSES,
  ALERT_STATUSES,
  CONFIDENCE_LEVELS,
  MONITORED_METRICS,
  ORG_ROLES,
  RECOMMENDATION_TYPES,
  REPORT_FORMATS,
  REPORT_FREQUENCIES,
  REPORT_SECTIONS,
  RESULT_CLASSIFICATIONS,
  SUPPORTED_CURRENCIES,
  TARGET_METRICS,
  TARGET_SCOPES,
} from '@adpulse/types';
import { z } from 'zod';

/**
 * Client-side schemas. They mirror the API's class-validator DTOs (the API remains the authority) and
 * produce exactly the request bodies the API accepts, because unknown fields are rejected server-side.
 */

export const PASSWORD_MIN_LENGTH = 12;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(128, 'Use at most 128 characters')
  .regex(/[a-z]/, 'Include a lowercase letter')
  .regex(/[A-Z]/, 'Include an uppercase letter')
  .regex(/\d/, 'Include a number')
  .regex(/[^A-Za-z0-9]/, 'Include a symbol');

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

/** Empty form inputs become null so optional fields can be cleared. */
const optionalText = (max: number) =>
  z
    .string()
    .max(max, `Use at most ${max} characters`)
    .transform((v) => (v.trim() === '' ? null : v.trim()))
    .nullable();

const optionalNumber = z.preprocess(
  (v) =>
    v === '' || v === undefined || v === null || (typeof v === 'number' && Number.isNaN(v))
      ? null
      : Number(v),
  z.number({ invalid_type_error: 'Enter a number' }).finite().nullable(),
);

/* ----------------------------- Auth & profile ----------------------------- */

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter your name').max(100),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, { errorMap: () => ({ message: 'You must accept the terms' }) }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });
export type RegisterInput = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().max(128).optional(),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const profileSchema = z.object({ name: z.string().trim().min(2, 'Enter your name').max(100) });
export type ProfileInput = z.infer<typeof profileSchema>;

/* ----------------------------- Organization ----------------------------- */

export const currencyCodeSchema = z.enum(SUPPORTED_CURRENCIES, {
  errorMap: () => ({ message: 'Select a supported currency' }),
});

export const timezoneSchema = z.string().refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Unknown timezone' },
);

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, 'Enter an organization name').max(120),
  currencyCode: currencyCodeSchema,
  timezone: timezoneSchema,
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const organizationSettingsSchema = createOrganizationSchema.extend({
  dataRetentionDays: z.coerce.number().int().min(90, 'At least 90 days').max(3650, 'At most 3650 days'),
  reportingPreferences: z.object({
    defaultDateRangeDays: z.coerce.number().int().min(7).max(365),
    weekStartsOn: z.union([z.literal(0), z.literal(1)]),
    compareByDefault: z.boolean(),
    weeklyReportEnabled: z.boolean(),
    monthlyReportEnabled: z.boolean(),
    dailySummaryEnabled: z.boolean(),
  }),
  branding: z.object({
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex color such as #3949AB'),
    logoUrl: z
      .string()
      .trim()
      .transform((v) => (v === '' ? null : v))
      .pipe(
        z.string().url('Enter a valid URL').startsWith('https://', 'Use an https URL').max(500).nullable(),
      )
      .nullable(),
    reportFooter: optionalText(200),
  }),
});
export type OrganizationSettingsInput = z.input<typeof organizationSettingsSchema>;
export type OrganizationSettingsOutput = z.output<typeof organizationSettingsSchema>;

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: z.enum(ORG_ROLES),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

/* ----------------------------- Targets ----------------------------- */

const PERCENT_TARGETS = new Set(['CTR', 'CONVERSION_RATE', 'SPEND_PACING_TOLERANCE']);

export const targetSchema = z
  .object({
    scope: z.enum(TARGET_SCOPES),
    metric: z.enum(TARGET_METRICS),
    value: z.union([z.number(), z.string().trim().min(1, 'Enter a value')]).pipe(
      z.coerce
        .number({ invalid_type_error: 'Enter a number' })
        .positive('Must be greater than zero')
        .max(1_000_000)
        .refine((v) => Math.abs(v * 10_000 - Math.round(v * 10_000)) < 1e-6, 'Use at most 4 decimals'),
    ),
    adAccountId: z.string().nullable(),
    campaignId: z.string().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.scope === 'AD_ACCOUNT' && !v.adAccountId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['adAccountId'], message: 'Select an account' });
    }
    if (v.scope === 'CAMPAIGN' && !v.campaignId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['campaignId'], message: 'Select a campaign' });
    }
    if (PERCENT_TARGETS.has(v.metric) && v.value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Percentages cannot exceed 100',
      });
    }
  })
  .transform((v) => ({
    scope: v.scope,
    metric: v.metric,
    value: v.value,
    ...(v.scope === 'AD_ACCOUNT' && v.adAccountId ? { adAccountId: v.adAccountId } : {}),
    ...(v.scope === 'CAMPAIGN' && v.campaignId ? { campaignId: v.campaignId } : {}),
  }));
export type TargetInput = z.input<typeof targetSchema>;
export type TargetPayload = z.output<typeof targetSchema>;

/* ----------------------------- Actions ----------------------------- */

export const attachmentSchema = z.object({
  name: z.string().trim().min(1, 'Name the attachment').max(200),
  url: z.string().trim().url('Enter a valid URL').startsWith('https://', 'Use an https URL').max(1000),
});

export const actionSchema = z.object({
  title: z.string().trim().min(3, 'Enter a title (min. 3 characters)').max(200),
  description: optionalText(5000),
  hypothesis: optionalText(2000),
  expectedImpact: optionalText(500),
  priority: z.enum(ACTION_PRIORITIES),
  ownerId: z.string().nullable(),
  campaignId: z.string().nullable(),
  adGroupId: z.string().nullable(),
  metricToMonitor: z.enum(MONITORED_METRICS).nullable(),
  baselineValue: optionalNumber,
  targetValue: optionalNumber,
  plannedDate: isoDateSchema.nullable(),
  evaluationDate: isoDateSchema.nullable(),
  attachments: z.array(attachmentSchema).max(20),
});
export type ActionInput = z.input<typeof actionSchema>;
export type ActionPayload = z.output<typeof actionSchema>;

export const actionTransitionSchema = z
  .object({
    status: z.enum(ACTION_STATUSES),
    cancellationReason: z.string().trim().max(1000).optional(),
    actualValue: optionalNumber.optional(),
    actualResult: z.string().trim().max(5000).optional(),
    resultClassification: z.enum(RESULT_CLASSIFICATIONS).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.status === 'CANCELLED' && (!v.cancellationReason || v.cancellationReason.length < 5)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cancellationReason'],
        message: 'Explain why the action is cancelled (min. 5 characters)',
      });
    }
    if (v.status === 'EVALUATED') {
      if (!v.resultClassification) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['resultClassification'],
          message: 'Classify the result',
        });
      }
      if (!v.actualResult || v.actualResult.length < 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['actualResult'],
          message: 'Describe the actual result (min. 5 characters)',
        });
      }
    }
  })
  .transform((v) => ({
    status: v.status,
    ...(v.status === 'CANCELLED' ? { cancellationReason: v.cancellationReason } : {}),
    ...(v.status === 'EVALUATED'
      ? {
          actualResult: v.actualResult,
          resultClassification: v.resultClassification,
          ...(v.actualValue != null ? { actualValue: v.actualValue } : {}),
        }
      : {}),
  }));
export type ActionTransitionInput = z.input<typeof actionTransitionSchema>;

export const commentSchema = z.object({ body: z.string().trim().min(1, 'Write a comment').max(5000) });
export type CommentInput = z.infer<typeof commentSchema>;

/* ----------------------------- Alerts & recommendations ----------------------------- */

export const dismissSchema = z.object({
  reason: z.string().trim().min(5, 'Explain why this is dismissed (min. 5 characters)').max(1000),
});
export type DismissInput = z.infer<typeof dismissSchema>;

export const alertUpdateSchema = z
  .object({
    status: z.enum(ALERT_STATUSES),
    assigneeId: z.string().nullable(),
    resolutionNote: z.string().trim().max(2000),
  })
  .superRefine((v, ctx) => {
    if ((v.status === 'RESOLVED' || v.status === 'DISMISSED') && v.resolutionNote.length < 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['resolutionNote'],
        message: 'Add a note explaining the outcome (min. 5 characters)',
      });
    }
  });
export type AlertUpdateInput = z.infer<typeof alertUpdateSchema>;

export const recommendationSchema = z.object({
  type: z.enum(RECOMMENDATION_TYPES),
  title: z.string().trim().min(5, 'Enter a title (min. 5 characters)').max(200),
  rationale: z.string().trim().min(20, 'Explain the reasoning (min. 20 characters)').max(4000),
  evidence: z
    .array(
      z.object({
        label: z.string().trim().min(1, 'Required').max(120),
        value: z.string().trim().min(1, 'Required').max(300),
      }),
    )
    .min(1, 'Add at least one observed data point')
    .max(20),
  confidence: z.enum(CONFIDENCE_LEVELS),
  campaignId: z.string().nullable(),
});
export type RecommendationInput = z.infer<typeof recommendationSchema>;

export const searchTermReviewSchema = z.object({ note: z.string().trim().max(1000) });

/* ----------------------------- Reports ----------------------------- */

export const reportRequestSchema = z
  .object({
    templateId: z.string().nullable(),
    frequency: z.enum(REPORT_FREQUENCIES),
    format: z.enum(REPORT_FORMATS),
    title: z.string().trim().min(3, 'Enter a title (min. 3 characters)').max(150),
    from: isoDateSchema,
    to: isoDateSchema,
    adAccountId: z.string().nullable(),
    campaignIds: z.array(z.string()).max(50, 'Select at most 50 campaigns'),
    commentary: z.string().max(5000),
  })
  .refine((v) => v.from <= v.to, { path: ['to'], message: 'End date must be on or after the start date' });
export type ReportRequestInput = z.infer<typeof reportRequestSchema>;

const SECTION_KEYS = REPORT_SECTIONS.map((s) => s.key) as [string, ...string[]];

export const reportTemplateSchema = z.object({
  name: z.string().trim().min(3, 'Enter a name (min. 3 characters)').max(120),
  description: z.string().trim().max(500),
  frequency: z.enum(REPORT_FREQUENCIES),
  sections: z.array(z.enum(SECTION_KEYS)).min(1, 'Select at least one section'),
  scheduleEnabled: z.boolean(),
  recipients: z.array(emailSchema).max(25),
});
export type ReportTemplateInput = z.infer<typeof reportTemplateSchema>;

export const dateRangeSchema = z
  .object({ from: isoDateSchema, to: isoDateSchema })
  .refine((v) => v.from <= v.to, { path: ['to'], message: 'End date must be on or after the start date' });
