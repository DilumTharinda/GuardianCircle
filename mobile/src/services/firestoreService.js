import { UsernameService } from './usernameService';

/**
 * Checks if a username is available.
 * @param {string} username
 * @returns {Promise<{ available: boolean, error?: string }>}
 */
export async function checkUsernameAvailability(username) {
  const validation = UsernameService.validateUsername(username);
  if (!validation.valid) {
    return { available: false, error: validation.error };
  }
  const taken = await UsernameService.isUsernameTaken(username);
  if (taken) {
    return { available: false, error: 'Username is already taken.' };
  }
  return { available: true };
}

/**
 * Assigns or updates a username atomically in the /usernames collection.
 * @param {string} uid
 * @param {string} newUsername
 * @param {string} [oldUsername]
 */
export async function claimUsername(uid, newUsername, oldUsername = null) {
  if (oldUsername) {
    return UsernameService.updateUsername(uid, oldUsername, newUsername);
  }
  return UsernameService.assignUsername(uid, newUsername);
}

export { UsernameService };

