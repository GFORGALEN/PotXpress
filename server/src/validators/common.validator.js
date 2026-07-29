import { z } from 'zod';

export const idSchema = z.string().min(1).max(100);
export const emptyQuerySchema = z.object({}).strict();

export const storeParamsSchema = z.object({
  storeId: idSchema,
}).strict();

export const storeTableParamsSchema = z.object({
  storeId: idSchema,
  tableId: idSchema,
}).strict();

export function hasAtLeastOneField(value) {
  return Object.keys(value).length > 0;
}

export function isValidTimezone(timezone) {
  try {
    new Intl.DateTimeFormat('en-NZ', { timeZone: timezone }).format(new Date());
    return true;
  } catch (error) {
    return false;
  }
}
