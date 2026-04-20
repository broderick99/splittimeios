import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  WorkoutTemplate,
  TemplateStep,
  TemplateRepeatGroup,
  TemplateSummary,
  DistanceUnit,
  TemplateStepType,
} from '@/types';

// ============================================================
// Templates
// ============================================================

export async function getAllTemplates(db: SQLiteDatabase): Promise<TemplateSummary[]> {
  const rows = await db.getAllAsync<{
    id: string;
    name: string;
    created_at: number;
    updated_at: number;
    step_count: number;
  }>(
    `SELECT t.id, t.name, t.created_at, t.updated_at,
            COUNT(s.id) as step_count
     FROM workout_templates t
     LEFT JOIN template_steps s ON t.id = s.template_id
     GROUP BY t.id
     ORDER BY t.updated_at DESC`
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    stepCount: r.step_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function getTemplate(
  db: SQLiteDatabase,
  id: string
): Promise<WorkoutTemplate | null> {
  const row = await db.getFirstAsync<{
    id: string;
    name: string;
    created_at: number;
    updated_at: number;
  }>('SELECT id, name, created_at, updated_at FROM workout_templates WHERE id = ?', id);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function insertTemplate(
  db: SQLiteDatabase,
  template: WorkoutTemplate
): Promise<void> {
  await db.runAsync(
    'INSERT INTO workout_templates (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
    template.id,
    template.name,
    template.createdAt,
    template.updatedAt
  );
}

export async function updateTemplateName(
  db: SQLiteDatabase,
  id: string,
  name: string
): Promise<void> {
  await db.runAsync(
    'UPDATE workout_templates SET name = ?, updated_at = ? WHERE id = ?',
    name,
    Date.now(),
    id
  );
}

export async function deleteTemplate(
  db: SQLiteDatabase,
  id: string
): Promise<void> {
  await db.runAsync('DELETE FROM workout_templates WHERE id = ?', id);
}

// ============================================================
// Steps
// ============================================================

export async function getStepsForTemplate(
  db: SQLiteDatabase,
  templateId: string
): Promise<TemplateStep[]> {
  const rows = await db.getAllAsync<{
    id: string;
    template_id: string;
    sort_order: number;
    type: string;
    distance_value: number | null;
    distance_unit: string | null;
    duration_ms: number | null;
    label: string;
    repeat_group_id: string | null;
  }>(
    `SELECT id, template_id, sort_order, type, distance_value, distance_unit,
            duration_ms, label, repeat_group_id
     FROM template_steps WHERE template_id = ? ORDER BY sort_order ASC`,
    templateId
  );
  return rows.map((r) => ({
    id: r.id,
    templateId: r.template_id,
    sortOrder: r.sort_order,
    type: r.type as TemplateStepType,
    distanceValue: r.distance_value,
    distanceUnit: r.distance_unit as DistanceUnit | null,
    durationMs: r.duration_ms,
    label: r.label,
    repeatGroupId: r.repeat_group_id,
  }));
}

// ============================================================
// Repeat Groups
// ============================================================

export async function getRepeatGroupsForTemplate(
  db: SQLiteDatabase,
  templateId: string
): Promise<TemplateRepeatGroup[]> {
  const rows = await db.getAllAsync<{
    id: string;
    template_id: string;
    repeat_count: number;
    sort_order: number;
  }>(
    `SELECT id, template_id, repeat_count, sort_order
     FROM template_repeat_groups WHERE template_id = ? ORDER BY sort_order ASC`,
    templateId
  );
  return rows.map((r) => ({
    id: r.id,
    templateId: r.template_id,
    repeatCount: r.repeat_count,
    sortOrder: r.sort_order,
  }));
}

// ============================================================
// Composite save (transaction: delete old + insert new)
// ============================================================

export async function saveTemplateWithSteps(
  db: SQLiteDatabase,
  template: WorkoutTemplate,
  repeatGroups: TemplateRepeatGroup[],
  steps: TemplateStep[]
): Promise<void> {
  await db.withTransactionAsync(async () => {
    // Upsert template
    await db.runAsync(
      `INSERT INTO workout_templates (id, name, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at`,
      template.id,
      template.name,
      template.createdAt,
      template.updatedAt
    );

    // Delete old steps and repeat groups
    await db.runAsync('DELETE FROM template_steps WHERE template_id = ?', template.id);
    await db.runAsync('DELETE FROM template_repeat_groups WHERE template_id = ?', template.id);

    // Insert repeat groups
    for (const rg of repeatGroups) {
      await db.runAsync(
        `INSERT INTO template_repeat_groups (id, template_id, repeat_count, sort_order)
         VALUES (?, ?, ?, ?)`,
        rg.id,
        rg.templateId,
        rg.repeatCount,
        rg.sortOrder
      );
    }

    // Insert steps
    for (const step of steps) {
      await db.runAsync(
        `INSERT INTO template_steps (id, template_id, sort_order, type, distance_value,
          distance_unit, duration_ms, label, repeat_group_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        step.id,
        step.templateId,
        step.sortOrder,
        step.type,
        step.distanceValue,
        step.distanceUnit,
        step.durationMs,
        step.label,
        step.repeatGroupId
      );
    }
  });
}
