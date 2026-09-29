import { describe, expect, it } from 'vitest';
import {
  allocate,
  createRandom,
  generateAccountRange,
  generateCampaignDay,
  MOCK_ACCOUNTS,
  patternFactors,
} from '../src';

const account = MOCK_ACCOUNTS[0]!;
const anchor = '2026-06-30';

const sum = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;

describe('allocate', () => {
  it('splits totals exactly', () => {
    const parts = allocate(100, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(sum(allocate(10.01, [0.3, 0.3, 0.4], 2))).toBe(10.01);
  });

  it('handles empty or zero weights', () => {
    expect(allocate(10, [])).toEqual([]);
    expect(allocate(10, [0, 0])).toEqual([0, 0]);
  });
});

describe('generator', () => {
  it('is deterministic', () => {
    const a = generateCampaignDay(account, account.campaigns[0]!, '2026-06-01', anchor);
    const b = generateCampaignDay(account, account.campaigns[0]!, '2026-06-01', anchor);
    expect(a).toEqual(b);
    expect(createRandom('x')()).toBe(createRandom('x')());
  });

  it('keeps device and location splits consistent with campaign totals', () => {
    const day = generateCampaignDay(account, account.campaigns[1]!, '2026-06-10', anchor)!;
    expect(sum(day.devices.map((d) => d.clicks))).toBe(day.clicks);
    expect(sum(day.devices.map((d) => d.cost))).toBe(day.cost);
    expect(sum(day.locations.map((l) => l.cost))).toBe(day.cost);
    expect(sum(day.adGroups.map((g) => g.conversions))).toBe(day.conversions);
  });

  it('produces no data for paused periods and future dates', () => {
    const paused = account.campaigns.find((c) => c.status === 'PAUSED')!;
    expect(generateCampaignDay(account, paused, anchor, anchor)).toBeNull();
    expect(generateCampaignDay(account, account.campaigns[0]!, '2026-07-01', anchor)).toBeNull();
  });

  it('models the configured problem patterns', () => {
    expect(patternFactors('RISING_CPC', 0).cpc).toBeGreaterThan(1.4);
    expect(patternFactors('RISING_CPC', 60).cpc).toBe(1);
    expect(patternFactors('FALLING_CVR', 0).cvr).toBeLessThan(0.5);
    expect(patternFactors('SPEND_NO_CONVERSIONS', 3).zeroConversions).toBe(true);
    expect(patternFactors('IMPRESSIONS_DROP', 1).impressions).toBe(0.3);
    expect(patternFactors('HIGH_BOUNCE', 0).cvr).toBeLessThan(1);
  });

  it('generates spend without conversions for the problem campaign', () => {
    const leads = MOCK_ACCOUNTS[1]!;
    const emergency = leads.campaigns.find((c) => c.pattern === 'SPEND_NO_CONVERSIONS')!;
    const day = generateCampaignDay(leads, emergency, '2026-06-28', anchor)!;
    expect(day.cost).toBeGreaterThan(0);
    expect(day.conversions).toBe(0);
  });

  it('iterates a date range for every active campaign', () => {
    const days = [...generateAccountRange(account, '2026-06-29', anchor, anchor)];
    const active = account.campaigns.filter((c) => c.status === 'ENABLED').length;
    expect(days).toHaveLength(active * 2);
  });

  it('never produces clicks above impressions', () => {
    for (const day of generateAccountRange(account, '2026-06-01', anchor, anchor)) {
      expect(day.clicks).toBeLessThanOrEqual(day.impressions);
      for (const t of day.searchTerms) expect(t.clicks).toBeLessThanOrEqual(t.impressions);
    }
  });
});
