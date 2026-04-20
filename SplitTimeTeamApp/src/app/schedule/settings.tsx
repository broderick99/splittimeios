import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BigButton from '@/components/ui/BigButton';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';
import { useDatabase } from '@/context/DatabaseContext';
import { useAuth } from '@/context/AuthContext';
import { useSchedule } from '@/context/ScheduleContext';
import {
  SCHEDULE_SETTINGS_DEFAULTS,
  SCHEDULE_SETTINGS_KEYS,
  getBooleanScheduleSetting,
  setBooleanScheduleSetting,
} from '@/utils/schedule-settings';

type ScheduleSettingItem = {
  key: keyof typeof SCHEDULE_SETTINGS_KEYS;
  title: string;
  description: string;
};

const SETTING_ITEMS: ScheduleSettingItem[] = [
  {
    key: 'showFilters',
    title: 'Show Event Filters',
    description: 'Show the All Events, Practices, and Races chips at the top of Schedule.',
  },
  {
    key: 'showCategoryOnCards',
    title: 'Show Category on Cards',
    description: 'Show labels like Easy Run, Speed Workout, or Meet in the schedule list.',
  },
  {
    key: 'showLocationOnCards',
    title: 'Show Location on Cards',
    description: 'Show the event location line on schedule cards.',
  },
];

export default function ScheduleSettingsScreen() {
  const db = useDatabase();
  const { session } = useAuth();
  const { scheduleEvents, deleteAllScheduleEvents } = useSchedule();
  const [settings, setSettings] = useState<{
    showFilters: boolean;
    showCategoryOnCards: boolean;
    showLocationOnCards: boolean;
  }>(SCHEDULE_SETTINGS_DEFAULTS);

  const isCoach = session?.user.role === 'coach';

  useEffect(() => {
    let mounted = true;

    (async () => {
      const [showFilters, showCategoryOnCards, showLocationOnCards] = await Promise.all([
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

      if (!mounted) {
        return;
      }

      setSettings({
        showFilters,
        showCategoryOnCards,
        showLocationOnCards,
      });
    })();

    return () => {
      mounted = false;
    };
  }, [db]);

  const updateSetting = useCallback(
    async (key: keyof typeof SCHEDULE_SETTINGS_KEYS, value: boolean) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
      await setBooleanScheduleSetting(db, SCHEDULE_SETTINGS_KEYS[key], value);
    },
    [db]
  );

  const handleDeleteAllSchedule = useCallback(() => {
    if (scheduleEvents.length === 0) {
      return;
    }

    Alert.alert(
      'Delete entire schedule?',
      'This will permanently remove every schedule event for this team.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: () => {
            void deleteAllScheduleEvents();
          },
        },
      ]
    );
  }, [deleteAllScheduleEvents, scheduleEvents.length]);

  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.introCard}>
          <Text style={styles.introTitle}>Schedule Settings</Text>
          <Text style={styles.introText}>
            Adjust how the schedule looks and keep the destructive actions tucked away here.
          </Text>
        </View>

        <View style={styles.section}>
          {SETTING_ITEMS.map((item, index) => (
            <View
              key={item.key}
              style={[styles.row, index === SETTING_ITEMS.length - 1 && styles.rowLast]}
            >
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.rowDescription}>{item.description}</Text>
              </View>
              <Switch
                value={settings[item.key]}
                onValueChange={(value) => {
                  void updateSetting(item.key, value);
                }}
                trackColor={{ false: Colors.border, true: Colors.primary + '66' }}
                thumbColor={settings[item.key] ? Colors.primary : '#FFFFFF'}
                ios_backgroundColor={Colors.border}
              />
            </View>
          ))}
        </View>

        {isCoach ? (
          <View style={styles.dangerSection}>
            <Text style={styles.dangerTitle}>Danger Zone</Text>
            <Text style={styles.dangerText}>
              Delete the full team schedule only if you are sure. This cannot be undone.
            </Text>
            <BigButton
              title="Delete All Schedule"
              onPress={handleDeleteAllSchedule}
              disabled={scheduleEvents.length === 0}
              style={styles.deleteButton}
            />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Layout.paddingLarge,
    gap: 18,
  },
  introCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: Layout.paddingLarge,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: 8,
  },
  introTitle: {
    fontSize: Layout.fontSizeLarge,
    fontWeight: '800',
    color: Colors.text,
  },
  introText: {
    fontSize: Layout.fontSize,
    lineHeight: 22,
    color: Colors.textSecondary,
  },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: Layout.paddingLarge,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowText: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    fontSize: Layout.fontSize,
    fontWeight: '700',
    color: Colors.text,
  },
  rowDescription: {
    fontSize: Layout.fontSizeSmall,
    lineHeight: 19,
    color: Colors.textSecondary,
  },
  dangerSection: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: Layout.paddingLarge,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: 10,
  },
  dangerTitle: {
    fontSize: Layout.fontSize,
    fontWeight: '800',
    color: Colors.text,
  },
  dangerText: {
    fontSize: Layout.fontSizeSmall,
    lineHeight: 19,
    color: Colors.textSecondary,
  },
  deleteButton: {
    marginTop: 6,
  },
});
