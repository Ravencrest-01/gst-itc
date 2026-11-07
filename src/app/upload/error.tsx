'use client';

import { useEffect } from 'react';
import { Alert, Button } from '@/components/ui';

/** Render errors on the upload screen: keep the shell, offer a retry. */
export default function UploadError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Alert tone="danger" title="Something went wrong on this screen">
        Your files have not been changed. Try again; if it keeps happening, reload the page.
        {error.digest && <span className="mt-1 block font-mono text-xs">Reference: {error.digest}</span>}
      </Alert>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
