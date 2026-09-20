import { badRequest } from './errors.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * Parse pagination + sorting query params. Sorting is restricted to a
 * whitelist of column names — never accept arbitrary client-supplied SQL.
 *
 * @param {import('express').Request} req
 * @param {string[]} sortableColumns whitelisted column aliases
 * @param {{page?: number, pageSize?: number, sort?: string, order?: 'asc'|'desc'}} [overrides]
 */
export function parsePagination(req, sortableColumns, overrides = {}) {
  const page = parseInt(overrides.page ?? req.query.page ?? '1', 10);
  const pageSize = parseInt(overrides.pageSize ?? req.query.pageSize ?? String(DEFAULT_PAGE_SIZE), 10);

  if (!Number.isFinite(page) || page < 1) {
    throw badRequest('VALIDATION_ERROR', 'page must be a positive integer.');
  }
  if (!Number.isFinite(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw badRequest('VALIDATION_ERROR', `pageSize must be between 1 and ${MAX_PAGE_SIZE}.`);
  }

  const sort = String(overrides.sort ?? req.query.sort ?? 'created_at');
  const order = String(overrides.order ?? req.query.order ?? 'desc').toLowerCase();

  if (!sortableColumns.includes(sort)) {
    throw badRequest('VALIDATION_ERROR', `sort must be one of: ${sortableColumns.join(', ')}.`);
  }
  if (order !== 'asc' && order !== 'desc') {
    throw badRequest('VALIDATION_ERROR', 'order must be "asc" or "desc".');
  }

  return { page, pageSize, sort, order, offset: (page - 1) * pageSize };
}