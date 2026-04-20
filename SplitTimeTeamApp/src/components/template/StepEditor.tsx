import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';
import type { BuilderStep, DistanceUnit, TemplateStepType } from '@/types';
import { generateId } from '@/utils/id';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import DistanceScrollPicker from './DistanceScrollPicker';
import DurationScrollPicker from './DurationScrollPicker';

interface StepEditorProps {
  initial?: BuilderStep | null;
  onSave: (step: BuilderStep) => void;
  onCancel: () => void;
}

type RecoveryMode = 'duration' | 'distance';

/** Split a decimal number into whole and fractional-hundredths parts */
function splitDistance(value: number | null | undefined): { whole: number; decimal: number } {
  if (value == null || value <= 0) return { whole: 0, decimal: 1 };
  const whole = Math.floor(value);
  const decimal = Math.round((value - whole) * 100);
  if (whole === 0 && decimal === 0) return { whole: 0, decimal: 1 };
  return { whole, decimal };
}

export default function StepEditor({ initial, onSave, onCancel }: StepEditorProps) {
  const [type, setType] = useState<TemplateStepType>(initial?.type ?? 'work');

  // Recovery mode: timed countdown or coach-triggered by distance
  const [recoveryMode, setRecoveryMode] = useState<RecoveryMode>(() => {
    if (initial?.type === 'recovery' && initial?.distanceValue != null) return 'distance';
    return 'duration';
  });

  // Distance state — whole number + decimal hundredths + unit
  const initDist = splitDistance(initial?.distanceValue);
  const [whole, setWhole] = useState(initDist.whole);
  const [decimal, setDecimal] = useState(initDist.decimal);
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>(
    initial?.distanceUnit ?? 'm'
  );

  // Recovery duration
  const [recoveryMinutes, setRecoveryMinutes] = useState(() =>
    initial?.durationMs != null ? Math.floor(initial.durationMs / 60000) : 0
  );
  const [recoverySeconds, setRecoverySeconds] = useState(() => {
    if (initial?.durationMs != null) {
      return Math.floor((initial.durationMs % 60000) / 1000);
    }
    return 1;
  });

  // Preserve existing label when editing; if empty, runtime UI can derive a summary label.
  const [label, setLabel] = useState(initial?.label ?? '');

  const handleWholeChange = useCallback((v: number) => {
    setWhole(v);
    setDecimal((prev) => (v === 0 && prev === 0 ? 1 : prev));
  }, []);

  const handleDecimalChange = useCallback(
    (v: number) => {
      setDecimal(whole === 0 && v === 0 ? 1 : v);
    },
    [whole]
  );

  const handleRecoveryMinutesChange = useCallback((v: number) => {
    setRecoveryMinutes(v);
    setRecoverySeconds((prev) => (v === 0 && prev === 0 ? 1 : prev));
  }, []);

  const handleRecoverySecondsChange = useCallback(
    (v: number) => {
      setRecoverySeconds(recoveryMinutes === 0 && v === 0 ? 1 : v);
    },
    [recoveryMinutes]
  );

  const handleSave = () => {
    const hasDistance = whole > 0 || decimal > 0;
    const distanceValue = hasDistance ? whole + decimal / 100 : 0.01;

    const safeRecoveryMinutes = Math.max(0, recoveryMinutes);
    const safeRecoverySeconds = Math.max(0, Math.min(59, recoverySeconds));
    const durationTotalSeconds =
      safeRecoveryMinutes > 0 || safeRecoverySeconds > 0
        ? safeRecoveryMinutes * 60 + safeRecoverySeconds
        : 1;
    const durationMs = durationTotalSeconds * 1000;

    const isRecovery = type === 'recovery';

    onSave({
      id: initial?.id ?? generateId(),
      type,
      distanceValue: !isRecovery || recoveryMode === 'distance' ? distanceValue : null,
      distanceUnit:
        (!isRecovery || recoveryMode === 'distance') && distanceValue !== null
          ? distanceUnit
          : null,
      durationMs: isRecovery && recoveryMode === 'duration' ? durationMs : null,
      label: label.trim(),
    });
  };

  return (
    <SafeAreaView style={styles.fullScreen}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onCancel} hitSlop={12}>
          <Text style={styles.headerCancel}>Cancel</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{initial ? 'Edit Step' : 'Add Step'}</Text>
        <Pressable onPress={handleSave} hitSlop={12}>
          <Text style={styles.headerSave}>{initial ? 'Update' : 'Add'}</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Type toggle */}
          <Text style={styles.sectionLabel}>Step Type</Text>
          <View style={styles.typeToggle}>
            <Pressable
              onPress={() => setType('work')}
              style={[styles.typeBtn, type === 'work' && styles.typeBtnActiveWork]}
            >
              <FontAwesome
                name="bolt"
                size={16}
                color={type === 'work' ? '#FFFFFF' : Colors.textSecondary}
              />
              <Text style={[styles.typeBtnText, type === 'work' && styles.typeBtnTextActive]}>
                Work
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setType('recovery')}
              style={[styles.typeBtn, type === 'recovery' && styles.typeBtnActiveRecovery]}
            >
              <FontAwesome
                name="pause"
                size={16}
                color={type === 'recovery' ? '#FFFFFF' : Colors.textSecondary}
              />
              <Text style={[styles.typeBtnText, type === 'recovery' && styles.typeBtnTextActive]}>
                Recovery
              </Text>
            </Pressable>
          </View>

          {/* Work: distance scroll picker */}
          {type === 'work' && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Distance</Text>
              <DistanceScrollPicker
                whole={whole}
                decimal={decimal}
                unit={distanceUnit}
                onWholeChange={handleWholeChange}
                onDecimalChange={handleDecimalChange}
                onUnitChange={setDistanceUnit}
              />
            </View>
          )}

          {/* Recovery: mode toggle + picker */}
          {type === 'recovery' && (
            <>
              {/* Duration vs Distance toggle */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Recovery By</Text>
                <View style={styles.modeToggle}>
                  <Pressable
                    onPress={() => setRecoveryMode('duration')}
                    style={[styles.modeBtn, recoveryMode === 'duration' && styles.modeBtnActive]}
                  >
                    <FontAwesome
                      name="clock-o"
                      size={14}
                      color={recoveryMode === 'duration' ? '#FFFFFF' : Colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.modeBtnText,
                        recoveryMode === 'duration' && styles.modeBtnTextActive,
                      ]}
                    >
                      Duration
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setRecoveryMode('distance')}
                    style={[styles.modeBtn, recoveryMode === 'distance' && styles.modeBtnActive]}
                  >
                    <FontAwesome
                      name="arrows-h"
                      size={14}
                      color={recoveryMode === 'distance' ? '#FFFFFF' : Colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.modeBtnText,
                        recoveryMode === 'distance' && styles.modeBtnTextActive,
                      ]}
                    >
                      Distance
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Duration: timed countdown */}
              {recoveryMode === 'duration' && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Duration</Text>
                  <DurationScrollPicker
                    minutes={recoveryMinutes}
                    seconds={recoverySeconds}
                    onMinutesChange={handleRecoveryMinutesChange}
                    onSecondsChange={handleRecoverySecondsChange}
                  />
                </View>
              )}

              {/* Distance: coach taps to advance */}
              {recoveryMode === 'distance' && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Distance</Text>
                  <DistanceScrollPicker
                    whole={whole}
                    decimal={decimal}
                    unit={distanceUnit}
                    onWholeChange={handleWholeChange}
                    onDecimalChange={handleDecimalChange}
                    onUnitChange={setDistanceUnit}
                  />
                </View>
              )}
            </>
          )}

          {/* Optional custom label */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Label (optional)</Text>
            <TextInput
              style={styles.input}
              value={label}
              onChangeText={setLabel}
              placeholder={type === 'work' ? 'e.g. 400m, Tempo' : 'e.g. Jog recovery'}
              placeholderTextColor={Colors.textTertiary}
              autoCapitalize="sentences"
              returnKeyType="done"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.padding,
    paddingTop: 20,
    paddingBottom: 16,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerCancel: {
    fontSize: 16,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
  },
  headerSave: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primary,
  },
  scrollContent: {
    padding: Layout.paddingLarge,
    paddingBottom: 40,
  },
  sectionLabel: {
    fontSize: Layout.fontSizeSmall,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  typeToggle: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 28,
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: Layout.borderRadius,
    backgroundColor: Colors.surfaceSecondary,
  },
  typeBtnActiveWork: {
    backgroundColor: Colors.primary,
  },
  typeBtnActiveRecovery: {
    backgroundColor: Colors.recovery,
  },
  typeBtnText: {
    fontSize: Layout.fontSize,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  typeBtnTextActive: {
    color: '#FFFFFF',
  },
  modeToggle: {
    flexDirection: 'row',
    gap: 12,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: Layout.borderRadius,
    backgroundColor: Colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modeBtnActive: {
    backgroundColor: Colors.recovery,
    borderColor: Colors.recovery,
  },
  modeBtnText: {
    fontSize: Layout.fontSize,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  modeBtnTextActive: {
    color: '#FFFFFF',
  },
  section: {
    marginBottom: 28,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadius,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 20,
    color: Colors.text,
    fontWeight: '500',
    borderWidth: 1,
    borderColor: Colors.border,
  },
});
