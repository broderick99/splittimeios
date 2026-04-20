import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import AthleteTimerCard from './AthleteTimerCard';
import { Colors } from '@/constants/colors';
import { formatTime } from '@/utils/format-time';
import type { GroupTimerBlock, AthleteWorkoutProgress, ExpandedStep } from '@/types';

interface GroupTimerSectionProps {
  block: GroupTimerBlock;
  groupElapsedMs: number;
  displayTick: number;
  enableAutoReorder?: boolean;
  showTapHints?: boolean;
  onStartGroup: () => void;
  onStopGroup: () => void;
  onLapGroup: () => void;
  onStartAthlete: (athleteId: string) => void;
  onStopAthlete: (athleteId: string) => void;
  onSplitAthlete: (athleteId: string) => void;
  onUndoLastSplit: (athleteId: string) => void;
  // Structured workout props (optional)
  athleteProgress?: Map<string, AthleteWorkoutProgress>;
  structuredSteps?: ExpandedStep[] | null;
  onAdvanceAthlete?: (athleteId: string) => void;
  onAdvanceGroup?: () => void;
}

export default function GroupTimerSection({
  block,
  groupElapsedMs,
  displayTick,
  enableAutoReorder = true,
  showTapHints = true,
  onStartGroup,
  onStopGroup,
  onLapGroup,
  onStartAthlete,
  onStopAthlete,
  onSplitAthlete,
  onUndoLastSplit,
  athleteProgress,
  structuredSteps,
  onAdvanceAthlete,
  onAdvanceGroup,
}: GroupTimerSectionProps) {
  const hasIdleAthletes = block.athletes.some((a) => a.status === 'idle');
  const hasRunningAthletes = block.athletes.some((a) => a.status === 'running');
  const isGroupRunning = block.groupStartedAt !== null && block.groupStoppedAt === null;

  // Check if any athlete in this group is in recovery (countdown or waiting)
  const hasRecoveryAthletes = athleteProgress
    ? block.athletes.some((a) => {
        const prog = athleteProgress.get(a.athleteId);
        return prog?.stepStatus === 'recovery_countdown' || prog?.stepStatus === 'recovery_waiting';
      })
    : false;

  // Check if ANY athlete in this group is waiting for next rep.
  const hasWaitingForNextRep = athleteProgress
    ? block.athletes.some((a) => {
        const prog = athleteProgress.get(a.athleteId);
        return prog?.stepStatus === 'recovery_waiting';
      })
    : false;

  // Auto-sort:
  // Queue-style ordering based on latest athlete action timestamp.
  // The athlete you just tapped/actioned moves to the bottom immediately.
  // As more athletes are tapped, earlier ones naturally filter back up.
  const sortedAthletes = useMemo(() => {
    if (!enableAutoReorder) {
      return block.athletes;
    }

    type AthleteItem = GroupTimerBlock['athletes'][number];
    const getLastActionTimestamp = (athlete: AthleteItem): number => {
      const lastSplit = athlete.splits.length > 0 ? athlete.splits[athlete.splits.length - 1] : null;
      if (lastSplit) return lastSplit.timestamp;
      return Number.NEGATIVE_INFINITY;
    };

    const getPhasePriority = (athlete: AthleteItem): number => {
      const progress = athleteProgress?.get(athlete.athleteId);
      // Keep fully completed/stopped athletes below active queue flow.
      if (progress?.stepStatus === 'completed' || athlete.status === 'stopped') return 1;
      return 0;
    };

    return [...block.athletes].sort((a, b) => {
      const pa = getPhasePriority(a);
      const pb = getPhasePriority(b);
      if (pa !== pb) return pa - pb;

      // Earlier action stays higher; newest action sinks to bottom.
      const tA = getLastActionTimestamp(a);
      const tB = getLastActionTimestamp(b);
      if (tA !== tB) return tA - tB;

      // Deterministic tie-breaker: alphabetical by athlete name.
      const nameCompare = a.athleteName.localeCompare(b.athleteName, undefined, {
        sensitivity: 'base',
      });
      if (nameCompare !== 0) return nameCompare;
      return a.athleteId.localeCompare(b.athleteId);
    });
  }, [athleteProgress, block.athletes, enableAutoReorder]);

  // Build 2x2 grid rows
  const rows: typeof block.athletes[] = [];
  for (let i = 0; i < sortedAthletes.length; i += 2) {
    rows.push(sortedAthletes.slice(i, i + 2));
  }

  return (
    <View style={styles.container}>
      {/* Per-group timer */}
      <View style={styles.timerContainer}>
        <Text
          style={[
            styles.timer,
            isGroupRunning && styles.timerRunning,
          ]}
        >
          {formatTime(groupElapsedMs)}
        </Text>
      </View>

      {/* Group action buttons */}
      <View style={styles.groupActions}>
        {hasIdleAthletes && (
          <Pressable style={[styles.groupBtn, { backgroundColor: Colors.success }]} onPress={onStartGroup}>
            <Text style={styles.groupBtnText}>Start Group</Text>
          </Pressable>
        )}
        {hasWaitingForNextRep && onAdvanceGroup && (
          <Pressable style={[styles.groupBtn, { backgroundColor: Colors.success }]} onPress={onAdvanceGroup}>
            <Text style={styles.groupBtnText}>Group GO</Text>
          </Pressable>
        )}
        {hasRunningAthletes && (
          <>
            {!hasRecoveryAthletes && (
              <Pressable style={[styles.groupBtn, { backgroundColor: Colors.primary }]} onPress={onLapGroup}>
                <Text style={styles.groupBtnText}>Lap Group</Text>
              </Pressable>
            )}
            <Pressable style={[styles.groupBtn, { backgroundColor: Colors.danger }]} onPress={onStopGroup}>
              <Text style={styles.groupBtnText}>Stop Group</Text>
            </Pressable>
          </>
        )}
      </View>

      {/* 2x2 Grid */}
      <View style={styles.grid}>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.gridRow}>
            {row.map((timer) => {
              const progress = athleteProgress?.get(timer.athleteId) ?? null;
              const currentStep =
                structuredSteps && progress
                  ? structuredSteps[progress.currentStepIndex] ?? null
                  : null;

              return (
                <AthleteTimerCard
                  key={timer.athleteId}
                  timer={timer}
                  displayTick={displayTick}
                  onStart={() => onStartAthlete(timer.athleteId)}
                  onStop={() => onStopAthlete(timer.athleteId)}
                  onSplit={() => onSplitAthlete(timer.athleteId)}
                  onUndoLastSplit={() => onUndoLastSplit(timer.athleteId)}
                  showTapHint={showTapHints}
                  progress={progress}
                  currentStep={currentStep}
                  onAdvance={
                    onAdvanceAthlete
                      ? () => onAdvanceAthlete(timer.athleteId)
                      : undefined
                  }
                />
              );
            })}
            {/* Spacer if odd number of athletes */}
            {row.length === 1 && <View style={styles.spacer} />}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  timerContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  timer: {
    fontSize: 52,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    color: Colors.text,
    letterSpacing: 1,
  },
  timerRunning: {
    color: Colors.running,
  },
  groupActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 4,
  },
  groupBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  groupBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  grid: {
    padding: 8,
    gap: 8,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 8,
  },
  spacer: {
    flex: 1,
  },
});
