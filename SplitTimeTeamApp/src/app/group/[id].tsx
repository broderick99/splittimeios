import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoster } from '@/context/RosterContext';
import BigButton from '@/components/ui/BigButton';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Colors, GroupColors } from '@/constants/colors';
import { Layout } from '@/constants/layout';

export default function EditGroupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { groups, athletes, updateGroup, deleteGroup, setGroupMembers } = useRoster();

  const group = groups.find((g) => g.id === id);
  const [name, setName] = useState(group?.name ?? '');
  const [color, setColor] = useState(group?.color ?? GroupColors[0]);
  const [showDelete, setShowDelete] = useState(false);

  // Multi-select: track which athletes are checked
  const initialSelected = useMemo(
    () => new Set(athletes.filter((a) => a.groupId === id).map((a) => a.id)),
    [athletes, id]
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(initialSelected);

  if (!group) {
    return (
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
        <Text style={styles.notFound}>Group not found</Text>
      </SafeAreaView>
    );
  }

  const toggleAthlete = (athleteId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(athleteId)) {
        next.delete(athleteId);
      } else {
        next.add(athleteId);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    await updateGroup(group.id, { name, color });
    await setGroupMembers(group.id, Array.from(selectedIds));
    router.back();
  };

  const handleDelete = async () => {
    await deleteGroup(group.id);
    setShowDelete(false);
    router.back();
  };

  const getInitials = (n: string) => {
    const parts = n.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  };

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: 132 + insets.bottom }]}>
        <View style={styles.form}>
          <Text style={styles.label}>Group Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Group name"
            placeholderTextColor={Colors.textTertiary}
            returnKeyType="done"
          />

          <Text style={styles.label}>Color</Text>
          <View style={styles.colorGrid}>
            {GroupColors.map((c) => (
              <Pressable
                key={c}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: c },
                  color === c && styles.colorSelected,
                ]}
                onPress={() => setColor(c)}
              />
            ))}
          </View>

          <Text style={styles.label}>
            Select Athletes ({selectedIds.size} selected)
          </Text>
          {athletes.length === 0 ? (
            <Text style={styles.noAthletes}>No athletes on roster yet</Text>
          ) : (
            <View style={styles.athleteList}>
              {athletes.map((athlete) => {
                const isSelected = selectedIds.has(athlete.id);
                const otherGroup =
                  athlete.groupId && athlete.groupId !== id
                    ? groups.find((g) => g.id === athlete.groupId)
                    : null;

                return (
                  <Pressable
                    key={athlete.id}
                    style={[styles.athleteRow, isSelected && styles.athleteRowSelected]}
                    onPress={() => toggleAthlete(athlete.id)}
                  >
                    {/* Checkbox */}
                    <View style={[styles.checkbox, isSelected && { backgroundColor: color, borderColor: color }]}>
                      {isSelected && <Text style={styles.checkmark}>✓</Text>}
                    </View>

                    {/* Avatar */}
                    {athlete.photoUri ? (
                      <Image source={{ uri: athlete.photoUri }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: color + '30' }]}>
                        <Text style={[styles.initials, { color }]}>{getInitials(athlete.name)}</Text>
                      </View>
                    )}

                    <View style={styles.athleteInfo}>
                      <Text style={styles.athleteName}>{athlete.name}</Text>
                      {otherGroup && (
                        <Text style={styles.otherGroup}>
                          Currently in {otherGroup.name}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, Layout.padding) }]}>
        <BigButton
          title="Delete Group"
          onPress={() => setShowDelete(true)}
          variant="danger"
          style={styles.actionButton}
        />
        <BigButton
          title="Save Changes"
          onPress={handleSave}
          disabled={!name.trim()}
          style={styles.actionButton}
        />
      </View>

      <ConfirmDialog
        visible={showDelete}
        title="Delete Group?"
        message={
          selectedIds.size > 0
            ? `"${group.name}" has ${selectedIds.size} athlete(s). They will become unassigned.`
            : `"${group.name}" will be permanently deleted.`
        }
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
  },
  form: {
    padding: Layout.paddingLarge,
    gap: 8,
  },
  label: {
    fontSize: Layout.fontSizeSmall,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 12,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadiusSmall,
    padding: Layout.padding,
    fontSize: Layout.fontSize,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
  },
  colorSwatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  colorSelected: {
    borderWidth: 3,
    borderColor: Colors.text,
  },
  noAthletes: {
    fontSize: Layout.fontSize,
    color: Colors.textTertiary,
    fontStyle: 'italic',
    padding: Layout.padding,
  },
  athleteList: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadiusSmall,
    overflow: 'hidden',
  },
  athleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: Layout.padding,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  athleteRowSelected: {
    backgroundColor: Colors.surfaceSecondary,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  initials: {
    fontSize: 14,
    fontWeight: '700',
  },
  athleteInfo: {
    flex: 1,
  },
  athleteName: {
    fontSize: Layout.fontSize,
    fontWeight: '600',
    color: Colors.text,
  },
  otherGroup: {
    fontSize: Layout.fontSizeSmall,
    color: Colors.warning,
    marginTop: 2,
  },
  actionBar: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: Layout.paddingLarge,
    paddingTop: Layout.padding,
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
  },
  notFound: {
    textAlign: 'center',
    padding: 40,
    color: Colors.textSecondary,
    fontSize: Layout.fontSize,
  },
});
