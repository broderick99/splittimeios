import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';
import type { BuilderRepeatGroup, BuilderStep } from '@/types';
import StepRow from './StepRow';

interface RepeatGroupRowProps {
  group: BuilderRepeatGroup;
  onIncrement: () => void;
  onDecrement: () => void;
  onEditStep: (stepIndex: number) => void;
  onDeleteStep: (stepIndex: number) => void;
  onAddStep: () => void;
  onMoveStep: (fromStepIndex: number, toStepIndex: number) => void;
  onDeleteGroup: () => void;
  onDuplicateGroup?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  onDragActiveChange?: (active: boolean) => void;
}

type StepRowItem = {
  id: string;
  step: BuilderStep;
};

export default function RepeatGroupRow({
  group,
  onIncrement,
  onDecrement,
  onEditStep,
  onDeleteStep,
  onAddStep,
  onMoveStep,
  onDeleteGroup,
  onDuplicateGroup,
  onDragActiveChange,
}: RepeatGroupRowProps) {
  const rows = useMemo<StepRowItem[]>(
    () => group.steps.map((step) => ({ id: step.id, step })),
    [group.steps]
  );

  const stepIndexById = useMemo(() => {
    const map = new Map<string, number>();
    group.steps.forEach((step, idx) => {
      map.set(step.id, idx);
    });
    return map;
  }, [group.steps]);

  const handleDragEnd = useCallback(
    ({ from, to }: { from: number; to: number }) => {
      onDragActiveChange?.(false);
      if (from !== to) onMoveStep(from, to);
    },
    [onDragActiveChange, onMoveStep]
  );

  const renderStepItem = useCallback(
    ({ item: row, drag, isActive }: RenderItemParams<StepRowItem>) => {
      const stepIndex = stepIndexById.get(row.id);
      if (stepIndex === undefined) return null;

      return (
        <ScaleDecorator>
          <View style={[styles.nestedStepWrapper, isActive && styles.dragging]}>
            <View style={styles.nestedStepContent}>
              <StepRow
                step={row.step}
                onEdit={() => onEditStep(stepIndex)}
                onDelete={() => onDeleteStep(stepIndex)}
                nested
                dragActive={isActive}
                onLongPress={drag}
                delayLongPress={160}
              />
            </View>
          </View>
        </ScaleDecorator>
      );
    },
    [onDeleteStep, onEditStep, stepIndexById]
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.repeatBadge}>
          <FontAwesome name="repeat" size={12} color={Colors.primary} />
          <Text style={styles.repeatText}>{group.repeatCount}x</Text>
        </View>
        <View style={styles.stepper}>
          <Pressable
            onPress={onDecrement}
            disabled={group.repeatCount <= 1}
            style={[styles.stepperBtn, group.repeatCount <= 1 && styles.stepperBtnDisabled]}
            hitSlop={8}
          >
            <FontAwesome
              name="minus"
              size={12}
              color={group.repeatCount <= 1 ? Colors.textTertiary : Colors.text}
            />
          </Pressable>
          <Text style={styles.stepperValue}>{group.repeatCount}</Text>
          <Pressable onPress={onIncrement} style={styles.stepperBtn} hitSlop={8}>
            <FontAwesome name="plus" size={12} color={Colors.text} />
          </Pressable>
        </View>
        <Pressable onPress={onDeleteGroup} hitSlop={12} style={styles.deleteBtn}>
          <FontAwesome name="trash-o" size={16} color={Colors.danger} />
        </Pressable>
        {onDuplicateGroup && (
          <Pressable onPress={onDuplicateGroup} hitSlop={12} style={styles.duplicateBtn}>
            <FontAwesome name="copy" size={15} color={Colors.textSecondary} />
          </Pressable>
        )}
      </View>

      <DraggableFlatList
        data={rows}
        keyExtractor={(row) => row.id}
        renderItem={renderStepItem}
        onDragBegin={() => onDragActiveChange?.(true)}
        onRelease={() => onDragActiveChange?.(false)}
        onDragEnd={handleDragEnd}
        scrollEnabled={false}
        activationDistance={4}
        autoscrollThreshold={36}
        autoscrollSpeed={110}
        animationConfig={{ damping: 24, mass: 0.2, stiffness: 250 }}
        contentContainerStyle={styles.nestedListContent}
      />

      <Pressable onPress={onAddStep} style={styles.addStepBtn}>
        <FontAwesome name="plus" size={12} color={Colors.primary} />
        <Text style={styles.addStepText}>Add Step</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 2,
    borderTopLeftRadius: Layout.borderRadiusSmall,
    borderBottomLeftRadius: Layout.borderRadiusSmall,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceSecondary,
  },
  dragging: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingLeft: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    gap: 12,
  },
  repeatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  repeatText: {
    fontSize: Layout.fontSizeLarge,
    fontWeight: '800',
    color: Colors.primary,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: Layout.borderRadiusSmall,
    paddingHorizontal: 4,
    paddingVertical: 4,
    gap: 8,
    flex: 1,
    justifyContent: 'center',
  },
  stepperBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperBtnDisabled: {
    opacity: 0.4,
  },
  stepperValue: {
    fontSize: Layout.fontSize,
    fontWeight: '700',
    color: Colors.text,
    minWidth: 24,
    textAlign: 'center',
  },
  deleteBtn: {
    padding: 4,
  },
  duplicateBtn: {
    padding: 4,
  },
  nestedListContent: {
    paddingBottom: 1,
  },
  nestedStepWrapper: {
    alignItems: 'stretch',
  },
  nestedStepContent: {
    flex: 1,
  },
  addStepBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  addStepText: {
    fontSize: Layout.fontSizeSmall,
    fontWeight: '600',
    color: Colors.primary,
  },
});
