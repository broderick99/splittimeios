import React from 'react';
import { View, StyleSheet } from 'react-native';
import BigButton from '@/components/ui/BigButton';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';

interface WorkoutControlsProps {
  hasIdleAthletes: boolean;
  hasRunningAthletes: boolean;
  hasStoppedAthletes: boolean;
  onStartAll: () => void;
  onStopAll: () => void;
  onSave: () => void;
  onDiscard: () => void;
}

export default function WorkoutControls({
  hasIdleAthletes,
  hasRunningAthletes,
  hasStoppedAthletes,
  onStartAll,
  onStopAll,
  onSave,
  onDiscard,
}: WorkoutControlsProps) {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {hasIdleAthletes && (
          <BigButton
            title="Start All"
            onPress={onStartAll}
            variant="success"
            size="large"
            style={styles.flex}
          />
        )}
        {hasRunningAthletes && (
          <BigButton
            title="Stop All"
            onPress={onStopAll}
            variant="danger"
            size="large"
            style={styles.flex}
          />
        )}
      </View>
      <View style={styles.row}>
        <BigButton
          title="Save"
          onPress={onSave}
          variant="primary"
          disabled={!hasStoppedAthletes}
          style={styles.flex}
        />
        <BigButton
          title="Discard"
          onPress={onDiscard}
          variant="ghost"
          style={styles.flex}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Layout.padding,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  flex: {
    flex: 1,
  },
});
