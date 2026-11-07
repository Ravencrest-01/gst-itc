import type { Metadata } from 'next';
import { UploadWorkbench } from '@/components/upload/upload-workbench';

export const metadata: Metadata = { title: 'Upload data' };

export default function UploadPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <UploadWorkbench />
    </div>
  );
}
