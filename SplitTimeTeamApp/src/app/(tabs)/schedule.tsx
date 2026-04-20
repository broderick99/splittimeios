import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useDatabase } from '@/context/DatabaseContext';
import EmptyState from '@/components/ui/EmptyState';
import FloatingAddButton from '@/components/ui/FloatingAddButton';
import { useAuth } from '@/context/AuthContext';
import { useSchedule } from '@/context/ScheduleContext';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';
import {
  buildUpcomingOccurrences,
  formatScheduleDate,
  formatScheduleMonthYear,
  formatScheduleWeekLabel,
  formatScheduleTimeRange,
  getScheduleDayNumber,
  getLocationDisplayName,
  getScheduleWeekdayShort,
  getStartOfWeek,
} from '@/utils/schedule';
import {
  SCHEDULE_SETTINGS_DEFAULTS,
  SCHEDULE_SETTINGS_KEYS,
  getBooleanScheduleSetting,
} from '@/utils/schedule-settings';
import type { ScheduleOccurrence } from '@/types';

type ScheduleFilter = 'all' | 'practice' | 'race';

type ScheduleListItem =
  | { key: string; type: 'summary' }
  | { key: string; type: 'month-section'; label: string }
  | { key: string; type: 'week-section'; label: string }
  | { key: string; type: 'event'; occurrence: ScheduleOccurrence };

