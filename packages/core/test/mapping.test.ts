import { describe, expect, it } from 'vitest';
import {
  aggregateRows,
  inferObjective,
  mapChannelType,
  mapDevice,
  mapMatchType,
  mapStatus,
  microsToDecimal,
  normalizePath,
  normalizeUrl,
  shareToDecimal,
  splitRange,
  toDbMetrics,
} from '../src/sync/mapping';

describe('sync mapping', () => {
  it('maps provider enums defensively', () => {
    expect(mapStatus('ENABLED')).toBe('ENABLED');
    expect(mapStatus('UNKNOWN')).toBe('PAUSED');
    expect(mapChannelType('PERFORMANCE_MAX')).toBe('PERFORMANCE_MAX');
    expect(mapChannelType('DEMAND_GEN')).toBe('VIDEO');
    expect(mapChannelType('HOTEL')).toBe('SEARCH');
    expect(mapDevice('CONNECTED_TV')).toBe('OTHER');
    expect(mapDevice('MOBILE')).toBe('MOBILE');
    expect(mapMatchType('PHRASE')).toBe('PHRASE');
    expect(mapMatchType('BROAD_MODIFIER')).toBe('BROAD');
  });

  it('infers objectives from hints, names and channels', () => {
    expect(inferObjective('SEARCH', 'Anything', 'ECOMMERCE')).toBe('ECOMMERCE');
    expect(inferObjective('DISPLAY', 'Remarketing - past visitors')).toBe('REMARKETING');
    expect(inferObjective('SEARCH', 'Quote requests')).toBe('LEAD_GENERATION');
    expect(inferObjective('SHOPPING', 'All products')).toBe('ECOMMERCE');
    expect(inferObjective('VIDEO', 'Awareness')).toBe('DISPLAY');
    expect(inferObjective('SEARCH', 'Brand', 'bogus')).toBe('SEARCH');
  });

  it('converts micros and shares to decimals', () => {
    expect(microsToDecimal('1234560000').toString()).toBe('1234.56');
    expect(microsToDecimal(null).toString()).toBe('0');
    expect(shareToDecimal(1.4)?.toString()).toBe('1');
    expect(shareToDecimal(0.12345)?.toString()).toBe('0.1235');
    expect(shareToDecimal(null)).toBeNull();
    expect(shareToDecimal(Number.NaN)).toBeNull();
  });

  it('normalizes URLs and paths for joins', () => {
    expect(normalizePath('https://Example.com/Tents/?utm_source=x')).toBe('/tents');
    expect(normalizePath('/Quote?x=1')).toBe('/quote');
    expect(normalizePath('https://example.com')).toBe('/');
    expect(normalizeUrl('https://EXAMPLE.com/a/?q=1')).toBe('https://example.com/a');
    expect(normalizeUrl('  not a url ')).toBe('not a url');
  });

  it('converts provider metrics and aggregates colliding keys', () => {
    const rows = [
      {
        date: '2026-01-01',
        key: 'OTHER',
        impressions: 10,
        clicks: 1,
        costMicros: '1000000',
        conversions: 0.5,
        conversionsValue: 10,
      },
      {
        date: '2026-01-01',
        key: 'CONNECTED_TV',
        impressions: 5,
        clicks: 2,
        costMicros: '500000',
        conversions: 1,
        conversionsValue: 5,
      },
      {
        date: '2026-01-01',
        key: 'SKIP',
        impressions: 5,
        clicks: 2,
        costMicros: '500000',
        conversions: 1,
        conversionsValue: 5,
      },
    ];
    const out = aggregateRows(rows, (r) => (r.key === 'SKIP' ? null : mapDevice(r.key)));
    expect(out.size).toBe(1);
    const other = out.get('OTHER');
    expect(other).toMatchObject({
      impressions: 15,
      clicks: 3,
      costMicros: '1500000',
      conversions: 1.5,
      conversionsValue: 15,
    });
    if (!other) throw new Error('expected aggregated row');
    const db = toDbMetrics(other);
    expect(db.cost.toString()).toBe('1.5');
    expect(db.conversions.toString()).toBe('1.5');
    expect(rows[0]?.impressions).toBe(10);
  });

  it('splits date ranges into chunks', () => {
    expect(splitRange('2026-01-01', '2026-01-30', 14)).toEqual([
      { from: '2026-01-01', to: '2026-01-14' },
      { from: '2026-01-15', to: '2026-01-28' },
      { from: '2026-01-29', to: '2026-01-30' },
    ]);
    expect(splitRange('2026-01-02', '2026-01-01', 14)).toEqual([]);
  });
});
