/**
 * Shared theme constants for GuardianCircle.
 * Central design tokens used across all modules.
 *
 * UI Theme: Dark Green (applied to shell & auth screens)
 * Red is reserved exclusively for SOS / danger indicators.
 */

export const COLORS = {
  // ── SOS / Danger (red — DO NOT use for UI chrome) ──
  primary: '#E53935',
  primaryDark: '#C62828',
  primaryLight: '#FFEBEE',
  primaryMuted: 'rgba(229, 57, 53, 0.12)',

  // ── Dark Green UI Theme ──
  darkGreen: '#06756A',        // Deep forest green — headers, CTAs
  darkGreenMid: '#06756A',     // Mid green — active states, buttons
  darkGreenLight: '#0A9B8D',   // Lighter accent green
  darkGreenSurface: '#E0F2F1', // Tinted surface for cards / focus
  darkGreenMuted: 'rgba(6, 117, 106, 0.12)',

  // ── Neutrals & Backgrounds ──
  background: '#F4F6F4',       // Slightly green-tinted off-white
  surface: '#FFFFFF',          // Pure white cards
  card: '#FFFFFF',
  cardBackground: '#FFFFFF',
  textPrimary: '#1A1A1A',
  textSecondary: '#616161',
  textMuted: '#9E9E9E',
  border: '#E0E8E0',           // Faint green-tinted border
  borderDark: '#C8D8C8',
  divider: '#EEF2EE',
  white: '#FFFFFF',

  // ── Status Chips ──
  safeGreen: '#2E7D32',
  safeGreenLight: '#E8F5E9',
  accentGreen: '#00C853',      // Vivid safe/online badge
  warnOrange: '#FB8C00',
  warnOrangeLight: '#FFF3E0',
  dangerRed: '#D32F2F',
  dangerRedLight: '#FFCDD2',
  infoBlue: '#1565C0',
  infoBlueLight: '#E3F2FD',
  purple: '#7B1FA2',
  purpleLight: '#F3E5F5',
  missingPink: '#E91E63',
  missingPinkLight: '#FCE4EC',

  // ── Overlay & Shadows ──
  overlay: 'rgba(0, 0, 0, 0.5)',
  shadow: '#000000',
  greenShadow: '#1B5E20',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
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
    shadowColor: COLORS.greenShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  card: {
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
};

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const FONTS = {
  xs: 10,
  sm: 12,
  base: 14,
  md: 16,
  lg: 18,
  xl: 24,
  xxl: 28,
  regular: '400',
  medium: '500',
  semiBold: '600',
  bold: '700',
  danger: '#B91C1C',
};

export default {
  COLORS,
  SPACING,
  TYPOGRAPHY,
  SHADOWS,
  RADIUS,
  FONTS,
};

// ── Dynamic color palettes for dark/light mode ──────────────────

/** Light mode — default app colors */
export const LIGHT_COLORS = {
  // Header / brand (dark green)
  darkGreen: '#06756A',
  darkGreenMid: '#06756A',
  darkGreenLight: '#0A9B8D',
  darkGreenSurface: '#E0F2F1',
  darkGreenMuted: 'rgba(6, 117, 106, 0.12)',

  // SOS / danger (red)
  primary: '#E53935',
  primaryDark: '#C62828',
  dangerRed: '#D32F2F',
  dangerRedLight: '#FFCDD2',

  // Backgrounds
  background: '#F4F6F4',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  cardBackground: '#FFFFFF',

  // Text
  textPrimary: '#1A1A1A',
  textSecondary: '#616161',
  textMuted: '#9E9E9E',

  // Borders
  border: '#E0E8E0',
  borderDark: '#C8D8C8',
  divider: '#EEF2EE',

  // Status
  safeGreen: '#2E7D32',
  safeGreenLight: '#E8F5E9',
  accentGreen: '#00C853',
  warnOrange: '#FB8C00',
  warnOrangeLight: '#FFF3E0',
  missingPink: '#E91E63',
  missingPinkLight: '#FCE4EC',
  infoBlue: '#1565C0',
  infoBlueLight: '#E3F2FD',

  // Shadows
  shadow: '#000000',
  greenShadow: '#1B5E20',
  overlay: 'rgba(0,0,0,0.5)',

  // Misc
  white: '#FFFFFF',
  sosRing: 'rgba(229,57,53,0.18)',
};

/** Dark mode — dark-surface palette with same green brand */
export const DARK_COLORS = {
  // Header / brand (same green — stays vivid on dark)
  darkGreen: '#06756A',
  darkGreenMid: '#06756A',   // Slightly lighter so it pops on dark surface
  darkGreenLight: '#0A9B8D',
  darkGreenSurface: '#032B27',
  darkGreenMuted: 'rgba(6, 117, 106, 0.18)',

  // SOS / danger (unchanged)
  primary: '#EF5350',
  primaryDark: '#C62828',
  dangerRed: '#EF5350',
  dangerRedLight: '#3D1A1A',

  // Backgrounds (deep dark)
  background: '#0D1512',    // Very dark green-tinted black
  surface: '#1A2420',       // Dark card surface
  card: '#1A2420',
  cardBackground: '#1A2420',

  // Text
  textPrimary: '#E8F0E8',
  textSecondary: '#9AB09A',
  textMuted: '#5C7A5C',

  // Borders
  border: '#2A3D2A',
  borderDark: '#1F301F',
  divider: '#1E301E',

  // Status
  safeGreen: '#43A047',
  safeGreenLight: '#1A2E1A',
  accentGreen: '#00E676',
  warnOrange: '#FFA726',
  warnOrangeLight: '#2D1F0A',
  missingPink: '#F06292',
  missingPinkLight: '#2D0F1A',
  infoBlue: '#42A5F5',
  infoBlueLight: '#0D1E30',

  // Shadows
  shadow: '#000000',
  greenShadow: '#000000',
  overlay: 'rgba(0,0,0,0.7)',

  // Misc
  white: '#FFFFFF',
  sosRing: 'rgba(239,83,80,0.22)',
};

