import { Dimensions, PixelRatio, Platform } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Base screen width used for standard mobile layout (375dp)
const GUIDELINE_BASE_WIDTH = 375;
const GUIDELINE_BASE_HEIGHT = 812;

/**
 * Scales a linear dimension based on the device screen width.
 * @param {number} value The value to scale.
 * @returns {number} The scaled value.
 */
export const scale = (value) => {
  const scaleFactor = SCREEN_WIDTH / GUIDELINE_BASE_WIDTH;
  return Math.round(value * scaleFactor);
};

/**
 * Dynamically scales font size based on screen size with sensible min/max clamps
 * and PixelRatio rounding so text never clips or blows up across Android 8 through 16.
 * @param {number} size Base font size
 * @param {number} [factor=0.5] Moderate scaling factor between 0 (strict base) and 1 (linear scale)
 * @returns {number} The responsive font size
 */
export const normalize = (size, factor = 0.5) => {
  const scaleFactor = SCREEN_WIDTH / GUIDELINE_BASE_WIDTH;
  const newSize = size + (scale(size) - size) * factor;
  return Math.round(PixelRatio.roundToNearestPixel(newSize));
};

/**
 * Vertical scaling for heights and vertical margins.
 */
export const verticalScale = (value) => {
  const scaleFactor = SCREEN_HEIGHT / GUIDELINE_BASE_HEIGHT;
  return Math.round(value * scaleFactor);
};

export default {
  scale,
  normalize,
  verticalScale,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
};
