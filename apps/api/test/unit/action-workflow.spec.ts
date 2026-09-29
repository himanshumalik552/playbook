import { DomainError } from '@adpulse/core';
import { canTransition, planTransition } from '../../src/modules/actions/action-workflow';

describe('action workflow', () => {
  const now = new Date('2026-09-28T10:00:00.000Z');

  it('allows only the documented transitions', () => {
    expect(canTransition('BACKLOG', 'PLANNED')).toBe(true);
    expect(canTransition('BACKLOG', 'COMPLETED')).toBe(false);
    expect(canTransition('EVALUATED', 'IN_PROGRESS')).toBe(false);
    expect(canTransition('CANCELLED', 'PLANNED')).toBe(false);
  });

  it('rejects a disallowed move with INVALID_STATE', () => {
    expect(() => planTransition('BACKLOG', 'EVALUATED', {}, now)).toThrow(DomainError);
    try {
      planTransition('BACKLOG', 'EVALUATED', {}, now);
    } catch (error) {
      expect((error as DomainError).code).toBe('INVALID_STATE');
    }
  });

  it('requires a non-blank reason to cancel', () => {
    expect(() => planTransition('PLANNED', 'CANCELLED', { cancellationReason: '   ' }, now)).toThrow(
      'cancellation reason',
    );
    expect(planTransition('PLANNED', 'CANCELLED', { cancellationReason: ' Budget moved ' }, now)).toEqual({
      status: 'CANCELLED',
      cancellationReason: 'Budget moved',
    });
  });

  it('stamps completion and clears it when work is reopened', () => {
    expect(planTransition('IN_PROGRESS', 'COMPLETED', {}, now)).toEqual({
      status: 'COMPLETED',
      completedAt: now,
    });
    expect(planTransition('COMPLETED', 'IN_PROGRESS', {}, now)).toEqual({
      status: 'IN_PROGRESS',
      completedAt: null,
    });
    expect(planTransition('PLANNED', 'IN_PROGRESS', {}, now)).toEqual({ status: 'IN_PROGRESS' });
  });

  it('requires a recorded outcome before evaluation', () => {
    expect(() => planTransition('COMPLETED', 'EVALUATED', { actualResult: 'CPA fell' }, now)).toThrow(
      DomainError,
    );
    expect(() => planTransition('COMPLETED', 'EVALUATED', { resultClassification: 'POSITIVE' }, now)).toThrow(
      DomainError,
    );
    expect(
      planTransition(
        'COMPLETED',
        'EVALUATED',
        { actualResult: ' CPA fell 12% ', resultClassification: 'POSITIVE', actualValue: 38.5 },
        now,
      ),
    ).toEqual({
      status: 'EVALUATED',
      actualResult: 'CPA fell 12%',
      resultClassification: 'POSITIVE',
      actualValue: 38.5,
    });
  });

  it('passes simple moves through unchanged', () => {
    expect(planTransition('PLANNED', 'BACKLOG', {}, now)).toEqual({ status: 'BACKLOG' });
  });
});
