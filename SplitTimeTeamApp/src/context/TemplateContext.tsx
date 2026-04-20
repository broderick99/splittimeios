import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type {
  TemplateSummary,
  BuilderItem,
  WorkoutTemplate,
  TemplateRepeatGroup,
  TemplateStep,
  BuilderStep,
} from '@/types';
import { useDatabase } from '@/context/DatabaseContext';
import * as templateDb from '@/db/templates';
import { generateId } from '@/utils/id';

interface TemplateContextValue {
  templates: TemplateSummary[];
  refreshTemplates: () => Promise<void>;
  createTemplate: (name: string, items: BuilderItem[]) => Promise<string>;
  updateTemplate: (id: string, name: string, items: BuilderItem[]) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  getTemplateDetail: (id: string) => Promise<{
    template: WorkoutTemplate;
    items: BuilderItem[];
  } | null>;
  getTemplateStepsAndGroups: (id: string) => Promise<{
    steps: TemplateStep[];
    repeatGroups: TemplateRepeatGroup[];
  }>;
}

const TemplateContext = createContext<TemplateContextValue | null>(null);

/**
 * Convert BuilderItem[] into flat DB entities (TemplateRepeatGroup[] + TemplateStep[]).
 * Assigns sortOrder based on position in the items array.
 */
function builderItemsToDbEntities(
  templateId: string,
  items: BuilderItem[]
): { repeatGroups: TemplateRepeatGroup[]; steps: TemplateStep[] } {
  const repeatGroups: TemplateRepeatGroup[] = [];
  const steps: TemplateStep[] = [];
  let sortOrder = 0;

  for (const item of items) {
    if (item.kind === 'step') {
      steps.push({
        id: item.step.id,
        templateId,
        sortOrder,
        type: item.step.type,
        distanceValue: item.step.distanceValue,
        distanceUnit: item.step.distanceUnit,
        durationMs: item.step.durationMs,
        label: item.step.label,
        repeatGroupId: null,
      });
      sortOrder++;
    } else {
      const groupId = item.group.id;
      repeatGroups.push({
        id: groupId,
        templateId,
        repeatCount: item.group.repeatCount,
        sortOrder,
      });
      // Each step in the group gets the same sortOrder base (within-group ordering
      // uses a secondary sortOrder starting from 0)
      for (let i = 0; i < item.group.steps.length; i++) {
        const s = item.group.steps[i];
        steps.push({
          id: s.id,
          templateId,
          sortOrder: i,
          type: s.type,
          distanceValue: s.distanceValue,
          distanceUnit: s.distanceUnit,
          durationMs: s.durationMs,
          label: s.label,
          repeatGroupId: groupId,
        });
      }
      sortOrder++;
    }
  }

  return { repeatGroups, steps };
}

/**
 * Convert DB entities back into BuilderItem[] for the editor.
 */
