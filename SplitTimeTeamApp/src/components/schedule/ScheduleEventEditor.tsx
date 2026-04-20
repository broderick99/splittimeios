import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BigButton from '@/components/ui/BigButton';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';
import {
  RECURRING_WEEKDAY_OPTIONS,
  combineDateAndTime,
  daysInMonth,
  formatRecurrenceDaysLabel,
  formatScheduleDateShort,
  getDateParts,
  getScheduleCategoryOptions,
} from '@/utils/schedule';
import type { ScheduleEvent, ScheduleEventType } from '@/types';

interface ScheduleEventEditorProps {
  initialEvent?: ScheduleEvent;
  submitLabel: string;
  submitting?: boolean;
  onSubmit: (input: {
    type: ScheduleEventType;
    category: string;
    title: string;
    startsAt: number;
    endsAt: number | null;
    location: string | null;
    locationLatitude: number | null;
    locationLongitude: number | null;
    notes: string | null;
    isRecurring: boolean;
    recurrenceDays: number[];
    recurrenceEndsAt: number | null;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
  deleting?: boolean;
}

type PickerMode = 'date' | 'start-time' | 'end-time' | 'repeat-until' | null;
type Coordinates = {
  latitude: number;
  longitude: number;
};
type LocationSearchResult = {
  id: string;
  title: string;
  address: string;
  latitude: number;
  longitude: number;
};

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: index,
  label: new Intl.DateTimeFormat(undefined, { month: 'long' }).format(new Date(2026, index, 1)),
}));

const YEAR_OPTIONS = Array.from({ length: 5 }, (_, index) => {
  const year = new Date().getFullYear() - 1 + index;
  return { value: year, label: String(year) };
});

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => {
  const value = index + 1;
  return { value, label: String(value) };
});

const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) => {
  const value = index * 5;
  return { value, label: value.toString().padStart(2, '0') };
});

function formatEditorDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(timestamp));
}

function formatEditorTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function buildTimeFromParts(parts: {
  year: number;
  monthIndex: number;
  day: number;
  hour12: number;
  minute: number;
  meridiem: 'AM' | 'PM';
}) {
  return combineDateAndTime(parts);
}

function formatDraftRecurrenceSummary(recurrenceDays: number[]) {
  const label = formatRecurrenceDaysLabel(recurrenceDays);
  return label ? `Repeats ${label}` : null;
}

