import Constants from 'expo-constants';

type ExtraConfig = {
  apiBaseUrl?: string;
};

export function getApiBaseUrl(): string | null {
  const rawValue =
    (Constants.expoConfig?.extra as ExtraConfig | undefined)?.apiBaseUrl?.trim() ?? '';

  if (!rawValue) {
    return null;
  }

  return rawValue.replace(/\/+$/, '');
}
