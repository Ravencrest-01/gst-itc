import { z } from 'zod';

/** An error that maps to an HTTP status with a client-safe message. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} not found`);
export const badRequest = (message: string, details?: unknown) => new HttpError(400, message, details);

export function json(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, init);
}

/** Converts thrown errors into JSON responses; unexpected errors are logged, not leaked. */
export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return json({ error: err.message, ...(err.details ? { details: err.details } : {}) }, { status: err.status });
  }
  if (err instanceof z.ZodError) {
    return json(
      { error: 'Invalid request', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
      { status: 400 },
    );
  }
  console.error(err);
  return json({ error: 'Internal server error' }, { status: 500 });
}

/** Wraps a route handler so every error becomes a proper JSON response. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    throw badRequest('Request body must be valid JSON');
  }
  return schema.parse(body);
}

export function readQuery<T>(request: Request, schema: z.ZodType<T>): T {
  const params = new URL(request.url).searchParams;
  const raw: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const all = params.getAll(key);
    raw[key] = all.length > 1 ? all : all[0];
  }
  return schema.parse(raw);
}

// Shared schema pieces
export const financialYearSchema = z
  .string()
  .regex(/^\d{4}-\d{4}$/, 'Expected a financial year like 2025-2026')
  .refine((fy) => Number(fy.slice(5)) === Number(fy.slice(0, 4)) + 1, 'Financial year must span consecutive years');
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
export const uuidSchema = z.string().uuid();

/** "a,b" or repeated ?x=a&x=b → string[] */
export const csvList = <T extends z.ZodType<unknown, string>>(item: T) =>
  z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v.split(',')).map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(item));

export const booleanParam = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');
