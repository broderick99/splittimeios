import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Region } from 'react-native-maps';
import BigButton from '@/components/ui/BigButton';
import { useSchedule } from '@/context/ScheduleContext';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';
import {
  buildAppleMapsUrl,
  buildGoogleMapsAppUrl,
  buildGoogleMapsWebUrl,
  geocodeMapQuery,
  type MapCoordinates,
} from '@/utils/maps';

export default function ScheduleLocationMapScreen() {
  const { id, occurrence } = useLocalSearchParams<{ id: string; occurrence?: string }>();
  const { scheduleEvents, scheduleOverrides } = useSchedule();
  const [coordinates, setCoordinates] = useState<MapCoordinates | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const event = useMemo(
    () => scheduleEvents.find((item) => item.id === id) ?? null,
    [id, scheduleEvents]
  );
  const selectedOccurrenceStartsAt = occurrence ? Number(occurrence) : null;
  const selectedOverride = useMemo(
    () =>
      selectedOccurrenceStartsAt === null
        ? null
        : scheduleOverrides.find(
            (item) => item.eventId === id && item.occurrenceStartsAt === selectedOccurrenceStartsAt
          ) ?? null,
    [id, scheduleOverrides, selectedOccurrenceStartsAt]
  );

  const location = selectedOverride?.location ?? event?.location ?? null;
  const savedLatitude = selectedOverride?.locationLatitude ?? event?.locationLatitude ?? null;
  const savedLongitude = selectedOverride?.locationLongitude ?? event?.locationLongitude ?? null;

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (!location) {
        setCoordinates(null);
        setIsLoading(false);
        return;
      }

      if (savedLatitude != null && savedLongitude != null) {
        setCoordinates({
          latitude: savedLatitude,
          longitude: savedLongitude,
        });
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const result = await geocodeMapQuery(location);
        if (!active) {
          return;
        }

        setCoordinates(result);
      } catch {
        if (active) {
          setCoordinates(null);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [location, savedLatitude, savedLongitude]);

  const region = useMemo<Region | null>(() => {
    if (!coordinates) {
      return null;
    }

    return {
      ...coordinates,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    };
  }, [coordinates]);

  const openAppleMaps = async () => {
    if (!location) {
      return;
    }
    await Linking.openURL(buildAppleMapsUrl(location));
  };

  const openGoogleMaps = async () => {
    if (!location) {
      return;
    }

    const appUrl = buildGoogleMapsAppUrl(location);
    const canOpenApp = await Linking.canOpenURL(appUrl);
    await Linking.openURL(canOpenApp ? appUrl : buildGoogleMapsWebUrl(location));
  };

  if (!event || !location) {
    return (
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Location not available</Text>
          <Text style={styles.emptyBody}>This event does not have a location yet.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.container}>
      <View style={styles.mapWrap}>
        {region ? (
          <MapView style={styles.map} initialRegion={region}>
            <Marker coordinate={coordinates!} title={event.title} description={location} />
          </MapView>
        ) : (
          <View style={styles.loadingMap}>
            {isLoading ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <>
                <Text style={styles.emptyTitle}>Map preview unavailable</Text>
                <Text style={styles.emptyBody}>You can still open the location in Apple Maps or Google Maps.</Text>
              </>
            )}
          </View>
        )}
      </View>

      <View style={styles.infoPanel}>
        <Text style={styles.locationLabel}>Location</Text>
        <Text style={styles.locationValue}>{location}</Text>

        <BigButton title="Open in Apple Maps" onPress={() => void openAppleMaps()} />
        <BigButton
          title="Open in Google Maps"
          onPress={() => void openGoogleMaps()}
          style={styles.secondaryButton}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  mapWrap: {
    flex: 1,
    minHeight: 320,
  },
  map: {
    flex: 1,
  },
  loadingMap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Layout.paddingLarge,
    backgroundColor: '#E6EEF9',
    gap: 10,
  },
  infoPanel: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Layout.paddingLarge,
    gap: 12,
  },
  locationLabel: {
    fontSize: Layout.fontSizeSmall,
    fontWeight: '800',
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  locationValue: {
    fontSize: Layout.fontSize,
    fontWeight: '700',
    color: Colors.text,
    lineHeight: 22,
    marginBottom: 4,
  },
  secondaryButton: {
    marginTop: 0,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Layout.paddingLarge,
  },
  emptyTitle: {
    fontSize: Layout.fontSizeLarge,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
  },
  emptyBody: {
    marginTop: 8,
    fontSize: Layout.fontSize,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
