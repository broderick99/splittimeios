import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Colors } from '@/constants/colors';
import type { DistanceUnit } from '@/types';

/* ── Data ── */

const WHOLE_NUMBERS = Array.from({ length: 1000 }, (_, i) => i); // 0–999
const DECIMALS = Array.from({ length: 100 }, (_, i) => i);       // 0–99
const UNITS: { value: DistanceUnit; label: string }[] = [
  { value: 'm', label: 'm' },
  { value: 'km', label: 'km' },
  { value: 'mi', label: 'mi' },
];

/* ── Props ── */

interface DistanceScrollPickerProps {
  whole: number;
  decimal: number;
  unit: DistanceUnit;
  onWholeChange: (v: number) => void;
  onDecimalChange: (v: number) => void;
  onUnitChange: (v: DistanceUnit) => void;
}

export default function DistanceScrollPicker({
  whole,
  decimal,
  unit,
  onWholeChange,
  onDecimalChange,
  onUnitChange,
}: DistanceScrollPickerProps) {
  return (
    <View style={styles.container}>
      {/* Whole number */}
      <View style={styles.columnWhole}>
        <Picker
          selectedValue={whole}
          onValueChange={onWholeChange}
          style={styles.picker}
          itemStyle={styles.pickerItem}
        >
          {WHOLE_NUMBERS.map((n) => (
            <Picker.Item key={n} label={String(n)} value={n} />
          ))}
        </Picker>
      </View>

      <Text style={styles.dot}>.</Text>

      {/* Decimal */}
      <View style={styles.columnDecimal}>
        <Picker
          selectedValue={decimal}
          onValueChange={onDecimalChange}
          style={styles.picker}
          itemStyle={styles.pickerItem}
        >
          {DECIMALS.map((n) => (
            <Picker.Item
              key={n}
              label={String(n).padStart(2, '0')}
              value={n}
            />
          ))}
        </Picker>
      </View>

      {/* Unit */}
      <View style={styles.columnUnit}>
        <Picker
          selectedValue={unit}
          onValueChange={onUnitChange}
          style={styles.picker}
          itemStyle={styles.pickerItem}
        >
          {UNITS.map((u) => (
            <Picker.Item key={u.value} label={u.label} value={u.value} />
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
  columnWhole: {
    flex: 1.2,
  },
  columnDecimal: {
    flex: 1,
  },
  columnUnit: {
    flex: 0.8,
  },
  dot: {
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
