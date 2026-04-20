import React, { createContext, useContext, useEffect, useState } from 'react';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDatabase } from '@/db/database';
import { ActivityIndicator, View, StyleSheet, Text } from 'react-native';
import { Colors } from '@/constants/colors';

interface DatabaseContextValue {
  db: SQLiteDatabase;
}

const DatabaseContext = createContext<DatabaseContextValue | null>(null);

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<SQLiteDatabase | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDatabase()
      .then(setDb)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Database error: {error}</Text>
      </View>
    );
  }

  if (!db) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return <DatabaseContext.Provider value={{ db }}>{children}</DatabaseContext.Provider>;
}

export function useDatabase(): SQLiteDatabase {
  const ctx = useContext(DatabaseContext);
  if (!ctx) throw new Error('useDatabase must be used within DatabaseProvider');
  return ctx.db;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 16,
    textAlign: 'center',
    padding: 20,
  },
});
