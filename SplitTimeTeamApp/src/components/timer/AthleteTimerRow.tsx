import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { Colors } from '@/constants/colors';
import { formatTime, formatCountdown } from '@/utils/format-time';
import type { AthleteTimerState, AthleteWorkoutProgress, ExpandedStep } from '@/types';

interface AthleteTimerRowProps {
  timer: AthleteTimerState;
  displayTick: number;
  onStart: () => void;
  onStop: () => void;
  onSplit: () => void;
  onUndoLastSplit?: () => void;
  progress?: AthleteWorkoutProgress | null;
  currentStep?: ExpandedStep | null;
  onAdvance?: () => void;
}

const DOUBLE_TAP_DELAY = 300;

function AthleteTimerRow({
  timer,
  displayTick,
  onStart,
  onStop,
  onSplit,
  onUndoLastSplit,
  progress,
  currentStep,
  onAdvance,
}: AthleteTimerRowProps) {
  const lastTapRef = useRef(0);

  const isRecoveryCountdown = progress?.stepStatus === 'recovery_countdown';
  const isRecoveryWaiting = progress?.stepStatus === 'recovery_waiting';
  const isStructuredCompleted = progress?.stepStatus === 'completed';

  const handleTap = useCallback(() => {
    if (isRecoveryWaiting && onAdvance) {
      onAdvance();
      return;
    }
    if (isRecoveryCountdown) return;

    const now = Date.now();
    const timeSinceLastTap = now - lastTapRef.current;
    lastTapRef.current = now;

    if (timer.status === 'idle') return;

    if (timer.status === 'running') {
      if (timeSinceLastTap < DOUBLE_TAP_DELAY) {
        onUndoLastSplit?.();
        onStop();
      } else {
        onSplit();
      }
    }
  }, [timer.status, isRecoveryWaiting, isRecoveryCountdown, onStop, onSplit, onUndoLastSplit, onAdvance]);

  const getInitials = (name: string) => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  // Border color logic (same as AthleteTimerCard)
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
  const workSplits = timer.splits.filter(s => !s.isRecoveryEnd);
  const lastWorkSplit = workSplits.length > 0 ? workSplits[workSplits.length - 1] : null;
  const workSplitCount = workSplits.filter(s => !s.isFinal).length;

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

  // Recovery countdown remaining
  const recoveryRemainingMs =
    isRecoveryCountdown && progress?.recoveryStartedAt && currentStep?.durationMs
      ? Math.max(0, currentStep.durationMs - (Date.now() - progress.recoveryStartedAt))
      : 0;

  const isDone = timer.status === 'stopped' || isStructuredCompleted;

  // Right-side content
  const renderRight = () => {
    if (isRecoveryCountdown) {
      return (
        <View style={styles.rightSection}>
          {lastWorkLapMs > 0 && (
            <Text style={styles.prevLapInline}>{formatTime(lastWorkLapMs)}</Text>
          )}
          <Text style={styles.recoveryText}>{formatCountdown(recoveryRemainingMs)}</Text>
        </View>
      );
    }

    if (isRecoveryWaiting) {
      return (
        <View style={styles.rightSection}>
          {lastWorkLapMs > 0 && (
            <Text style={styles.prevLapInline}>{formatTime(lastWorkLapMs)}</Text>
          )}
          <View style={styles.goBadge}>
            <Text style={styles.goText}>GO</Text>
          </View>
        </View>
      );
    }

    if (timer.status === 'stopped' && lastSplit?.isFinal) {
      return (
        <View style={styles.rightSection}>
          <Text style={styles.finalTime}>{formatTime(lastSplit.elapsedMs)}</Text>
          {workSplitCount > 0 && (
            <Text style={styles.splitCount}>
              {workSplitCount} split{workSplitCount !== 1 ? 's' : ''}
            </Text>
          )}
        </View>
      );
    }

    if (timer.status === 'running' && lastWorkSplit && !lastWorkSplit.isFinal) {
      return (
        <View style={styles.rightSection}>
          <Text style={styles.splitBadgeText}>
            S{workSplitCount}: {formatTime(lastWorkLapMs)}
          </Text>
          {showLapTimer && (
            <Text style={styles.lapTimerText}>{formatTime(lapElapsed)}</Text>
          )}
        </View>
      );
    }

    return null;
  };

  return (
    <Pressable
      onPress={handleTap}
      style={({ pressed }) => [
        styles.row,
        isDone && !isRecoveryCountdown && !isRecoveryWaiting && styles.rowStopped,
        isRecoveryCountdown && styles.rowRecovery,
        isRecoveryWaiting && styles.rowGoReady,
        pressed && !isDone && styles.rowPressed,
      ]}
    >
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

      {/* Name + step label */}
      <View style={styles.nameSection}>
        <Text style={styles.name} numberOfLines={1}>{timer.athleteName}</Text>
        {currentStep && progress?.stepStatus === 'active' && (
          <Text style={styles.stepLabel} numberOfLines={1}>
            {currentStep.label}
            {currentStep.repeatIteration !== null && currentStep.repeatTotal !== null
              ? ` ${currentStep.repeatIteration}/${currentStep.repeatTotal}`
              : ''}
          </Text>
        )}
      </View>

      {/* Right side: status-dependent content */}
      {renderRight()}
    </Pressable>
  );
}

export default React.memo(AthleteTimerRow, (prev, next) => {
  if (prev.timer !== next.timer) return false;
  if (prev.progress !== next.progress) return false;
  if (prev.currentStep !== next.currentStep) return false;
  if (
    next.timer.status === 'running' &&
    next.timer.splits.length > 0 &&
    prev.displayTick !== next.displayTick
  ) {
    return false;
  }
  if (next.progress?.stepStatus === 'recovery_countdown' && prev.displayTick !== next.displayTick) {
    return false;
  }
  return true;
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    gap: 10,
  },
  rowStopped: {
    opacity: 0.6,
  },
  rowRecovery: {
    backgroundColor: Colors.recovery + '08',
    borderLeftWidth: 3,
    borderLeftColor: Colors.recovery,
  },
  rowGoReady: {
    backgroundColor: Colors.success + '08',
    borderLeftWidth: 3,
    borderLeftColor: Colors.success,
  },
  rowPressed: {
    backgroundColor: Colors.surfaceSecondary,
  },
  photo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
  },
  photoPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  initials: {
    fontSize: 13,
    fontWeight: '700',
  },
  nameSection: {
    flex: 1,
    justifyContent: 'center',
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  stepLabel: {
    fontSize: 11,
    color: Colors.primary,
    fontWeight: '600',
    marginTop: 1,
  },
  rightSection: {
    alignItems: 'flex-end',
    gap: 2,
  },
  splitBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
    fontVariant: ['tabular-nums'],
  },
  lapTimerText: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    color: Colors.running,
  },
  prevLapInline: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    color: Colors.success,
  },
  recoveryText: {
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    color: Colors.recovery,
  },
  goBadge: {
    backgroundColor: Colors.success,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 8,
  },
  goText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  finalTime: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  splitCount: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.stopped,
  },
});
