import React from 'react';
import { Modal, View, Text, StyleSheet, Pressable } from 'react-native';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={onCancel}>
        <View style={styles.dialog} onStartShouldSetResponder={() => true}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.buttons}>
            <Pressable
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
            >
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              style={[
                styles.button,
                { backgroundColor: destructive ? Colors.danger : Colors.primary },
              ]}
              onPress={onConfirm}
            >
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Layout.paddingLarge,
  },
  dialog: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadius,
    padding: Layout.paddingLarge,
    width: '100%',
    maxWidth: 340,
  },
  title: {
    fontSize: Layout.fontSizeLarge,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  message: {
    fontSize: Layout.fontSize,
    color: Colors.textSecondary,
    marginBottom: Layout.paddingLarge,
    lineHeight: 22,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    borderRadius: Layout.borderRadiusSmall,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: Colors.surfaceSecondary,
  },
  cancelText: {
    fontSize: Layout.fontSize,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  confirmText: {
    fontSize: Layout.fontSize,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
