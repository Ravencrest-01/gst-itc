import React from 'react';
import { cn } from '../../lib/utils';
import { BUCKET_LABELS, BUCKET_TONES, REVIEW_STATUS_LABELS, REVIEW_STATUS_TONES } from '../../lib/enums';

export function Badge({ children, tone = 'neutral', className }) {
  const tones = {
    matched: 'bg-matched/10 text-matched border-matched/20',
    attention: 'bg-attention/10 text-attention border-attention/20',
    risk: 'bg-destructive/10 text-destructive border-destructive/20',
    neutral: 'bg-muted text-muted-foreground border-border',
    blue: 'bg-accent/10 text-accent border-accent/20',
  };

  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2", tones[tone], className)}>
      {children}
    </span>
  );
}

export function BucketBadge({ bucket, className }) {
  if (!bucket) return null;
  const label = BUCKET_LABELS[bucket] || bucket;
  const tone = BUCKET_TONES[bucket] || 'neutral';
  return <Badge tone={tone} className={className}>{label}</Badge>;
}

export function ReviewBadge({ status, className }) {
  if (!status) return null;
  const label = REVIEW_STATUS_LABELS[status] || status;
  const tone = REVIEW_STATUS_TONES[status] || 'neutral';
  return <Badge tone={tone} className={className}>{label}</Badge>;
}
