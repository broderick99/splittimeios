import type { TemplateStep, TemplateRepeatGroup, ExpandedStep } from '@/types';

/**
 * Generate a human-readable display label from a step's distance or duration
 * when the user hasn't provided a custom label.
 *
 * Examples: "400m", "1.5 km", "2 mi", "3:00 recovery"
 */
function autoLabel(step: TemplateStep): string {
  if (step.distanceValue != null && step.distanceUnit != null) {
    const sep = step.distanceUnit === 'm' ? '' : ' ';
    const val = Number.isInteger(step.distanceValue)
      ? String(step.distanceValue)
      : String(parseFloat(step.distanceValue.toFixed(2)));
    return `${val}${sep}${step.distanceUnit}`;
  }
  if (step.durationMs != null && step.durationMs > 0) {
    const totalSec = Math.floor(step.durationMs / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
  }
  return step.type === 'recovery' ? 'Recovery' : 'Work';
}

/**
 * Expands a template's steps and repeat groups into a flat ordered list
 * of ExpandedStep objects ready for runtime use.
 *
 * Steps belong to either:
 * - A repeat group (repeatGroupId is set) → duplicated N times
 * - Standalone (repeatGroupId is null) → included once
 *
 * Top-level ordering:
 * - Standalone steps sort by their own sortOrder
 * - Repeat groups sort by their sortOrder (all grouped steps share the group's position)
 */
export function expandTemplate(
  steps: TemplateStep[],
  repeatGroups: TemplateRepeatGroup[]
): ExpandedStep[] {
  const groupMap = new Map<string, TemplateRepeatGroup>();
  for (const rg of repeatGroups) {
    groupMap.set(rg.id, rg);
  }

  // Separate standalone steps and grouped steps
  const standaloneSteps: TemplateStep[] = [];
  const groupedSteps = new Map<string, TemplateStep[]>();

  for (const step of steps) {
    if (step.repeatGroupId === null) {
      standaloneSteps.push(step);
    } else {
      if (!groupedSteps.has(step.repeatGroupId)) {
        groupedSteps.set(step.repeatGroupId, []);
      }
      groupedSteps.get(step.repeatGroupId)!.push(step);
    }
  }

  // Sort grouped steps by their sortOrder within each group
  for (const [, groupSteps] of groupedSteps) {
    groupSteps.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  // Build top-level items: standalone steps + repeat groups
  type TopLevelItem =
    | { kind: 'step'; step: TemplateStep; sortOrder: number }
    | { kind: 'repeat'; group: TemplateRepeatGroup; steps: TemplateStep[]; sortOrder: number };

  const topLevel: TopLevelItem[] = [];

  for (const step of standaloneSteps) {
    topLevel.push({ kind: 'step', step, sortOrder: step.sortOrder });
  }

  for (const [groupId, groupSteps] of groupedSteps) {
    const group = groupMap.get(groupId);
    if (group) {
      topLevel.push({ kind: 'repeat', group, steps: groupSteps, sortOrder: group.sortOrder });
    }
  }

  // Sort by sortOrder
  topLevel.sort((a, b) => a.sortOrder - b.sortOrder);

  // Expand into flat list
  const expanded: ExpandedStep[] = [];
  let index = 0;

  for (const item of topLevel) {
    if (item.kind === 'step') {
      const step = item.step;
      expanded.push({
        index,
        type: step.type,
        distanceValue: step.distanceValue,
        distanceUnit: step.distanceUnit,
        durationMs: step.durationMs,
        label: step.label || autoLabel(step),
        repeatIteration: null,
        repeatTotal: null,
      });
      index++;
    } else {
      const { group, steps: groupSteps } = item;
      for (let rep = 1; rep <= group.repeatCount; rep++) {
        for (const step of groupSteps) {
          expanded.push({
            index,
            type: step.type,
            distanceValue: step.distanceValue,
            distanceUnit: step.distanceUnit,
            durationMs: step.durationMs,
            label: step.label || autoLabel(step),
            repeatIteration: rep,
            repeatTotal: group.repeatCount,
          });
          index++;
        }
      }
    }
  }

  return expanded;
}
