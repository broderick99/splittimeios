import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDatabase } from '@/context/DatabaseContext';
import { getWorkout, getWorkoutAthletes } from '@/db/workouts';
import { getSplitsForWorkout } from '@/db/splits';
import SplitTable from '@/components/history/SplitTable';
import StructuredSplitTable from '@/components/history/StructuredSplitTable';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';
import { formatTime } from '@/utils/format-time';
import { shareDetailedSplitPdf } from '@/utils/share-pdf';
import type { Split, Workout, WorkoutAthlete } from '@/types';

export default function AthleteWorkoutDetailScreen() {
  const { id, workoutId } = useLocalSearchParams<{ id: string; workoutId: string }>();
  const navigation = useNavigation();
  const db = useDatabase();

  const [workout, setWorkout] = useState<Workout | null>(null);
  const [workoutAthlete, setWorkoutAthlete] = useState<WorkoutAthlete | null>(null);
  const [splits, setSplits] = useState<Split[]>([]);

  useEffect(() => {
    if (!id || !workoutId) return;
    (async () => {
      const [w, athleteSnapshots, allSplits] = await Promise.all([
        getWorkout(db, workoutId),
        getWorkoutAthletes(db, workoutId),
        getSplitsForWorkout(db, workoutId),
      ]);
      setWorkout(w);
      setWorkoutAthlete(athleteSnapshots.find((a) => a.athleteId === id) ?? null);
      setSplits(allSplits.filter((s) => s.athleteId === id));
    })();
  }, [db, id, workoutId]);

  const finalSplit = useMemo(() => splits.find((s) => s.isFinal) ?? null, [splits]);
  const splitCount = useMemo(() => splits.filter((s) => !s.isFinal).length, [splits]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: workoutAthlete ? `${workoutAthlete.athleteName} Splits` : 'Athlete Splits',
      headerRight: () => (
        <Pressable
          onPress={async () => {
            if (!workoutAthlete || !workout) return;
            await shareDetailedSplitPdf({
              workoutDate: workout.date,
              workoutName: workout.name || 'Untitled Workout',
              splits,
              getAthleteName: () => workoutAthlete.athleteName,
              getGroupName: () => workoutAthlete.groupName ?? '',
              fileNameBase: `${workoutAthlete.athleteName} ${workout.name || 'workout'} export`,
              dialogTitle: `${workoutAthlete.athleteName} Export`,
            });
          }}
          style={{ paddingHorizontal: 8 }}
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.primary }}>Export</Text>
        </Pressable>
      ),
    });
  }, [navigation, workoutAthlete, workout, splits]);

  if (!workout || !workoutAthlete) {
    return (
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
        <Text style={styles.emptyText}>Workout details unavailable for this athlete.</Text>
      </SafeAreaView>
    );
  }

  const dateStr = new Date(workout.date).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const timeStr = new Date(workout.date).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>{workoutAthlete.athleteName}</Text>
          <Text style={styles.workoutName}>{workout.name || 'Untitled Workout'}</Text>
          <Text style={styles.date}>
            {dateStr} at {timeStr}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>{splitCount} split{splitCount !== 1 ? 's' : ''}</Text>
            <Text style={styles.metaDot}>•</Text>
            <Text style={styles.meta}>
              Final: {finalSplit ? formatTime(finalSplit.elapsedMs) : '--'}
            </Text>
          </View>
        </View>

        <View style={styles.tableCard}>
          {workout.templateId ? (
            <StructuredSplitTable splits={splits} />
          ) : (
            <SplitTable splits={splits} />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingBottom: 30,
  },
  header: {
    margin: Layout.padding,
    marginBottom: 10,
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadius,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Layout.padding,
  },
  title: {
    fontSize: Layout.fontSizeTitle,
    fontWeight: '700',
    color: Colors.text,
  },
  workoutName: {
    marginTop: 4,
    fontSize: Layout.fontSize,
    fontWeight: '600',
    color: Colors.primary,
  },
  date: {
    marginTop: 4,
    fontSize: Layout.fontSizeSmall,
    color: Colors.textSecondary,
  },
  metaRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  meta: {
    fontSize: Layout.fontSizeSmall,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  metaDot: {
    color: Colors.textTertiary,
  },
  tableCard: {
    marginHorizontal: Layout.padding,
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadiusSmall,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    overflow: 'hidden',
  },
  emptyText: {
    textAlign: 'center',
    paddingHorizontal: Layout.paddingLarge,
    marginTop: 80,
    color: Colors.textSecondary,
    fontSize: Layout.fontSize,
  },
});
