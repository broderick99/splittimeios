import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDatabase } from '@/context/DatabaseContext';
import { useRoster } from '@/context/RosterContext';
import { getWorkoutSummariesForAthlete } from '@/db/workouts';
import { getSplitsForWorkout } from '@/db/splits';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';
import { formatTime } from '@/utils/format-time';
import { shareCsvFile } from '@/utils/share-csv';
import type { Split, WorkoutSummary } from '@/types';

type AthleteWorkoutHistory = {
  workout: WorkoutSummary;
  splits: Split[];
};

function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export default function AthleteHistoryScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const db = useDatabase();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { athletes } = useRoster();
  const athlete = athletes.find((a) => a.id === id);
  const [history, setHistory] = useState<AthleteWorkoutHistory[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const workouts = await getWorkoutSummariesForAthlete(db, id);
      const splitBuckets = await Promise.all(workouts.map((w) => getSplitsForWorkout(db, w.id)));
      const nextHistory = workouts.map((workout, idx) => ({
        workout,
        splits: splitBuckets[idx].filter((s) => s.athleteId === id),
      }));
      setHistory(nextHistory);
    })();
  }, [db, id]);

  const exportHistory = useCallback(async () => {
    if (!athlete) return;
    const rows = history.map((entry) => {
      const final = entry.splits.find((s) => s.isFinal);
      return [
        new Date(entry.workout.date).toISOString(),
        entry.workout.name || 'Untitled Workout',
        String(entry.splits.filter((s) => !s.isFinal).length),
        final ? formatTime(final.elapsedMs) : '',
      ]
        .map((v) => csvEscape(v))
        .join(',');
    });
    const csv = ['date,workout_name,split_count,final_time', ...rows].join('\n');
    await shareCsvFile({
      csv,
      fileNameBase: `${athlete.name} history`,
      dialogTitle: `${athlete.name} History Export`,
    });
  }, [athlete, history]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: athlete ? `${athlete.name} History` : 'Athlete History',
      headerRight: () => (
        <Pressable onPress={exportHistory} style={{ paddingHorizontal: 8 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.primary }}>Export</Text>
        </Pressable>
      ),
    });
  }, [navigation, athlete, exportHistory]);

  if (!athlete) {
    return (
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
        <Text style={styles.emptyText}>Athlete not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>{athlete.name}</Text>
        <Text style={styles.summaryMeta}>
          {history.length} workout{history.length !== 1 ? 's' : ''} logged
        </Text>
      </View>

      <FlatList
        data={history}
        keyExtractor={(item) => item.workout.id}
        renderItem={({ item }) => {
          const final = item.splits.find((s) => s.isFinal);
          const splitCount = item.splits.filter((s) => !s.isFinal).length;
          return (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => router.push(`/athlete/history/${id}/workout/${item.workout.id}`)}
            >
              <View style={styles.rowMain}>
                <Text style={styles.workoutName} numberOfLines={1}>
                  {item.workout.name || 'Untitled Workout'}
                </Text>
                <Text style={styles.workoutDate}>
                  {new Date(item.workout.date).toLocaleDateString()}
                </Text>
              </View>
              <View style={styles.rowRight}>
                <Text style={styles.splitMeta}>
                  {splitCount} split{splitCount !== 1 ? 's' : ''}
                </Text>
                <Text style={styles.finalTime}>{final ? formatTime(final.elapsedMs) : '--'}</Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No workouts recorded for this athlete yet.</Text>
        }
        contentContainerStyle={history.length === 0 ? styles.emptyList : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  summaryCard: {
    margin: Layout.padding,
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadius,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Layout.padding,
  },
  summaryTitle: {
    fontSize: Layout.fontSizeLarge,
    fontWeight: '700',
    color: Colors.text,
  },
  summaryMeta: {
    marginTop: 4,
    fontSize: Layout.fontSizeSmall,
    color: Colors.textSecondary,
  },
  row: {
    marginHorizontal: Layout.padding,
    marginBottom: 8,
    padding: Layout.padding,
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadiusSmall,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  rowPressed: {
    backgroundColor: Colors.surfaceSecondary,
  },
  rowMain: {
    flex: 1,
  },
  workoutName: {
    fontSize: Layout.fontSize,
    fontWeight: '600',
    color: Colors.text,
  },
  workoutDate: {
    marginTop: 2,
    fontSize: Layout.fontSizeSmall,
    color: Colors.textSecondary,
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  splitMeta: {
    fontSize: Layout.fontSizeSmall,
    color: Colors.textTertiary,
  },
  finalTime: {
    marginTop: 2,
    fontSize: Layout.fontSize,
    fontWeight: '700',
    color: Colors.primary,
    fontVariant: ['tabular-nums'],
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyText: {
    textAlign: 'center',
    color: Colors.textSecondary,
    fontSize: Layout.fontSize,
    paddingHorizontal: Layout.paddingLarge,
  },
});
