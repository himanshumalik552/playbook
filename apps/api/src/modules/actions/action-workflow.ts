import { DomainError } from '@adpulse/core';
import { ACTION_WORKFLOW, type ActionStatus, type ResultClassification } from '@adpulse/types';

export interface TransitionInput {
  cancellationReason?: string | null;
  actualResult?: string | null;
  actualValue?: number | null;
  resultClassification?: ResultClassification | null;
}

export interface TransitionPatch {
  status: ActionStatus;
  completedAt?: Date | null;
  cancellationReason?: string | null;
  actualResult?: string | null;
  actualValue?: number | null;
  resultClassification?: ResultClassification | null;
}

export function canTransition(from: ActionStatus, to: ActionStatus): boolean {
  return ACTION_WORKFLOW[from].includes(to);
}

/**
 * Validates a status change and returns the fields it implies. Cancelling requires a reason; evaluating
 * requires a recorded outcome, because results must be documented before an action is closed.
 */
export function planTransition(
  from: ActionStatus,
  to: ActionStatus,
  input: TransitionInput,
  now = new Date(),
): TransitionPatch {
  if (!canTransition(from, to)) {
    throw new DomainError('INVALID_STATE', `An action cannot move from ${from} to ${to}`, {
      from,
      to,
      allowed: ACTION_WORKFLOW[from],
    });
  }
  switch (to) {
    case 'CANCELLED': {
      const reason = input.cancellationReason?.trim();
      if (!reason) throw new DomainError('VALIDATION_FAILED', 'A cancellation reason is required');
      return { status: to, cancellationReason: reason };
    }
    case 'COMPLETED':
      return { status: to, completedAt: now };
    case 'EVALUATED': {
      const result = input.actualResult?.trim();
      if (!result || !input.resultClassification) {
        throw new DomainError(
          'VALIDATION_FAILED',
          'Record the actual result and a result classification before evaluating',
        );
      }
      return {
        status: to,
        actualResult: result,
        resultClassification: input.resultClassification,
        ...(input.actualValue !== undefined ? { actualValue: input.actualValue } : {}),
      };
    }
    case 'IN_PROGRESS':
      return from === 'COMPLETED' ? { status: to, completedAt: null } : { status: to };
    default:
      return { status: to };
  }
}
