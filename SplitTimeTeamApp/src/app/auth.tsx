import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BigButton from '@/components/ui/BigButton';
import GradePickerSheet from '@/components/ui/GradePickerSheet';
import { useAuth, getErrorMessage } from '@/context/AuthContext';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';
import { formatPhoneNumber } from '@/utils/profile-format';

type UserRole = 'coach' | 'athlete';
type AuthMode = 'signup' | 'login';

export default function AuthScreen() {
  const { apiBaseUrl, login, signupCoach, signupAthlete } = useAuth();

  const [role, setRole] = useState<UserRole>('coach');
  const [mode, setMode] = useState<AuthMode>('signup');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [teamName, setTeamName] = useState('');
  const [teamCode, setTeamCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [grade, setGrade] = useState('');
  const [password, setPassword] = useState('');
  const [showGradePicker, setShowGradePicker] = useState(false);

  const title = useMemo(() => {
    if (mode === 'login') {
      return role === 'coach' ? 'Coach Login' : 'Athlete Login';
    }

    return role === 'coach' ? 'Create Your Team' : 'Join Your Team';
  }, [mode, role]);

  const subtitle = useMemo(() => {
    if (mode === 'login') {
      return role === 'coach'
        ? 'Sign in to manage workouts, rosters, and team updates.'
        : 'Sign in to see your team, workouts, and upcoming practices.';
    }

    return role === 'coach'
      ? 'Create your coach account and start building your team space.'
      : 'Use your team code to join the right squad before practice starts.';
  }, [mode, role]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setErrorMessage(null);

    try {
      if (mode === 'login') {
        await login({
          email,
          password,
        });
      } else if (role === 'coach') {
        await signupCoach({
          teamName,
          firstName,
          lastName,
          email,
          phone,
          password,
        });
      } else {
        await signupAthlete({
          teamCode,
          firstName,
          lastName,
          email,
          phone,
          age: Number(age),
          grade,
          password,
        });
      }

    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const ctaLabel = submitting
    ? mode === 'login'
      ? 'Signing In...'
      : 'Creating Account...'
    : mode === 'login'
      ? 'Log In'
      : role === 'coach'
        ? 'Create Coach Account'
        : 'Join Team';

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardShell}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>SplitTeam</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>I am joining as</Text>
            <View style={styles.segmentTrack}>
              {(['coach', 'athlete'] as UserRole[]).map((option) => (
                <Pressable
                  key={option}
                  onPress={() => setRole(option)}
                  style={[styles.segment, role === option && styles.segmentActive]}
                >
                  <Text
                    style={[styles.segmentText, role === option && styles.segmentTextActive]}
                  >
                    {option === 'coach' ? 'Coach' : 'Athlete'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.sectionLabel, styles.modeLabel]}>Account action</Text>
            <View style={styles.segmentTrack}>
              {(['signup', 'login'] as AuthMode[]).map((option) => (
                <Pressable
                  key={option}
                  onPress={() => setMode(option)}
                  style={[styles.segment, mode === option && styles.segmentActive]}
                >
                  <Text
                    style={[styles.segmentText, mode === option && styles.segmentTextActive]}
                  >
                    {option === 'signup' ? 'Sign Up' : 'Log In'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {!apiBaseUrl && (
              <View style={styles.warningBanner}>
                <Text style={styles.warningTitle}>Backend URL Needed</Text>
                <Text style={styles.warningText}>
                  Add your Cloudflare Worker URL to `expo.extra.apiBaseUrl` in `app.json`.
                </Text>
              </View>
            )}

            {errorMessage && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            )}

            <View style={styles.form}>
              {mode === 'signup' && role === 'coach' && (
                <Field
                  label="Team Name"
                  value={teamName}
                  onChangeText={setTeamName}
                />
              )}

              {mode === 'signup' && role === 'athlete' && (
                <Field
                  label="Team Code"
                  value={teamCode}
                  onChangeText={(value) => setTeamCode(value.toUpperCase())}
                  autoCapitalize="characters"
                />
              )}

              {mode === 'signup' && (
                <>
                  <Field
                    label="First Name"
                    value={firstName}
                    onChangeText={setFirstName}
                  />
                  <Field
                    label="Last Name"
                    value={lastName}
                    onChangeText={setLastName}
                  />
                </>
              )}

              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />

              {mode === 'signup' && (
                <Field
                  label="Phone Number"
                  value={phone}
                  onChangeText={(value) => setPhone(formatPhoneNumber(value))}
                  keyboardType="phone-pad"
                />
              )}

              {mode === 'signup' && role === 'athlete' && (
                <View style={styles.row}>
                  <Field
                    label="Age"
                    value={age}
                    onChangeText={setAge}
                    keyboardType="number-pad"
                    containerStyle={styles.rowField}
                  />
                  <View style={styles.rowField}>
                    <Text style={styles.fieldLabel}>Grade</Text>
                    <Pressable style={styles.input} onPress={() => setShowGradePicker(true)}>
                      <Text style={[styles.gradeValue, !grade && styles.gradePlaceholder]}>
                        {grade || 'Select Grade'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}

              <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>

            <BigButton
              title={ctaLabel}
              onPress={() => void handleSubmit()}
              disabled={submitting}
              style={styles.cta}
            />

            <Text style={styles.footerCopy}>
              {mode === 'signup'
                ? role === 'coach'
                  ? 'You will create the team and receive a join code for athletes.'
                  : 'Ask your coach for the team code before signing up.'
                : 'Use the account email and password you already created.'}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <GradePickerSheet
        visible={showGradePicker}
        selectedGrade={grade || null}
        onSelect={(value) => setGrade(value ?? '')}
        onClose={() => setShowGradePicker(false)}
      />
    </SafeAreaView>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'number-pad';
  containerStyle?: object;
}

function Field({
  label,
  value,
  onChangeText,
  secureTextEntry,
  autoCapitalize = 'sentences',
  keyboardType = 'default',
  containerStyle,
}: FieldProps) {
  return (
    <View style={containerStyle}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={styles.input}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardShell: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Layout.paddingLarge,
    paddingTop: 20,
    paddingBottom: 40,
  },
  hero: {
    marginBottom: 22,
    gap: 8,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: Colors.primary,
  },
  title: {
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '800',
    color: Colors.text,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 23,
    color: Colors.textSecondary,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: Layout.paddingLarge,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  modeLabel: {
    marginTop: 18,
  },
  segmentTrack: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
  },
  segmentActive: {
    backgroundColor: Colors.surface,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 1,
  },
  segmentText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  segmentTextActive: {
    color: Colors.text,
  },
  warningBanner: {
    marginTop: 18,
    backgroundColor: Colors.warning + '14',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.warning + '35',
    gap: 4,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.warning,
  },
  warningText: {
    fontSize: 13,
    lineHeight: 19,
    color: Colors.textSecondary,
  },
  errorBanner: {
    marginTop: 18,
    backgroundColor: Colors.danger + '14',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.danger + '28',
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.danger,
    fontWeight: '600',
  },
  form: {
    marginTop: 20,
    gap: 14,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 52,
    justifyContent: 'center',
    fontSize: 16,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  gradeValue: {
    fontSize: 16,
    color: Colors.text,
  },
  gradePlaceholder: {
    color: Colors.textTertiary,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  rowField: {
    flex: 1,
  },
  cta: {
    marginTop: 24,
  },
  footerCopy: {
    marginTop: 14,
    fontSize: 13,
    lineHeight: 19,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
});
