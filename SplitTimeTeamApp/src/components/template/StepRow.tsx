import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';
import type { BuilderStep } from '@/types';
import { formatCountdown } from '@/utils/format-time';

interface StepRowProps {
  step: BuilderStep;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  nested?: boolean;
  /** When true, a drag gesture is active — suppress onPress */
  dragActive?: boolean;
  /** When true, don't render the internal drag-handle icon */
  hideDragHandle?: boolean;
  /** When false, render a plain View instead of Pressable (use when
   *  the row lives inside a GestureDetector that handles taps itself). */
  pressable?: boolean;
  onLongPress?: () => void;
  delayLongPress?: number;
}

function stepSummary(step: BuilderStep): string {
  if (step.type === 'work') {
    if (step.distanceValue !== null && step.distanceUnit !== null) {
      return `${step.distanceValue}${step.distanceUnit}`;
    }
    if (step.durationMs !== null) {
      return formatCountdown(step.durationMs);
    }
    return 'Work';
  } else {
    if (step.durationMs !== null) {
      return formatCountdown(step.durationMs);
    }
    if (step.distanceValue !== null && step.distanceUnit !== null) {
      return `${step.distanceValue}${step.distanceUnit}`;
    }
    return 'Recovery';
  }
}

export default function StepRow({
  step,
  onEdit,
  onDelete,
  onDuplicate,
  nested = false,
  dragActive = false,
  hideDragHandle = false,
  pressable = true,
  onLongPress,
  delayLongPress,
}: StepRowProps) {
  const isWork = step.type === 'work';
  const summary = stepSummary(step);

  // Track press timing: only fire onEdit for short taps, not after a long press
  const pressStartRef = useRef(0);

  const handlePressIn = useCallback(() => {
    pressStartRef.current = Date.now();
  }, []);

  const handlePress = useCallback(() => {
    // If drag was active, suppress the edit
    if (dragActive) return;
    // If the press lasted longer than 250ms, it was a long press (drag attempt), suppress edit
    const elapsed = Date.now() - pressStartRef.current;
    if (elapsed > 250) return;
    onEdit();
  }, [dragActive, onEdit]);

  const showDragHandle = !nested && !hideDragHandle;

  const content = (
    <>
      <View style={[styles.typeIndicator, isWork ? styles.workIndicator : styles.recoveryIndicator]} />
      <View style={styles.content}>
        <Text style={styles.typeLabel}>{isWork ? 'Work' : 'Recovery'}</Text>
        <Text style={styles.summary}>{step.label || summary}</Text>
      </View>
      <Text style={styles.value}>{summary}</Text>
      {showDragHandle && (
        <View style={styles.dragHandle}>
          <FontAwesome name="bars" size={14} color={Colors.textTertiary} />
        </View>
      )}
      {!nested && onDuplicate && (
        <Pressable onPress={onDuplicate} hitSlop={12} style={styles.iconBtn}>
          <FontAwesome name="copy" size={14} color={Colors.textTertiary} />
        </Pressable>
      )}
      <Pressable onPress={onDelete} hitSlop={12} style={styles.deleteBtn}>
        <FontAwesome name="times" size={16} color={Colors.textTertiary} />
      </Pressable>
    </>
  );

  if (!pressable) {
    return (
      <View style={[styles.container, nested && styles.nested]}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      style={[styles.container, nested && styles.nested]}
      onPressIn={handlePressIn}
      onPress={handlePress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: Layout.padding,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    gap: 10,
  },
  nested: {
    paddingLeft: 40,
    backgroundColor: Colors.surfaceSecondary,
  },
  typeIndicator: {
    width: 4,
    height: 28,
    borderRadius: 2,
  },
  workIndicator: {
    backgroundColor: Colors.primary,
  },
  recoveryIndicator: {
    backgroundColor: Colors.recovery,
  },
  content: {
    flex: 1,
  },
  typeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summary: {
    fontSize: Layout.fontSize,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 1,
  },
  value: {
    fontSize: Layout.fontSizeSmall,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  dragHandle: {
    padding: 6,
  },
  iconBtn: {
    padding: 4,
  },
  deleteBtn: {
    padding: 4,
  },
});