function dbEntitiesToBuilderItems(
  dbSteps: TemplateStep[],
  dbRepeatGroups: TemplateRepeatGroup[]
): BuilderItem[] {
  const groupMap = new Map<string, TemplateRepeatGroup>();
  for (const rg of dbRepeatGroups) {
    groupMap.set(rg.id, rg);
  }

  // Separate standalone and grouped steps
  const standaloneSteps: TemplateStep[] = [];
  const groupedSteps = new Map<string, TemplateStep[]>();

  for (const step of dbSteps) {
    if (step.repeatGroupId === null) {
      standaloneSteps.push(step);
    } else {
      if (!groupedSteps.has(step.repeatGroupId)) {
        groupedSteps.set(step.repeatGroupId, []);
      }
      groupedSteps.get(step.repeatGroupId)!.push(step);
    }
  }

  // Sort grouped steps by sortOrder within each group
  for (const [, gSteps] of groupedSteps) {
    gSteps.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  // Build top-level items with their sort positions
  type TopItem =
    | { kind: 'step'; step: TemplateStep; sortOrder: number }
    | { kind: 'repeat'; group: TemplateRepeatGroup; steps: TemplateStep[]; sortOrder: number };

  const topItems: TopItem[] = [];

  for (const step of standaloneSteps) {
    topItems.push({ kind: 'step', step, sortOrder: step.sortOrder });
  }

  for (const [groupId, gSteps] of groupedSteps) {
    const group = groupMap.get(groupId);
    if (group) {
      topItems.push({ kind: 'repeat', group, steps: gSteps, sortOrder: group.sortOrder });
    }
  }

  topItems.sort((a, b) => a.sortOrder - b.sortOrder);

  // Convert to BuilderItem[]
  return topItems.map((item): BuilderItem => {
    if (item.kind === 'step') {
      const s = item.step;
      return {
        kind: 'step',
        step: {
          id: s.id,
          type: s.type,
          distanceValue: s.distanceValue,
          distanceUnit: s.distanceUnit,
          durationMs: s.durationMs,
          label: s.label,
        },
      };
    } else {
      return {
        kind: 'repeat',
        group: {
          id: item.group.id,
          repeatCount: item.group.repeatCount,
          steps: item.steps.map(
            (s): BuilderStep => ({
              id: s.id,
              type: s.type,
              distanceValue: s.distanceValue,
              distanceUnit: s.distanceUnit,
              durationMs: s.durationMs,
              label: s.label,
            })
          ),
        },
      };
    }
  });
}

export function TemplateProvider({ children }: { children: React.ReactNode }) {
  const db = useDatabase();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);

  const refreshTemplates = useCallback(async () => {
    const list = await templateDb.getAllTemplates(db);
    setTemplates(list);
  }, [db]);

  useEffect(() => {
    refreshTemplates();
  }, [refreshTemplates]);

  const createTemplate = useCallback(
    async (name: string, items: BuilderItem[]): Promise<string> => {
      const now = Date.now();
      const template: WorkoutTemplate = {
        id: generateId(),
        name: name.trim(),
        createdAt: now,
        updatedAt: now,
      };
      const { repeatGroups, steps } = builderItemsToDbEntities(template.id, items);
      await templateDb.saveTemplateWithSteps(db, template, repeatGroups, steps);
      await refreshTemplates();
      return template.id;
    },
    [db, refreshTemplates]
  );

  const updateTemplate = useCallback(
    async (id: string, name: string, items: BuilderItem[]) => {
      const existing = await templateDb.getTemplate(db, id);
      if (!existing) return;
      const template: WorkoutTemplate = {
        ...existing,
        name: name.trim(),
        updatedAt: Date.now(),
      };
      const { repeatGroups, steps } = builderItemsToDbEntities(id, items);
      await templateDb.saveTemplateWithSteps(db, template, repeatGroups, steps);
      await refreshTemplates();
    },
    [db, refreshTemplates]
  );

  const deleteTemplate = useCallback(
    async (id: string) => {
      await templateDb.deleteTemplate(db, id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    },
    [db]
  );

  const getTemplateDetail = useCallback(
    async (id: string) => {
      const template = await templateDb.getTemplate(db, id);
      if (!template) return null;
      const [dbSteps, dbRepeatGroups] = await Promise.all([
        templateDb.getStepsForTemplate(db, id),
        templateDb.getRepeatGroupsForTemplate(db, id),
      ]);
      const items = dbEntitiesToBuilderItems(dbSteps, dbRepeatGroups);
      return { template, items };
    },
    [db]
  );

  const getTemplateStepsAndGroups = useCallback(
    async (id: string) => {
      const [steps, repeatGroups] = await Promise.all([
        templateDb.getStepsForTemplate(db, id),
        templateDb.getRepeatGroupsForTemplate(db, id),
      ]);
      return { steps, repeatGroups };
    },
    [db]
  );

  return (
    <TemplateContext.Provider
      value={{
        templates,
        refreshTemplates,
        createTemplate,
        updateTemplate,
        deleteTemplate,
        getTemplateDetail,
        getTemplateStepsAndGroups,
      }}
    >
      {children}
    </TemplateContext.Provider>
  );
}

export function useTemplates() {
  const ctx = useContext(TemplateContext);
  if (!ctx) throw new Error('useTemplates must be used within TemplateProvider');
  return ctx;
}
