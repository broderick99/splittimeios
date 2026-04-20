import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';
import type { WorkoutSummary } from '@/types';

interface WorkoutListItemProps {
  workout: WorkoutSummary;
  onPress: () => void;
  onDelete: () => void;
}

export default function WorkoutListItem({ workout, onPress, onDelete }: WorkoutListItemProps) {
  const dateStr = new Date(workout.date).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timeStr = new Date(workout.date).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={onPress}
    >
      <View style={styles.left}>
        <Text style={styles.name}>{workout.name || 'Untitled Workout'}</Text>
        <Text style={styles.date}>
          {dateStr} at {timeStr}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.count}>
          {workout.athleteCount} athlete{workout.athleteCount !== 1 ? 's' : ''}
        </Text>
        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          hitSlop={12}
          style={styles.iconButton}
        >
          <FontAwesome name="trash-o" size={20} color={Colors.danger} />
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: Layout.padding,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  pressed: {
    backgroundColor: Colors.surfaceSecondary,
  },
  left: {
    flex: 1,
    paddingRight: 12,
  },
  name: {
    fontSize: Layout.fontSize,
    fontWeight: '600',
    color: Colors.text,
  },
  date: {
    fontSize: Layout.fontSizeSmall,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  count: {
    fontSize: Layout.fontSizeSmall,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  right: {
    alignItems: 'flex-end',
    gap: 10,
  },
  iconButton: {
    paddingLeft: 8,
    paddingVertical: 4,
  },
});
