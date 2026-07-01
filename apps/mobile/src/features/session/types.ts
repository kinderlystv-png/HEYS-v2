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
  tokenType: string;
  user?: SessionUser;
};

export type StoredSession = MobileSession & {
  biometricUnlockEnabled?: boolean;
};
