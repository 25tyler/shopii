/**
 * Database-agnostic helpers for handling array/JSON fields
 * Works with both SQLite (JSON strings) and PostgreSQL (native arrays)
 */

import { prisma } from '../config/prisma.js';

// Detect database type from Prisma client
// @ts-ignore - accessing internal prisma property
const dbProvider = (prisma as any)._engineConfig?.activeProvider || 'sqlite';
export const isPostgres = dbProvider === 'postgresql';

/**
 * Format an array for database storage
 * - PostgreSQL: Returns native array
 * - SQLite: Returns JSON string
 */
export function formatArray<T>(arr: T[]): T[] | string {
  return isPostgres ? arr : JSON.stringify(arr);
}

/**
 * Parse an array from database storage
 * - PostgreSQL: Returns as-is (already an array)
 * - SQLite: Parses JSON string to array
 */
export function parseArray<T>(value: T[] | string | null | undefined): T[] {
  if (!value) return [];
  if (isPostgres) return value as T[];
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }
  return value as T[];
}

/**
 * Format a JSON object for database storage
 * - PostgreSQL: Returns native object
 * - SQLite: Returns JSON string
 */
export function formatJson<T extends object>(obj: T): T | string {
  return isPostgres ? obj : JSON.stringify(obj);
}

/**
 * Parse a JSON object from database storage
 * - PostgreSQL: Returns as-is (already an object)
 * - SQLite: Parses JSON string to object
 */
export function parseJson<T extends object>(value: T | string | null | undefined): T | null {
  if (!value) return null;
  if (isPostgres) return value as T;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value as T;
}