function buildDefaultRecurrenceEnd(startTimestamp: number) {
  const date = new Date(startTimestamp);
  date.setMonth(date.getMonth() + 2);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildLocationSearchQueries(query: string) {
  const trimmed = query.trim();
  const normalized = normalizeSearchText(trimmed);
  const candidates = new Set<string>();

  if (trimmed) {
    candidates.add(trimmed);
  }

  if (normalized && normalized !== trimmed.toLowerCase()) {
    candidates.add(normalized);
  }

  const withoutGenericSchool = normalized
    .replace(/\bhigh school\b/g, 'high')
    .replace(/\bintermediate school\b/g, 'intermediate')
    .replace(/\belementary school\b/g, 'elementary')
    .replace(/\bmiddle school\b/g, 'middle')
    .replace(/\bschool\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (withoutGenericSchool && withoutGenericSchool !== normalized) {
    candidates.add(withoutGenericSchool);
  }

  return Array.from(candidates).slice(0, 3);
}

function scoreLocationResult(query: string, title: string, address: string) {
  const queryTokens = normalizeSearchText(query).split(' ').filter(Boolean);
  const haystack = normalizeSearchText(`${title} ${address}`);

  let score = 0;
  for (const token of queryTokens) {
    if (haystack.includes(token)) {
      score += 10;
    }
  }

  const normalizedTitle = normalizeSearchText(title);
  const normalizedAddress = normalizeSearchText(address);

  if (normalizedTitle.includes(normalizeSearchText(query))) {
    score += 20;
  }

  if (normalizedAddress.includes(normalizeSearchText(query))) {
    score += 8;
  }

  return score;
}

function buildLocationResultKey(result: { title: string; address: string }) {
  return `${normalizeSearchText(result.title)}|${normalizeSearchText(result.address)
    .replace(/\bunited states\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()}`;
}

function getInitialLocationCoordinates(initialEvent?: ScheduleEvent): Coordinates | null {
  if (
    initialEvent?.locationLatitude != null &&
    initialEvent?.locationLongitude != null
  ) {
    return {
      latitude: initialEvent.locationLatitude,
      longitude: initialEvent.locationLongitude,
    };
  }

  return null;
}

export default function ScheduleEventEditor({
  initialEvent,
  submitLabel,
  submitting = false,
  onSubmit,
  onDelete,
  deleting = false,
}: ScheduleEventEditorProps) {
  const insets = useSafeAreaInsets();
  const isEditingExistingEvent = Boolean(initialEvent);
  const baseStart = initialEvent?.startsAt ?? Date.now() + 60 * 60 * 1000;
  const baseEnd = initialEvent?.endsAt ?? baseStart + 90 * 60 * 1000;
  const initialLocationCoordinates = useMemo(
    () => getInitialLocationCoordinates(initialEvent),
    [initialEvent]
  );
  const startParts = getDateParts(baseStart);
  const endParts = getDateParts(baseEnd);

  const [title, setTitle] = useState(initialEvent?.title ?? '');
  const [type, setType] = useState<ScheduleEventType | null>(initialEvent?.type ?? null);
  const [category, setCategory] = useState(initialEvent?.category ?? '');
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [location, setLocation] = useState(initialEvent?.location ?? '');
  const [notes, setNotes] = useState(initialEvent?.notes ?? '');
  const [isRecurring, setIsRecurring] = useState(initialEvent?.isRecurring ?? false);
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>(
    initialEvent?.isRecurring && initialEvent.recurrenceDays.length > 0
      ? initialEvent.recurrenceDays
      : []
  );
  const [recurrenceEndsAt, setRecurrenceEndsAt] = useState<number | null>(
    initialEvent?.recurrenceEndsAt ?? null
  );
  const [hasChosenDate, setHasChosenDate] = useState(isEditingExistingEvent);
  const [hasChosenStartTime, setHasChosenStartTime] = useState(isEditingExistingEvent);

  const [year, setYear] = useState(startParts.year);
  const [monthIndex, setMonthIndex] = useState(startParts.monthIndex);
  const [day, setDay] = useState(startParts.day);
  const [startHour, setStartHour] = useState(startParts.hour12);
  const [startMinute, setStartMinute] = useState(Math.round(startParts.minute / 5) * 5 % 60);
  const [startMeridiem, setStartMeridiem] = useState<'AM' | 'PM'>(startParts.meridiem);
  const [hasEndTime, setHasEndTime] = useState(
    initialEvent ? initialEvent.endsAt !== null : false
  );
  const [endHour, setEndHour] = useState(endParts.hour12);
  const [endMinute, setEndMinute] = useState(Math.round(endParts.minute / 5) * 5 % 60);
  const [endMeridiem, setEndMeridiem] = useState<'AM' | 'PM'>(endParts.meridiem);
  const recurrenceEndParts = getDateParts(
    initialEvent?.recurrenceEndsAt ?? buildDefaultRecurrenceEnd(baseStart)
  );
  const [recurrenceEndYear, setRecurrenceEndYear] = useState(recurrenceEndParts.year);
  const [recurrenceEndMonthIndex, setRecurrenceEndMonthIndex] = useState(
    recurrenceEndParts.monthIndex
  );
  const [recurrenceEndDay, setRecurrenceEndDay] = useState(recurrenceEndParts.day);

  const [activePicker, setActivePicker] = useState<PickerMode>(null);
  const [isRecurrenceModalOpen, setIsRecurrenceModalOpen] = useState(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [locationDraft, setLocationDraft] = useState(initialEvent?.location ?? '');
  const [locationCoordinates, setLocationCoordinates] = useState<Coordinates | null>(
    initialLocationCoordinates
  );
  const [locationResults, setLocationResults] = useState<LocationSearchResult[]>([]);
  const [selectedLocationResult, setSelectedLocationResult] = useState<LocationSearchResult | null>(null);
  const [isSearchingLocations, setIsSearchingLocations] = useState(false);

  useEffect(() => {
    setLocationCoordinates(initialLocationCoordinates);
  }, [initialLocationCoordinates]);

  useEffect(() => {
    const maxDay = daysInMonth(year, monthIndex);
    if (day > maxDay) {
      setDay(maxDay);
    }
  }, [day, monthIndex, year]);

  useEffect(() => {
    const maxDay = daysInMonth(recurrenceEndYear, recurrenceEndMonthIndex);
    if (recurrenceEndDay > maxDay) {
      setRecurrenceEndDay(maxDay);
    }
  }, [recurrenceEndDay, recurrenceEndMonthIndex, recurrenceEndYear]);

  const dayOptions = useMemo(
    () => Array.from({ length: daysInMonth(year, monthIndex) }, (_, index) => index + 1),
    [monthIndex, year]
  );
  const recurrenceEndDayOptions = useMemo(
    () =>
      Array.from(
        { length: daysInMonth(recurrenceEndYear, recurrenceEndMonthIndex) },
        (_, index) => index + 1
      ),
    [recurrenceEndMonthIndex, recurrenceEndYear]
  );
  const categoryOptions = useMemo(
    () => (type ? getScheduleCategoryOptions(type) : []),
    [type]
  );

  useEffect(() => {
    if (!categoryOptions.includes(category)) {
      setCategory('');
      setShowCategoryMenu(false);
    }
  }, [category, categoryOptions]);

  useEffect(() => {
    if (!isLocationModalOpen) {
      return;
    }

    setLocationDraft(location);
    setLocationCoordinates(initialLocationCoordinates);
    setSelectedLocationResult(null);
    setLocationResults([]);
  }, [initialLocationCoordinates, isLocationModalOpen, location]);

  useEffect(() => {
    if (!isLocationModalOpen) {
      return;
    }

    const trimmed = locationDraft.trim();
    if (!trimmed) {
      setLocationCoordinates(null);
      setLocationResults([]);
      setSelectedLocationResult(null);
      setIsSearchingLocations(false);
      return;
    }

    let active = true;
    const timeout = setTimeout(() => {
      const run = async () => {
        try {
          setIsSearchingLocations(true);
          const queries = buildLocationSearchQueries(trimmed);
          const resultMap = new Map<string, LocationSearchResult>();

          for (const query of queries) {
            const response = await fetch(
              `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=8&addressdetails=1`,
              {
                headers: {
                  Accept: 'application/json',
                },
              }
            );
            const results = (await response.json()) as {
              place_id: number;
              name?: string;
              display_name: string;
              lat: string;
              lon: string;
            }[];

            for (const item of results) {
              const firstPart = item.display_name.split(',')[0]?.trim() ?? item.display_name;
              const mappedItem = {
                id: String(item.place_id),
                title: item.name?.trim() || firstPart,
                address: item.display_name,
                latitude: Number(item.lat),
                longitude: Number(item.lon),
              };
              resultMap.set(mappedItem.id, mappedItem);
            }
          }

          if (!active) {
            return;
          }

          const deduped = new Map<string, LocationSearchResult>();
          for (const result of resultMap.values()) {
            const key = buildLocationResultKey(result);
            if (!deduped.has(key)) {
              deduped.set(key, result);
            }
          }

          const mapped = Array.from(deduped.values())
            .sort(
              (left, right) =>
                scoreLocationResult(trimmed, right.title, right.address) -
                scoreLocationResult(trimmed, left.title, left.address)
            )
            .slice(0, 8);

          setLocationResults(mapped);

          const matchedSelected =
            selectedLocationResult &&
            mapped.find((item) => item.id === selectedLocationResult.id)
              ? mapped.find((item) => item.id === selectedLocationResult.id) ?? null
              : null;

          const previewTarget = matchedSelected ?? mapped[0] ?? null;
          setSelectedLocationResult(matchedSelected);
          setLocationCoordinates(
            previewTarget
              ? {
                  latitude: previewTarget.latitude,
                  longitude: previewTarget.longitude,
                }
              : null
          );
        } catch {
          if (active) {
            setLocationResults([]);
            setLocationCoordinates(null);
          }
        } finally {
          if (active) {
            setIsSearchingLocations(false);
          }
        }
      };

      void run();
    }, 350);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [isLocationModalOpen, locationDraft, selectedLocationResult]);

  const startTimestamp = useMemo(
    () =>
      buildTimeFromParts({
        year,
        monthIndex,
        day,
        hour12: startHour,
        minute: startMinute,
        meridiem: startMeridiem,
      }),
    [day, monthIndex, startHour, startMeridiem, startMinute, year]
  );

  const endTimestamp = useMemo(() => {
    if (!hasEndTime) {
      return null;
    }
    return buildTimeFromParts({
      year,
      monthIndex,
      day,
      hour12: endHour,
      minute: endMinute,
      meridiem: endMeridiem,
    });
  }, [day, endHour, endMeridiem, endMinute, hasEndTime, monthIndex, year]);

  const recurrenceEndTimestamp = useMemo(() => {
    if (!isRecurring) {
      return null;
    }

    return new Date(
      recurrenceEndYear,
      recurrenceEndMonthIndex,
      recurrenceEndDay,
      23,
      59,
      59,
      999
    ).getTime();
  }, [isRecurring, recurrenceEndDay, recurrenceEndMonthIndex, recurrenceEndYear]);

  const canSubmit =
    title.trim().length > 0 &&
    type !== null &&
    hasChosenDate &&
    hasChosenStartTime &&
    (!isRecurring || (recurrenceDays.length > 0 && recurrenceEndTimestamp !== null)) &&
    !submitting;
  const recurrenceDateLabel = recurrenceEndTimestamp
    ? formatScheduleDateShort(recurrenceEndTimestamp)
    : null;
  const recurrenceSummary = isRecurring
    ? `${formatDraftRecurrenceSummary(recurrenceDays) ?? 'Repeats weekly'}${
        recurrenceDateLabel ? ` until\n${recurrenceDateLabel}` : ''
      }`
    : null;

  const toggleRecurrenceDay = (weekday: number) => {
    setRecurrenceDays((prev) => {
      if (prev.includes(weekday)) {
        return prev.filter((value) => value !== weekday);
      }
      return [...prev, weekday].sort((left, right) => left - right);
    });
  };

  const handleRecurringToggle = (value: boolean) => {
    setIsRecurring(value);
    if (value && recurrenceDays.length === 0) {
      setRecurrenceDays([new Date(startTimestamp).getDay()]);
    }
    if (value && recurrenceEndsAt === null) {
      const nextEnd = buildDefaultRecurrenceEnd(startTimestamp);
      const parts = getDateParts(nextEnd);
      setRecurrenceEndsAt(nextEnd);
      setRecurrenceEndYear(parts.year);
      setRecurrenceEndMonthIndex(parts.monthIndex);
      setRecurrenceEndDay(parts.day);
    }
    if (!value) {
      setRecurrenceEndsAt(null);
    }
  };

  const closeRecurrenceModal = () => {
    setIsRecurrenceModalOpen(false);
    if (activePicker === 'repeat-until') {
      setActivePicker(null);
    }
  };

  const openRepeatUntilPicker = () => {
    setIsRecurrenceModalOpen(false);
    requestAnimationFrame(() => {
      setActivePicker('repeat-until');
    });
  };

  const closeRepeatUntilPicker = () => {
    setActivePicker(null);
    requestAnimationFrame(() => {
      setIsRecurrenceModalOpen(true);
    });
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }

    if (!type) {
      return;
    }

    if (endTimestamp !== null && endTimestamp <= startTimestamp) {
      Alert.alert('Invalid end time', 'Choose an end time that comes after the start time.');
      return;
    }

    if (isRecurring && recurrenceEndTimestamp !== null && recurrenceEndTimestamp < startTimestamp) {
      Alert.alert('Invalid repeat end', 'Choose an end date that comes on or after the event date.');
      return;
    }

    await onSubmit({
      type,
      category,
      title,
      startsAt: startTimestamp,
      endsAt: endTimestamp,
      location: location.trim() || null,
      locationLatitude: locationCoordinates?.latitude ?? null,
      locationLongitude: locationCoordinates?.longitude ?? null,
      notes: notes.trim() || null,
      isRecurring,
      recurrenceDays,
      recurrenceEndsAt: recurrenceEndTimestamp,
    });
  };

  return (
    <View style={styles.shell}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 136 + (onDelete ? 64 : 0) + Math.max(insets.bottom, Layout.padding) },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.typeSection}>
          <Text style={styles.sectionLabel}>Event Type</Text>
          <View style={styles.typeSegmentRow}>
            {(['practice', 'race'] as const).map((option) => {
              const selected = type === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => setType(option)}
                  style={[styles.typeSegmentButton, selected && styles.typeSegmentButtonSelected]}
                >
                  <Text
                    style={[styles.typeSegmentText, selected && styles.typeSegmentTextSelected]}
                  >
                    {option === 'practice' ? 'Practice' : 'Race'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.formCard}>
          <LabeledInput
            label="Event Name"
            value={title}
            onChangeText={setTitle}
            placeholder="Enter event name"
          />

          <View style={styles.dropdownField}>
            <SelectionRow
              label="Category"
              value={category || 'Select category'}
              isPlaceholder={!category}
              onPress={type ? () => setShowCategoryMenu((current) => !current) : null}
              keepBorderOpen={showCategoryMenu}
            />
            {showCategoryMenu ? (
              <View style={styles.dropdownMenu}>
                {categoryOptions.map((option, index) => {
                  const selected = option === category;
                  return (
                    <Pressable
                      key={option}
                      onPress={() => setCategory(option)}
                      style={[
                        styles.dropdownOption,
                        selected && styles.dropdownOptionSelected,
                        index === categoryOptions.length - 1 && styles.dropdownOptionLast,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dropdownOptionText,
                          selected && styles.dropdownOptionTextSelected,
                        ]}
                      >
                        {option}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>

          <SelectionRow
            label="Date"
            value={hasChosenDate ? formatEditorDate(startTimestamp) : 'Select event date'}
            isPlaceholder={!hasChosenDate}
            onPress={() => setActivePicker('date')}
          />

          <SelectionRow
            label="Start Time"
            value={hasChosenStartTime ? formatEditorTime(startTimestamp) : 'Select start time'}
            isPlaceholder={!hasChosenStartTime}
            onPress={() => setActivePicker('start-time')}
          />

          <SelectionRow
            label="End Time"
            value={hasEndTime && endTimestamp ? formatEditorTime(endTimestamp) : 'Select end time'}
            isPlaceholder={!hasEndTime}
            onPress={() => setActivePicker('end-time')}
          />

          <SelectionRow
            label="Recurring"
            value={isRecurring ? recurrenceSummary || 'Repeats weekly' : 'Select'}
            isPlaceholder={!isRecurring}
            onPress={() => setIsRecurrenceModalOpen(true)}
          />

          <SelectionRow
            label="Location"
            value={location || 'Select location'}
            isPlaceholder={!location}
            onPress={() => setIsLocationModalOpen(true)}
          />
        </View>

        <View style={styles.notesSection}>
          <Text style={styles.notesLabel}>Notes</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            style={styles.notesInput}
            multiline
            textAlignVertical="top"
            placeholder="Add notes"
            placeholderTextColor={Colors.textTertiary}
          />
        </View>
      </ScrollView>

      <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, Layout.padding) }]}>
        <BigButton
          title={submitting ? `${submitLabel}...` : submitLabel}
          onPress={() => void handleSubmit()}
          disabled={!canSubmit}
        />

        {onDelete ? (
          <BigButton
            title={deleting ? 'Deleting...' : 'Delete Event'}
            onPress={() => void onDelete()}
            variant="danger"
            disabled={deleting || submitting}
            style={styles.deleteButton}
          />
        ) : null}
      </View>

      <PickerSheet
        visible={activePicker === 'date'}
        title="Select Event Date"
        onDone={() => {
          setHasChosenDate(true);
          setActivePicker(null);
        }}
        onRequestClose={() => setActivePicker(null)}
      >
        <View style={styles.pickerColumns}>
          <View style={styles.pickerColumn}>
            <Picker selectedValue={monthIndex} onValueChange={(value: number | string) => setMonthIndex(Number(value))}>
              {MONTH_OPTIONS.map((option) => (
                <Picker.Item key={option.value} label={option.label} value={option.value} />
              ))}
            </Picker>
          </View>
          <View style={styles.pickerColumn}>
            <Picker selectedValue={day} onValueChange={(value: number | string) => setDay(Number(value))}>
              {dayOptions.map((option) => (
                <Picker.Item key={option} label={String(option)} value={option} />
              ))}
            </Picker>
          </View>
          <View style={styles.pickerColumn}>
            <Picker selectedValue={year} onValueChange={(value: number | string) => setYear(Number(value))}>
              {YEAR_OPTIONS.map((option) => (
                <Picker.Item key={option.value} label={option.label} value={option.value} />
              ))}
            </Picker>
          </View>
        </View>
      </PickerSheet>

      <PickerSheet
        visible={activePicker === 'repeat-until'}
        title="Repeat Until"
        onDone={() => {
          const nextEndsAt = new Date(
            recurrenceEndYear,
            recurrenceEndMonthIndex,
            recurrenceEndDay,
            23,
            59,
            59,
            999
          ).getTime();
          setRecurrenceEndsAt(nextEndsAt);
          closeRepeatUntilPicker();
        }}
        onRequestClose={closeRepeatUntilPicker}
      >
        <View style={styles.pickerColumns}>
          <View style={styles.pickerColumn}>
            <Picker
              selectedValue={recurrenceEndMonthIndex}
              onValueChange={(value: number | string) =>
                setRecurrenceEndMonthIndex(Number(value))
              }
            >
              {MONTH_OPTIONS.map((option) => (
                <Picker.Item key={option.value} label={option.label} value={option.value} />
              ))}
            </Picker>
          </View>
          <View style={styles.pickerColumn}>
            <Picker
              selectedValue={recurrenceEndDay}
              onValueChange={(value: number | string) => setRecurrenceEndDay(Number(value))}
            >
              {recurrenceEndDayOptions.map((option) => (
                <Picker.Item key={option} label={String(option)} value={option} />
              ))}
            </Picker>
          </View>
          <View style={styles.pickerColumn}>
            <Picker
              selectedValue={recurrenceEndYear}
              onValueChange={(value: number | string) => setRecurrenceEndYear(Number(value))}
            >
              {YEAR_OPTIONS.map((option) => (
                <Picker.Item key={option.value} label={option.label} value={option.value} />
              ))}
            </Picker>
          </View>
        </View>
      </PickerSheet>

      <PickerSheet
        visible={activePicker === 'start-time'}
        title="Select Start Time"
        onDone={() => {
          setHasChosenStartTime(true);
          setActivePicker(null);
        }}
        onRequestClose={() => setActivePicker(null)}
      >
        <View style={styles.pickerColumns}>
          <View style={styles.pickerColumn}>
            <Picker selectedValue={startHour} onValueChange={(value: number | string) => setStartHour(Number(value))}>
              {HOUR_OPTIONS.map((option) => (
                <Picker.Item key={option.value} label={option.label} value={option.value} />
              ))}
            </Picker>
          </View>
          <View style={styles.pickerColumn}>
            <Picker selectedValue={startMinute} onValueChange={(value: number | string) => setStartMinute(Number(value))}>
              {MINUTE_OPTIONS.map((option) => (
                <Picker.Item key={option.value} label={option.label} value={option.value} />
              ))}
            </Picker>
          </View>
          <View style={styles.pickerColumn}>
            <Picker
              selectedValue={startMeridiem}
              onValueChange={(value: string) => setStartMeridiem(value as 'AM' | 'PM')}
            >
              <Picker.Item label="AM" value="AM" />
              <Picker.Item label="PM" value="PM" />
            </Picker>
          </View>
        </View>
      </PickerSheet>

      <PickerSheet
        visible={activePicker === 'end-time'}
        title="Select End Time"
        doneLabel={hasEndTime ? 'Done' : 'Use End Time'}
        secondaryActionLabel={hasEndTime ? 'Remove End Time' : undefined}
        onSecondaryAction={() => {
          setHasEndTime(false);
          setActivePicker(null);
        }}
        onDone={() => {
          setHasEndTime(true);
          setActivePicker(null);
        }}
        onRequestClose={() => setActivePicker(null)}
      >
        <View style={styles.pickerColumns}>
          <View style={styles.pickerColumn}>
            <Picker selectedValue={endHour} onValueChange={(value: number | string) => setEndHour(Number(value))}>
              {HOUR_OPTIONS.map((option) => (
                <Picker.Item key={option.value} label={option.label} value={option.value} />
              ))}
            </Picker>
          </View>
          <View style={styles.pickerColumn}>
            <Picker selectedValue={endMinute} onValueChange={(value: number | string) => setEndMinute(Number(value))}>
              {MINUTE_OPTIONS.map((option) => (
                <Picker.Item key={option.value} label={option.label} value={option.value} />
              ))}
            </Picker>
          </View>
          <View style={styles.pickerColumn}>
            <Picker
              selectedValue={endMeridiem}
              onValueChange={(value: string) => setEndMeridiem(value as 'AM' | 'PM')}
            >
              <Picker.Item label="AM" value="AM" />
              <Picker.Item label="PM" value="PM" />
            </Picker>
          </View>
        </View>
      </PickerSheet>

      <Modal
        visible={isRecurrenceModalOpen}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        onRequestClose={closeRecurrenceModal}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeRecurrenceModal}
          />
          <View style={styles.recurrenceModalWrap}>
            <View style={styles.recurrenceModal}>
            <View style={styles.recurrenceHeader}>
              <Text style={styles.recurrenceTitle}>How often should this event occur?</Text>
              <Pressable onPress={closeRecurrenceModal} hitSlop={10}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.recurrenceToggleRow}>
              <Text style={styles.recurrenceToggleLabel}>Repeat weekly</Text>
              <Switch
                value={isRecurring}
                onValueChange={handleRecurringToggle}
                trackColor={{ false: Colors.border, true: Colors.primaryLight }}
                thumbColor={isRecurring ? Colors.primary : '#FFFFFF'}
              />
            </View>

            {isRecurring ? (
              <>
                <View style={styles.recurrenceFieldBlock}>
                  <SelectionRow
                    label="Repeat Until"
                    value={
                      recurrenceEndTimestamp
                        ? formatScheduleDateShort(recurrenceEndTimestamp)
                        : 'Select end date'
                    }
                    isPlaceholder={!recurrenceEndTimestamp}
                    onPress={openRepeatUntilPicker}
                  />
                </View>

                <View style={styles.weekdayGrid}>
                  {RECURRING_WEEKDAY_OPTIONS.map((weekday) => {
                    const selected = recurrenceDays.includes(weekday.value);
                    return (
                      <Pressable
                        key={weekday.value}
                        onPress={() => toggleRecurrenceDay(weekday.value)}
                        style={[styles.weekdayChip, selected && styles.weekdayChipSelected]}
                      >
                        <Text
                          style={[
                            styles.weekdayChipText,
                            selected && styles.weekdayChipTextSelected,
                          ]}
                        >
                          {weekday.shortLabel}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : (
              <Text style={styles.recurrenceHint}>This event will only happen once.</Text>
            )}

            <View style={styles.recurrenceActions}>
              <BigButton
                title="Done"
                onPress={closeRecurrenceModal}
                style={styles.recurrenceDoneButton}
              />
            </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isLocationModalOpen}
        presentationStyle="fullScreen"
        animationType="fade"
        onRequestClose={() => setIsLocationModalOpen(false)}
      >
        <View style={[styles.locationScreen, { paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.locationTopBar}>
            <Pressable onPress={() => setIsLocationModalOpen(false)} hitSlop={10}>
              <Text style={styles.locationTopAction}>Cancel</Text>
            </Pressable>
            <Text style={styles.locationScreenTitle}>Choose Location</Text>
            <Pressable
              onPress={() => {
                setLocation((selectedLocationResult?.address || locationDraft).trim());
                setIsLocationModalOpen(false);
              }}
              hitSlop={10}
              disabled={!locationDraft.trim()}
            >
              <Text
                style={[
                  styles.locationTopAction,
                  !locationDraft.trim() && styles.locationTopActionDisabled,
                ]}
              >
                Done
              </Text>
            </Pressable>
          </View>

          <View style={styles.locationSearchBar}>
            <Ionicons name="search" size={18} color={Colors.textTertiary} />
            <TextInput
              value={locationDraft}
              onChangeText={(text) => {
                setLocationDraft(text);
                setSelectedLocationResult(null);
              }}
              placeholder="Search address or place"
              placeholderTextColor={Colors.textTertiary}
              style={styles.locationSearchInput}
              autoCapitalize="words"
              autoFocus
            />
          </View>

          <View style={styles.locationMapWrap}>
            {locationCoordinates ? (
              <MapView
                style={styles.locationMap}
                initialRegion={{
                  ...locationCoordinates,
                  latitudeDelta: 0.015,
                  longitudeDelta: 0.015,
                }}
                region={{
                  ...locationCoordinates,
                  latitudeDelta: 0.015,
                  longitudeDelta: 0.015,
                }}
              >
                <Marker coordinate={locationCoordinates} />
              </MapView>
            ) : (
              <View style={styles.locationMapFallback}>
                {isSearchingLocations ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <>
                    <Ionicons name="location-outline" size={26} color={Colors.primary} />
                    <Text style={styles.locationFallbackText}>
                      Search for a place to preview it on the map.
                    </Text>
                  </>
                )}
              </View>
            )}
          </View>

          <FlatList
            data={locationResults}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={locationResults.length === 0 ? styles.locationResultsEmpty : undefined}
            ListEmptyComponent={
              locationDraft.trim() ? (
                <View style={styles.locationEmptyState}>
                  {isSearchingLocations ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <Text style={styles.locationEmptyText}>No matching places found yet.</Text>
                  )}
                </View>
              ) : null
            }
            renderItem={({ item }) => {
              const selected = selectedLocationResult?.id === item.id;
              return (
                <Pressable
                  onPress={() => {
                    setSelectedLocationResult(item);
                    setLocationDraft(item.address);
                    setLocationCoordinates({
                      latitude: item.latitude,
                      longitude: item.longitude,
                    });
                  }}
                  style={[styles.locationResultRow, selected && styles.locationResultRowSelected]}
                >
                  <View style={styles.locationResultIconWrap}>
                    <Ionicons
                      name={selected ? 'location' : 'location-outline'}
                      size={18}
                      color={selected ? Colors.primary : Colors.textSecondary}
                    />
                  </View>
                  <View style={styles.locationResultTextWrap}>
                    <Text style={styles.locationResultTitle}>{item.title}</Text>
                    <Text style={styles.locationResultAddress} numberOfLines={2}>
                      {item.address}
                    </Text>
                  </View>
                </Pressable>
              );
            }}
          />

          {location ? (
            <BigButton
              title="Clear Location"
              onPress={() => {
                setLocation('');
                setLocationDraft('');
                setLocationCoordinates(null);
                setLocationResults([]);
                setSelectedLocationResult(null);
                setIsLocationModalOpen(false);
              }}
              variant="outline"
              style={styles.locationFooterButton}
            />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.inputBlock}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={styles.inputFieldWrap}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.textTertiary}
          style={styles.inputField}
          textAlign="left"
          autoCorrect={false}
          autoCapitalize="sentences"
          autoComplete="off"
        />
      </View>
    </View>
  );
}

function SelectionRow({
  label,
  value,
  onPress,
  isPlaceholder = false,
  keepBorderOpen = false,
}: {
  label: string;
  value: string;
  onPress: (() => void) | null;
  isPlaceholder?: boolean;
  keepBorderOpen?: boolean;
}) {
  return (
    <View style={styles.rowBlock}>
      <Pressable
        onPress={onPress ?? undefined}
        style={[styles.rowPressable, keepBorderOpen && styles.rowPressableActive]}
      >
        <Text style={styles.rowLabel}>{label}</Text>
        <View style={styles.rowValueWrap}>
          <Text style={[styles.rowValue, isPlaceholder && styles.rowPlaceholder]}>{value}</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
        </View>
      </Pressable>
    </View>
  );
}

function PickerSheet({
  visible,
  title,
  doneLabel = 'Done',
  secondaryActionLabel,
  onSecondaryAction,
  onDone,
  onRequestClose,
  children,
}: {
  visible: boolean;
  title: string;
  doneLabel?: string;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  onDone: () => void;
  onRequestClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onRequestClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onRequestClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={onDone} hitSlop={10}>
              <Text style={styles.sheetDone}>{doneLabel}</Text>
            </Pressable>
          </View>
          {children}
          {secondaryActionLabel && onSecondaryAction ? (
            <Pressable onPress={onSecondaryAction} style={styles.sheetSecondaryAction}>
              <Text style={styles.sheetSecondaryActionText}>{secondaryActionLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
  content: {
    padding: Layout.paddingLarge,
    gap: 18,
  },
  typeSection: {
    gap: 10,
  },
  sectionLabel: {
    fontSize: Layout.fontSizeSmall,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  typeSegmentRow: {
    flexDirection: 'row',
    gap: 10,
  },
  typeSegmentButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeSegmentButtonSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#EAF1FF',
  },
  typeSegmentText: {
    fontSize: Layout.fontSize,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  typeSegmentTextSelected: {
    color: Colors.primary,
  },
  formCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  rowBlock: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  inputBlock: {
    paddingHorizontal: Layout.padding,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    gap: 8,
  },
  inputLabel: {
    fontSize: Layout.fontSizeSmall,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputFieldWrap: {
    minHeight: 44,
    justifyContent: 'center',
  },
  rowPressable: {
    minHeight: 60,
    paddingHorizontal: Layout.padding,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  rowPressableActive: {
    backgroundColor: '#F8FBFF',
  },
  rowStatic: {
    minHeight: 60,
    paddingHorizontal: Layout.padding,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  rowValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  rowValue: {
    fontSize: Layout.fontSize,
    color: Colors.textSecondary,
    textAlign: 'right',
    flexShrink: 1,
  },
  rowPlaceholder: {
    color: Colors.textTertiary,
  },
  rowInput: {
    flex: 1,
    minHeight: 60,
    fontSize: Layout.fontSize,
    color: Colors.textSecondary,
    textAlign: 'right',
  },
  inputField: {
    minHeight: 44,
    fontSize: Layout.fontSize,
    color: Colors.text,
    paddingVertical: 0,
  },
  dropdownField: {
    position: 'relative',
    zIndex: 5,
  },
  dropdownMenu: {
    marginTop: 8,
    marginHorizontal: Layout.padding,
    marginBottom: 12,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 6,
  },
  dropdownOption: {
    minHeight: 46,
    paddingHorizontal: Layout.padding,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  dropdownOptionLast: {
    borderBottomWidth: 0,
  },
  dropdownOptionSelected: {
    backgroundColor: '#EFF6FF',
  },
  dropdownOptionText: {
    fontSize: Layout.fontSize,
    color: Colors.text,
  },
  dropdownOptionTextSelected: {
    color: Colors.primary,
    fontWeight: '700',
  },
  notesSection: {
    gap: 10,
  },
  notesLabel: {
    fontSize: Layout.fontSizeSmall,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  notesInput: {
    minHeight: 132,
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadius,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Layout.padding,
    paddingVertical: 14,
    fontSize: Layout.fontSize,
    color: Colors.text,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.28)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingBottom: 28,
  },
  sheetHeader: {
    minHeight: 56,
    paddingHorizontal: Layout.paddingLarge,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  sheetTitle: {
    fontSize: Layout.fontSize,
    fontWeight: '700',
    color: Colors.text,
  },
  sheetDone: {
    fontSize: Layout.fontSize,
    fontWeight: '700',
    color: Colors.primary,
  },
  sheetSecondaryAction: {
    alignSelf: 'center',
    marginTop: 12,
    paddingHorizontal: Layout.padding,
    paddingVertical: 8,
  },
  sheetSecondaryActionText: {
    fontSize: Layout.fontSize,
    fontWeight: '700',
    color: Colors.danger,
  },
  pickerColumns: {
    flexDirection: 'row',
  },
  pickerColumn: {
    flex: 1,
  },
  recurrenceModal: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: Layout.paddingLarge,
    gap: 18,
    width: '100%',
  },
  recurrenceModalWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Layout.paddingLarge,
  },
  recurrenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  recurrenceTitle: {
    flex: 1,
    fontSize: Layout.fontSizeLarge,
    fontWeight: '800',
    color: Colors.text,
  },
  recurrenceToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recurrenceToggleLabel: {
    fontSize: Layout.fontSize,
    fontWeight: '700',
    color: Colors.text,
  },
  recurrenceHint: {
    fontSize: Layout.fontSize,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  recurrenceFieldBlock: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  weekdayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  weekdayChip: {
    width: '22%',
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayChipSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#EAF1FF',
  },
  weekdayChipText: {
    fontSize: Layout.fontSizeSmall,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  weekdayChipTextSelected: {
    color: Colors.primary,
  },
  recurrenceActions: {
    marginTop: 4,
  },
  recurrenceDoneButton: {
    marginTop: 0,
  },
  locationScreen: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: Layout.paddingLarge,
  },
  locationTopBar: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  locationScreenTitle: {
    flex: 1,
    fontSize: Layout.fontSize,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
  },
  locationTopAction: {
    fontSize: Layout.fontSize,
    fontWeight: '700',
    color: Colors.primary,
    minWidth: 56,
  },
  locationTopActionDisabled: {
    color: Colors.textTertiary,
  },
  locationSearchBar: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: Layout.padding,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  locationSearchInput: {
    flex: 1,
    minHeight: 52,
    fontSize: Layout.fontSize,
    color: Colors.text,
  },
  locationMapWrap: {
    height: 220,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#E6EEF9',
    marginBottom: 14,
  },
  locationMap: {
    flex: 1,
  },
  locationMapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Layout.paddingLarge,
    gap: 10,
  },
  locationFallbackText: {
    fontSize: Layout.fontSize,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  locationActions: {
    gap: 10,
  },
  locationResultsEmpty: {
    flexGrow: 1,
  },
  locationEmptyState: {
    paddingTop: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationEmptyText: {
    fontSize: Layout.fontSize,
    color: Colors.textSecondary,
  },
  locationResultRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  locationResultRowSelected: {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    borderBottomColor: 'transparent',
    paddingHorizontal: 10,
  },
  locationResultIconWrap: {
    width: 24,
    alignItems: 'center',
    paddingTop: 2,
  },
  locationResultTextWrap: {
    flex: 1,
    gap: 3,
  },
  locationResultTitle: {
    fontSize: Layout.fontSize,
    fontWeight: '700',
    color: Colors.text,
  },
  locationResultAddress: {
    fontSize: Layout.fontSizeSmall,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  locationFooterButton: {
    marginTop: 12,
  },
  actionBar: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: Layout.paddingLarge,
    paddingTop: Layout.padding,
    gap: 10,
  },
  deleteButton: {
    marginTop: 0,
  },
});
