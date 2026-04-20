import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type {
  Athlete,
  AthleteTimerState,
  AthleteWorkoutProgress,
  ExpandedStep,
  Group,
  GroupTimerBlock,
  RuntimeSplit,
  Split,
  TimerStatus,
} from '@/types';
import { useDatabase } from '@/context/DatabaseContext';
import { generateId } from '@/utils/id';
import * as workoutDb from '@/db/workouts';
import * as splitDb from '@/db/splits';
import { Colors } from '@/constants/colors';

interface WorkoutContextValue {
  isActive: boolean;
  workoutId: string | null;
  timerStates: Map<string, AthleteTimerState>;
  displayTick: number;
  // Structured workout state
  structuredSteps: ExpandedStep[] | null;
  athleteProgress: Map<string, AthleteWorkoutProgress>;
  templateId: string | null;
  templateName: string | null;
  // Freeform actions
  startWorkout: (athletes: Athlete[], groups: Group[]) => void;
  startGroup: (groupId: string | null) => void;
  stopGroup: (groupId: string | null) => void;
  lapGroup: (groupId: string | null) => void;
  startAthlete: (athleteId: string) => void;
  stopAthlete: (athleteId: string) => void;
  recordSplit: (athleteId: string) => void;
  undoLastSplit: (athleteId: string) => void;
  resetWorkout: () => void;
  saveWorkout: (name?: string) => Promise<string>;
  discardWorkout: () => void;
  getGroupedTimers: () => GroupTimerBlock[];
  // Structured workout actions
  startStructuredWorkout: (
    athletes: Athlete[],
    groups: Group[],
    templateId: string,
    templateName: string,
    steps: ExpandedStep[]
  ) => void;
  advanceStep: (athleteId: string) => void;
  advanceGroup: (groupId: string | null) => void;
}

const WorkoutContext = createContext<WorkoutContextValue | null>(null);

interface GroupTimer {
  startedAt: number | null;
  stoppedAt: number | null;
}

