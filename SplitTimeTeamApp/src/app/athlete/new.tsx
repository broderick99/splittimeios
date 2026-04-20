import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, Image, ActionSheetIOS, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoster } from '@/context/RosterContext';
import * as ImagePicker from 'expo-image-picker';
import GroupPicker from '@/components/roster/GroupPicker';
import BigButton from '@/components/ui/BigButton';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';

export default function NewAthleteScreen() {
  const router = useRouter();
  const { groups, addAthlete } = useRoster();
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [showGroupPicker, setShowGroupPicker] = useState(false);

  const selectedGroup = groups.find((g) => g.id === groupId);

  const launchLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const launchCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Needed', 'Camera access is required to take a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const pickPhoto = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Choose from Library'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) launchCamera();
          else if (buttonIndex === 2) launchLibrary();
        }
      );
    } else {
      Alert.alert('Change Photo', '', [
        { text: 'Take Photo', onPress: launchCamera },
        { text: 'Choose from Library', onPress: launchLibrary },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    await addAthlete(name, groupId, photoUri);
    router.back();
  };

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
      <View style={styles.form}>
        {/* Photo */}
        <Pressable onPress={pickPhoto} style={styles.photoSection}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} />
          ) : (
            <View style={[styles.photo, styles.photoPlaceholder]}>
              <Text style={styles.photoIcon}>+</Text>
              <Text style={styles.photoLabel}>Photo</Text>
            </View>
          )}
        </Pressable>

        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Athlete name"
          placeholderTextColor={Colors.textTertiary}
          autoFocus
          returnKeyType="done"
        />

        <Text style={styles.label}>Group</Text>
        <Pressable style={styles.pickerButton} onPress={() => setShowGroupPicker(true)}>
          {selectedGroup ? (
            <View style={styles.groupDisplay}>
              <View style={[styles.dot, { backgroundColor: selectedGroup.color }]} />
              <Text style={styles.pickerText}>{selectedGroup.name}</Text>
            </View>
          ) : (
            <Text style={styles.pickerPlaceholder}>No Group</Text>
          )}
        </Pressable>

        <BigButton
          title="Add Athlete"
          onPress={handleSave}
          disabled={!name.trim()}
          style={styles.saveButton}
        />
      </View>

      <GroupPicker
        visible={showGroupPicker}
        groups={groups}
        selectedGroupId={groupId}
        onSelect={setGroupId}
        onClose={() => setShowGroupPicker(false)}
      />
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
  photoSection: {
    alignItems: 'center',
    marginBottom: 8,
  },
  photo: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  photoPlaceholder: {
    backgroundColor: Colors.surfaceSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  photoIcon: {
    fontSize: 28,
    color: Colors.textTertiary,
    fontWeight: '300',
  },
  photoLabel: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 2,
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
  pickerButton: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadiusSmall,
    padding: Layout.padding,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  groupDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  pickerText: {
    fontSize: Layout.fontSize,
    color: Colors.text,
  },
  pickerPlaceholder: {
    fontSize: Layout.fontSize,
    color: Colors.textTertiary,
  },
  saveButton: {
    marginTop: 24,
  },
});
