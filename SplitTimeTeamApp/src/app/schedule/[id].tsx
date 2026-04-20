import React, { useLayoutEffect, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import LocationMapPreview from '@/components/schedule/LocationMapPreview';
import { useAuth } from '@/context/AuthContext';
import { useSchedule } from '@/context/ScheduleContext';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';
import {
  formatScheduleDateFull,
  formatScheduleTimeRange,
  getLocationDisplayAddress,
  getLocationDisplayName,
  getRecurrenceSummary,
} from '@/utils/schedule';

export default function ScheduleEventDetailScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const { id, occurrence } = useLocalSearchParams<{ id: string; occurrence?: string }>();
  const { session } = useAuth();
  const { scheduleEvents, scheduleOverrides } = useSchedule();

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
            (item) =>
              item.eventId === id && item.occurrenceStartsAt === selectedOccurrenceStartsAt
          ) ?? null,
    [id, scheduleOverrides, selectedOccurrenceStartsAt]
  );

  const isCoach = session?.user.role === 'coach';

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight:
        isCoach && event
          ? () => (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/schedule/[id]/edit',
                    params: {
                      id: event.id,
                      ...(selectedOccurrenceStartsAt !== null
                        ? { occurrence: String(selectedOccurrenceStartsAt) }
                        : {}),
                    },
                  })
                }
                hitSlop={12}
              >
                <Text style={styles.headerAction}>Edit</Text>
              </Pressable>
            )
          : undefined,
    });
  }, [event, isCoach, navigation, router, selectedOccurrenceStartsAt]);

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
  const recurrenceSummary = getRecurrenceSummary(event);

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
  const detailLocationName = getLocationDisplayName(detailLocation);
  const detailLocationAddress = getLocationDisplayAddress(detailLocation);

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.detailContent}>
        {detailLocation ? (
          <LocationMapPreview
            location={detailLocation}
            latitude={detailLocationLatitude}
            longitude={detailLocationLongitude}
            onPress={() =>
              router.push(
                selectedOccurrenceStartsAt !== null
                  ? `/schedule/${event.id}/map?occurrence=${selectedOccurrenceStartsAt}`
                  : `/schedule/${event.id}/map`
              )
            }
          />
        ) : null}

        <View style={styles.badgeRow}>
          <View style={[styles.badge, detailType === 'practice' ? styles.practiceBadge : styles.raceBadge]}>
            <Text style={[styles.badgeText, detailType === 'practice' ? styles.practiceText : styles.raceText]}>
              {detailType === 'practice' ? 'Practice' : 'Race'}
            </Text>
          </View>
        </View>

        <Text style={styles.title}>{detailTitle}</Text>
        {detailCategory ? <Text style={styles.detailCategory}>{detailCategory}</Text> : null}
        <Text style={styles.detailLine}>{formatScheduleDateFull(detailStartsAt)}</Text>
        <Text style={styles.detailLine}>{formatScheduleTimeRange(detailStartsAt, detailEndsAt)}</Text>

        {detailLocation ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Location</Text>
            <Text style={styles.infoBody}>{detailLocationName}</Text>
            {detailLocationAddress ? (
              <Text style={styles.infoSubbody}>{detailLocationAddress}</Text>
            ) : null}
          </View>
        ) : null}

        {recurrenceSummary ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Repeats</Text>
            <Text style={styles.infoBody}>{recurrenceSummary}</Text>
          </View>
        ) : null}

        {detailNotes ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Notes</Text>
            <Text style={styles.infoBody}>{detailNotes}</Text>
          </View>
        ) : null}
      </ScrollView>
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
  detailContent: {
    padding: Layout.paddingLarge,
    gap: 16,
    paddingBottom: 40,
  },
  headerAction: {
    fontSize: Layout.fontSize,
    fontWeight: '700',
    color: Colors.primary,
  },
  badgeRow: {
    flexDirection: 'row',
  },
  badge: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  practiceBadge: {
    backgroundColor: '#EAF1FF',
  },
  raceBadge: {
    backgroundColor: '#FDEBD2',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  practiceText: {
    color: Colors.primary,
  },
  raceText: {
    color: Colors.warning,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: Colors.text,
  },
  detailCategory: {
    fontSize: Layout.fontSizeSmall,
    fontWeight: '800',
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailLine: {
    fontSize: Layout.fontSize,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  infoCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    padding: Layout.padding,
    gap: 6,
  },
  infoLabel: {
    fontSize: Layout.fontSizeSmall,
    fontWeight: '800',
    color: Colors.textTertiary,
    textTransform: 'uppercase',
  },
  infoBody: {
    fontSize: Layout.fontSize,
    fontWeight: '700',
    color: Colors.text,
    lineHeight: 22,
  },
  infoSubbody: {
    fontSize: Layout.fontSizeSmall,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
});