export function WorkoutProvider({ children }: { children: React.ReactNode }) {
  const db = useDatabase();
  const [isActive, setIsActive] = useState(false);
  const [workoutId, setWorkoutId] = useState<string | null>(null);
  const [timerStates, setTimerStates] = useState<Map<string, AthleteTimerState>>(new Map());
  const [groupTimers, setGroupTimers] = useState<Map<string, GroupTimer>>(new Map());
  const [displayTick, setDisplayTick] = useState(0);
  const groupsRef = useRef<Group[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Structured workout state
  const [structuredSteps, setStructuredSteps] = useState<ExpandedStep[] | null>(null);
  const [athleteProgress, setAthleteProgress] = useState<Map<string, AthleteWorkoutProgress>>(
    new Map()
  );
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState<string | null>(null);

  // Keep refs for use in interval callbacks
  const athleteProgressRef = useRef(athleteProgress);
  athleteProgressRef.current = athleteProgress;
  const structuredStepsRef = useRef(structuredSteps);
  structuredStepsRef.current = structuredSteps;

  // Display tick interval — drives timer re-renders
  // Also handles recovery countdown → waiting transition
  useEffect(() => {
    if (isActive) {
      intervalRef.current = setInterval(() => {
        setDisplayTick((prev) => prev + 1);

        // Check recovery countdowns
        const steps = structuredStepsRef.current;
        const progress = athleteProgressRef.current;
        if (steps && progress.size > 0) {
          const now = Date.now();
          let changed = false;
          const nextProgress = new Map(progress);

          for (const [athleteId, prog] of nextProgress) {
            if (
              prog.stepStatus === 'recovery_countdown' &&
              prog.recoveryStartedAt !== null
            ) {
              const step = steps[prog.currentStepIndex];
              if (step && step.durationMs !== null) {
                const elapsed = now - prog.recoveryStartedAt;
                if (elapsed >= step.durationMs) {
                  nextProgress.set(athleteId, {
                    ...prog,
                    stepStatus: 'recovery_waiting',
                  });
                  changed = true;
                }
              }
            }
          }

          if (changed) {
            setAthleteProgress(nextProgress);
          }
        }
      }, 64);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive]);

  // Helper to get the group timer key (uses '__unassigned' for null groupId)
  const groupKey = useCallback((groupId: string | null): string => {
    return groupId ?? '__unassigned';
  }, []);

  const startWorkout = useCallback((athletes: Athlete[], groups: Group[]) => {
    const id = generateId();
    groupsRef.current = groups;
    const states = new Map<string, AthleteTimerState>();
    const gTimers = new Map<string, GroupTimer>();

    // Collect all distinct group IDs
    const groupIds = new Set<string | null>();
    for (const athlete of athletes) {
      groupIds.add(athlete.groupId);
      const group = groups.find((g) => g.id === athlete.groupId);
      states.set(athlete.id, {
        athleteId: athlete.id,
        athleteName: athlete.name,
        photoUri: athlete.photoUri,
        groupId: athlete.groupId,
        groupName: group?.name ?? null,
        groupColor: group?.color ?? null,
        status: 'idle',
        startedAt: null,
        stoppedAt: null,
        splits: [],
      });
    }

    // Initialize a group timer for each group
    for (const gid of groupIds) {
      gTimers.set(groupKey(gid), { startedAt: null, stoppedAt: null });
    }

    setTimerStates(states);
    setGroupTimers(gTimers);
    setWorkoutId(id);
    setIsActive(true);
    setDisplayTick(0);
    // Clear structured state for freeform
    setStructuredSteps(null);
    setAthleteProgress(new Map());
    setTemplateId(null);
    setTemplateName(null);
  }, [groupKey]);

  const startStructuredWorkout = useCallback(
    (
      athletes: Athlete[],
      groups: Group[],
      tplId: string,
      tplName: string,
      steps: ExpandedStep[]
    ) => {
      const id = generateId();
      groupsRef.current = groups;
      const states = new Map<string, AthleteTimerState>();
      const gTimers = new Map<string, GroupTimer>();
      const progress = new Map<string, AthleteWorkoutProgress>();

      const groupIds = new Set<string | null>();
      for (const athlete of athletes) {
        groupIds.add(athlete.groupId);
        const group = groups.find((g) => g.id === athlete.groupId);
        states.set(athlete.id, {
          athleteId: athlete.id,
          athleteName: athlete.name,
          photoUri: athlete.photoUri,
          groupId: athlete.groupId,
          groupName: group?.name ?? null,
          groupColor: group?.color ?? null,
          status: 'idle',
          startedAt: null,
          stoppedAt: null,
          splits: [],
        });
        // Initialize progress for each athlete
        progress.set(athlete.id, {
          currentStepIndex: 0,
          stepStatus: 'pending',
          recoveryStartedAt: null,
        });
      }

      for (const gid of groupIds) {
        gTimers.set(groupKey(gid), { startedAt: null, stoppedAt: null });
      }

      setTimerStates(states);
      setGroupTimers(gTimers);
      setWorkoutId(id);
      setIsActive(true);
      setDisplayTick(0);
      setStructuredSteps(steps);
      setAthleteProgress(progress);
      setTemplateId(tplId);
      setTemplateName(tplName);
    },
    [groupKey]
  );

  const updateTimers = useCallback(
    (updater: (states: Map<string, AthleteTimerState>) => Map<string, AthleteTimerState>) => {
      setTimerStates((prev) => updater(new Map(prev)));
    },
    []
  );

  const startAthlete = useCallback(
    (athleteId: string) => {
      const now = Date.now();
      let athleteGroupId: string | null = null;
      updateTimers((states) => {
        const timer = states.get(athleteId);
        if (timer && timer.status === 'idle') {
          athleteGroupId = timer.groupId;
          states.set(athleteId, { ...timer, status: 'running', startedAt: now });
        }
        return states;
      });
      // Also start the group timer if it hasn't been started yet
      const key = groupKey(athleteGroupId);
      setGroupTimers((prev) => {
        const next = new Map(prev);
        const gt = next.get(key);
        if (gt && gt.startedAt === null) {
          next.set(key, { ...gt, startedAt: now });
        }
        return next;
      });
      // For structured workouts, mark the first step as active
      if (structuredSteps) {
        setAthleteProgress((prev) => {
          const next = new Map(prev);
          const prog = next.get(athleteId);
          if (prog && prog.stepStatus === 'pending') {
            next.set(athleteId, { ...prog, stepStatus: 'active' });
          }
          return next;
        });
      }
    },
    [updateTimers, groupKey, structuredSteps]
  );

  const stopAthlete = useCallback(
    (athleteId: string) => {
      const now = Date.now();
      let athleteGroupId: string | null = null;
      let wasLastRunning = false;
      updateTimers((states) => {
        const timer = states.get(athleteId);
        if (timer && timer.status === 'running' && timer.startedAt !== null) {
          athleteGroupId = timer.groupId;
          const elapsedMs = now - timer.startedAt;
          const finalSplit: RuntimeSplit = {
            splitNumber: timer.splits.length + 1,
            elapsedMs,
            timestamp: now,
            isFinal: true,
          };
          states.set(athleteId, {
            ...timer,
            status: 'stopped',
            stoppedAt: now,
            splits: [...timer.splits, finalSplit],
          });
          // Check if this was the last running athlete in the group
          wasLastRunning = true;
          for (const [id, t] of states) {
            if (id !== athleteId && t.groupId === athleteGroupId && t.status === 'running') {
              wasLastRunning = false;
              break;
            }
          }
        }
        return states;
      });
      // Stop the group timer if all athletes in the group are done
      if (wasLastRunning) {
        const key = groupKey(athleteGroupId);
        setGroupTimers((prev) => {
          const next = new Map(prev);
          const gt = next.get(key);
          if (gt && gt.startedAt !== null && gt.stoppedAt === null) {
            next.set(key, { ...gt, stoppedAt: now });
          }
          return next;
        });
      }
      // For structured workouts, mark as completed
      if (structuredSteps) {
        setAthleteProgress((prev) => {
          const next = new Map(prev);
          const prog = next.get(athleteId);
          if (prog) {
            next.set(athleteId, {
              ...prog,
              stepStatus: 'completed',
            });
          }
          return next;
        });
      }
    },
    [updateTimers, groupKey, structuredSteps]
  );

  const recordSplit = useCallback(
    (athleteId: string) => {
      const now = Date.now();
      updateTimers((states) => {
        const timer = states.get(athleteId);
        if (timer && timer.status === 'running' && timer.startedAt !== null) {
          const elapsedMs = now - timer.startedAt;
          const split: RuntimeSplit = {
            splitNumber: timer.splits.length + 1,
            elapsedMs,
            timestamp: now,
            isFinal: false,
          };
          states.set(athleteId, {
            ...timer,
            splits: [...timer.splits, split],
          });
        }
        return states;
      });

      // For structured workouts: after recording a split, check if next step is recovery
      if (structuredSteps) {
        setAthleteProgress((prev) => {
          const next = new Map(prev);
          const prog = next.get(athleteId);
          if (!prog) return prev;

          const nextStepIndex = prog.currentStepIndex + 1;
          if (nextStepIndex >= structuredSteps.length) {
            // No more steps — athlete is done (will need to be stopped manually or auto)
            return prev;
          }

          const nextStep = structuredSteps[nextStepIndex];
          if (nextStep.type === 'recovery') {
            // Move to recovery countdown
            next.set(athleteId, {
              currentStepIndex: nextStepIndex,
              stepStatus: 'recovery_countdown',
              recoveryStartedAt: now,
            });
          } else {
            // Next step is another work interval — advance directly
            next.set(athleteId, {
              currentStepIndex: nextStepIndex,
              stepStatus: 'active',
              recoveryStartedAt: null,
            });
          }
          return next;
        });
      }
    },
    [updateTimers, structuredSteps]
  );

  const advanceStep = useCallback(
    (athleteId: string) => {
      if (!structuredSteps) return;
      const now = Date.now();

      // Push recovery-end split to mark the GO moment
      updateTimers((states) => {
        const timer = states.get(athleteId);
        if (timer && timer.startedAt !== null) {
          states.set(athleteId, {
            ...timer,
            splits: [...timer.splits, {
              splitNumber: timer.splits.length + 1,
              elapsedMs: now - timer.startedAt,
              timestamp: now,
              isFinal: false,
              isRecoveryEnd: true,
            }],
          });
        }
        return states;
      });

      setAthleteProgress((prev) => {
        const next = new Map(prev);
        const prog = next.get(athleteId);
        if (!prog || prog.stepStatus !== 'recovery_waiting') return prev;

        const nextStepIndex = prog.currentStepIndex + 1;
        if (nextStepIndex >= structuredSteps.length) {
          next.set(athleteId, {
            currentStepIndex: prog.currentStepIndex,
            stepStatus: 'completed',
            recoveryStartedAt: null,
          });
          return next;
        }

        const nextStep = structuredSteps[nextStepIndex];
        next.set(athleteId, {
          currentStepIndex: nextStepIndex,
          stepStatus: nextStep.type === 'recovery' ? 'recovery_countdown' : 'active',
          recoveryStartedAt: nextStep.type === 'recovery' ? now : null,
        });
        return next;
      });
    },
    [structuredSteps, updateTimers]
  );

  const advanceGroup = useCallback(
    (groupId: string | null) => {
      if (!structuredSteps) return;
      const now = Date.now();

      // Push recovery-end splits for all recovery_waiting athletes in group
      updateTimers((states) => {
        for (const [id, timer] of states) {
          if (timer.groupId !== groupId || timer.startedAt === null) continue;
          const prog = athleteProgressRef.current.get(id);
          if (prog?.stepStatus !== 'recovery_waiting') continue;
          states.set(id, {
            ...timer,
            splits: [...timer.splits, {
              splitNumber: timer.splits.length + 1,
              elapsedMs: now - timer.startedAt,
              timestamp: now,
              isFinal: false,
              isRecoveryEnd: true,
            }],
          });
        }
        return states;
      });

      setAthleteProgress((prev) => {
        const next = new Map(prev);
        let changed = false;

        for (const [athleteId, prog] of next) {
          if (prog.stepStatus !== 'recovery_waiting') continue;
          const timer = timerStates.get(athleteId);
          if (!timer || timer.groupId !== groupId) continue;

          const nextStepIndex = prog.currentStepIndex + 1;
          if (nextStepIndex >= structuredSteps.length) {
            next.set(athleteId, {
              currentStepIndex: prog.currentStepIndex,
              stepStatus: 'completed',
              recoveryStartedAt: null,
            });
          } else {
            const nextStep = structuredSteps[nextStepIndex];
            next.set(athleteId, {
              currentStepIndex: nextStepIndex,
              stepStatus: nextStep.type === 'recovery' ? 'recovery_countdown' : 'active',
              recoveryStartedAt: nextStep.type === 'recovery' ? now : null,
            });
          }
          changed = true;
        }

        return changed ? next : prev;
      });
    },
    [structuredSteps, timerStates, updateTimers]
  );

  const undoLastSplit = useCallback(
    (athleteId: string) => {
      updateTimers((states) => {
        const timer = states.get(athleteId);
        if (timer && timer.splits.length > 0) {
          const lastSplit = timer.splits[timer.splits.length - 1];
          // Only undo non-final splits
          if (!lastSplit.isFinal) {
            states.set(athleteId, {
              ...timer,
              splits: timer.splits.slice(0, -1),
            });
          }
        }
        return states;
      });

      // For structured workouts, revert progress
      if (structuredSteps) {
        setAthleteProgress((prev) => {
          const next = new Map(prev);
          const prog = next.get(athleteId);
          if (!prog || prog.currentStepIndex === 0) return prev;
          // Go back to previous work step
          const prevIndex = prog.currentStepIndex - 1;
          next.set(athleteId, {
            currentStepIndex: prevIndex >= 0 ? prevIndex : 0,
            stepStatus: 'active',
            recoveryStartedAt: null,
          });
          return next;
        });
      }
    },
    [updateTimers, structuredSteps]
  );

  const startGroup = useCallback(
    (groupId: string | null) => {
      const now = Date.now();
      updateTimers((states) => {
        for (const [id, timer] of states) {
          if (timer.groupId === groupId && timer.status === 'idle') {
            states.set(id, { ...timer, status: 'running', startedAt: now });
          }
        }
        return states;
      });
      // Start the group timer
      const key = groupKey(groupId);
      setGroupTimers((prev) => {
        const next = new Map(prev);
        const gt = next.get(key);
        if (gt && gt.startedAt === null) {
          next.set(key, { ...gt, startedAt: now });
        }
        return next;
      });
      // For structured workouts, mark all idle athletes in group as active
      if (structuredSteps) {
        setAthleteProgress((prev) => {
          const next = new Map(prev);
          for (const [athleteId, prog] of next) {
            if (prog.stepStatus === 'pending') {
              // Check if this athlete belongs to the group
              const timer = timerStates.get(athleteId);
              if (timer && timer.groupId === groupId) {
                next.set(athleteId, { ...prog, stepStatus: 'active' });
              }
            }
          }
          return next;
        });
      }
    },
    [updateTimers, groupKey, structuredSteps, timerStates]
  );

  const stopGroup = useCallback(
    (groupId: string | null) => {
      const now = Date.now();
      updateTimers((states) => {
        for (const [id, timer] of states) {
          if (timer.groupId === groupId && timer.status === 'running' && timer.startedAt !== null) {
            const elapsedMs = now - timer.startedAt;
            const finalSplit: RuntimeSplit = {
              splitNumber: timer.splits.length + 1,
              elapsedMs,
              timestamp: now,
              isFinal: true,
            };
            states.set(id, {
              ...timer,
              status: 'stopped',
              stoppedAt: now,
              splits: [...timer.splits, finalSplit],
            });
          }
        }
        return states;
      });
      // Stop the group timer
      const key = groupKey(groupId);
      setGroupTimers((prev) => {
        const next = new Map(prev);
        const gt = next.get(key);
        if (gt && gt.startedAt !== null && gt.stoppedAt === null) {
          next.set(key, { ...gt, stoppedAt: now });
        }
        return next;
      });
      // For structured workouts, complete all athletes in group
      if (structuredSteps) {
        setAthleteProgress((prev) => {
          const next = new Map(prev);
          for (const [athleteId, prog] of next) {
            const timer = timerStates.get(athleteId);
            if (timer && timer.groupId === groupId && prog.stepStatus !== 'completed') {
              next.set(athleteId, { ...prog, stepStatus: 'completed' });
            }
          }
          return next;
        });
      }
    },
    [updateTimers, groupKey, structuredSteps, timerStates]
  );

  const lapGroup = useCallback(
    (groupId: string | null) => {
      const now = Date.now();
      const athleteIdsInGroup: string[] = [];
      updateTimers((states) => {
        for (const [id, timer] of states) {
          if (timer.groupId === groupId && timer.status === 'running' && timer.startedAt !== null) {
            const elapsedMs = now - timer.startedAt;
            const split: RuntimeSplit = {
              splitNumber: timer.splits.length + 1,
              elapsedMs,
              timestamp: now,
              isFinal: false,
            };
            states.set(id, {
              ...timer,
              splits: [...timer.splits, split],
            });
            athleteIdsInGroup.push(id);
          }
        }
        return states;
      });

      // For structured workouts: advance each athlete in group
      if (structuredSteps) {
        setAthleteProgress((prev) => {
          const next = new Map(prev);
          for (const athleteId of athleteIdsInGroup) {
            const prog = next.get(athleteId);
            if (!prog) continue;

            const nextStepIndex = prog.currentStepIndex + 1;
            if (nextStepIndex >= structuredSteps.length) continue;

            const nextStep = structuredSteps[nextStepIndex];
            if (nextStep.type === 'recovery') {
              next.set(athleteId, {
                currentStepIndex: nextStepIndex,
                stepStatus: 'recovery_countdown',
                recoveryStartedAt: now,
              });
            } else {
              next.set(athleteId, {
                currentStepIndex: nextStepIndex,
                stepStatus: 'active',
                recoveryStartedAt: null,
              });
            }
          }
          return next;
        });
      }
    },
    [updateTimers, structuredSteps]
  );

  const resetWorkout = useCallback(() => {
    const newId = generateId();
    setWorkoutId(newId);
    setDisplayTick(0);
    updateTimers((states) => {
      for (const [id, timer] of states) {
        states.set(id, {
          ...timer,
          status: 'idle',
          startedAt: null,
          stoppedAt: null,
          splits: [],
        });
      }
      return states;
    });
    // Reset all group timers
    setGroupTimers((prev) => {
      const next = new Map(prev);
      for (const [key] of next) {
        next.set(key, { startedAt: null, stoppedAt: null });
      }
      return next;
    });
    // Reset structured progress
    if (structuredSteps) {
      setAthleteProgress((prev) => {
        const next = new Map(prev);
        for (const [athleteId] of next) {
          next.set(athleteId, {
            currentStepIndex: 0,
            stepStatus: 'pending',
            recoveryStartedAt: null,
          });
        }
        return next;
      });
    }
  }, [updateTimers, structuredSteps]);

  const saveWorkout = useCallback(
    async (name?: string): Promise<string> => {
      if (!workoutId) throw new Error('No active workout');

      // Save workout record
      await workoutDb.insertWorkout(db, {
        id: workoutId,
        name: name || new Date().toLocaleDateString(),
        date: Date.now(),
        status: 'completed',
        templateId: templateId,
      });

      // Save athlete snapshots and splits
      const allSplits: Parameters<typeof splitDb.bulkInsertSplits>[1] = [];
      for (const [, timer] of timerStates) {
        await workoutDb.insertWorkoutAthlete(db, {
          workoutId,
          athleteId: timer.athleteId,
          groupId: timer.groupId,
          athleteName: timer.athleteName,
          groupName: timer.groupName,
          groupColor: timer.groupColor,
        });

        // Track which structured step each split maps to
        let structStepCursor = 0;
        let outputSplitNumber = 0;
        for (let i = 0; i < timer.splits.length; i++) {
          const split = timer.splits[i];
          outputSplitNumber++;

          // Recovery-end splits → save as recovery entries (captures actual GO timestamp)
          if (split.isRecoveryEnd && structuredSteps && structStepCursor < structuredSteps.length) {
            const recoveryStep = structuredSteps[structStepCursor];
            allSplits.push({
              id: generateId(),
              workoutId,
              athleteId: timer.athleteId,
              splitNumber: outputSplitNumber,
              elapsedMs: split.elapsedMs,
              timestamp: split.timestamp,
              isFinal: false,
              stepType: 'recovery',
              stepDistanceValue: recoveryStep.distanceValue,
              stepDistanceUnit: recoveryStep.distanceUnit,
              stepLabel: recoveryStep.label || 'Recovery',
            });
            structStepCursor++;
            continue;
          }

          // For structured workouts, attach work step metadata
          let stepType: Split['stepType'] = null;
          let stepDistanceValue: Split['stepDistanceValue'] = null;
          let stepDistanceUnit: Split['stepDistanceUnit'] = null;
          let stepLabel: Split['stepLabel'] = null;

          if (structuredSteps && structStepCursor < structuredSteps.length) {
            const step = structuredSteps[structStepCursor];
            if (step.type === 'work') {
              stepType = step.type;
              stepDistanceValue = step.distanceValue;
              stepDistanceUnit = step.distanceUnit;
              stepLabel = step.label;
            }
            structStepCursor++;
          }

          allSplits.push({
            id: generateId(),
            workoutId,
            athleteId: timer.athleteId,
            splitNumber: outputSplitNumber,
            elapsedMs: split.elapsedMs,
            timestamp: split.timestamp,
            isFinal: split.isFinal,
            stepType,
            stepDistanceValue,
            stepDistanceUnit,
            stepLabel,
          });
        }
      }

      if (allSplits.length > 0) {
        await splitDb.bulkInsertSplits(db, allSplits);
      }

      // Reset state
      setIsActive(false);
      setWorkoutId(null);
      setTimerStates(new Map());
      setGroupTimers(new Map());
      setDisplayTick(0);
      setStructuredSteps(null);
      setAthleteProgress(new Map());
      setTemplateId(null);
      setTemplateName(null);

      return workoutId;
    },
    [db, workoutId, timerStates, structuredSteps, templateId]
  );

  const discardWorkout = useCallback(() => {
    setIsActive(false);
    setWorkoutId(null);
    setTimerStates(new Map());
    setGroupTimers(new Map());
    setDisplayTick(0);
    setStructuredSteps(null);
    setAthleteProgress(new Map());
    setTemplateId(null);
    setTemplateName(null);
  }, []);

  const getGroupedTimers = useCallback((): GroupTimerBlock[] => {
    const resolveGroupTiming = (groupId: string | null, athletes: AthleteTimerState[]) => {
      const gt = groupTimers.get(groupKey(groupId));
      const startedCandidates = athletes
        .map((a) => a.startedAt)
        .filter((v): v is number => v !== null);
      const stoppedCandidates = athletes
        .map((a) => a.stoppedAt)
        .filter((v): v is number => v !== null);

      const groupStartedAt =
        gt?.startedAt ?? (startedCandidates.length > 0 ? Math.min(...startedCandidates) : null);

      let groupStoppedAt = gt?.stoppedAt ?? null;
      // Safety net: if nobody in the group is still running, freeze the timer.
      if (groupStartedAt !== null && groupStoppedAt === null) {
        const anyRunning = athletes.some((a) => a.status === 'running');
        if (!anyRunning && stoppedCandidates.length > 0) {
          groupStoppedAt = Math.max(...stoppedCandidates);
        }
      }

      return { groupStartedAt, groupStoppedAt };
    };

    const groupMap = new Map<string | null, AthleteTimerState[]>();

    for (const [, timer] of timerStates) {
      const key = timer.groupId;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(timer);
    }

    const blocks: GroupTimerBlock[] = [];
    // Named groups first
    for (const group of groupsRef.current) {
      const athletes = groupMap.get(group.id);
      if (athletes && athletes.length > 0) {
        const groupStatus = deriveGroupStatus(athletes);
        const timing = resolveGroupTiming(group.id, athletes);
        blocks.push({
          groupId: group.id,
          groupName: group.name,
          groupColor: group.color,
          athletes,
          groupStatus,
          groupStartedAt: timing.groupStartedAt,
          groupStoppedAt: timing.groupStoppedAt,
        });
      }
    }
    // Unassigned group last
    const unassigned = groupMap.get(null);
    if (unassigned && unassigned.length > 0) {
      const timing = resolveGroupTiming(null, unassigned);
      blocks.push({
        groupId: null,
        groupName: 'Unassigned',
        groupColor: Colors.textTertiary,
        athletes: unassigned,
        groupStatus: deriveGroupStatus(unassigned),
        groupStartedAt: timing.groupStartedAt,
        groupStoppedAt: timing.groupStoppedAt,
      });
    }

    return blocks;
  }, [timerStates, groupTimers, groupKey]);

  return (
    <WorkoutContext.Provider
      value={{
        isActive,
        workoutId,
        timerStates,
        displayTick,
        structuredSteps,
        athleteProgress,
        templateId,
        templateName,
        startWorkout,
        startGroup,
        stopGroup,
        lapGroup,
        startAthlete,
        stopAthlete,
        recordSplit,
        undoLastSplit,
        resetWorkout,
        saveWorkout,
        discardWorkout,
        getGroupedTimers,
        startStructuredWorkout,
        advanceStep,
        advanceGroup,
      }}
    >
      {children}
    </WorkoutContext.Provider>
  );
}

function deriveGroupStatus(athletes: AthleteTimerState[]): TimerStatus {
  const hasRunning = athletes.some((a) => a.status === 'running');
  if (hasRunning) return 'running';
  const hasIdle = athletes.some((a) => a.status === 'idle');
  if (hasIdle) return 'idle';
  return 'stopped';
}

export function useWorkout() {
  const ctx = useContext(WorkoutContext);
  if (!ctx) throw new Error('useWorkout must be used within WorkoutProvider');
  return ctx;
}
