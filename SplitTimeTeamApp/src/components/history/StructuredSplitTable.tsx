import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { formatTime } from '@/utils/format-time';
import { calculatePace, formatPace, paceUnitLabel } from '@/utils/pace';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';
import type { Split, DistanceUnit } from '@/types';

interface StructuredSplitTableProps {
  splits: Split[];
}

export default function StructuredSplitTable({ splits }: StructuredSplitTableProps) {
  if (splits.length === 0) {
    return <Text style={styles.noSplits}>No splits recorded</Text>;
  }

  // Check if any split has distance data
  const hasDistance = splits.some((s) => s.stepDistanceValue !== null);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.row}>
        <Text style={[styles.cell, styles.headerCell, styles.labelCol]}>
          Step
        </Text>
        <Text style={[styles.cell, styles.headerCell, styles.timeCol]}>Split</Text>
        <Text style={[styles.cell, styles.headerCell, styles.timeCol]}>Lap</Text>
        {hasDistance && (
          <Text style={[styles.cell, styles.headerCell, styles.paceCol]}>Pace</Text>
        )}
      </View>

      {/* Rows */}
      {splits.map((split, index) => {
        const prevElapsed = index > 0 ? splits[index - 1].elapsedMs : 0;
        const lapTime = split.elapsedMs - prevElapsed;

        // Calculate pace if distance data is available
        let paceStr = '';
        if (split.stepDistanceValue && split.stepDistanceUnit) {
          const paceMinutes = calculatePace(
            lapTime,
            split.stepDistanceValue,
            split.stepDistanceUnit as DistanceUnit,
            'mi'
          );
          paceStr = formatPace(paceMinutes) + paceUnitLabel('mi');
        }

        const label = split.isFinal ? 'Final' : (split.stepLabel || `S${split.splitNumber}`);
        const isRecovery = split.stepType === 'recovery';

        return (
          <View
            key={split.id}
            style={[
              styles.row,
              split.isFinal && styles.finalRow,
              isRecovery && styles.recoveryRow,
            ]}
          >
            <Text
              style={[
                styles.cell,
                styles.labelCol,
                split.isFinal && styles.finalText,
                isRecovery && styles.recoveryText,
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
            <Text
              style={[
                styles.cell,
                styles.timeCol,
                styles.timeText,
                split.isFinal && styles.finalText,
              ]}
            >
              {formatTime(split.elapsedMs)}
            </Text>
            <Text
              style={[
                styles.cell,
                styles.timeCol,
                styles.timeText,
                split.isFinal && styles.finalText,
              ]}
            >
              {formatTime(lapTime)}
            </Text>
            {hasDistance && (
              <Text
                style={[
                  styles.cell,
                  styles.paceCol,
                  styles.paceText,
                  split.isFinal && styles.finalText,
                ]}
              >
                {paceStr || '--'}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Layout.borderRadiusSmall,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  finalRow: {
    backgroundColor: Colors.primary + '10',
  },
  recoveryRow: {
    backgroundColor: Colors.recovery + '08',
  },
  cell: {
    fontSize: Layout.fontSizeSmall,
    color: Colors.text,
  },
  headerCell: {
    fontWeight: '700',
    color: Colors.textSecondary,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  labelCol: {
    width: 72,
    fontWeight: '600',
  },
  timeCol: {
    flex: 1,
    textAlign: 'right',
  },
  paceCol: {
    width: 75,
    textAlign: 'right',
  },
  timeText: {
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  paceText: {
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    color: Colors.primary,
  },
  finalText: {
    color: Colors.primary,
    fontWeight: '700',
  },
  recoveryText: {
    color: Colors.recovery,
    fontStyle: 'italic',
  },
  noSplits: {
    fontSize: Layout.fontSizeSmall,
    color: Colors.textTertiary,
    fontStyle: 'italic',
    padding: 8,
  },
});
