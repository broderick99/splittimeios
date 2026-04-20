import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Colors } from '@/constants/colors';

const MINUTES = Array.from({ length: 181 }, (_, i) => i); // 0-180
const SECONDS = Array.from({ length: 60 }, (_, i) => i); // 0-59

interface DurationScrollPickerProps {
  minutes: number;
  seconds: number;
  onMinutesChange: (v: number) => void;
  onSecondsChange: (v: number) => void;
}

export default function DurationScrollPicker({
  minutes,
  seconds,
  onMinutesChange,
  onSecondsChange,
}: DurationScrollPickerProps) {
  return (
    <View style={styles.container}>
      <View style={styles.column}>
        <Picker
          selectedValue={minutes}
          onValueChange={onMinutesChange}
          style={styles.picker}
          itemStyle={styles.pickerItem}
        >
          {MINUTES.map((n) => (
            <Picker.Item key={`m-${n}`} label={String(n)} value={n} />
          ))}
        </Picker>
      </View>

      <Text style={styles.colon}>:</Text>

      <View style={styles.column}>
        <Picker
          selectedValue={seconds}
          onValueChange={onSecondsChange}
          style={styles.picker}
          itemStyle={styles.pickerItem}
        >
          {SECONDS.map((n) => (
            <Picker.Item key={`s-${n}`} label={String(n).padStart(2, '0')} value={n} />
          ))}
        </Picker>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 12,
    overflow: 'hidden',
    height: Platform.OS === 'ios' ? 215 : 200,
  },
  column: {
    flex: 1,
  },
  colon: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
  },
  picker: {
    width: '100%',
  },
  pickerItem: {
    fontSize: 22,
    fontWeight: '600',
    color: Colors.text,
  },
});
