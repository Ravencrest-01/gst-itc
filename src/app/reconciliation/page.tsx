import type { Metadata } from 'next';
import { RunsList } from '@/components/reconciliation/runs-list';

export const metadata: Metadata = { title: 'Reconciliation' };

export default function ReconciliationPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <RunsList />
    </div>
  );
}
