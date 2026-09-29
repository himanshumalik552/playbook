import { describe, expect, it } from 'vitest';
import { classifySearchTerm } from '../src/search-terms/classify';
import { kpis } from './fixtures';

describe('classifySearchTerm', () => {
  it('flags non-converting terms with enough clicks as negative candidates', () => {
    const result = classifySearchTerm(kpis({ clicks: 20, cost: 30 }), 50, 'USD');
    expect(result.flag).toBe('NEGATIVE_CANDIDATE');
    expect(result.reason).toContain('Review intent');
  });

  it('flags expensive converting terms', () => {
    expect(classifySearchTerm(kpis({ clicks: 50, cost: 240, conversions: 2 }), 50, 'USD').flag).toBe(
      'EXPENSIVE',
    );
  });

  it('flags high performers', () => {
    expect(classifySearchTerm(kpis({ clicks: 50, cost: 80, conversions: 4 }), 50, 'USD').flag).toBe(
      'HIGH_PERFORMER',
    );
  });

  it('leaves ordinary or low-volume terms unflagged', () => {
    expect(classifySearchTerm(kpis({ clicks: 5, cost: 10 }), 50, 'USD')).toEqual({
      flag: null,
      reason: null,
    });
    expect(classifySearchTerm(kpis({ clicks: 40, cost: 90, conversions: 2 }), 50, 'USD').flag).toBeNull();
  });
});
