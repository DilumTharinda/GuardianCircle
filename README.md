# GuardianCircle

An Integrated Personal Safety, Location Tracking, and Lost & Found Mobile Platform

> Course: Mobile Applications Development (INTE 22283)
> Version: 1.0 — September 2026
> Team: 6 Members

---

## Table of Contents

- [What is GuardianCircle](#what-is-guardiancircle)
- [Technology Stack](#technology-stack)
- [Repository Structure](#repository-structure)
- [Team and Responsibilities](#team-and-responsibilities)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Folder Structure](#folder-structure)
- [Shared Data Model](#shared-data-model)
- [Screen Names (Routes)](#screen-names-routes)
- [User Roles](#user-roles)
- [Firestore Collections](#firestore-collections)
- [Git Workflow](#git-workflow)
- [Commit Message Format](#commit-message-format)
- [Branch Naming](#branch-naming)
- [Running the App](#running-the-app)
- [Third-Party Free Tier Limits](#third-party-free-tier-limits)

---

## What is GuardianCircle

GuardianCircle is a cross-platform mobile application built with React Native and Expo that runs on both Android (8.0+) and iOS (13+) from a single codebase. It brings together personal safety alerting, live location tracking, safe-route guidance, and community-based lost-and-found reporting into one platform.

The system also includes a separate Admin web dashboard used by staff to monitor live emergency alerts and moderate community content.

### Core Features

- **Personal Safety (SOS):** One-tap button, triple volume-press, shake gesture, home-screen widget, and automatic fall detection — all trigger an emergency alert to trusted contacts instantly.
- **Journey Tracking and Safe Routes:** Share a live trip, get automatic check-in on arrival, report unsafe areas, and get route suggestions that avoid those areas.
- **Lost and Found:** Report a lost item or pet with photo and location. The app automatically suggests matches against found reports from other users, with in-app chat to arrange handover.
- **Parent-Child Tracking:** A parent permanently links to a child account to see their live location, set safe zones (home, school), and always receive the child's SOS alerts.
- **Pet and Item Tracking (Optional Phase 2):** A small BLE tag attached to a pet collar or valuable item shows last known location and warns the owner if it goes out of range.
- **Admin Web Dashboard:** A separate responsive website where Admins monitor live alerts, moderate reports, and manage Admin promotions.

---

## Technology Stack

| Part of the System | Technology |
|---|---|
| Mobile app | React Native with Expo SDK 54 |
| Admin dashboard | React (separate web application) |
| Sign-up and login | Firebase Authentication |
| Main database | Cloud Firestore |
| Offline cache | Expo SQLite |
| Secure token storage | Expo SecureStore |
| Photos and media | Cloudinary (free tier) |
| Push notifications | Firebase Cloud Messaging (FCM) |
| Maps and location | Google Maps / Places API |
| Minimum Android version | Android 8.0 Oreo (API level 26) |
| Minimum iOS version | iOS 13.0 |
| Optional Bluetooth tag | ESP32 + BLE (react-native-ble-plx) |

---

## Repository Structure

```
guardiancircle/
│
├── mobile/                      # React Native + Expo phone app (Android and iOS)
│   ├── src/
│   │   ├── screens/             # All screens organized by module
│   │   │   ├── shell/           # Home screen and splash screen
│   │   │   ├── safety/          # SOS and emergency trigger screens (Member 2)
│   │   │   ├── journey/         # Journey tracking and map screens (Member 3)
│   │   │   ├── lostfound/       # Lost and found screens (Member 4)
│   │   │   ├── parentchild/     # Parent-child tracking screens (Member 5)
│   │   │   ├── pettracking/     # Pet and item tracking screens (Member 5)
│   │   │   └── account/         # Login, register, profile screens (Member 6)
│   │   ├── components/          # Reusable UI components organized by module
│   │   │   ├── common/          # Shared components used across modules
│   │   │   ├── safety/
│   │   │   ├── journey/
│   │   │   ├── lostfound/
│   │   │   └── parentchild/
│   │   ├── navigation/          # Stack and tab navigators
│   │   │   ├── AppNavigator.js
│   │   │   ├── AuthNavigator.js
│   │   │   └── MainTabNavigator.js
│   │   ├── services/            # Firebase, Cloudinary, and API call functions
│   │   │   ├── firebase.js      # Firebase initialization (import from here)
│   │   │   ├── authService.js
│   │   │   ├── firestoreService.js
│   │   │   ├── alertService.js
│   │   │   ├── notificationService.js
│   │   │   ├── locationService.js
│   │   │   └── cloudinaryService.js
│   │   ├── context/             # React context for shared state
│   │   │   ├── AuthContext.js   # Auth state and login/logout functions
│   │   │   └── UserContext.js
│   │   ├── hooks/               # Custom React hooks
│   │   │   ├── useAuth.js
│   │   │   ├── useLocation.js
│   │   │   └── useFirestore.js
│   │   ├── constants/           # Shared constants — ALL members use these
│   │   │   ├── roles.js         # User role constants
│   │   │   ├── routes.js        # Screen name constants
│   │   │   ├── theme.js         # Colors, fonts, spacing
│   │   │   └── config.js        # App-wide configuration values
│   │   └── utils/               # Pure utility functions
│   │       ├── permissions.js   # Runtime permission request helpers
│   │       ├── geohash.js       # Geohash helpers for location queries
│   │       └── dateHelpers.js
│   ├── assets/
│   │   ├── images/
│   │   └── fonts/
│   ├── App.js                   # Entry point
│   ├── app.json                 # Expo configuration (minSdkVersion: 26)
│   ├── .env                     # Secret keys — never commit this file
│   └── package.json
│
├── admin-dashboard/             # Separate React web app for Admin/Moderator
│   ├── src/
│   │   ├── pages/               # Dashboard pages
│   │   ├── components/          # Reusable web components
│   │   └── services/            # Firebase calls from the web app
│   ├── .env                     # Secret keys — never commit this file
│   └── package.json
│
├── scripts/                     # Backend utility scripts (not part of any app)
│   └── bootstrapAdmin.js        # One-time first Admin account creation script
│
├── firestore.rules              # Firestore security rules (reference copy)
└── README.md                    # This file
```

> **Critical rule:** The `mobile/` and `admin-dashboard/` projects must never share code or be bundled together. They share only the Firebase backend.

---

## Team and Responsibilities

| Member | Focus Area | Key Features |
|---|---|---|
| Member 1 (Team Lead) | Core infrastructure, authentication, security, admin dashboard, navigation shell | Firebase setup, Firestore rules, AuthContext, Home screen, bottom tabs, Admin web dashboard, CI/CD, deployment |
| Member 2 | Safety alerts and emergency triggers | FR-1.1 SOS button, FR-1.2 volume trigger, FR-1.3 shake, FR-1.4 widget, FR-1.5 fall detection |
| Member 3 | Journey tracking, safe routes, maps | FR-1.6 journey tracking, FR-1.7 route sharing, FR-1.8 unsafe reporting, FR-1.9 heatmap, FR-1.10 safer route, FR-1.11 trusted circle |
| Member 4 | Lost and Found module | FR-2.1 report lost, FR-2.2 report found, FR-2.3 match suggestion, FR-2.4 chat, FR-2.5 upvote, FR-2.6 status, FR-2.7 karma |
| Member 5 | Parent-child tracking and pet/item BLE tracking | FR-4.1 to FR-4.5 parent-child, FR-5.1 to FR-5.4 BLE tracking (optional) |
| Member 6 | Account, notifications, offline access, testing and QA | FR-3.1 login/register screens, FR-3.3 profile, FR-3.4 offline, notifications, test suite |

---

## Getting Started

### Prerequisites

Make sure you have installed:
- Node.js LTS (v20.x or higher) — https://nodejs.org
- Git — https://git-scm.com
- VS Code — https://code.visualstudio.com
- Expo Go app on your phone (Play Store or App Store)
- EAS CLI: `npm install -g eas-cli`

### One-Time Setup (Every Member Does This Once)

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/guardiancircle.git
cd guardiancircle

# 2. Switch to the dev branch
git checkout dev
git pull origin dev

# 3. Install mobile app dependencies
cd mobile
npm install

# 4. Install admin dashboard dependencies
cd ../admin-dashboard
npm install
```

Get the `.env` file values from Member 1 through a private channel and place them in `mobile/.env` and `admin-dashboard/.env`.

### Running the Mobile App

```bash
cd mobile
npx expo start
```

Scan the QR code with Expo Go on your phone. The app reloads automatically every time you save a file.

```bash
npx expo start --clear    # use this if you see strange errors
npx expo start --tunnel   # use this if your phone and laptop are on different networks
```

---

## Environment Variables

**Never commit `.env` files to GitHub.** Get the actual values from Member 1.

### `mobile/.env`

```
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=
EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME=
EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET=guardiancircle_unsigned
```

### `admin-dashboard/.env`

```
REACT_APP_FIREBASE_API_KEY=
REACT_APP_FIREBASE_AUTH_DOMAIN=
REACT_APP_FIREBASE_PROJECT_ID=
REACT_APP_FIREBASE_STORAGE_BUCKET=
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=
REACT_APP_FIREBASE_APP_ID=
```

> Use `EXPO_PUBLIC_` prefix for the mobile app and `REACT_APP_` prefix for the admin dashboard. These prefixes expose the variables to the client-side code safely within each framework.

---

## Folder Structure

### Where to Put Your Files

| What you are building | Where it goes |
|---|---|
| A new screen | `mobile/src/screens/yourmodule/YourScreen.js` |
| A reusable UI component | `mobile/src/components/yourmodule/YourComponent.js` |
| A Firebase query function | `mobile/src/services/firestoreService.js` or your own service file |
| A shared constant | `mobile/src/constants/` |
| A custom hook | `mobile/src/hooks/` |
| A utility function (no UI) | `mobile/src/utils/` |

### Registering a New Screen in Navigation

After creating a new screen file, register it in the appropriate navigator:
- Login/register screens → `AuthNavigator.js`
- Main tab screens → `MainTabNavigator.js`
- Sub-screens within a module → add a Stack navigator inside that tab

Always use the `ROUTES` constants from `src/constants/routes.js`. Never use raw string names.

```javascript
// Correct
navigation.navigate(ROUTES.REPORT_LOST);

// Wrong — never do this
navigation.navigate('ReportLost');
```

---

## Shared Data Model

**All members must use these exact field names.** Do not rename fields without telling the whole team.

### `users/{uid}`

```
uid: string
email: string
displayName: string
role: string                    — use ROLES constants from roles.js
photoURL: string | null
createdAt: Timestamp
updatedAt: Timestamp
notificationPrefs: {
  sos: boolean                  — always true, cannot be toggled off
  journey: boolean
  lostFound: boolean
  geofence: boolean
  reminders: boolean
}
karma: number
fcmToken: string | null
```

### `linkedEntities/{ownerUid_targetUid}`

```
type: 'child' | 'pet' | 'item' | 'trusted_contact'
ownerUid: string
targetUid: string | null        — null for pet and item (no account)
targetName: string
targetPhotoURL: string | null
permissions: {
  viewLocation: boolean
  receiveSOS: boolean
  receiveJourney: boolean
}
linkedAt: Timestamp
status: 'active' | 'pending' | 'revoked'
```

### `journeys/{journeyId}`

```
ownerUid: string
startLocation: GeoPoint
destination: GeoPoint
destinationName: string
expectedArrivalTime: Timestamp
currentLocation: GeoPoint
routePolyline: string           — encoded polyline from Maps API
sharedWith: string[]            — array of trusted contact uids
status: 'active' | 'arrived' | 'overdue' | 'cancelled'
startedAt: Timestamp
arrivedAt: Timestamp | null
```

### `alerts/{alertId}`

```
type: 'sos' | 'geofence' | 'overdue'
triggeredBy: string             — uid of the user who triggered
triggerSource: 'button' | 'volume' | 'shake' | 'widget' | 'fall_detection'
location: GeoPoint
timestamp: Timestamp
recipients: string[]            — array of recipient uids
status: 'active' | 'resolved' | 'cancelled'
resolvedAt: Timestamp | null
```

### `reports/{reportId}`

```
type: 'lost' | 'found' | 'sighting' | 'unsafe_location'
reporterUid: string
category: string
description: string
photoURL: string | null
location: GeoPoint
geohash: string                 — for spatial queries
status: 'open' | 'sighted' | 'matched' | 'returned' | 'removed'
confidenceScore: number         — 0 to 100
upvotes: number
createdAt: Timestamp
updatedAt: Timestamp
```

### `matches/{matchId}`

```
reporterA: string               — uid of the lost reporter
reporterB: string               — uid of the found reporter
lostReportId: string
foundReportId: string
status: 'suggested' | 'confirmed' | 'rejected'
messages: subcollection         — chat thread
createdAt: Timestamp
```

### `bleTags/{tagId}` (Phase 2 Optional)

```
ownerUid: string
bleDeviceId: string
linkedEntityId: string          — references a linkedEntities document
lastKnownLocation: GeoPoint
lastSeen: Timestamp
activitySteps: number
activityRestMinutes: number
status: 'in_range' | 'out_of_range'
```

### `auditLog/{logId}`

```
action: string                  — e.g. 'ADMIN_BOOTSTRAP', 'ADMIN_PROMOTION'
targetUid: string
targetEmail: string
performedBy: string             — uid of the Admin who performed the action
timestamp: Timestamp
note: string
```

---

## Screen Names (Routes)

Always import from `src/constants/routes.js`. Never use raw strings.

```javascript
import { ROUTES } from '../constants/routes';
```

| Constant | Screen |
|---|---|
| `ROUTES.SPLASH` | Splash / loading screen |
| `ROUTES.LOGIN` | Login screen |
| `ROUTES.REGISTER` | Register screen |
| `ROUTES.HOME` | Home screen (main tab) |
| `ROUTES.SAFETY` | Safety and SOS tab |
| `ROUTES.MAP` | Map tab |
| `ROUTES.LOST_FOUND` | Lost and Found tab |
| `ROUTES.PROFILE` | Profile tab |
| `ROUTES.SOS` | Active SOS screen |
| `ROUTES.START_JOURNEY` | Start a new journey |
| `ROUTES.JOURNEY_ACTIVE` | Active journey view |
| `ROUTES.TRUSTED_CIRCLE` | Manage trusted contacts |
| `ROUTES.UNSAFE_REPORT` | Report an unsafe location |
| `ROUTES.REPORT_LOST` | Report a lost item or pet |
| `ROUTES.REPORT_FOUND` | Report a found item |
| `ROUTES.LOST_FOUND_DETAIL` | Lost/found report detail |
| `ROUTES.MATCH_CHAT` | In-app match chat |
| `ROUTES.PARENT_DASHBOARD` | Parent monitoring dashboard |
| `ROUTES.CHILD_LOCATION` | Live child location map |
| `ROUTES.SAFE_ZONES` | Manage safe zones |
| `ROUTES.CHILD_HISTORY` | Child journey history |
| `ROUTES.NOTIFICATION_PREFS` | Notification preferences |
| `ROUTES.EDIT_PROFILE` | Edit profile |

---

## User Roles

Always import from `src/constants/roles.js`. Never use raw role strings.

```javascript
import { ROLES, isAdmin, isChild } from '../constants/roles';
```

| Constant | Value | Description |
|---|---|---|
| `ROLES.PRIMARY_USER` | `'primary_user'` | General adult user |
| `ROLES.PARENT_GUARDIAN` | `'parent_guardian'` | Monitors linked child accounts |
| `ROLES.CHILD_DEPENDENT` | `'child_dependent'` | Simplified UI, cannot disable location sharing |
| `ROLES.PET_OWNER` | `'pet_owner'` | Manages pet and item profiles |
| `ROLES.TRUSTED_CONTACT` | `'trusted_contact'` | Receives SOS and journey alerts |
| `ROLES.ADMIN_MODERATOR` | `'admin_moderator'` | Web dashboard only — never in mobile app |

> **Critical:** `ROLES.ADMIN_MODERATOR` must never appear as a selectable option in any registration or settings screen. Admin accounts are created only through the bootstrap script or Admin promotion from the web dashboard.

---

## Firestore Collections

| Collection | Who reads | Who writes | Admin access |
|---|---|---|---|
| `users` | Own profile only | Own profile only (role field locked) | Read all |
| `linkedEntities` | Owner of the link | Owner of the link | Read all |
| `journeys` | Owner + sharedWith + linked parent | Owner | Read all |
| `alerts` | Triggerer + recipients + linked parent | Any authenticated user (create only) | Read all |
| `reports` | All authenticated users | Any authenticated user | Read, update, delete |
| `matches` | Both matched parties | Both matched parties | Read, update |
| `bleTags` | Owner + linked parent | Owner | Read all |
| `auditLog` | Admin only | Backend only (no client writes) | Read all |

---

## Git Workflow

### Branch Types

| Branch | Purpose | Who pushes |
|---|---|---|
| `main` | Always stable — used for demos and submission | Only Member 1, after confirming dev is stable |
| `dev` | Integration branch — all finished features land here | Nobody pushes directly — only via Pull Request |
| `feature/mX-description` | Your personal working branch for one task | You push your own feature branch |

### Daily Routine

```bash
# 1. Get the latest changes from the team
git checkout dev
git fetch origin
git pull origin dev

# 2. Create or return to your feature branch
git checkout -b feature/m2-sos-triggers   # first time
git checkout feature/m2-sos-triggers      # returning to existing branch

# 3. Do your work and commit regularly
git add src/screens/safety/SOSScreen.js
git commit -m "feat(sos): add single tap SOS button with vibration feedback"

# 4. Push at the end of every work session
git push

# 5. When the feature is done, open a Pull Request into dev on GitHub
```

### Pull Request Rules

- Always open Pull Request from your feature branch into `dev` — never into `main`
- At least one other member must review and approve before merging
- For anything touching shared services (AuthContext, firebase.js, navigation), request Member 1 as reviewer
- Use Squash and Merge to keep the history clean
- Delete your feature branch after it is merged

---

## Commit Message Format

```
type(scope): short description in present tense
```

| Type | When to use |
|---|---|
| `feat` | New feature added |
| `fix` | Bug fixed |
| `docs` | Documentation only change |
| `style` | Formatting, no logic change |
| `refactor` | Restructured code, behavior unchanged |
| `test` | Adding or editing tests |
| `chore` | Config, dependencies, tooling |

### Examples

```
feat(sos): add triple volume button trigger with 5 second countdown
feat(auth): add Google sign-in alongside email and password
fix(firestore): correct security rule blocking parent reading child location
docs(readme): update shared data model with matches collection fields
chore(deps): update expo-notifications to SDK 54 compatible version
test(account): add unit tests for role validation in AuthContext
```

---

## Branch Naming

```
feature/m<member number>-<short description>
```

| Member | Example branch names |
|---|---|
| Member 1 | `feature/m1-core-infrastructure` |
| Member 2 | `feature/m2-sos-triggers` |
| Member 3 | `feature/m3-journey-tracking`, `feature/m3-safe-routes` |
| Member 4 | `feature/m4-lost-found-reporting`, `feature/m4-match-chat` |
| Member 5 | `feature/m5-parent-child-linking`, `feature/m5-geofence-alerts` |
| Member 6 | `feature/m6-login-register`, `feature/m6-offline-access` |

---

## Running the App

```bash
cd mobile

# Start with Expo Go (use this every day)
npx expo start

# Clear cache if you see strange errors
npx expo start --clear

# Use tunnel if phone and laptop are on different Wi-Fi networks
npx expo start --tunnel

# Run on Android emulator (requires Android Studio)
npx expo start --android

# Run on iOS simulator (requires macOS and Xcode)
npx expo start --ios
```

### Adding a New Package

Always check with Member 1 before adding a new package. Use `npx expo install` for all Expo-related packages:

```bash
# Correct for Expo packages — picks the SDK 54 compatible version
npx expo install expo-camera

# Correct for non-Expo packages
npm install date-fns
```

---

## Third-Party Free Tier Limits

The project must stay within these limits at all times. Do not make unnecessary API calls.

| Service | Free Limit | How We Stay Within It |
|---|---|---|
| Firebase Authentication | 50,000 monthly active users | Well within range for development and demo |
| Cloud Firestore storage | 1 GiB | Keep report photos in Cloudinary, not Firestore |
| Firestore writes | 20,000 per day | Batch writes where possible, avoid polling |
| Firestore reads | 50,000 per day | Use real-time listeners instead of repeated reads |
| Cloudinary | 25 credits per month | Compress images client-side before upload (max 800px wide, q_auto:eco) |
| Google Maps | Monthly free credit | Cache route results, limit geocoding calls |

---

## Important Rules for Every Member

1. **Never commit `.env` files** — get secret values from Member 1 privately
2. **Never push directly to `dev` or `main`** — always use a Pull Request
3. **Always use `ROUTES` constants** — never raw string screen names
4. **Always use `ROLES` constants** — never raw role strings
5. **Never show `ROLES.ADMIN_MODERATOR`** in any mobile app UI — not in registration, settings, or any dropdown
6. **Use `npx expo install`** for Expo packages, not plain `npm install`
7. **Never commit `node_modules/`** — it is in `.gitignore` and must stay there
8. **Never commit `serviceAccountKey.json`** — it is a Firebase admin secret
9. **Test on a real phone** through Expo Go before opening a Pull Request
10. **Ask Member 1** before adding a new npm package or changing shared files (firebase.js, AuthContext.js, navigators, constants)