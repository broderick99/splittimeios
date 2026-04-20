import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';

interface EmptyStateProps {
  title: string;
  subtitle?: string;
}

export default function EmptyState({ title, subtitle }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Layout.paddingLarge,
    paddingTop: 80,
  },
  title: {
    fontSize: Layout.fontSizeLarge,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: Layout.fontSize,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: 8,
  },
});
