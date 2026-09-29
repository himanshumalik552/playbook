import { Injectable, NotFoundException } from '@nestjs/common';
import { type AuditContext, classifySearchTerm, recordAudit } from '@adpulse/core';
import { Prisma } from '@adpulse/database';
import type {
  AdGroupRowDto,
  KeywordRowDto,
  LandingPageRowDto,
  Paginated,
  SearchTermRowDto,
} from '@adpulse/types';
import { paginateArray } from '../../common/dto';
import { iso } from '../../common/mappers';
import type { OrgContext } from '../../common/request-context';
import { matchesSearch, sortRows } from '../../common/sorting';
import { PrismaService } from '../../infra/prisma.service';
import { MetricsService } from '../analytics/metrics.service';
import type { EntityListQueryDto, SearchTermQueryDto } from './performance.dto';

@Injectable()
export class PerformanceService {
  constructor(
    private readonly db: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  private adGroupWhere(adGroupId: string | undefined): Prisma.Sql | undefined {
    return adGroupId ? Prisma.sql`m."adGroupId" = ${adGroupId}` : undefined;
  }

  async adGroups(org: OrgContext, query: EntityListQueryDto): Promise<Paginated<AdGroupRowDto>> {
    const q = await this.metrics.resolve(org, query);
    const rows = await this.metrics.repo.groupBy(q.filters, q.range, 'adGroup', {
      campaignIds: q.campaignIds,
      extraWhere: this.adGroupWhere(query.adGroupId),
    });
    const groups = await this.db.adGroup.findMany({
      where: { organizationId: org.organizationId, id: { in: rows.map((r) => r.key) } },
      include: { campaign: { select: { name: true } } },
    });
    const byId = new Map(groups.map((g) => [g.id, g]));
    const items = rows.flatMap((r): AdGroupRowDto[] => {
      const g = byId.get(r.key);
      if (!g || !matchesSearch(`${g.name} ${g.campaign.name}`, query.search)) return [];
      return [
        {
          id: g.id,
          name: g.name,
          status: g.status,
          campaignId: g.campaignId,
          campaignName: g.campaign.name,
          metrics: this.metrics.kpis(r),
        },
      ];
    });
    const sorted = sortRows(items, query.sortBy, query.sortDir, (r) => r.metrics, {
      name: (r) => r.name,
      campaignName: (r) => r.campaignName,
    });
    return paginateArray(sorted, query.page, query.pageSize);
  }

  async keywords(org: OrgContext, query: EntityListQueryDto): Promise<Paginated<KeywordRowDto>> {
    const q = await this.metrics.resolve(org, query);
    const rows = await this.metrics.repo.groupBy(q.filters, q.range, 'keyword', {
      campaignIds: q.campaignIds,
      extraWhere: this.adGroupWhere(query.adGroupId),
    });
    const keywords = await this.db.keyword.findMany({
      where: { organizationId: org.organizationId, id: { in: rows.map((r) => r.key) } },
      include: { campaign: { select: { name: true } }, adGroup: { select: { name: true } } },
    });
    const byId = new Map(keywords.map((k) => [k.id, k]));
    const items = rows.flatMap((r): KeywordRowDto[] => {
      const k = byId.get(r.key);
      if (!k || !matchesSearch(k.text, query.search)) return [];
      return [
        {
          id: k.id,
          text: k.text,
          matchType: k.matchType,
          status: k.status,
          qualityScore: k.qualityScore,
          adGroupId: k.adGroupId,
          adGroupName: k.adGroup.name,
          campaignId: k.campaignId,
          campaignName: k.campaign.name,
          metrics: this.metrics.kpis(r),
        },
      ];
    });
    const sorted = sortRows(items, query.sortBy, query.sortDir, (r) => r.metrics, {
      text: (r) => r.text,
      campaignName: (r) => r.campaignName,
      qualityScore: (r) => String(r.qualityScore ?? 0).padStart(2, '0'),
    });
    return paginateArray(sorted, query.page, query.pageSize);
  }

  async searchTerms(org: OrgContext, query: SearchTermQueryDto): Promise<Paginated<SearchTermRowDto>> {
    const q = await this.metrics.resolve(org, query);
    const [rows, targets] = await Promise.all([
      this.metrics.repo.groupBy(q.filters, q.range, 'searchTerm', {
        campaignIds: q.campaignIds,
        extraWhere: this.adGroupWhere(query.adGroupId),
      }),
      this.metrics.targets(org.organizationId),
    ]);
    const terms = await this.db.searchTerm.findMany({
      where: { organizationId: org.organizationId, id: { in: rows.map((r) => r.key) } },
      include: {
        campaign: { select: { name: true, adAccountId: true } },
        adGroup: { select: { name: true } },
        keyword: { select: { text: true } },
        reviewedBy: { select: { name: true } },
      },
    });
    const byId = new Map(terms.map((t) => [t.id, t]));
    const items = rows.flatMap((r): SearchTermRowDto[] => {
      const t = byId.get(r.key);
      if (!t || !matchesSearch(t.term, query.search)) return [];
      if (query.reviewed !== undefined && (t.reviewedAt !== null) !== query.reviewed) return [];
      const metrics = this.metrics.kpis(r);
      const classification = classifySearchTerm(
        metrics,
        targets.get('CPA', { adAccountId: t.campaign.adAccountId, campaignId: t.campaignId }),
        org.currencyCode,
      );
      if (query.flag && classification.flag !== query.flag) return [];
      return [
        {
          id: t.id,
          term: t.term,
          campaignId: t.campaignId,
          campaignName: t.campaign.name,
          adGroupId: t.adGroupId,
          adGroupName: t.adGroup.name,
          keywordText: t.keyword?.text ?? null,
          reviewedAt: iso(t.reviewedAt),
          reviewedBy: t.reviewedBy?.name ?? null,
          reviewNote: t.reviewNote,
          metrics,
          recommendationReason: classification.reason,
          flag: classification.flag,
        },
      ];
    });
    const sorted = sortRows(items, query.sortBy, query.sortDir, (r) => r.metrics, {
      term: (r) => r.term,
      campaignName: (r) => r.campaignName,
    });
    return paginateArray(sorted, query.page, query.pageSize);
  }

  /** Records a human review decision. Negative keywords are never pushed to Google Ads by the platform. */
  async reviewSearchTerm(
    org: OrgContext,
    userId: string,
    id: string,
    reviewed: boolean,
    note: string | undefined,
    ctx: AuditContext,
  ) {
    const term = await this.db.searchTerm.findFirst({ where: { id, organizationId: org.organizationId } });
    if (!term) throw new NotFoundException('Search term not found');
    const updated = await this.db.searchTerm.update({
      where: { id: term.id },
      data: reviewed
        ? { reviewedAt: new Date(), reviewedById: userId, reviewNote: note?.trim() || null }
        : { reviewedAt: null, reviewedById: null, reviewNote: null },
      include: { reviewedBy: { select: { name: true } } },
    });
    await recordAudit(this.db, ctx, {
      action: reviewed ? 'search_term.reviewed' : 'search_term.review_cleared',
      entityType: 'SearchTerm',
      entityId: term.id,
      metadata: { term: term.term, note: updated.reviewNote },
    });
    return {
      id: updated.id,
      reviewedAt: iso(updated.reviewedAt),
      reviewedBy: updated.reviewedBy?.name ?? null,
      reviewNote: updated.reviewNote,
    };
  }

  async landingPages(org: OrgContext, query: EntityListQueryDto): Promise<Paginated<LandingPageRowDto>> {
    const q = await this.metrics.resolve(org, query);
    const rows = await this.metrics.repo.landingPageAnalytics(q.filters, q.range, q.campaignIds);
    const pages = await this.db.landingPage.findMany({
      where: { organizationId: org.organizationId, id: { in: rows.map((r) => r.key) } },
    });
    const urls = new Map(pages.map((p) => [p.id, p.url]));
    const items = rows.flatMap((r): LandingPageRowDto[] => {
      const url = urls.get(r.key);
      if (!url || !matchesSearch(url, query.search)) return [];
      const sessions = r.sessions === null ? null : Number(r.sessions);
      const engaged = r.engagedSessions === null ? null : Number(r.engagedSessions);
      const engagementRate = sessions && engaged !== null ? (engaged / sessions) * 100 : null;
      return [
        {
          id: r.key,
          url,
          metrics: this.metrics.kpis(r),
          sessions,
          engagedSessions: engaged,
          engagementRate,
          // GA4 defines bounce rate as the complement of engagement rate.
          bounceRate: engagementRate === null ? null : 100 - engagementRate,
          analyticsConversions: r.keyEvents === null ? null : Number(r.keyEvents),
          analyticsJoined: r.joined,
        },
      ];
    });
    const sorted = sortRows(items, query.sortBy, query.sortDir, (r) => r.metrics, { url: (r) => r.url });
    return paginateArray(sorted, query.page, query.pageSize);
  }
}
