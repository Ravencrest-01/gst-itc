import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';
import { z } from 'zod';
import { getRequestContext } from '@/lib/api/context';
import { badRequest, handler, HttpError, json } from '@/lib/api/http';
import { and, desc, eq } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { runIngestionJob } from '@/lib/ingestion/db-sink';
import { FIELDS } from '@/lib/ingestion/fields';
import type { ColumnMapping, FieldKey } from '@/lib/ingestion/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET ?source=&limit=: recent uploads with their outcome. */
export const GET = handler(async (request: Request) => {
  const ctx = await getRequestContext(request);
  const params = new URL(request.url).searchParams;
  const source = params.get('source') ? z.enum(['PURCHASE_REGISTER', 'GSTR2B']).parse(params.get('source')) : undefined;
  const limit = z.coerce.number().int().min(1).max(100).default(20).parse(params.get('limit') ?? undefined);
  const b = schema.ingestionBatches;
  const batches = await ctx.db
    .select({
      id: b.id,
      source: b.source,
      fileName: b.fileName,
      status: b.status,
      rowCount: b.rowCount,
      insertedCount: b.insertedCount,
      errorCount: b.errorCount,
      errors: b.errors,
      createdAt: b.createdAt,
      completedAt: b.completedAt,
    })
    .from(b)
    .where(and(eq(b.organizationId, ctx.organizationId), source ? eq(b.source, source) : undefined))
    .orderBy(desc(b.createdAt))
    .limit(limit);
  return json({ batches: batches.map((x) => ({ ...x, errors: (x.errors ?? []).slice(0, 5) })) });
});

/** Upload limit for direct uploads (local/self-hosted). Hosted deployments upload to blob storage. */
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const sourceSchema = z.enum(['PURCHASE_REGISTER', 'GSTR2B']);
const fieldKeys = FIELDS.map((f) => f.key) as [FieldKey, ...FieldKey[]];
const mappingSchema = z.partialRecord(z.enum(fieldKeys), z.string().min(1)).optional();

/**
 * POST multipart/form-data: file, source (PURCHASE_REGISTER | GSTR2B), mapping (optional
 * JSON {field: column header}). Returns the ingestion summary (row errors, mapping used).
 */
export const POST = handler(async (request: Request) => {
  const ctx = await getRequestContext(request);
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 1024 * 1024) throw new HttpError(413, 'File is larger than 50 MB');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw badRequest('Expected multipart/form-data with a "file" field');
  }
  const file = form.get('file');
  if (!(file instanceof File)) throw badRequest('Missing "file"');
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, 'File is larger than 50 MB');
  const source = sourceSchema.parse(form.get('source'));
  const rawMapping = form.get('mapping');
  let mapping: ColumnMapping | undefined;
  if (typeof rawMapping === 'string' && rawMapping.trim()) {
    try {
      mapping = mappingSchema.parse(JSON.parse(rawMapping));
    } catch {
      throw badRequest('"mapping" must be a JSON object of field → column header');
    }
  }

  const { batchId, summary, error } = await runIngestionJob(ctx.db, {
    organizationId: ctx.organizationId,
    source,
    fileName: file.name || 'upload',
    input: Readable.fromWeb(file.stream() as unknown as NodeWebReadableStream),
    mapping,
    createdByUserId: ctx.userId ?? undefined,
  });
  if (error) return json({ batchId, error, summary }, { status: 422 });
  return json({ batchId, summary }, { status: 201 });
});
