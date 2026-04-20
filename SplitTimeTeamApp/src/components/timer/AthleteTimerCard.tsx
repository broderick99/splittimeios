import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { Colors } from '@/constants/colors';
import { formatTime } from '@/utils/format-time';
import RecoveryCountdown from './RecoveryCountdown';
import type { AthleteTimerState, AthleteWorkoutProgress, ExpandedStep } from '@/types';

interface AthleteTimerCardProps {
  timer: AthleteTimerState;
  displayTick: number;
  onStart: () => void;
  onStop: () => void;
  onSplit: () => void;
  onUndoLastSplit?: () => void;
  showTapHint?: boolean;
  // Structured workout props
  progress?: AthleteWorkoutProgress | null;
  currentStep?: ExpandedStep | null;
  onAdvance?: () => void;
}

function AthleteTimerCard({
  timer,
  displayTick,
  onStart,
  onStop,
  onSplit,
  onUndoLastSplit,
  showTapHint = true,
  progress,
  currentStep,
  onAdvance,
}: AthleteTimerCardProps) {
  const isRecoveryCountdown = progress?.stepStatus === 'recovery_countdown';
  const isRecoveryWaiting = progress?.stepStatus === 'recovery_waiting';
  const isStructuredCompleted = progress?.stepStatus === 'completed';

  const handleTap = useCallback(() => {
    // If recovery waiting, tap means "GO" (advance)
    if (isRecoveryWaiting && onAdvance) {
      onAdvance();
      return;
    }

    // Don't allow taps during recovery countdown
    if (isRecoveryCountdown) return;

    // No individual start — must use "Start Group"
    if (timer.status === 'idle') {
      return;
    }

    if (timer.status === 'running') {
      onSplit();
    }
  }, [timer.status, isRecoveryWaiting, isRecoveryCountdown, onSplit, onAdvance]);

  const getInitials = (name: string) => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  // Border color logic
  let borderColor = timer.groupColor || Colors.idle;
  if (isRecoveryCountdown) {
    borderColor = Colors.recovery;
  } else if (isRecoveryWaiting) {
    borderColor = Colors.success;
  } else if (timer.status === 'running') {
    borderColor = Colors.running;
  } else if (timer.status === 'stopped') {
    borderColor = Colors.stopped;
  }

  const lastSplit = timer.splits.length > 0 ? timer.splits[timer.splits.length - 1] : null;

  // Work splits only (exclude recovery-end markers)
  const workSplits = timer.splits.filter(s => !s.isRecoveryEnd);
  const lastWorkSplit = workSplits.length > 0 ? workSplits[workSplits.length - 1] : null;
  const workSplitCount = workSplits.filter(s => !s.isFinal).length;

  // Lap time of last work split
  const lastWorkLapMs = (() => {
    if (!lastWorkSplit || lastWorkSplit.isFinal) return 0;
    const idx = timer.splits.indexOf(lastWorkSplit);
    const prevElapsed = idx > 0 ? timer.splits[idx - 1].elapsedMs : 0;
    return lastWorkSplit.elapsedMs - prevElapsed;
  })();

  // Mini lap timer:
  // Show whenever there is a prior split marker and the athlete is in an active work phase.
  const showLapTimer =
    timer.status === 'running' &&
    lastSplit &&
    !lastSplit.isFinal &&
    !isRecoveryCountdown &&
    !isRecoveryWaiting;
  const lapElapsed = showLapTimer ? Date.now() - lastSplit.timestamp : 0;

  // Show previous lap time during recovery
  const showPrevLap = (isRecoveryCountdown || isRecoveryWaiting) && lastWorkLapMs > 0;

  // Recovery countdown remaining
  const recoveryRemainingMs =
    isRecoveryCountdown && progress?.recoveryStartedAt && currentStep?.durationMs
      ? Math.max(0, currentStep.durationMs - (Date.now() - progress.recoveryStartedAt))
      : 0;

  // Determine if card is fully done (stopped in freeform, or structured completed)
  const isDone = timer.status === 'stopped' || isStructuredCompleted;

  return (
    <Pressable
      onPress={handleTap}
      style={({ pressed }) => [
        styles.card,
        isDone && !isRecoveryCountdown && !isRecoveryWaiting && styles.cardStopped,
        isRecoveryCountdown && styles.cardRecovery,
        isRecoveryWaiting && styles.cardGoReady,
        pressed && !isDone && styles.cardPressed,
      ]}
    >
      {/* Mini lap timer — top-left corner */}
      {showLapTimer && (
        <View style={styles.lapTimerContainer}>
          <Text style={styles.lapTimerText}>{formatTime(lapElapsed)}</Text>
        </View>
      )}

      {/* Step label — top-right corner (structured workouts) */}
      {currentStep && progress && progress.stepStatus === 'active' && (
        <View style={styles.stepLabelContainer}>
          <Text style={styles.stepLabelText}>{currentStep.label}</Text>
          {currentStep.repeatIteration !== null && currentStep.repeatTotal !== null && (
            <Text style={styles.repText}>
              {currentStep.repeatIteration}/{currentStep.repeatTotal}
            </Text>
          )}
        </View>
      )}

      {/* Previous lap time — top-right during recovery */}
      {showPrevLap && (
        <View style={styles.prevLapContainer}>
          <Text style={styles.prevLapText}>{formatTime(lastWorkLapMs)}</Text>
        </View>
      )}

      {/* Photo */}
      {timer.photoUri ? (
        <Image
          source={{ uri: timer.photoUri }}
          style={[styles.photo, { borderColor }]}
        />
      ) : (
        <View
          style={[
            styles.photo,
            styles.photoPlaceholder,
            { borderColor, backgroundColor: (timer.groupColor || Colors.idle) + '20' },
          ]}
        >
          <Text style={[styles.initials, { color: timer.groupColor || Colors.idle }]}>
            {getInitials(timer.athleteName)}
          </Text>
        </View>
      )}

      {/* Name */}
      <Text style={styles.name} numberOfLines={1}>
        {timer.athleteName}
      </Text>

      {/* Recovery countdown overlay */}
      {isRecoveryCountdown && (
        <RecoveryCountdown remainingMs={recoveryRemainingMs} />
      )}

      {/* Recovery waiting — GO button */}
      {isRecoveryWaiting && (
        <View style={styles.goBadge}>
          <Text style={styles.goText}>GO</Text>
        </View>
      )}

      {/* Last split badge — shows lap time */}
      {!isRecoveryCountdown && !isRecoveryWaiting && lastWorkSplit && !lastWorkSplit.isFinal && (
        <View style={styles.splitBadge}>
          <Text style={styles.splitBadgeText}>
            S{workSplitCount}: {formatTime(lastWorkLapMs)}
          </Text>
        </View>
      )}

      {/* Final time for stopped athletes */}
      {timer.status === 'stopped' && lastSplit && lastSplit.isFinal && !isRecoveryCountdown && !isRecoveryWaiting && (
        <View style={styles.finalBadge}>
          <Text style={styles.finalBadgeText}>
            {formatTime(lastSplit.elapsedMs)}
          </Text>
        </View>
      )}

      {timer.status === 'stopped' && lastSplit && lastSplit.isFinal && workSplitCount > 0 && !isRecoveryCountdown && !isRecoveryWaiting && (
        <Text style={styles.doneLabel}>
          {workSplitCount} split{workSplitCount !== 1 ? 's' : ''}
        </Text>
      )}
      {timer.status === 'running' && (
        <Pressable
          onPress={(event) => {
            event.stopPropagation?.();
            onStop();
          }}
          hitSlop={6}
          style={({ pressed }) => [
            styles.stopButton,
            pressed && styles.stopButtonPressed,
          ]}
        >
          <Text style={styles.stopButtonText}>Stop</Text>
        </Pressable>
      )}
      {showTapHint && !isRecoveryCountdown && !isRecoveryWaiting && timer.status === 'running' && (
        <Text style={styles.tapHint}>tap = split</Text>
      )}
    </Pressable>
  );
}

