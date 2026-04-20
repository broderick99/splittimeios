import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import ScheduleEventEditor from '@/components/schedule/ScheduleEventEditor';
import { useAuth } from '@/context/AuthContext';
import { useSchedule } from '@/context/ScheduleContext';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';

export default function NewScheduleEventScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { createScheduleEvent } = useSchedule();
  const [submitting, setSubmitting] = useState(false);
  const isCoach = session?.user.role === 'coach';

  if (!isCoach) {
    return (
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
        <View style={styles.lockedState}>
          <Text style={styles.lockedTitle}>Coach Only</Text>
          <Text style={styles.lockedBody}>Only coaches can create schedule events.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScheduleEventEditor
          submitLabel="Save Event"
          submitting={submitting}
          onSubmit={async (input) => {
            setSubmitting(true);
            try {
              await createScheduleEvent(input);
              router.back();
            } finally {
              setSubmitting(false);
            }
          }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  lockedState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Layout.paddingLarge,
  },
  lockedTitle: {
    fontSize: Layout.fontSizeLarge,
    fontWeight: '800',
    color: Colors.text,
  },
  lockedBody: {
    marginTop: 8,
    fontSize: Layout.fontSize,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
