import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';
import type { TemplateSummary } from '@/types';

interface TemplateListItemProps {
  template: TemplateSummary;
  onPress: () => void;
}

export default function TemplateListItem({ template, onPress }: TemplateListItemProps) {
  const dateStr = new Date(template.updatedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={onPress}
    >
      <View style={styles.iconContainer}>
        <FontAwesome name="clipboard" size={20} color={Colors.primary} />
      </View>
      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={1}>{template.name}</Text>
        <Text style={styles.meta}>
          {template.stepCount} step{template.stepCount !== 1 ? 's' : ''} &middot; {dateStr}
        </Text>
      </View>
      <FontAwesome name="chevron-right" size={14} color={Colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Layout.padding,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    gap: 12,
  },
  pressed: {
    backgroundColor: Colors.surfaceSecondary,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  name: {
    fontSize: Layout.fontSize,
    fontWeight: '600',
    color: Colors.text,
  },
  meta: {
    fontSize: Layout.fontSizeSmall,
    color: Colors.textTertiary,
    marginTop: 2,
  },
});
