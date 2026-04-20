import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View, Pressable, Text } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTemplates } from '@/context/TemplateContext';
import { useDatabase } from '@/context/DatabaseContext';
import { deleteWorkout, getWorkoutSummaries } from '@/db/workouts';
import TemplateListItem from '@/components/template/TemplateListItem';
import WorkoutListItem from '@/components/history/WorkoutListItem';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import FloatingAddButton from '@/components/ui/FloatingAddButton';
import { Colors } from '@/constants/colors';
import type { WorkoutSummary } from '@/types';

export default function WorkoutsScreen() {
  const router = useRouter();
  const db = useDatabase();
  const { templates, refreshTemplates } = useTemplates();
  const [activeSegment, setActiveSegment] = useState<'templates' | 'history'>('templates');
  const [workouts, setWorkouts] = useState<WorkoutSummary[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<WorkoutSummary | null>(null);

  useFocusEffect(
    useCallback(() => {
      refreshTemplates();
      getWorkoutSummaries(db).then(setWorkouts);
    }, [refreshTemplates, db])
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    await deleteWorkout(db, deleteTarget.id);
    setWorkouts((prev) => prev.filter((workout) => workout.id !== deleteTarget.id));
    setDeleteTarget(null);
  }, [db, deleteTarget]);

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.container}>
      <View style={styles.topTabBar}>
        <Pressable
          style={[styles.topTab, activeSegment === 'templates' && styles.topTabActive]}
          onPress={() => setActiveSegment('templates')}
        >
          <Text
            style={[
              styles.topTabText,
              activeSegment === 'templates' && styles.topTabTextActive,
            ]}
          >
            Templates
          </Text>
        </Pressable>
        <Pressable
          style={[styles.topTab, activeSegment === 'history' && styles.topTabActive]}
          onPress={() => setActiveSegment('history')}
        >
          <Text
            style={[
              styles.topTabText,
              activeSegment === 'history' && styles.topTabTextActive,
            ]}
          >
            History
          </Text>
        </Pressable>
      </View>

      {/* ---- Templates Sub-tab ---- */}
      {activeSegment === 'templates' && (
        <>
          <FlatList
            data={templates}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TemplateListItem
                template={item}
                onPress={() => router.push(`/template/${item.id}`)}
              />
            )}
            ListEmptyComponent={
              <EmptyState
                title="No Workouts"
                subtitle="Create a structured workout to get started"
              />
            }
            contentContainerStyle={templates.length === 0 ? styles.emptyList : undefined}
          />
          <FloatingAddButton
            accessibilityLabel="Add workout template"
            onPress={() => router.push('/template/new')}
          />
        </>
      )}

      {/* ---- History Sub-tab ---- */}
      {activeSegment === 'history' && (
        <FlatList
          data={workouts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <WorkoutListItem
              workout={item}
              onPress={() => router.push(`/workout/${item.id}`)}
              onDelete={() => setDeleteTarget(item)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              title="No Workout History"
              subtitle="Saved workouts will appear here"
            />
          }
          contentContainerStyle={workouts.length === 0 ? styles.emptyList : undefined}
        />
      )}

      <ConfirmDialog
        visible={deleteTarget !== null}
        title="Delete Workout?"
        message={
          deleteTarget
            ? `"${deleteTarget.name || 'Untitled Workout'}" and its saved results will be permanently removed.`
            : ''
        }
        confirmLabel="Delete"
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  emptyList: {
    flexGrow: 1,
  },
  topTabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  topTab: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  topTabActive: {
    borderBottomColor: Colors.primary,
  },
  topTabText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  topTabTextActive: {
    color: Colors.text,
    fontWeight: '700',
  },
});
