import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import { AuthProvider } from './context/AuthContext';
import { ROLES, isAdminRole } from './constants/roles';

jest.mock('./services/firebase', () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  isFirebaseConfigured: false,
}));

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth, cb) => {
    cb(null);
    return () => {};
  },
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
}));

test('renders admin login screen without self-registration controls', () => {
  render(
    <AuthProvider>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <LoginPage />
      </MemoryRouter>
    </AuthProvider>
  );
  expect(screen.getByText(/GuardianCircle Admin/i)).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /Sign In to Dashboard/i })
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /register|sign up/i })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: /register|sign up/i })
  ).not.toBeInTheDocument();
});

test('enforces admin_moderator role check', () => {
  expect(isAdminRole(ROLES.ADMIN_MODERATOR)).toBe(true);
  expect(isAdminRole(ROLES.PRIMARY_USER)).toBe(false);
  expect(isAdminRole(ROLES.PARENT_GUARDIAN)).toBe(false);
  expect(isAdminRole(ROLES.CHILD_DEPENDENT)).toBe(false);
  expect(isAdminRole(undefined)).toBe(false);
});
