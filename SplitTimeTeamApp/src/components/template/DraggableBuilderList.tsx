import React, { useCallback, useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';
import type { BuilderItem } from '@/types';
import StepRow from './StepRow';
import RepeatGroupRow from './RepeatGroupRow';

interface DraggableBuilderListProps {
  items: BuilderItem[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  onEditTopStep: (itemIndex: number) => void;
  onDeleteTopItem: (itemIndex: number) => void;
  onDuplicateTopStep: (itemIndex: number) => void;
  onEditGroupStep: (itemIndex: number, stepIndex: number) => void;
  onDeleteGroupStep: (itemIndex: number, stepIndex: number) => void;
  onAddGroupStep: (itemIndex: number) => void;
  onMoveGroupStep: (itemIndex: number, fromStepIndex: number, toStepIndex: number) => void;
  onIncrement: (itemIndex: number) => void;
  onDecrement: (itemIndex: number) => void;
  onDeleteGroup: (itemIndex: number) => void;
  onDuplicateGroup: (itemIndex: number) => void;
  onDragActiveChange?: (active: boolean) => void;
}

type TopRow = {
  id: string;
  item: BuilderItem;
};

function getItemId(item: BuilderItem): string {
  return item.kind === 'step' ? item.step.id : item.group.id;
}

export default function DraggableBuilderList({
  items,
  onReorder,
  onEditTopStep,
  onDeleteTopItem,
  onDuplicateTopStep,
  onEditGroupStep,
  onDeleteGroupStep,
  onAddGroupStep,
  onMoveGroupStep,
  onIncrement,
  onDecrement,
  onDeleteGroup,
  onDuplicateGroup,
  onDragActiveChange,
}: DraggableBuilderListProps) {
  const rows = useMemo<TopRow[]>(
    () => items.map((item) => ({ id: getItemId(item), item })),
    [items]
  );

  const indexById = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((item, idx) => {
      map.set(getItemId(item), idx);
    });
    return map;
  }, [items]);

  const handleDragEnd = useCallback(
    ({ from, to }: { from: number; to: number }) => {
      onDragActiveChange?.(false);
      if (from !== to) onReorder(from, to);
    },
    [onDragActiveChange, onReorder]
  );

  const renderItem = useCallback(
    ({ item: row, drag, isActive }: RenderItemParams<TopRow>) => {
      const itemIndex = indexById.get(row.id);
      if (itemIndex === undefined) return null;

      if (row.item.kind === 'step') {
        return (
          <ScaleDecorator>
            <View style={[styles.stepWrapper, isActive && styles.dragging]}>
              <StepRow
                step={row.item.step}
                onEdit={() => onEditTopStep(itemIndex)}
                onDelete={() => onDeleteTopItem(itemIndex)}
                onDuplicate={() => onDuplicateTopStep(itemIndex)}
                isFirst={itemIndex === 0}
                isLast={itemIndex === items.length - 1}
                dragActive={isActive}
                hideDragHandle
                onLongPress={drag}
                delayLongPress={180}
              />
            </View>
          </ScaleDecorator>
        );
      }

      return (
        <ScaleDecorator>
          <View style={[styles.repeatWrapper, isActive && styles.dragging]}>
            <View style={styles.repeatContent}>
              <RepeatGroupRow
                group={row.item.group}
                onIncrement={() => onIncrement(itemIndex)}
                onDecrement={() => onDecrement(itemIndex)}
                onEditStep={(stepIndex) => onEditGroupStep(itemIndex, stepIndex)}
                onDeleteStep={(stepIndex) => onDeleteGroupStep(itemIndex, stepIndex)}
                onAddStep={() => onAddGroupStep(itemIndex)}
                onMoveStep={(fromStepIndex, toStepIndex) =>
                  onMoveGroupStep(itemIndex, fromStepIndex, toStepIndex)
                }
                onDeleteGroup={() => onDeleteGroup(itemIndex)}
                onDuplicateGroup={() => onDuplicateGroup(itemIndex)}
                isFirst={itemIndex === 0}
                isLast={itemIndex === items.length - 1}
                onDragActiveChange={onDragActiveChange}
              />
            </View>
            <Pressable
              style={styles.repeatDragBorder}
              onLongPress={drag}
              delayLongPress={180}
              hitSlop={10}
            >
              <View style={styles.borderGripDots}>
                <View style={styles.gripDot} />
                <View style={styles.gripDot} />
                <View style={styles.gripDot} />
              </View>
            </Pressable>
          </View>
        </ScaleDecorator>
      );
    },
    [
      indexById,
      items.length,
      onAddGroupStep,
      onDecrement,
      onDeleteGroup,
      onDeleteGroupStep,
      onDeleteTopItem,
      onDuplicateTopStep,
      onDragActiveChange,
      onEditGroupStep,
      onEditTopStep,
      onIncrement,
      onMoveGroupStep,
      onDuplicateGroup,
    ]
  );

  return (
    <DraggableFlatList
      data={rows}
      keyExtractor={(row) => row.id}
      renderItem={renderItem}
      onDragBegin={() => onDragActiveChange?.(true)}
      onRelease={() => onDragActiveChange?.(false)}
      onDragEnd={handleDragEnd}
      scrollEnabled={false}
      activationDistance={4}
      autoscrollThreshold={60}
      autoscrollSpeed={140}
      animationConfig={{ damping: 24, mass: 0.2, stiffness: 260 }}
      containerStyle={styles.container}
      contentContainerStyle={styles.contentContainer}
    />
  );
}

const styles = StyleSheet.create({
  container: {},
  contentContainer: {
    paddingBottom: 4,
  },
  dragging: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
    borderRadius: Layout.borderRadiusSmall,
    overflow: 'hidden',
  },
  stepWrapper: {
    alignItems: 'stretch',
  },
  repeatWrapper: {
    flexDirection: 'row',
    marginLeft: Layout.padding,
    marginRight: Layout.padding,
    marginTop: 8,
  },
  repeatDragBorder: {
    width: 32,
    backgroundColor: Colors.primary,
    borderTopRightRadius: Layout.borderRadiusSmall,
    borderBottomRightRadius: Layout.borderRadiusSmall,
    justifyContent: 'center',
    alignItems: 'center',
  },
  borderGripDots: {
    gap: 4,
  },
  gripDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  repeatContent: {
    flex: 1,
  },
});
