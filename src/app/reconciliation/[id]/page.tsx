import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Workbench } from '@/components/reconciliation/workbench';

export const metadata: Metadata = { title: 'Reconciliation workbench' };

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return (
    <div className="mx-auto max-w-[1400px]">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <Workbench runId={id} />
      </Suspense>
    </div>
  );
}
