// src/utils/parentChildIcons.js
//
// Parent-child data (see parentChildService.js) stores emoji in fields like
// avatarEmoji and safeZones[].icon. To show Google's Material Icons instead,
// without touching that data, the screens look the emoji up here.
//
// Material Icons is Google's icon set. It ships inside @expo/vector-icons,
// which the project already has, so nothing new needs installing:
//   import { MaterialIcons } from '@expo/vector-icons';
//   <MaterialIcons name={iconForEmoji(zone.icon)} size={22} color="#fff" />

const EMOJI_TO_ICON = {
  // People
  '👦': 'face',
  '👧': 'face',
  '🧒': 'child-care',
  '👵': 'people',
  // Places
  '🏫': 'school',
  '🏠': 'home',
  '📚': 'menu-book',
  '🌳': 'park',
  '⚽': 'sports-soccer',
  '🛡': 'local-police',
  '🏥': 'local-hospital',
  '📍': 'place',
  // Pets and items
  '🐕': 'pets',
  '🐈': 'pets',
  '🎒': 'work',
  '💼': 'work',
  '🔑': 'vpn-key',
  // Status
  '🚨': 'warning',
  '🔋': 'battery-full',
  '📞': 'phone',
  '📲': 'notifications-active',
  '📱': 'smartphone',
  '🚶': 'directions-walk',
  '🗺': 'map',
  '✅': 'check-circle',
};

// Emoji often carry an invisible variation selector (U+FE0F), so strip it
// before the lookup.
function normalize(emoji) {
  return typeof emoji === 'string' ? emoji.replace(/\uFE0F/g, '').trim() : '';
}

/**
 * Returns a Material Icons name for an emoji from the parent-child data.
 * @param {string} emoji
 * @param {string} [fallback='place'] - Used when the emoji isn't in the map.
 * @returns {string}
 */
export function iconForEmoji(emoji, fallback = 'place') {
  return EMOJI_TO_ICON[normalize(emoji)] || fallback;
}

/**
 * Material Icons name for a child's avatar.
 * @param {Object} child - A linked child record (uses child.avatarEmoji).
 * @returns {string}
 */
export function avatarIconForChild(child) {
  return iconForEmoji(child?.avatarEmoji, 'child-care');
}
