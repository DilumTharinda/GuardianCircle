/**
 * GuardianCircle — First Admin Bootstrap Script
 *
 * PURPOSE: Creates the very first Admin/Moderator account in the system.
 * This script runs once, from the command line, by the Team Lead only.
 * It is never called by the mobile app or the admin dashboard.
 *
 * USAGE:
 *   node bootstrapAdmin.js
 *
 * REQUIREMENTS:
 *   - serviceAccountKey.json must be present in this directory
 *   - .env.bootstrap must contain FIRST_ADMIN_EMAIL and FIRST_ADMIN_PASSWORD
 */

require('dotenv').config({ path: './.env.bootstrap' });
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();
const authAdmin = getAuth();

async function createFirstAdmin() {
  const email = process.env.FIRST_ADMIN_EMAIL;
  const password = process.env.FIRST_ADMIN_PASSWORD;
  const displayName = process.env.FIRST_ADMIN_DISPLAY_NAME;

  if (!email || !password) {
    console.error('ERROR: FIRST_ADMIN_EMAIL and FIRST_ADMIN_PASSWORD must be set in .env.bootstrap');
    process.exit(1);
  }

  console.log(`Creating first Admin account for: ${email}`);

  try {
    // Step 1: Create the Firebase Auth user
    const userRecord = await authAdmin.createUser({
      email,
      password,
      displayName,
      emailVerified: true,
    });

    console.log(`✓ Firebase Auth user created: ${userRecord.uid}`);

    // Step 2: Set the Admin custom claim on the Auth token
    // This means even if the Firestore role is somehow altered,
    // the custom claim on the JWT still identifies this user as Admin
    await authAdmin.setCustomUserClaims(userRecord.uid, {
      role: 'admin_moderator',
    });

    console.log(`✓ Custom claim 'admin_moderator' set on Auth token`);

    // Step 3: Create the Firestore profile document
    await db.collection('users').doc(userRecord.uid).set({
      uid: userRecord.uid,
      email,
      displayName,
      role: 'admin_moderator',
      photoURL: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      notificationPrefs: {
        sos: true,
        journey: true,
        lostFound: true,
        geofence: true,
        reminders: true,
      },
      karma: 0,
    });

    console.log(`✓ Firestore profile document created`);

    // Step 4: Write an audit log entry for this bootstrap
    await db.collection('auditLog').add({
      action: 'ADMIN_BOOTSTRAP',
      targetUid: userRecord.uid,
      targetEmail: email,
      performedBy: 'SYSTEM_BOOTSTRAP',
      timestamp: FieldValue.serverTimestamp(),
      note: 'First Admin account created via bootstrap script',
    });

    console.log(`✓ Audit log entry written`);
    console.log('\n✅ Bootstrap complete. Change the Admin password immediately after first login.');
    console.log(`   Admin email: ${email}`);
    console.log(`   Admin UID:   ${userRecord.uid}`);

  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
      console.error('ERROR: An account with this email already exists. Bootstrap should only run once.');
    } else {
      console.error('Bootstrap failed:', error);
    }
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

createFirstAdmin();