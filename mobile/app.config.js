module.exports = ({ config }) => {
  const androidGoogleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();

  const localTesting = process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === 'true';
  if (!androidGoogleMapsApiKey && !localTesting) {
    throw new Error('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY must be set before loading the Expo configuration.');
  }

  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      ...(androidGoogleMapsApiKey ? [['react-native-maps', { androidGoogleMapsApiKey }]] : []),
    ],
  };
};
