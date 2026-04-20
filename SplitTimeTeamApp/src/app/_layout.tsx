import { Stack, useRouter, useSegments } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DatabaseProvider, useDatabase } from '@/context/DatabaseContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { AnnouncementProvider } from '@/context/AnnouncementContext';
import { ChatProvider } from '@/context/ChatContext';
import { RosterProvider } from '@/context/RosterContext';
import { ScheduleProvider } from '@/context/ScheduleContext';
import { TemplateProvider } from '@/context/TemplateContext';
import { WorkoutProvider } from '@/context/WorkoutContext';
import { getSetting, setSetting } from '@/db/settings';
import OnboardingModal from '@/components/ui/OnboardingModal';
import { StatusBar } from 'expo-status-bar';

const launchLogo = require('../../assets/images/splash-logo.png');

const LAUNCH_FADE_IN_MS = 700;
const LAUNCH_HOLD_MS = 650;
const LAUNCH_FADE_OUT_MS = 500;

export default function RootLayout() {
  const [showLaunchScreen, setShowLaunchScreen] = useState(true);
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.94)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let cancelled = false;

    const runLaunchAnimation = () => {
      Animated.sequence([
        Animated.parallel([
          Animated.timing(logoOpacity, {
            toValue: 1,
            duration: LAUNCH_FADE_IN_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(logoScale, {
            toValue: 1,
            duration: LAUNCH_FADE_IN_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(LAUNCH_HOLD_MS),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: LAUNCH_FADE_OUT_MS,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished && !cancelled) {
          setShowLaunchScreen(false);
        }
      });
    };

    const timeout = setTimeout(() => {
      runLaunchAnimation();
    }, 40);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [logoOpacity, logoScale, overlayOpacity]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <DatabaseProvider>
          <AuthProvider>
            <AnnouncementProvider>
              <ChatProvider>
                <ScheduleProvider>
                  <RosterProvider>
                    <TemplateProvider>
                      <WorkoutProvider>
                        <AppNavigator launchComplete={!showLaunchScreen} />
                      </WorkoutProvider>
                    </TemplateProvider>
                  </RosterProvider>
                </ScheduleProvider>
              </ChatProvider>
            </AnnouncementProvider>
          </AuthProvider>
        </DatabaseProvider>
      </SafeAreaProvider>
      <StatusBar style="dark" hidden={showLaunchScreen} animated />
      {showLaunchScreen && (
        <Animated.View style={[styles.launchOverlay, { opacity: overlayOpacity }]}>
          <Animated.Image
            source={launchLogo}
            resizeMode="contain"
            style={[
              styles.launchLogo,
              {
                opacity: logoOpacity,
                transform: [{ scale: logoScale }],
              },
            ]}
          />
        </Animated.View>
      )}
    </GestureHandlerRootView>
  );
}

const ONBOARDING_KEY = 'onboarding.completed';

function AppNavigator({ launchComplete }: { launchComplete: boolean }) {
  const db = useDatabase();
  const router = useRouter();
  const segments = useSegments();
  const { isHydrating, session } = useAuth();
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [checkedOnboarding, setCheckedOnboarding] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const value = await getSetting(db, ONBOARDING_KEY);
      if (!mounted) return;
      setNeedsOnboarding(value !== '1');
      setCheckedOnboarding(true);
    })();
    return () => {
      mounted = false;
    };
  }, [db]);

  useEffect(() => {
    if (!launchComplete || !checkedOnboarding || isHydrating || needsOnboarding) {
      return;
    }

    const activeRootSegment = segments[0];
    const isInAuthFlow = activeRootSegment === 'auth';

    if (!session && !isInAuthFlow) {
      router.replace('/auth');
      return;
    }

    if (session && isInAuthFlow) {
      router.replace('/(tabs)/roster');
    }
  }, [checkedOnboarding, isHydrating, launchComplete, needsOnboarding, router, segments, session]);

  const handleFinishOnboarding = async () => {
    await setSetting(db, ONBOARDING_KEY, '1');
    setNeedsOnboarding(false);
  };

  return (
    <>
      <Stack>
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="athlete/new"
          options={{ title: 'Add Athlete', presentation: 'modal' }}
        />
        <Stack.Screen
          name="athlete/[id]"
          options={{ title: 'Edit Athlete', presentation: 'modal' }}
        />
        <Stack.Screen
          name="athlete/history/[id]"
          options={{ title: 'Athlete History' }}
        />
        <Stack.Screen
          name="athlete/history/[id]/workout/[workoutId]"
          options={{ title: 'Athlete Splits' }}
        />
        <Stack.Screen
          name="group/new"
          options={{ title: 'New Group', presentation: 'modal' }}
        />
        <Stack.Screen
          name="group/[id]"
          options={{ title: 'Edit Group', presentation: 'modal' }}
        />
        <Stack.Screen
          name="announcement/new"
          options={{ title: 'New Announcement', presentation: 'modal' }}
        />
        <Stack.Screen
          name="schedule/new"
          options={{ title: 'New Event', presentation: 'modal' }}
        />
        <Stack.Screen
          name="schedule/[id]"
          options={{ title: 'Event Details' }}
        />
        <Stack.Screen
          name="schedule/[id]/map"
          options={{ title: 'Location Map' }}
        />
        <Stack.Screen
          name="schedule/[id]/edit"
          options={{ title: 'Edit Event', presentation: 'modal' }}
        />
        <Stack.Screen
          name="schedule/settings"
          options={{ title: 'Schedule Settings' }}
        />
        <Stack.Screen
          name="timer/settings"
          options={{ title: 'Timer Settings' }}
        />
        <Stack.Screen
          name="workout/[id]"
          options={{ title: 'Workout Details' }}
        />
        <Stack.Screen
          name="template/new"
          options={{ title: 'New Workout', presentation: 'modal' }}
        />
        <Stack.Screen
          name="template/[id]"
          options={{ title: 'Edit Workout', presentation: 'modal' }}
        />
      </Stack>

      {checkedOnboarding && (
        <OnboardingModal
          visible={launchComplete && needsOnboarding}
          onFinish={handleFinishOnboarding}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  launchOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  launchLogo: {
    width: 172,
    height: 172,
  },
});
