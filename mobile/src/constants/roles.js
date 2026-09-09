/**
 * All user roles in GuardianCircle.
 * IMPORTANT: ADMIN is never selectable during normal registration.
 * It is only set via the backend bootstrap script or Admin promotion.
 */
export const ROLES = {
  PRIMARY_USER: 'primary_user',
  PARENT_GUARDIAN: 'parent_guardian',
  CHILD_DEPENDENT: 'child_dependent',
  PET_OWNER: 'pet_owner',
  TRUSTED_CONTACT: 'trusted_contact',
  ADMIN_MODERATOR: 'admin_moderator',   // Never shown in registration UI
};

/**
 * Roles that a user can self-select during registration.
 * Admin is intentionally excluded.
 */
export const SELECTABLE_ROLES = [
  { label: 'Personal User (General / Student / Adult)', value: ROLES.PRIMARY_USER },
  { label: 'Parent / Guardian', value: ROLES.PARENT_GUARDIAN },
  { label: 'Child / Dependent', value: ROLES.CHILD_DEPENDENT },
  { label: 'Pet Owner', value: ROLES.PET_OWNER },
  { label: 'Trusted Contact', value: ROLES.TRUSTED_CONTACT },
];

/**
 * Check if a role can access admin-only features.
 */
export function isAdmin(role) {
  return role === ROLES.ADMIN_MODERATOR;
}

/**
 * Check if a role is a child/dependent (simplified UI, cannot disable location sharing).
 */
export function isChild(role) {
  return role === ROLES.CHILD_DEPENDENT;
}