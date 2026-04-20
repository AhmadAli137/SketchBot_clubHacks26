import type { ClassroomRestrictions } from '@/lib/platform-types';

const FREE_DRAW_ID = 'free-draw';

export function isConceptAllowed(
  conceptId: string | null | undefined,
  restrictions: ClassroomRestrictions | null | undefined,
): boolean {
  if (!restrictions?.allowedConceptIds || restrictions.allowedConceptIds.length === 0) {
    return true;
  }
  const id = conceptId ?? FREE_DRAW_ID;
  return restrictions.allowedConceptIds.includes(id);
}

export function canUseFreeDraw(restrictions: ClassroomRestrictions | null | undefined): boolean {
  if (restrictions?.disableFreeDraw) return false;
  return isConceptAllowed(null, restrictions);
}

export function canUpload(restrictions: ClassroomRestrictions | null | undefined): boolean {
  return !restrictions?.disableUpload;
}

/** null = no cap */
export function effectiveMaxHints(restrictions: ClassroomRestrictions | null | undefined): number | null {
  const n = restrictions?.maxTutorHintsPerSession;
  if (n === undefined || n === null || n <= 0) return null;
  return n;
}
