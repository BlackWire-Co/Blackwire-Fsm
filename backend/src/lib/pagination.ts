export function parsePagination(req: any, defaultPageSize = 50, maxPageSize = 500) {
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const pageSize = Math.min(maxPageSize, Math.max(5, parseInt(req.query.pageSize as string, 10) || defaultPageSize));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
