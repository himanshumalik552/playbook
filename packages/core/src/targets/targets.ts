import type { DbClient } from '@adpulse/database';
import type { TargetMetric, TargetScope } from '@adpulse/types';

export const DEFAULT_TARGETS: Record<TargetMetric, number> = {
  CPA: 50,
  ROAS: 3,
  CTR: 1,
  CONVERSION_RATE: 2,
  SPEND_PACING_TOLERANCE: 15,
};

export function targetScopeKey(
  scope: TargetScope,
  adAccountId?: string | null,
  campaignId?: string | null,
): string {
  if (scope === 'CAMPAIGN') return `campaign:${campaignId}`;
  if (scope === 'AD_ACCOUNT') return `account:${adAccountId}`;
  return 'org';
}

export class TargetResolver {
  constructor(private readonly values: Map<string, number>) {}

  /** Campaign override → account override → organization target → platform default. */
  get(metric: TargetMetric, scope: { adAccountId?: string | null; campaignId?: string | null } = {}): number {
    const keys = [
      scope.campaignId ? `campaign:${scope.campaignId}` : null,
      scope.adAccountId ? `account:${scope.adAccountId}` : null,
      'org',
    ];
    for (const key of keys) {
      if (!key) continue;
      const v = this.values.get(`${key}|${metric}`);
      if (v !== undefined) return v;
    }
    return DEFAULT_TARGETS[metric];
  }

  forEntity(scope: {
    adAccountId?: string | null;
    campaignId?: string | null;
  }): Record<TargetMetric, number> {
    return {
      CPA: this.get('CPA', scope),
      ROAS: this.get('ROAS', scope),
      CTR: this.get('CTR', scope),
      CONVERSION_RATE: this.get('CONVERSION_RATE', scope),
      SPEND_PACING_TOLERANCE: this.get('SPEND_PACING_TOLERANCE', scope),
    };
  }
}

export async function loadTargets(db: DbClient, organizationId: string): Promise<TargetResolver> {
  const rows = await db.performanceTarget.findMany({
    where: { organizationId },
    select: { scopeKey: true, metric: true, value: true },
  });
  return new TargetResolver(
    new Map(rows.map((r) => [`${r.scopeKey}|${r.metric}`, Number(r.value.toString())])),
  );
}
