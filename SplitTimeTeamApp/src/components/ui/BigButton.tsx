import React from 'react';
import { Pressable, Text, StyleSheet, type ViewStyle } from 'react-native';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';

interface BigButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'success' | 'danger' | 'warning' | 'outline' | 'ghost';
  size?: 'normal' | 'large' | 'small';
  disabled?: boolean;
  style?: ViewStyle;
}

const variantStyles: Record<string, { bg: string; bgPressed: string; text: string }> = {
  primary: { bg: Colors.primary, bgPressed: Colors.primaryLight, text: '#FFFFFF' },
  success: { bg: Colors.success, bgPressed: Colors.successLight, text: '#FFFFFF' },
  danger: { bg: Colors.danger, bgPressed: Colors.dangerLight, text: '#FFFFFF' },
  warning: { bg: Colors.warning, bgPressed: Colors.warningLight, text: '#FFFFFF' },
  outline: { bg: 'transparent', bgPressed: Colors.surfaceSecondary, text: Colors.primary },
  ghost: { bg: 'transparent', bgPressed: Colors.surfaceSecondary, text: Colors.text },
};

export default function BigButton({
  title,
  onPress,
  variant = 'primary',
  size = 'normal',
  disabled = false,
  style,
}: BigButtonProps) {
  const v = variantStyles[variant];
  const height = size === 'large' ? Layout.buttonLarge : size === 'small' ? 36 : Layout.buttonMinHeight;
  const fontSize = size === 'large' ? Layout.fontSizeLarge : size === 'small' ? Layout.fontSizeSmall : Layout.fontSize;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: pressed ? v.bgPressed : v.bg,
          minHeight: height,
          opacity: disabled ? 0.5 : 1,
          borderWidth: variant === 'outline' ? 1.5 : 0,
          borderColor: variant === 'outline' ? Colors.primary : 'transparent',
        },
        style,
      ]}
    >
      <Text style={[styles.text, { color: v.text, fontSize }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: Layout.borderRadius,
    paddingHorizontal: Layout.padding,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontWeight: '700',
  },
});
