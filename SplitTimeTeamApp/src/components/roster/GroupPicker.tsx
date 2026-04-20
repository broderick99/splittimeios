import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Modal } from 'react-native';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';
import type { Group } from '@/types';

interface GroupPickerProps {
  visible: boolean;
  groups: Group[];
  selectedGroupId: string | null;
  onSelect: (groupId: string | null) => void;
  onClose: () => void;
}

export default function GroupPicker({
  visible,
  groups,
  selectedGroupId,
  onSelect,
  onClose,
}: GroupPickerProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <Text style={styles.title}>Select Group</Text>
          <ScrollView style={styles.list}>
            <Pressable
              style={[styles.option, selectedGroupId === null && styles.optionSelected]}
              onPress={() => {
                onSelect(null);
                onClose();
              }}
            >
              <View style={[styles.dot, { backgroundColor: Colors.textTertiary }]} />
              <Text style={styles.optionText}>No Group</Text>
              {selectedGroupId === null && <Text style={styles.check}>✓</Text>}
            </Pressable>
            {groups.map((group) => (
              <Pressable
                key={group.id}
                style={[styles.option, selectedGroupId === group.id && styles.optionSelected]}
                onPress={() => {
                  onSelect(group.id);
                  onClose();
                }}
              >
                <View style={[styles.dot, { backgroundColor: group.color }]} />
                <Text style={styles.optionText}>{group.name}</Text>
                {selectedGroupId === group.id && <Text style={styles.check}>✓</Text>}
              </Pressable>
            ))}
          </ScrollView>
          <Pressable style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: Layout.paddingLarge,
    paddingBottom: 40,
    maxHeight: '60%',
  },
  title: {
    fontSize: Layout.fontSizeLarge,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Layout.padding,
  },
  list: {
    paddingHorizontal: Layout.padding,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Layout.padding,
    borderRadius: Layout.borderRadiusSmall,
    gap: 12,
  },
  optionSelected: {
    backgroundColor: Colors.surfaceSecondary,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  optionText: {
    fontSize: Layout.fontSize,
    color: Colors.text,
    flex: 1,
  },
  check: {
    fontSize: 18,
    color: Colors.primary,
    fontWeight: '700',
  },
  cancelButton: {
    marginTop: Layout.padding,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: Layout.fontSize,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
});
