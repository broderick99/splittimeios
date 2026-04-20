import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { formatCountdown } from '@/utils/format-time';

interface RecoveryCountdownProps {
  remainingMs: number;
}

export default function RecoveryCountdown({ remainingMs }: RecoveryCountdownProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>RECOVERY</Text>
      <Text style={styles.countdown}>{formatCountdown(remainingMs)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  label: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.recovery,
    letterSpacing: 1,
  },
  countdown: {
    fontSize: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    color: Colors.recovery,
  },
});
