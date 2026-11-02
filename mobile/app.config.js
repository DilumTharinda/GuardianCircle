module.exports = ({ config }) => {
  const androidGoogleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();

  if (!androidGoogleMapsApiKey) {
    throw new Error('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY must be set before loading the Expo configuration.');
  }

  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      ['react-native-maps', { androidGoogleMapsApiKey }],
    ],
  };
};
