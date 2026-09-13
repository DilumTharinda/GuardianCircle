/**
 * Shared theme constants for GuardianCircle.
 * Central design tokens used across all modules.
 */

export const COLORS = {
  // Primary Brand & Emergency
  primary: '#E53935',
  primaryDark: '#C62828',
  primaryLight: '#FFEBEE',
  primaryMuted: 'rgba(229, 57, 53, 0.12)',

  // Neutrals & Backgrounds
  background: '#F8F9FA',
  card: '#FFFFFF',
  textPrimary: '#212121',
  textSecondary: '#757575',
  textMuted: '#9E9E9E',
  border: '#EEEEEE',
  borderDark: '#E0E0E0',
  divider: '#F0F0F0',

  // Status & Accents
  safeGreen: '#2E7D32',
  safeGreenLight: '#E8F5E9',
  warnOrange: '#FB8C00',
  warnOrangeLight: '#FFF3E0',
  dangerRed: '#D32F2F',
  dangerRedLight: '#FFCDD2',
  infoBlue: '#1976D2',
  infoBlueLight: '#E3F2FD',
  purple: '#7B1FA2',
  purpleLight: '#F3E5F5',

  // Overlay & Shadows
  overlay: 'rgba(0, 0, 0, 0.5)',
  shadow: '#000000',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const TYPOGRAPHY = {
  h1: { fontSize: 28, fontWeight: '700', color: COLORS.textPrimary },
  h2: { fontSize: 22, fontWeight: '700', color: COLORS.textPrimary },
  h3: { fontSize: 18, fontWeight: '600', color: COLORS.textPrimary },
  body1: { fontSize: 16, fontWeight: '400', color: COLORS.textPrimary },
  body2: { fontSize: 14, fontWeight: '400', color: COLORS.textSecondary },
  caption: { fontSize: 12, fontWeight: '500', color: COLORS.textMuted },
  badge: { fontSize: 11, fontWeight: '600' },
};

export const SHADOWS = {
  small: {
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  medium: {
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  large: {
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
};

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export default {
  COLORS,
  SPACING,
  TYPOGRAPHY,
  SHADOWS,
  RADIUS,
};
