import React from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { Colors } from '@/constants/colors';

type FloatingAddButtonProps = {
  onPress: () => void;
  accessibilityLabel?: string;
  style?: ViewStyle;
};

export default function FloatingAddButton({
  onPress,
  accessibilityLabel = 'Add',
  style,
}: FloatingAddButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={10}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, style]}
      onPress={onPress}
    >
      <Text style={styles.icon}>+</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonPressed: {
    backgroundColor: Colors.primaryLight,
  },
  icon: {
    fontSize: 28,
    lineHeight: 28,
    color: '#FFFFFF',
    fontWeight: '400',
    marginTop: -2,
  },
});
