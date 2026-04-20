import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import BigButton from '@/components/ui/BigButton';
import { useAnnouncements } from '@/context/AnnouncementContext';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';

export default function NewAnnouncementScreen() {
  const router = useRouter();
  const { createAnnouncement } = useAnnouncements();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canPost = title.trim().length > 0 && body.trim().length > 0 && !submitting;

  const handlePost = async () => {
    if (!canPost) {
      return;
    }

    setSubmitting(true);
    try {
      await createAnnouncement({
        title,
        body,
      });
      router.back();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardShell}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <Text style={styles.label}>Title</Text>
            <TextInput value={title} onChangeText={setTitle} style={styles.input} />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Message</Text>
            <TextInput
              value={body}
              onChangeText={setBody}
              style={[styles.input, styles.bodyInput]}
              multiline
              textAlignVertical="top"
            />
          </View>

          <BigButton
            title={submitting ? 'Posting...' : 'Post'}
            onPress={() => void handlePost()}
            disabled={!canPost}
            style={styles.postButton}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
    padding: Layout.paddingLarge,
    gap: 18,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: Layout.fontSizeSmall,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.borderRadius,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Layout.padding,
    paddingVertical: 14,
    fontSize: Layout.fontSize,
    color: Colors.text,
  },
  bodyInput: {
    minHeight: 180,
  },
  postButton: {
    marginTop: 6,
  },
});
