import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BigButton from '@/components/ui/BigButton';
import { Colors } from '@/constants/colors';
import { useAuth, getErrorMessage } from '@/context/AuthContext';

export default function YouScreen() {
  const { session, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (isLoggingOut) {
      return;
    }

    try {
      setIsLoggingOut(true);
      await logout();
    } catch (error) {
      Alert.alert('Could not log out', getErrorMessage(error));
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.name}>
            {session ? `${session.user.firstName} ${session.user.lastName}`.trim() : 'Your Account'}
          </Text>
          <Text style={styles.subtitle}>
            {session?.user.email ?? 'Signed in'}
          </Text>
        </View>

        <BigButton
          title={isLoggingOut ? 'Logging Out...' : 'Log Out'}
          onPress={handleLogout}
          disabled={isLoggingOut}
          style={styles.logoutButton}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 18,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 20,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: 6,
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
  },
  logoutButton: {
    marginTop: 4,
  },
});
