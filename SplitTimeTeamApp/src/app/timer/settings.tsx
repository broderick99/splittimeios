import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDatabase } from '@/context/DatabaseContext';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';
import {
  TIMER_SETTINGS_DEFAULTS,
  TIMER_SETTINGS_KEYS,
  getBooleanTimerSetting,
  setBooleanTimerSetting,
} from '@/utils/timer-settings';

type TimerSettingItem = {
  key: keyof typeof TIMER_SETTINGS_KEYS;
  title: string;
  description: string;
};

const SETTING_ITEMS: TimerSettingItem[] = [
  {
    key: 'autoReorder',
    title: 'Auto-Reorder Athletes',
    description: 'Move athletes through the queue automatically as splits are recorded.',
  },
  {
    key: 'showTapHints',
    title: 'Show Tap Hints',
    description: 'Show the little split hint text on each athlete timer tile.',
  },
  {
    key: 'showStatusStrip',
    title: 'Show Workout Status',
    description: 'Show the running, recovery, and stopped status strip above the timer groups.',
  },
];

export default function TimerSettingsScreen() {
  const db = useDatabase();
  const [settings, setSettings] = useState<{
    autoReorder: boolean;
    showTapHints: boolean;
    showStatusStrip: boolean;
  }>(TIMER_SETTINGS_DEFAULTS);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const [autoReorder, showTapHints, showStatusStrip] = await Promise.all([
        getBooleanTimerSetting(
          db,
          TIMER_SETTINGS_KEYS.autoReorder,
          TIMER_SETTINGS_DEFAULTS.autoReorder
        ),
        getBooleanTimerSetting(
          db,
          TIMER_SETTINGS_KEYS.showTapHints,
          TIMER_SETTINGS_DEFAULTS.showTapHints
        ),
        getBooleanTimerSetting(
          db,
          TIMER_SETTINGS_KEYS.showStatusStrip,
          TIMER_SETTINGS_DEFAULTS.showStatusStrip
        ),
      ]);

      if (!mounted) {
        return;
      }

      setSettings({
        autoReorder,
        showTapHints,
        showStatusStrip,
      });
    })();

    return () => {
      mounted = false;
    };
  }, [db]);

  const updateSetting = useCallback(
    async (key: keyof typeof TIMER_SETTINGS_KEYS, value: boolean) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
      await setBooleanTimerSetting(db, TIMER_SETTINGS_KEYS[key], value);
    },
    [db]
  );

  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.introCard}>
          <Text style={styles.introTitle}>Timer Settings</Text>
          <Text style={styles.introText}>
            Tune the timer screen so it works the way you want at practice.
          </Text>
        </View>

        <View style={styles.section}>
          {SETTING_ITEMS.map((item) => (
            <View key={item.key} style={styles.row}>
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
});
