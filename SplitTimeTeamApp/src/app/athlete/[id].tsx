import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import GroupPicker from '@/components/roster/GroupPicker';
import BigButton from '@/components/ui/BigButton';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import GradePickerSheet from '@/components/ui/GradePickerSheet';
import { useAuth } from '@/context/AuthContext';
import { useRoster } from '@/context/RosterContext';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';
import { buildFullName, formatPhoneNumber, splitFullName } from '@/utils/profile-format';

export default function AthleteProfileScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { athletes, groups, teamRosterMembers, addAthlete, updateAthlete, deleteAthlete } = useRoster();
  const isRemotePlaceholder = typeof id === 'string' && id.startsWith('remote-');
  const remoteMemberId = isRemotePlaceholder ? id.slice('remote-'.length) : null;

  const athlete = athletes.find((entry) => entry.id === id);
  const remoteMember = teamRosterMembers.find(
    (member) =>
      member.role === 'athlete' &&
      (member.id === remoteMemberId || member.id === athlete?.remoteUserId)
  );
  const fallbackNameParts = useMemo(
    () =>
      splitFullName(
        athlete?.name ?? `${remoteMember?.firstName ?? ''} ${remoteMember?.lastName ?? ''}`.trim()
      ),
    [athlete?.name, remoteMember?.firstName, remoteMember?.lastName]
  );

  const [isEditing, setIsEditing] = useState(false);
  const [firstName, setFirstName] = useState(
    athlete?.firstName ?? remoteMember?.firstName ?? fallbackNameParts.firstName
  );
  const [lastName, setLastName] = useState(
    athlete?.lastName ?? remoteMember?.lastName ?? fallbackNameParts.lastName
  );
  const [groupId, setGroupId] = useState<string | null>(athlete?.groupId ?? null);
  const [photoUri, setPhotoUri] = useState<string | null>(athlete?.photoUri ?? null);
  const [age, setAge] = useState(
    athlete?.age != null
      ? String(athlete.age)
      : remoteMember?.age != null
        ? String(remoteMember.age)
        : ''
  );
  const [grade, setGrade] = useState(athlete?.grade ?? remoteMember?.grade ?? '');
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [showGradePicker, setShowGradePicker] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const selectedGroup = groups.find((group) => group.id === groupId);
  const displayName =
    buildFullName(firstName, lastName) ||
    athlete?.name ||
    `${remoteMember?.firstName ?? ''} ${remoteMember?.lastName ?? ''}`.trim() ||
    'Athlete Profile';
  const displayPhone =
    athlete?.phone || remoteMember?.phone
      ? formatPhoneNumber(athlete?.phone ?? remoteMember?.phone ?? '')
      : 'Not added';
  const displayEmail = athlete?.email ?? remoteMember?.email ?? 'Not added';
  const canShowEditAction = session?.user.role === 'coach' && (!!athlete || !!remoteMember);
  const canSaveProfile = buildFullName(firstName, lastName).trim().length > 0;
  const canShowGroupInfo = session?.user.role === 'coach';

  const launchLibrary = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  }, []);

  const launchCamera = useCallback(async () => {
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
  }, []);

  const pickPhoto = useCallback(() => {
    if (!isEditing) {
      return;
    }

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Choose from Library'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) void launchCamera();
          if (buttonIndex === 2) void launchLibrary();
        }
      );
      return;
    }

    Alert.alert('Change Photo', '', [
      { text: 'Take Photo', onPress: () => void launchCamera() },
      { text: 'Choose from Library', onPress: () => void launchLibrary() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [isEditing, launchCamera, launchLibrary]);

  const handleSave = useCallback(async () => {
    if (!athlete && !remoteMember) {
      return;
    }

    const resolvedFirstName = firstName.trim();
    const resolvedLastName = lastName.trim();
    const resolvedName = buildFullName(resolvedFirstName, resolvedLastName);

    if (!resolvedName) {
      return;
    }

    const nextAge = age.trim() ? Number(age) : null;

    if (athlete) {
      await updateAthlete(athlete.id, {
        name: resolvedName,
        firstName: resolvedFirstName,
        lastName: resolvedLastName,
        age: nextAge,
        grade: grade || null,
        groupId,
        photoUri,
      });
    } else if (remoteMember) {
      await addAthlete(resolvedName, groupId, photoUri, {
        remoteUserId: remoteMember.id,
        firstName: resolvedFirstName,
        lastName: resolvedLastName,
        email: remoteMember.email ?? null,
        phone: remoteMember.phone ?? null,
        age: nextAge,
        grade: grade || null,
      });
    }

    setIsEditing(false);
  }, [addAthlete, age, athlete, firstName, grade, groupId, lastName, photoUri, remoteMember, updateAthlete]);

  const handleDelete = useCallback(async () => {
    if (!athlete) {
      return;
    }

    await deleteAthlete(athlete.id);
    setShowDelete(false);
    router.back();
  }, [athlete, deleteAthlete, router]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: isEditing ? 'Edit Athlete' : 'Athlete Profile',
      headerLeft: () => (
        <Pressable
          onPress={() => {
            if (isEditing) {
              setIsEditing(false);
              return;
            }

            router.back();
          }}
          hitSlop={12}
        >
          <Text style={styles.headerAction}>Cancel</Text>
        </Pressable>
      ),
      headerRight: canShowEditAction
        ? () => (
            <Pressable
              onPress={() => {
                if (isEditing) {
                  if (!canSaveProfile) {
                    return;
                  }
                  void handleSave();
                  return;
                }

                setIsEditing(true);
              }}
              hitSlop={12}
              disabled={isEditing && !canSaveProfile}
            >
              <Text
                style={[
                  styles.headerAction,
                  isEditing && !canSaveProfile && styles.headerActionDisabled,
                ]}
              >
                {isEditing ? 'Save' : 'Edit'}
              </Text>
            </Pressable>
          )
        : undefined,
    });
  }, [canSaveProfile, canShowEditAction, handleSave, isEditing, navigation, router]);

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  if (!athlete && !remoteMember) {
    return (
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
        <Text style={styles.notFound}>Athlete not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <Pressable onPress={pickPhoto} disabled={!isEditing} style={styles.photoSection}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photo} />
            ) : (
              <View style={[styles.photo, styles.photoPlaceholder]}>
                <Text style={styles.initials}>{getInitials(displayName || 'AA')}</Text>
              </View>
            )}
          </Pressable>

          <Text style={styles.athleteName}>{displayName}</Text>
          <Text style={styles.athleteSubline}>
            {canShowGroupInfo
              ? selectedGroup?.name ?? (remoteMember ? 'Team athlete' : 'No group assigned')
              : 'Team athlete'}
          </Text>
          {isEditing && <Text style={styles.changePhoto}>Tap photo to change it</Text>}
        </View>

        {isEditing ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Edit Profile</Text>

            <Field label="First Name" value={firstName} onChangeText={setFirstName} />
            <Field label="Last Name" value={lastName} onChangeText={setLastName} />

            <Field
              label="Email"
              value={athlete?.email ?? remoteMember?.email ?? ''}
              onChangeText={() => {}}
              editable={false}
              keyboardType="email-address"
            />

            <Field
              label="Phone Number"
              value={displayPhone === 'Not added' ? '' : displayPhone}
              onChangeText={() => {}}
              editable={false}
              keyboardType="phone-pad"
            />

            <View style={styles.row}>
              <Field
                label="Age"
                value={age}
                onChangeText={setAge}
                keyboardType="number-pad"
                containerStyle={styles.rowField}
              />

              <View style={styles.rowField}>
                <Text style={styles.label}>Grade</Text>
                <Pressable style={styles.pickerButton} onPress={() => setShowGradePicker(true)}>
                  <Text style={[styles.pickerText, !grade && styles.placeholderText]}>
                    {grade || 'Select Grade'}
                  </Text>
                </Pressable>
              </View>
            </View>

            {canShowGroupInfo && (
              <>
                <Text style={styles.label}>Group</Text>
                <Pressable style={styles.pickerButton} onPress={() => setShowGroupPicker(true)}>
                  {selectedGroup ? (
                    <View style={styles.groupDisplay}>
                      <View style={[styles.dot, { backgroundColor: selectedGroup.color }]} />
                      <Text style={styles.pickerText}>{selectedGroup.name}</Text>
                    </View>
                  ) : (
                    <Text style={styles.placeholderText}>No Group</Text>
                  )}
                </Pressable>
              </>
            )}

          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Athlete Details</Text>
            <ProfileRow
              label="First Name"
              value={
                (athlete?.firstName ?? remoteMember?.firstName ?? fallbackNameParts.firstName) ||
                'Not added'
              }
            />
            <ProfileRow
              label="Last Name"
              value={
                (athlete?.lastName ?? remoteMember?.lastName ?? fallbackNameParts.lastName) ||
                'Not added'
              }
            />
            <ProfileRow label="Email" value={displayEmail} />
            <ProfileRow label="Phone Number" value={displayPhone} />
            <ProfileRow
              label="Age"
              value={
                athlete?.age != null
                  ? String(athlete.age)
                  : remoteMember?.age != null
                    ? String(remoteMember.age)
                    : 'Not added'
              }
            />
            <ProfileRow label="Grade" value={athlete?.grade ?? remoteMember?.grade ?? 'Not added'} />
            {canShowGroupInfo && (
              <ProfileRow label="Group" value={selectedGroup?.name ?? 'No Group'} />
            )}
            {!athlete && remoteMember && (
              <Text style={styles.remoteNote}>
                Edit this athlete to save a local profile and group assignment.
              </Text>
            )}

            <BigButton
              title="View Workout History"
              onPress={() => {
                if (athlete) {
                  router.push(`/athlete/history/${athlete.id}`);
                }
              }}
              variant="outline"
              style={styles.historyButton}
            />
          </View>
        )}

        {isEditing && (
          <BigButton
            title="Delete Athlete"
            onPress={() => setShowDelete(true)}
            variant="danger"
            style={styles.deleteButton}
          />
        )}
      </ScrollView>

      <GroupPicker
        visible={showGroupPicker}
        groups={groups}
        selectedGroupId={groupId}
        onSelect={setGroupId}
        onClose={() => setShowGroupPicker(false)}
      />

      <GradePickerSheet
        visible={showGradePicker}
        selectedGrade={grade || null}
        onSelect={(value) => setGrade(value ?? '')}
        onClose={() => setShowGradePicker(false)}
      />

      <ConfirmDialog
        visible={showDelete}
        title="Delete Athlete?"
        message={`"${displayName}" will be permanently removed from the roster.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />
    </SafeAreaView>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  editable?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'number-pad';
  containerStyle?: object;
}

function Field({
  label,
  value,
  onChangeText,
  editable = true,
  keyboardType = 'default',
  containerStyle,
}: FieldProps) {
  return (
    <View style={containerStyle}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        style={[styles.input, !editable && styles.inputDisabled]}
        keyboardType={keyboardType}
      />
    </View>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.profileRow}>
      <Text style={styles.profileLabel}>{label}</Text>
      <Text style={styles.profileValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Layout.paddingLarge,
    paddingBottom: 36,
    gap: 16,
  },
  headerAction: {
    fontSize: Layout.fontSize,
    fontWeight: '700',
    color: Colors.primary,
  },
  headerActionDisabled: {
    color: Colors.textTertiary,
  },
  heroCard: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadius,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Layout.paddingLarge,
  },
  photoSection: {
    alignItems: 'center',
  },
  photo: {
    width: 104,
    height: 104,
    borderRadius: 52,
  },
  photoPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surfaceSecondary,
  },
  initials: {
    fontSize: 30,
    fontWeight: '800',
    color: Colors.textSecondary,
  },
  athleteName: {
    marginTop: 14,
    fontSize: 28,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
  },
  athleteSubline: {
    marginTop: 6,
    fontSize: Layout.fontSize,
    color: Colors.textSecondary,
  },
  changePhoto: {
    marginTop: 10,
    fontSize: Layout.fontSizeSmall,
    color: Colors.primary,
    fontWeight: '600',
  },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadius,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Layout.paddingLarge,
  },
  sectionTitle: {
    fontSize: Layout.fontSizeLarge,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 16,
  },
  label: {
    fontSize: Layout.fontSizeSmall,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: Layout.borderRadiusSmall,
    paddingHorizontal: Layout.padding,
    paddingVertical: 14,
    fontSize: Layout.fontSize,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inputDisabled: {
    opacity: 0.75,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  rowField: {
    flex: 1,
  },
  pickerButton: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: Layout.borderRadiusSmall,
    paddingHorizontal: Layout.padding,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 52,
    justifyContent: 'center',
  },
  pickerText: {
    fontSize: Layout.fontSize,
    color: Colors.text,
  },
  placeholderText: {
    color: Colors.textTertiary,
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
  profileRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    gap: 6,
  },
  profileLabel: {
    fontSize: Layout.fontSizeSmall,
    color: Colors.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  profileValue: {
    fontSize: Layout.fontSize,
    color: Colors.text,
  },
  remoteNote: {
    marginTop: 16,
    fontSize: Layout.fontSizeSmall,
    lineHeight: 20,
    color: Colors.textSecondary,
  },
  historyButton: {
    marginTop: 24,
  },
  deleteButton: {
    marginTop: 4,
  },
  notFound: {
    textAlign: 'center',
    padding: 40,
    color: Colors.textSecondary,
    fontSize: Layout.fontSize,
  },
});
