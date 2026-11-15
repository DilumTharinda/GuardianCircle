# Deploying the GuardianCircle Admin Web Dashboard

The Admin Dashboard is a standalone React web application deployed to **Firebase Hosting** (free Spark tier), completely separate from the React Native/Expo mobile app.

## 1. Local Configuration

Copy `admin-dashboard/.env.example` to `admin-dashboard/.env` and fill in your Firebase project values:

```env
REACT_APP_FIREBASE_API_KEY=...
REACT_APP_FIREBASE_AUTH_DOMAIN=...
REACT_APP_FIREBASE_PROJECT_ID=...
REACT_APP_FIREBASE_STORAGE_BUCKET=...
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=...
REACT_APP_FIREBASE_APP_ID=...
```

Update `.firebaserc` at the repository root with your actual Firebase Project ID:

```json
{
  "projects": {
    "default": "your-actual-firebase-project-id"
  }
}
```

## 2. Manual Deployment via Firebase CLI

From the repository root:

```bash
cd admin-dashboard
npm install
npm run build
cd ..
npx firebase-tools login
npx firebase-tools deploy --only hosting
```

## 3. Automated Deployment via GitHub Actions

The workflow `.github/workflows/deploy-admin.yml` automatically builds, tests, and deploys `admin-dashboard/build` to Firebase Hosting on pushes to `main` (or via manual `workflow_dispatch`).

Add these GitHub repository secrets (**Settings -> Secrets and variables -> Actions**):
- `FIREBASE_SERVICE_ACCOUNT` (JSON key from Firebase Console -> Project Settings -> Service Accounts)
- `REACT_APP_FIREBASE_API_KEY`
- `REACT_APP_FIREBASE_AUTH_DOMAIN`
- `REACT_APP_FIREBASE_PROJECT_ID`
- `REACT_APP_FIREBASE_STORAGE_BUCKET`
- `REACT_APP_FIREBASE_MESSAGING_SENDER_ID`
- `REACT_APP_FIREBASE_APP_ID`
