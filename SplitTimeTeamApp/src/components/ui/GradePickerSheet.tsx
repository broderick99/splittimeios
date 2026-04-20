import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { GRADE_OPTIONS } from '@/constants/grades';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';

interface GradePickerSheetProps {
  visible: boolean;
  selectedGrade: string | null;
  onSelect: (grade: string | null) => void;
  onClose: () => void;
}

export default function GradePickerSheet({
  visible,
  selectedGrade,
  onSelect,
  onClose,
}: GradePickerSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.headerAction}>Done</Text>
            </Pressable>
          </View>

          <Text style={styles.title}>Select Grade</Text>

          <Picker
            selectedValue={selectedGrade ?? ''}
            onValueChange={(value) => onSelect(value ? String(value) : null)}
            itemStyle={styles.pickerItem}
          >
            <Picker.Item label="No Grade" value="" />
            {GRADE_OPTIONS.map((grade) => (
              <Picker.Item key={grade} label={grade} value={grade} />
            ))}
          </Picker>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingBottom: 24,
  },
  header: {
    alignItems: 'flex-end',
    paddingHorizontal: Layout.paddingLarge,
    paddingTop: Layout.padding,
  },
  headerAction: {
    color: Colors.primary,
    fontSize: Layout.fontSize,
    fontWeight: '700',
  },
  title: {
    textAlign: 'center',
    fontSize: Layout.fontSizeLarge,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  pickerItem: {
    fontSize: 20,
    color: Colors.text,
  },
});
