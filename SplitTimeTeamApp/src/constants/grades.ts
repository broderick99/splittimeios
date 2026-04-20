export const GRADE_OPTIONS = ['7th', '8th', '9th', '10th', '11th', '12th'] as const;

export type GradeOption = (typeof GRADE_OPTIONS)[number];
