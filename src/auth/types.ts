export interface UserInfo {
  login: string;
  name: string;
  avatarUrl: string;
  isPro?: boolean;
  orgs?: OrgInfo[];
}

export interface OrgInfo {
  name: string;
  avatarUrl: string;
  isEnterprise?: boolean;
}

export interface AuthState {
  token: string | null;
  tokenExpiresAt: Date | null;
  user: UserInfo | null;
  /** bisa browse repo publik tanpa login */
  isGuest: boolean;
}
