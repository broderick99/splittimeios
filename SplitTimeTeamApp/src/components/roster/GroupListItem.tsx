import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';
import type { Group } from '@/types';

interface GroupListItemProps {
  group: Group;
  athleteCount: number;
  onPress: () => void;
  onDelete: () => void;
  showDeleteAction?: boolean;
}

export default function GroupListItem({
  group,
  athleteCount,
  onPress,
  onDelete,
  showDeleteAction = true,
}: GroupListItemProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={onPress}
    >
      <View style={styles.left}>
        <View style={[styles.colorSwatch, { backgroundColor: group.color }]} />
        <View>
          <Text style={styles.name}>{group.name}</Text>
          <Text style={styles.count}>
            {athleteCount} {athleteCount === 1 ? 'athlete' : 'athletes'}
          </Text>
        </View>
      </View>
      {showDeleteAction && (
        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          hitSlop={12}
          style={styles.iconButton}
        >
          <FontAwesome name="trash-o" size={20} color={Colors.danger} />
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 74,
    paddingVertical: 16,
    paddingHorizontal: Layout.padding,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  pressed: {
    backgroundColor: Colors.surfaceSecondary,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  colorSwatch: {
    width: 24,
    height: 24,
    borderRadius: 6,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  count: {
    fontSize: Layout.fontSizeSmall,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  iconButton: {
    paddingVertical: 8,
    paddingLeft: 12,
  },
});
