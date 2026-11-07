/** Browser-side API helpers. Errors carry the server's message for display. */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: { path?: string; message: string }[],
    readonly body?: unknown,
  ) {
    super(message);
  }
}

async function parse<T>(res: Response): Promise<T> {
  const body = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    const message = body?.error ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, message, body?.details, body);
  }
  return body as T;
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return parse<T>(await fetch(path, { signal, cache: 'no-store' }));
}

export async function apiPost<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return parse<T>(
    await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal }),
  );
}

export async function apiPostForm<T>(path: string, form: FormData, signal?: AbortSignal): Promise<T> {
  return parse<T>(await fetch(path, { method: 'POST', body: form, signal }));
}

/**
 * Multipart upload with progress (fetch cannot report upload progress). Resolves with
 * the parsed JSON body; rejects with ApiError on non-2xx, keeping the body (e.g. a 422
 * upload summary).
 */
export function uploadWithProgress<T>(path: string, form: FormData, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', path);
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.upload.onload = () => onProgress(1);
    xhr.onload = () => {
      const body = xhr.response as { error?: string; details?: { message: string }[] } | null;
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else reject(new ApiError(xhr.status, body?.error ?? `Upload failed (${xhr.status})`, body?.details, body));
    };
    xhr.onerror = () => reject(new ApiError(0, 'Network error: the server could not be reached'));
    xhr.onabort = () => reject(new ApiError(0, 'Upload cancelled'));
    signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(form);
  });
}
