import { Prisma, PrismaClient } from '@prisma/client';

export * from '@prisma/client';

export interface CreatePrismaOptions {
  url?: string;
  logQueries?: boolean;
}

export function createPrismaClient(options: CreatePrismaOptions = {}): PrismaClient {
  return new PrismaClient({
    datasources: options.url ? { db: { url: options.url } } : undefined,
    log: options.logQueries ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });
}

export type TransactionClient = Prisma.TransactionClient;
export type DbClient = PrismaClient | Prisma.TransactionClient;

/** Postgres DATE columns are exchanged as UTC midnight Date objects. */
export function dbDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

export function fromDbDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export function isNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}
