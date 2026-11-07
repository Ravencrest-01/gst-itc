'use client';

import { FileSpreadsheet, UploadCloud } from 'lucide-react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { cx } from '@/components/ui';
import type { Source } from './types';

export const MAX_FILE_BYTES = 50 * 1024 * 1024;

const ACCEPT: Record<Source, Record<string, string[]>> = {
  PURCHASE_REGISTER: {
    'text/csv': ['.csv'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  },
  GSTR2B: {
    'text/csv': ['.csv'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    'application/json': ['.json'],
  },
};

function rejectionMessage(rejections: FileRejection[]): string {
  const r = rejections[0];
  const code = r?.errors[0]?.code;
  if (code === 'file-too-large') return `${r.file.name} is larger than 50 MB. Export it as CSV, or split it by month.`;
  if (code === 'file-invalid-type') {
    return r.file.name.toLowerCase().endsWith('.xls')
      ? 'Old .xls files are not supported. Open it in Excel and save as .xlsx or .csv.'
      : `${r.file.name} is not a supported file type.`;
  }
  if (code === 'too-many-files') return 'Drop one file at a time.';
  return r?.errors[0]?.message ?? 'That file could not be used.';
}

export function FileDropzone({
  source,
  disabled,
  onFile,
  onReject,
}: {
  source: Source;
  disabled?: boolean;
  onFile: (file: File) => void;
  onReject: (message: string) => void;
}) {
  const types = source === 'GSTR2B' ? '.json, .xlsx or .csv' : '.xlsx or .csv';
  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    accept: ACCEPT[source],
    maxFiles: 1,
    maxSize: MAX_FILE_BYTES,
    multiple: false,
    disabled,
    onDropAccepted: ([file]) => onFile(file),
    onDropRejected: (rejections) => onReject(rejectionMessage(rejections)),
  });

  return (
    <div
      {...getRootProps()}
      className={cx(
        'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors',
        isDragReject ? 'border-danger bg-danger-soft' : isDragActive ? 'border-accent bg-accent-soft' : 'border-border-strong bg-surface hover:border-accent hover:bg-surface-2',
        disabled && 'pointer-events-none opacity-60',
      )}
    >
      <input {...getInputProps()} aria-label="Choose a file to upload" />
      <div className={cx('grid size-12 place-items-center rounded-full', isDragActive ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted')}>
        {isDragActive ? <FileSpreadsheet className="size-6" aria-hidden /> : <UploadCloud className="size-6" aria-hidden />}
      </div>
      <div>
        <p className="text-sm font-medium">
          {isDragReject ? 'This file type is not supported' : isDragActive ? 'Drop the file to read it' : 'Drag & drop a file here, or click to browse'}
        </p>
        <p className="mt-1 text-xs text-muted">
          {types} · up to 50 MB · nothing is saved until you confirm the columns
        </p>
      </div>
    </div>
  );
}
