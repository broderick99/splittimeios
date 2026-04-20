export function buildAppleMapsUrl(query: string) {
  return `https://maps.apple.com/?q=${encodeURIComponent(query)}`;
}

export function buildGoogleMapsWebUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function buildGoogleMapsAppUrl(query: string) {
  return `comgooglemaps://?q=${encodeURIComponent(query)}`;
}

export type MapCoordinates = {
  latitude: number;
  longitude: number;
};

type NominatimResult = {
  lat: string;
  lon: string;
};

export async function geocodeMapQuery(query: string): Promise<MapCoordinates | null> {
  const trimmed = query.trim();
  if (!trimmed) {
    return null;
  }

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(trimmed)}&limit=1&addressdetails=1`,
    {
      headers: {
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error('Could not geocode location.');
  }

  const results = (await response.json()) as NominatimResult[];
  const first = results[0];

  if (!first) {
    return null;
  }

  return {
    latitude: Number(first.lat),
    longitude: Number(first.lon),
  };
}
