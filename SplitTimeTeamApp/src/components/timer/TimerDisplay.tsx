import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { formatTime } from '@/utils/format-time';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';
import type { TimerStatus } from '@/types';

interface TimerDisplayProps {
  elapsedMs: number;
  status: TimerStatus;
  size?: 'normal' | 'large';
}

function TimerDisplay({ elapsedMs, status, size = 'normal' }: TimerDisplayProps) {
  const color =
    status === 'running'
      ? Colors.running
      : status === 'stopped'
        ? Colors.text
        : Colors.idle;

  return (
    <Text
      style={[
        styles.timer,
        {
          color,
          fontSize: size === 'large' ? Layout.timerFontSizeLarge : Layout.timerFontSize,
        },
      ]}
    >
      {formatTime(elapsedMs)}
    </Text>
  );
}

export default React.memo(TimerDisplay);

const styles = StyleSheet.create({
  timer: {
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
