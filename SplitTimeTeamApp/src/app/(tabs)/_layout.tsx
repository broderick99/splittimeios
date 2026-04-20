import { Tabs, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';

export default function TabLayout() {
  const { session } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const isAthlete = session?.user.role === 'athlete';

  useEffect(() => {
    if (!isAthlete) {
      return;
    }

    const activeTab = segments[1] ?? 'index';
    if (activeTab === 'index' || activeTab === 'workouts') {
      router.replace('/(tabs)/roster');
    }
  }, [isAthlete, router, segments]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textTertiary,
        tabBarStyle: {
          height: 88,
          paddingBottom: 24,
          paddingTop: 8,
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
        },
        tabBarItemStyle: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          textAlign: 'center',
        },
        headerStyle: {
          backgroundColor: Colors.surface,
        },
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 20,
          color: Colors.text,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Timer',
          href: isAthlete ? null : undefined,
          tabBarIcon: ({ color, size }) => (
            <FontAwesome name="clock-o" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Schedule',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome name="calendar" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="roster"
        options={{
          title: 'Team',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome name="users" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="workouts"
        options={{
          title: 'Workouts',
          href: isAthlete ? null : undefined,
          tabBarIcon: ({ color, size }) => (
            <FontAwesome name="clipboard" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="you"
        options={{
          title: 'You',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome name="user" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
