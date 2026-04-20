import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoster } from '@/context/RosterContext';
import BigButton from '@/components/ui/BigButton';
import { Colors, GroupColors } from '@/constants/colors';
import { Layout } from '@/constants/layout';

export default function NewGroupScreen() {
  const router = useRouter();
  const { addGroup } = useRoster();
  const [name, setName] = useState('');
  const [color, setColor] = useState(GroupColors[0]);

  const handleSave = async () => {
    if (!name.trim()) return;
    await addGroup(name, color);
    router.back();
  };

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
      <View style={styles.form}>
        <Text style={styles.label}>Group Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Heat 1, Sprinters"
          placeholderTextColor={Colors.textTertiary}
          autoFocus
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

        <BigButton
          title="Create Group"
          onPress={handleSave}
          disabled={!name.trim()}
          style={styles.saveButton}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
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
  saveButton: {
    marginTop: 24,
  },
});
