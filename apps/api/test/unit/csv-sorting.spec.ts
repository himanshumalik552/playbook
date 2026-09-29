import type { KpiValues } from '@adpulse/types';
import { csvCell, csvFilename, toCsv } from '../../src/common/csv';
import { matchesSearch, sortRows } from '../../src/common/sorting';

describe('csv', () => {
  it('neutralizes spreadsheet formula triggers in text cells', () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-cmd')).toBe("'-cmd");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('keeps negative numbers numeric and blanks non-finite values', () => {
    expect(csvCell(-12.5)).toBe('-12.5');
    expect(csvCell(Number.NaN)).toBe('');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('quotes separators and line breaks', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
  });

  it('writes a BOM, CRLF line endings and a trailing newline', () => {
    expect(toCsv(['Name', 'Cost'], [['Brand', 10]])).toBe('\uFEFFName,Cost\r\nBrand,10\r\n');
  });

  it('builds safe filenames', () => {
    expect(csvFilename('campaigns/../x', { from: '2026-09-01', to: '2026-09-27' })).toBe(
      'campaigns----x-2026-09-01-to-2026-09-27.csv',
    );
  });
});

describe('sortRows', () => {
  const kpi = (cost: number, cpa: number | null): KpiValues =>
    ({
      impressions: 0,
      clicks: 0,
      cost,
      conversions: 0,
      conversionValue: 0,
      ctr: null,
      cpc: null,
      cpm: null,
      conversionRate: null,
      cpa,
      roas: null,
    }) as KpiValues;
  const rows = [
    { name: 'b', kpis: kpi(20, null) },
    { name: 'a', kpis: kpi(10, 5) },
    { name: 'c', kpis: kpi(30, 2) },
  ];
  const metrics = (r: (typeof rows)[number]) => r.kpis;

  it('sorts by cost descending by default', () => {
    expect(sortRows(rows, undefined, 'desc', metrics).map((r) => r.name)).toEqual(['c', 'b', 'a']);
  });

  it('always places undefined ratios last', () => {
    expect(sortRows(rows, 'cpa', 'asc', metrics).map((r) => r.name)).toEqual(['c', 'a', 'b']);
    expect(sortRows(rows, 'cpa', 'desc', metrics).map((r) => r.name)).toEqual(['a', 'c', 'b']);
  });

  it('sorts whitelisted text fields and ignores unknown keys', () => {
    expect(sortRows(rows, 'name', 'asc', metrics, { name: (r) => r.name }).map((r) => r.name)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(sortRows(rows, 'dropTable', 'asc', metrics).map((r) => r.name)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input', () => {
    const copy = [...rows];
    sortRows(rows, 'cost', 'asc', metrics);
    expect(rows).toEqual(copy);
  });
});

describe('matchesSearch', () => {
  it('matches case-insensitively and treats empty search as a match', () => {
    expect(matchesSearch('Brand Search', ' brand ')).toBe(true);
    expect(matchesSearch('Brand Search', 'shopping')).toBe(false);
    expect(matchesSearch('anything', undefined)).toBe(true);
  });
});
