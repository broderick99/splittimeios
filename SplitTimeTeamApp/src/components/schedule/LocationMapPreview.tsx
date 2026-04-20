import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { Layout } from '@/constants/layout';
import { geocodeMapQuery, type MapCoordinates } from '@/utils/maps';
import { getLocationDisplayAddress, getLocationDisplayName } from '@/utils/schedule';

interface LocationMapPreviewProps {
  location: string;
  latitude?: number | null;
  longitude?: number | null;
  onPress: () => void;
}

export default function LocationMapPreview({
  location,
  latitude = null,
  longitude = null,
  onPress,
}: LocationMapPreviewProps) {
  const [coordinates, setCoordinates] = useState<MapCoordinates | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const locationName = useMemo(() => getLocationDisplayName(location), [location]);
  const locationAddress = useMemo(() => getLocationDisplayAddress(location), [location]);

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (latitude != null && longitude != null) {
        setCoordinates({
          latitude,
          longitude,
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
  }, [latitude, location, longitude]);

  const region = useMemo<Region | null>(() => {
    if (!coordinates) {
      return null;
    }

    return {
      ...coordinates,
      latitudeDelta: 0.015,
      longitudeDelta: 0.015,
    };
  }, [coordinates]);

  return (
    <View style={styles.card}>
      <View style={styles.mapWrap}>
        {region ? (
          <MapView
            style={styles.map}
            initialRegion={region}
            region={region}
            pointerEvents="none"
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
          >
            <Marker coordinate={coordinates!} />
          </MapView>
        ) : (
          <View style={styles.fallbackMap}>
            {isLoading ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Ionicons name="location" size={28} color={Colors.primary} />
            )}
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <View style={styles.footerHeader}>
          <Text style={styles.footerLabel}>Location</Text>
          <Ionicons name="expand-outline" size={16} color={Colors.textSecondary} />
        </View>
        <Text style={styles.footerLocation} numberOfLines={2}>
          {locationName}
        </Text>
        {locationAddress ? (
          <Text style={styles.footerAddress} numberOfLines={2}>
            {locationAddress}
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={onPress}
        style={StyleSheet.absoluteFill}
        accessibilityRole="button"
        accessibilityLabel="Open location map"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  mapWrap: {
    height: 170,
    backgroundColor: '#DCE7F9',
  },
  map: {
    flex: 1,
  },
  fallbackMap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E6EEF9',
  },
  footer: {
    paddingHorizontal: Layout.padding,
    paddingBottom: 16,
    paddingTop: 14,
    backgroundColor: Colors.surface,
  },
  footerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  footerLabel: {
    fontSize: Layout.fontSizeSmall,
    fontWeight: '800',
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  footerLocation: {
    fontSize: Layout.fontSize,
    fontWeight: '700',
    color: Colors.text,
    lineHeight: 22,
  },
  footerAddress: {
    marginTop: 2,
    fontSize: Layout.fontSizeSmall,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
});
