export type SessionKind = 'client' | 'curator';

export type SessionUser = {
  email?: string;
  id: string;
  name?: string;
  role?: string;
};

export type MobileSession = {
  accessToken: string;
  createdAt: number;
  expiresAt?: number;
  kind: SessionKind;
  tokenType: string;
  user?: SessionUser;
};

export type StoredSession = MobileSession & {
  biometricUnlockEnabled?: boolean;
};
