import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { formatTime } from '@/utils/format-time';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';
import type { Split } from '@/types';

interface SplitTableProps {
  splits: Split[];
}

export default function SplitTable({ splits }: SplitTableProps) {
  if (splits.length === 0) {
    return <Text style={styles.noSplits}>No splits recorded</Text>;
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.row}>
        <Text style={[styles.cell, styles.headerCell, styles.labelCol]}>#</Text>
        <Text style={[styles.cell, styles.headerCell, styles.timeCol]}>Split Time</Text>
        <Text style={[styles.cell, styles.headerCell, styles.timeCol]}>Lap Time</Text>
      </View>

      {/* Rows */}
      {splits.map((split, index) => {
        const prevElapsed = index > 0 ? splits[index - 1].elapsedMs : 0;
        const lapTime = split.elapsedMs - prevElapsed;

        return (
          <View
            key={split.id}
            style={[styles.row, split.isFinal && styles.finalRow]}
          >
            <Text style={[styles.cell, styles.labelCol, split.isFinal && styles.finalText]}>
              {split.isFinal ? 'Final' : `S${split.splitNumber}`}
            </Text>
            <Text style={[styles.cell, styles.timeCol, styles.timeText, split.isFinal && styles.finalText]}>
              {formatTime(split.elapsedMs)}
            </Text>
            <Text style={[styles.cell, styles.timeCol, styles.timeText, split.isFinal && styles.finalText]}>
              {formatTime(lapTime)}
            </Text>
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
    width: 50,
    fontWeight: '600',
  },
  timeCol: {
    flex: 1,
    textAlign: 'right',
  },
  timeText: {
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  finalText: {
    color: Colors.primary,
    fontWeight: '700',
  },
  noSplits: {
    fontSize: Layout.fontSizeSmall,
    color: Colors.textTertiary,
    fontStyle: 'italic',
    padding: 8,
  },
});
