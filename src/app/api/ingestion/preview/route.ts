import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';
import { z } from 'zod';
import { getRequestContext } from '@/lib/api/context';
import { badRequest, handler, HttpError, json } from '@/lib/api/http';
import { FIELDS } from '@/lib/ingestion/fields';
import { IngestionError } from '@/lib/ingestion/pipeline';
import { previewFile } from '@/lib/ingestion/preview';
import type { FieldKey } from '@/lib/ingestion/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const fieldKeys = FIELDS.map((f) => f.key) as [FieldKey, ...FieldKey[]];

/**
 * POST multipart/form-data: file, source, mapping (optional overrides). Reads the file
 * without saving anything and returns headers, sample rows, row counts, the column
 * mapping that would be used, and problems found in the sample rows.
 */
export const POST = handler(async (request: Request) => {
  await getRequestContext(request);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw badRequest('Expected multipart/form-data with a "file" field');
  }
  const file = form.get('file');
  if (!(file instanceof File)) throw badRequest('Missing "file"');
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, 'File is larger than 50 MB');
  const source = z.enum(['PURCHASE_REGISTER', 'GSTR2B']).parse(form.get('source'));
  const raw = form.get('mapping');
  const overrides =
    typeof raw === 'string' && raw.trim()
      ? z.partialRecord(z.enum(fieldKeys), z.string().min(1)).parse(JSON.parse(raw))
      : {};

  try {
    const preview = await previewFile(
      file.name || 'upload',
      Readable.fromWeb(file.stream() as unknown as NodeWebReadableStream),
      source,
      overrides,
    );
    return json({ fileName: file.name, size: file.size, ...preview });
  } catch (err) {
    // Unreadable files are the user's to fix, not server errors.
    if (err instanceof IngestionError || /Not a readable \.xlsx|larger than/.test(String((err as Error)?.message))) {
      throw new HttpError(422, (err as Error).message);
    }
    throw err;
  }
});
