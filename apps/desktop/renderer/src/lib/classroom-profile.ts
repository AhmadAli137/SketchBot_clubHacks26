import type { ClassroomProfile, ClassroomRestrictions } from '@/lib/platform-types';

export const CLASSROOM_PROFILE_KEY = 'sketchbot-classroom-profile';
export const LESSON_DRAFT_KEY = 'sketchbot-lesson-draft-v1';

export type LessonDraft = {
  templateConceptId: string;
  templateTitle: string;
  notes: string;
  updatedAt: string;
};

export function defaultClassroomProfile(): ClassroomProfile {
  return {
    classroomName: '',
    teacherName: '',
    students: [],
    bots: [],
    restrictions: {
      allowedConceptIds: null,
      disableFreeDraw: false,
      disableUpload: false,
    },
  };
}

export function loadClassroomProfile(): ClassroomProfile {
  try {
    const raw = localStorage.getItem(CLASSROOM_PROFILE_KEY);
    if (!raw) return defaultClassroomProfile();
    const parsed = JSON.parse(raw) as Partial<ClassroomProfile>;
    const base = defaultClassroomProfile();
    const baseRestrictions: ClassroomRestrictions = base.restrictions ?? {
      allowedConceptIds: null,
      disableFreeDraw: false,
      disableUpload: false,
    };
    const partial =
      parsed.restrictions && typeof parsed.restrictions === 'object'
        ? (parsed.restrictions as Partial<ClassroomRestrictions>)
        : {};
    const merged: ClassroomRestrictions = {
      ...baseRestrictions,
      ...partial,
      allowedConceptIds:
        partial.allowedConceptIds !== undefined ? partial.allowedConceptIds : baseRestrictions.allowedConceptIds,
    };
    return {
      classroomName: typeof parsed.classroomName === 'string' ? parsed.classroomName : base.classroomName,
      teacherName: typeof parsed.teacherName === 'string' ? parsed.teacherName : base.teacherName,
      students: Array.isArray(parsed.students) ? parsed.students.filter((s) => typeof s === 'string' && s.trim()) : [],
      bots: Array.isArray(parsed.bots) ? parsed.bots.filter((s) => typeof s === 'string' && s.trim()) : [],
      restrictions: merged,
    };
  } catch {
    return defaultClassroomProfile();
  }
}

export function saveClassroomProfile(profile: ClassroomProfile): void {
  const normalized: ClassroomProfile = {
    ...profile,
    students: [...new Set(profile.students.map((s) => s.trim()).filter(Boolean))],
    bots: [...new Set(profile.bots.map((s) => s.trim()).filter(Boolean))],
  };
  localStorage.setItem(CLASSROOM_PROFILE_KEY, JSON.stringify(normalized));
}

export function loadLessonDraft(): LessonDraft | null {
  try {
    const raw = localStorage.getItem(LESSON_DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<LessonDraft>;
    if (!d.templateConceptId || !d.templateTitle) return null;
    return {
      templateConceptId: d.templateConceptId,
      templateTitle: d.templateTitle,
      notes: typeof d.notes === 'string' ? d.notes : '',
      updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveLessonDraft(draft: LessonDraft): void {
  localStorage.setItem(LESSON_DRAFT_KEY, JSON.stringify(draft));
}
