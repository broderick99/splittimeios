import React, { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import ScheduleEventEditor from '@/components/schedule/ScheduleEventEditor';
import { useAuth } from '@/context/AuthContext';
import { useSchedule } from '@/context/ScheduleContext';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';

export default function EditScheduleEventScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { id, occurrence } = useLocalSearchParams<{ id: string; occurrence?: string }>();
  const {
    scheduleEvents,
    scheduleOverrides,
    updateScheduleEvent,
    updateScheduleOccurrence,
    deleteScheduleEvent,
    deleteScheduleOccurrence,
  } = useSchedule();
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isCoach = session?.user.role === 'coach';

  const event = useMemo(
    () => scheduleEvents.find((item) => item.id === id) ?? null,
    [id, scheduleEvents]
  );

  const selectedOccurrenceStartsAt = occurrence ? Number(occurrence) : null;
  const selectedOverride = useMemo(
    () =>
      selectedOccurrenceStartsAt === null
        ? null
        : scheduleOverrides.find(
            (item) => item.eventId === id && item.occurrenceStartsAt === selectedOccurrenceStartsAt
          ) ?? null,
    [id, scheduleOverrides, selectedOccurrenceStartsAt]
  );

  if (!event) {
    return (
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
        <View style={styles.notFoundState}>
          <Text style={styles.notFoundTitle}>Event not found</Text>
          <Text style={styles.notFoundSubtitle}>This schedule item may have been deleted.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isCoach) {
    return (
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
        <View style={styles.notFoundState}>
          <Text style={styles.notFoundTitle}>Coach Only</Text>
          <Text style={styles.notFoundSubtitle}>Only coaches can edit schedule events.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isRecurringOccurrenceEdit = event.isRecurring && selectedOccurrenceStartsAt !== null;
  const detailStartsAt = selectedOverride?.startsAt ?? selectedOccurrenceStartsAt ?? event.startsAt;
  const detailEndsAt =
    selectedOverride?.endsAt ??
    (selectedOccurrenceStartsAt !== null && event.endsAt
      ? selectedOccurrenceStartsAt + (event.endsAt - event.startsAt)
      : event.endsAt);
  const detailTitle = selectedOverride?.title ?? event.title;
  const detailType = selectedOverride?.type ?? event.type;
  const detailCategory = selectedOverride?.category ?? event.category;
  const detailLocation = selectedOverride?.location ?? event.location;
  const detailLocationLatitude = selectedOverride?.locationLatitude ?? event.locationLatitude;
  const detailLocationLongitude = selectedOverride?.locationLongitude ?? event.locationLongitude;
  const detailNotes = selectedOverride?.notes ?? event.notes;

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {isRecurringOccurrenceEdit ? (
          <View style={styles.seriesNotice}>
            <Text style={styles.seriesNoticeText}>Editing only this occurrence</Text>
          </View>
        ) : null}
        <ScheduleEventEditor
          initialEvent={{
            ...event,
            title: detailTitle,
            type: detailType,
            category: detailCategory,
            startsAt: detailStartsAt,
            endsAt: detailEndsAt,
            location: detailLocation,
            locationLatitude: detailLocationLatitude,
            locationLongitude: detailLocationLongitude,
            notes: detailNotes,
            isRecurring: isRecurringOccurrenceEdit ? false : event.isRecurring,
            recurrenceDays: isRecurringOccurrenceEdit ? [] : event.recurrenceDays,
          }}
          submitLabel="Save Changes"
          submitting={submitting}
          deleting={deleting}
          onSubmit={async (input) => {
            setSubmitting(true);
            try {
              if (isRecurringOccurrenceEdit && selectedOccurrenceStartsAt !== null) {
                await updateScheduleOccurrence(event.id, selectedOccurrenceStartsAt, input);
              } else {
                await updateScheduleEvent(event.id, input);
              }
              router.back();
            } finally {
              setSubmitting(false);
            }
          }}
          onDelete={async () => {
            Alert.alert(
              isRecurringOccurrenceEdit ? 'Delete Occurrence?' : 'Delete Event?',
              isRecurringOccurrenceEdit
                ? `"${detailTitle}" will be removed just for this occurrence.`
                : `"${event.title}" will be removed from the schedule.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => {
                    setDeleting(true);
                    const task =
                      isRecurringOccurrenceEdit && selectedOccurrenceStartsAt !== null
                        ? deleteScheduleOccurrence(event.id, selectedOccurrenceStartsAt)
                        : deleteScheduleEvent(event.id);
                    void task.then(() => router.back()).finally(() => setDeleting(false));
                  },
                },
              ]
            );
          }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  notFoundState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Layout.paddingLarge,
  },
  notFoundTitle: {
    fontSize: Layout.fontSizeLarge,
    fontWeight: '800',
    color: Colors.text,
  },
  notFoundSubtitle: {
    marginTop: 8,
    fontSize: Layout.fontSize,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  seriesNotice: {
    paddingHorizontal: Layout.paddingLarge,
    paddingTop: Layout.padding,
  },
  seriesNoticeText: {
    fontSize: Layout.fontSizeSmall,
    fontWeight: '700',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
