import { UsernameService } from './usernameService';

/**
 * Generate a random username during registration.
 * Format: Adjective + Noun + RandomNumber (e.g. HappyPanda123)
 */
export function generateRandomUsername() {
  return UsernameService.generateRandomUsername();
}

/**
 * Validates username syntax, length, and reserved keywords.
 */
export function validateUsername(username) {
  return UsernameService.validateUsername(username);
}

/**
 * Checks uniqueness in Firestore /usernames collection.
 */
export async function isUsernameTaken(username) {
  return UsernameService.isUsernameTaken(username);
}

