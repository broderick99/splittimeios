import React, { useEffect, useLayoutEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
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
import type { Workout, WorkoutAthlete, Split } from '@/types';

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const db = useDatabase();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [athletes, setAthletes] = useState<WorkoutAthlete[]>([]);
  const [splits, setSplits] = useState<Split[]>([]);

  useEffect(() => {
    if (!id) return;
    Promise.all([getWorkout(db, id), getWorkoutAthletes(db, id), getSplitsForWorkout(db, id)]).then(
      ([w, a, s]) => {
        setWorkout(w);
        setAthletes(a);
        setSplits(s);
      }
    );
  }, [db, id]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={async () => {
            if (!workout) return;
            await shareDetailedSplitPdf({
              workoutDate: workout.date,
              workoutName: workout.name || 'Untitled Workout',
              splits,
              getAthleteName: (athleteId) =>
                athletes.find((athlete) => athlete.athleteId === athleteId)?.athleteName ?? '',
              getGroupName: (athleteId) =>
                athletes.find((athlete) => athlete.athleteId === athleteId)?.groupName ?? '',
              fileNameBase: `${workout.name || 'workout'} export`,
              dialogTitle: `${workout.name || 'Workout'} Export`,
            });
          }}
          style={{ paddingHorizontal: 8 }}
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.primary }}>Export</Text>
        </Pressable>
      ),
    });
  }, [navigation, workout, splits, athletes]);

  if (!workout) {
    return (
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
        <Text style={styles.loading}>Loading...</Text>
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

  const groupedAthletes = new Map<string, { groupName: string; groupColor: string; athletes: WorkoutAthlete[] }>();
  for (const athlete of athletes) {
    const key = athlete.groupId || '__unassigned';
    if (!groupedAthletes.has(key)) {
      groupedAthletes.set(key, {
        groupName: athlete.groupName || 'Unassigned',
        groupColor: athlete.groupColor || Colors.textTertiary,
        athletes: [],
      });
    }
    groupedAthletes.get(key)!.athletes.push(athlete);
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>{workout.name || 'Untitled Workout'}</Text>
          <Text style={styles.date}>
            {dateStr} at {timeStr}
          </Text>
          <Text style={styles.athleteCount}>
            {athletes.length} athlete{athletes.length !== 1 ? 's' : ''}
          </Text>
        </View>

        {Array.from(groupedAthletes.entries()).map(([key, group]) => (
          <View key={key} style={styles.groupSection}>
            <View style={[styles.groupHeader, { borderLeftColor: group.groupColor }]}>
              <Text style={styles.groupName}>{group.groupName}</Text>
            </View>
            {group.athletes.map((athlete) => {
              const athleteSplits = splits.filter((s) => s.athleteId === athlete.athleteId);
              const finalSplit = athleteSplits.find((s) => s.isFinal);
              return (
                <View key={athlete.athleteId} style={styles.athleteSection}>
                  <View style={styles.athleteHeader}>
                    <Text style={styles.athleteName}>{athlete.athleteName}</Text>
                    {finalSplit && (
                      <Text style={styles.totalTime}>{formatTime(finalSplit.elapsedMs)}</Text>
                    )}
                  </View>
                  {workout.templateId ? (
                    <StructuredSplitTable splits={athleteSplits} />
                  ) : (
                    <SplitTable splits={athleteSplits} />
                  )}
                </View>
              );
            })}
          </View>
        ))}
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
    paddingBottom: 40,
  },
  loading: {
    textAlign: 'center',
    padding: 40,
    color: Colors.textSecondary,
    fontSize: Layout.fontSize,
  },
  header: {
    padding: Layout.paddingLarge,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: Layout.fontSizeTitle,
    fontWeight: '700',
    color: Colors.text,
  },
  date: {
    fontSize: Layout.fontSize,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  athleteCount: {
    fontSize: Layout.fontSizeSmall,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  groupSection: {
    marginTop: 12,
  },
  groupHeader: {
    paddingVertical: 10,
    paddingHorizontal: Layout.padding,
    backgroundColor: Colors.surfaceSecondary,
    borderLeftWidth: 4,
  },
  groupName: {
    fontSize: Layout.fontSize,
    fontWeight: '700',
    color: Colors.text,
  },
  athleteSection: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Layout.padding,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  athleteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  athleteName: {
    fontSize: Layout.fontSize,
    fontWeight: '600',
    color: Colors.text,
  },
  totalTime: {
    fontSize: Layout.fontSizeLarge,
    fontWeight: '700',
    color: Colors.primary,
    fontVariant: ['tabular-nums'],
  },
});
