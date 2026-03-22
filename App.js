import React, { useEffect, useState, useCallback } from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getDb } from './src/db/database';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setDbError(null);
    getDb()
      .then(() => {
        if (!cancelled) {
          setDbReady(true);
          setDbError(null);
        }
      })
      .catch((err) => {
        console.error('Database initialization failed:', err);
        if (!cancelled) {
          setDbReady(false);
          setDbError(err?.message || String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retryDb = useCallback(() => {
    setDbReady(false);
    setDbError(null);
    setAttempt((a) => a + 1);
  }, []);

  if (!dbReady && !dbError) {
    return (
      <SafeAreaProvider>
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
        </View>
      </SafeAreaProvider>
    );
  }

  if (dbError) {
    return (
      <SafeAreaProvider>
        <View style={[styles.centered, styles.errorBox]}>
          <Text style={styles.errorTitle}>{"Couldn't open database"}</Text>
          <Text style={styles.errorBody}>{dbError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={retryDb}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorBox: {
    paddingHorizontal: 16,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorBody: {
    fontSize: 14,
    color: '#444',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryBtn: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
});
