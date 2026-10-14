/**
 * Canonical PTT Normalization Utility for HBTrack
 * Ensures identical PTT key representation across ingestion, Firestore doc IDs,
 * query filters, and UI tables.
 */
export function normalizePttId(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val).trim().replace(/^trans-/i, '').trim();
  // Strip leading zeros if numeric (e.g. "0244289" -> "244289"), but keep single "0"
  const stripped = str.replace(/^0+(?=\d)/, '');
  return stripped;
}

export function isValidPttId(val: unknown): boolean {
  const norm = normalizePttId(val);
  return /^\d{3,12}$/.test(norm);
}