export default React.memo(AthleteTimerCard, (prev, next) => {
  if (prev.timer !== next.timer) return false;
  if (prev.progress !== next.progress) return false;
  if (prev.currentStep !== next.currentStep) return false;
  // Re-render running cards with splits on every tick for the lap timer
  if (
    next.timer.status === 'running' &&
    next.timer.splits.length > 0 &&
    prev.displayTick !== next.displayTick
  ) {
    return false;
  }
  // Re-render during recovery countdown on every tick
  if (next.progress?.stepStatus === 'recovery_countdown' && prev.displayTick !== next.displayTick) {
    return false;
  }
  return true;
});

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 6,
    paddingHorizontal: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardStopped: {
    opacity: 0.6,
  },
  cardRecovery: {
    borderWidth: 2,
    borderColor: Colors.recovery,
    backgroundColor: Colors.recovery + '08',
  },
  cardGoReady: {
    borderWidth: 2,
    borderColor: Colors.success,
    backgroundColor: Colors.success + '08',
  },
  cardPressed: {
    backgroundColor: Colors.surfaceSecondary,
  },
  lapTimerContainer: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: Colors.running + '18',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  lapTimerText: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    color: Colors.running,
  },
  stepLabelContainer: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: Colors.primary + '15',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    alignItems: 'center',
  },
  stepLabelText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
  },
  repText: {
    fontSize: 9,
    fontWeight: '600',
    color: Colors.primary,
  },
  photo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
  },
  photoPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  initials: {
    fontSize: 24,
    fontWeight: '700',
  },
  name: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 4,
    textAlign: 'center',
  },
  splitBadge: {
    backgroundColor: Colors.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 4,
  },
  splitBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
    fontVariant: ['tabular-nums'],
  },
  finalBadge: {
    backgroundColor: Colors.stopped + '20',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginTop: 6,
  },
  finalBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  goBadge: {
    backgroundColor: Colors.success,
    paddingHorizontal: 16,
    paddingVertical: 5,
    borderRadius: 10,
    marginTop: 4,
  },
  goText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  doneLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.stopped,
    marginTop: 2,
  },
  stopButton: {
    marginTop: 6,
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: Colors.danger,
  },
  stopButtonPressed: {
    opacity: 0.88,
  },
  stopButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tapHint: {
    fontSize: 8,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  prevLapContainer: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: Colors.success + '18',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  prevLapText: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    color: Colors.success,
  },
});
