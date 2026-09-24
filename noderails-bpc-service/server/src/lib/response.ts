import type { Request, Response } from 'express';

export function success<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data });
}

export function created<T>(res: Response, data: T): void {
  success(res, data, 201);
}

export function noContent(res: Response): void {
  res.status(204).send();
}

export function paginated<T>(
  res: Response,
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): void {
  res.json({
    success: true,
    data: items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}

export type AuthenticatedRequest = Request & {
  admin?: { email: string; role: string };
};