export default function ScheduleScreen() {
  const db = useDatabase();
  const navigation = useNavigation();
  const router = useRouter();
  const { session } = useAuth();
  const {
    scheduleEvents,
    scheduleOverrides,
    refreshScheduleEvents,
    isLoadingSchedule,
  } = useSchedule();
  const [activeFilter, setActiveFilter] = useState<ScheduleFilter>('all');
  const [showFilters, setShowFilters] = useState<boolean>(SCHEDULE_SETTINGS_DEFAULTS.showFilters);
  const [showCategoryOnCards, setShowCategoryOnCards] = useState<boolean>(
    SCHEDULE_SETTINGS_DEFAULTS.showCategoryOnCards
  );
  const [showLocationOnCards, setShowLocationOnCards] = useState<boolean>(
    SCHEDULE_SETTINGS_DEFAULTS.showLocationOnCards
  );

  const isCoach = session?.user.role === 'coach';

  const filteredEvents = useMemo(() => {
    if (activeFilter === 'all') {
      return scheduleEvents;
    }
    return scheduleEvents.filter((event) => event.type === activeFilter);
  }, [activeFilter, scheduleEvents]);

  const occurrences = useMemo(
    () => buildUpcomingOccurrences(filteredEvents, scheduleOverrides, { maxCount: 40 }),
    [filteredEvents, scheduleOverrides]
  );

  const listItems = useMemo<ScheduleListItem[]>(() => {
    const items: ScheduleListItem[] = [{ key: 'summary', type: 'summary' }];
    let currentMonthSection = '';
    let currentWeekSection = '';

    for (const occurrence of occurrences) {
      const monthLabel = formatScheduleMonthYear(occurrence.startsAt);
      const weekStart = getStartOfWeek(occurrence.startsAt);
      const weekLabel = formatScheduleWeekLabel(weekStart);

      if (monthLabel !== currentMonthSection) {
        currentMonthSection = monthLabel;
        currentWeekSection = '';
        items.push({ key: `month-${monthLabel}`, type: 'month-section', label: monthLabel });
      }

      const weekKey = `${monthLabel}-${weekStart}`;
      if (weekKey !== currentWeekSection) {
        currentWeekSection = weekKey;
        items.push({ key: `week-${weekKey}`, type: 'week-section', label: weekLabel });
      }
      items.push({ key: occurrence.id, type: 'event', occurrence });
    }

    return items;
  }, [occurrences]);

  const nextOccurrence = occurrences[0] ?? null;
  const recurringEventCount = useMemo(
    () => scheduleEvents.filter((event) => event.isRecurring).length,
    [scheduleEvents]
  );

  const handleRefresh = useCallback(async () => {
    await refreshScheduleEvents();
  }, [refreshScheduleEvents]);

  const loadScheduleSettings = useCallback(async () => {
    const [nextShowFilters, nextShowCategoryOnCards, nextShowLocationOnCards] = await Promise.all([
      getBooleanScheduleSetting(
        db,
        SCHEDULE_SETTINGS_KEYS.showFilters,
        SCHEDULE_SETTINGS_DEFAULTS.showFilters
      ),
      getBooleanScheduleSetting(
        db,
        SCHEDULE_SETTINGS_KEYS.showCategoryOnCards,
        SCHEDULE_SETTINGS_DEFAULTS.showCategoryOnCards
      ),
      getBooleanScheduleSetting(
        db,
        SCHEDULE_SETTINGS_KEYS.showLocationOnCards,
        SCHEDULE_SETTINGS_DEFAULTS.showLocationOnCards
      ),
    ]);

    setShowFilters(nextShowFilters);
    setShowCategoryOnCards(nextShowCategoryOnCards);
    setShowLocationOnCards(nextShowLocationOnCards);
  }, [db]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => router.push('/schedule/settings')} style={styles.headerIconButton}>
          <FontAwesome name="gear" size={22} color={Colors.textSecondary} />
        </Pressable>
      ),
    });
  }, [navigation, router]);

  useEffect(() => {
    void loadScheduleSettings();
  }, [loadScheduleSettings]);

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.container}>
      <FlatList
        data={listItems}
        keyExtractor={(item) => item.key}
        refreshControl={
          <RefreshControl refreshing={isLoadingSchedule} onRefresh={() => void handleRefresh()} />
        }
        contentContainerStyle={occurrences.length === 0 ? styles.emptyContent : styles.content}
        renderItem={({ item }) => {
          if (item.type === 'summary') {
            return (
              <View style={styles.summaryBlock}>
                <Text style={styles.heading}>Team Schedule</Text>
                <Text style={styles.subheading}>
                  {isCoach
                    ? 'Build practices, races, and recurring team events.'
                    : 'See the next practices, races, and team events here.'}
                </Text>

                {showFilters ? (
                  <View style={styles.filterRow}>
                    {(['all', 'practice', 'race'] as const).map((filter) => {
                      const selected = activeFilter === filter;
                      const label =
                        filter === 'all' ? 'All Events' : filter === 'practice' ? 'Practices' : 'Races';
                      return (
                        <Pressable
                          key={filter}
                          onPress={() => setActiveFilter(filter)}
                          style={[styles.filterChip, selected && styles.filterChipSelected]}
                        >
                          <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}

                <View style={styles.metricRow}>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>Next Up</Text>
                    <Text style={styles.metricValue}>{nextOccurrence ? nextOccurrence.title : 'Nothing yet'}</Text>
                    <Text style={styles.metricSubtext}>
                      {nextOccurrence ? formatScheduleDate(nextOccurrence.startsAt) : 'Add your first event'}
                    </Text>
                  </View>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>Recurring</Text>
                    <Text style={styles.metricValue}>{recurringEventCount}</Text>
                    <Text style={styles.metricSubtext}>Active weekly events</Text>
                  </View>
                </View>
              </View>
            );
          }

          if (item.type === 'month-section') {
            return <Text style={styles.monthSectionLabel}>{item.label}</Text>;
          }

          if (item.type === 'week-section') {
            return <Text style={styles.weekSectionLabel}>{item.label}</Text>;
          }

          return (
            <Pressable
              style={styles.eventRow}
              onPress={() =>
                router.push({
                  pathname: '/schedule/[id]',
                  params: {
                    id: item.occurrence.eventId,
                    occurrence: String(item.occurrence.startsAt),
                  },
                })
              }
            >
              <View style={styles.dateTile}>
                <Text style={styles.dateTileDay}>{getScheduleDayNumber(item.occurrence.startsAt)}</Text>
                <Text style={styles.dateTileWeekday}>{getScheduleWeekdayShort(item.occurrence.startsAt)}</Text>
              </View>

              <View style={styles.eventContent}>
                <View
                  style={[
                    styles.eventTimeRow,
                  ]}
                >
                  <View
                    style={[
                      styles.eventDot,
                      item.occurrence.type === 'practice' ? styles.practiceDot : styles.raceDot,
                    ]}
                  />
                  <Text
                    style={[
                      styles.eventTime,
                    ]}
                  >
                    {formatScheduleTimeRange(item.occurrence.startsAt, item.occurrence.endsAt)}
                  </Text>
                </View>

                <Text style={styles.eventTitle}>{item.occurrence.title}</Text>

                {showCategoryOnCards && item.occurrence.category ? (
                  <Text style={styles.eventCategory}>{item.occurrence.category}</Text>
                ) : null}

                {showLocationOnCards && item.occurrence.location ? (
                  <Text style={styles.eventMeta} numberOfLines={1}>
                    {getLocationDisplayName(item.occurrence.location)}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            title="No events yet"
            subtitle={
              isCoach
                ? 'Tap the plus button to add a practice, race, or recurring team event.'
                : 'Your coach has not added any schedule items yet.'
            }
          />
        }
      />
      {isCoach ? (
        <FloatingAddButton
          accessibilityLabel="Add schedule event"
          onPress={() => router.push('/schedule/new')}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerIconButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  content: {
    padding: Layout.padding,
    paddingBottom: 120,
  },
  emptyContent: {
    flexGrow: 1,
    padding: Layout.padding,
  },
  summaryBlock: {
    gap: 14,
    marginBottom: 12,
  },
  heading: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.text,
  },
  subheading: {
    fontSize: Layout.fontSize,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#EAF1FF',
  },
  filterChipText: {
    fontSize: Layout.fontSizeSmall,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  filterChipTextSelected: {
    color: Colors.primary,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Layout.padding,
    gap: 6,
  },
  metricLabel: {
    fontSize: Layout.fontSizeSmall,
    fontWeight: '700',
    color: Colors.textTertiary,
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
  },
  metricSubtext: {
    fontSize: Layout.fontSizeSmall,
    color: Colors.textSecondary,
  },
  monthSectionLabel: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: Layout.fontSize,
    fontWeight: '800',
    color: Colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  weekSectionLabel: {
    marginTop: 6,
    marginBottom: 10,
    fontSize: Layout.fontSizeSmall,
    fontWeight: '800',
    color: Colors.textSecondary,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  dateTile: {
    width: 58,
    minHeight: 62,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    alignSelf: 'center',
  },
  dateTileDay: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text,
    lineHeight: 28,
  },
  dateTileWeekday: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  eventContent: {
    flex: 1,
    paddingTop: 6,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  eventTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  eventDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  practiceDot: {
    backgroundColor: Colors.primary,
  },
  raceDot: {
    backgroundColor: Colors.warning,
  },
  eventTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
  },
  eventTime: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
  },
  eventMeta: {
    marginTop: 4,
    fontSize: 15,
    color: Colors.textSecondary,
  },
  eventCategory: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },
});
