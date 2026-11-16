export const ROLES = {
  PRIMARY_USER: 'primary_user',
  PARENT_GUARDIAN: 'parent_guardian',
  CHILD_DEPENDENT: 'child_dependent',
  PET_OWNER: 'pet_owner',
  TRUSTED_CONTACT: 'trusted_contact',
  ADMIN_MODERATOR: 'admin_moderator',
};

export const ROLE_LABELS = {
  primary_user: 'Primary User',
  parent_guardian: 'Parent / Guardian',
  child_dependent: 'Child / Dependent',
  pet_owner: 'Pet Owner',
  trusted_contact: 'Trusted Contact',
  admin_moderator: 'Admin / Moderator',
};

export const isAdminRole = (role) => role === ROLES.ADMIN_MODERATOR;
