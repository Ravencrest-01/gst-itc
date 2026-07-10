// Bucket mappings
export const BUCKET_LABELS = {
  matched: 'Matched',
  mismatched: 'Mismatched',
  missing_in_portal: 'Missing in Portal',
  missing_in_books: 'Missing in Books',
  probable: 'Probable Match',
};

export const BUCKET_TONES = {
  matched: 'matched',
  mismatched: 'attention',
  missing_in_portal: 'risk',
  missing_in_books: 'neutral',
  probable: 'attention',
};

// Review status mappings
export const REVIEW_STATUS_LABELS = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  rejected: 'Rejected',
  skipped: 'Skipped',
};

export const REVIEW_STATUS_TONES = {
  pending: 'neutral',
  confirmed: 'matched',
  rejected: 'risk',
  skipped: 'neutral',
};

// Run status mappings
export const RUN_STATUS_LABELS = {
  pending: 'Running...',
  completed: 'Done',
  failed: 'Failed',
};
