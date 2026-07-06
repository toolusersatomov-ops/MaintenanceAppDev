export const STAGE_ORDER = [
  "Accepted", "Start Travel", "Reached Machine", "Machine QR Scanned",
  "Diagnostics Started", "Diagnostics Completed", "Repair Started",
  "Testing Completed", "Submitted for Review",
];

export function nextStage(current) {
  const idx = STAGE_ORDER.indexOf(current);
  if (idx === -1 || idx === STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[idx + 1];
}
