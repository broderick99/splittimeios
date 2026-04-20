import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';
import type { Athlete, Group } from '@/types';

interface AthleteListItemProps {
  athlete: Athlete;
  group: Group | undefined;
  onPress: () => void;
  onPhotoPress: () => void;
  onDelete: () => void;
  photoEditable?: boolean;
  showDeleteAction?: boolean;
  showGroupLabel?: boolean;
}

export default function AthleteListItem({
  athlete,
  group,
  onPress,
  onPhotoPress,
  onDelete,
  photoEditable = true,
  showDeleteAction = true,
  showGroupLabel = true,
}: AthleteListItemProps) {
  const getInitials = (name: string) => {
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={onPress}
    >
      <View style={styles.left}>
        <Pressable
          onPress={(event) => {
            if (!photoEditable) {
              return;
            }

            event.stopPropagation();
            onPhotoPress();
          }}
          hitSlop={8}
          style={styles.photoButton}
          disabled={!photoEditable}
        >
          {athlete.photoUri ? (
            <Image source={{ uri: athlete.photoUri }} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.photoPlaceholder]}>
              <Text style={styles.initials}>{getInitials(athlete.name)}</Text>
            </View>
          )}
        </Pressable>
        <View>
          <Text style={styles.name}>{athlete.name}</Text>
          {showGroupLabel && group && <Text style={styles.groupName}>{group.name}</Text>}
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
  photoButton: {
    borderRadius: 28,
  },
  photo: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  photoPlaceholder: {
    backgroundColor: Colors.surfaceSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  initials: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  groupName: {
    fontSize: Layout.fontSizeSmall,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  iconButton: {
    paddingVertical: 8,
    paddingLeft: 12,
  },
});
