// Tipe-tipe utama untuk API layer HuggingStudio

export type RepoType = 'model' | 'dataset' | 'space';

export interface RepoInfo {
  id: string; // format: owner/name
  name: string;
  owner: string;
  type: RepoType;
  isPrivate: boolean;
  lastModified: Date;
  description?: string;
  tags?: string[];
  downloads?: number;
  likes?: number;
}

export interface OrgInfo {
  name: string;
  avatarUrl: string;
  type: 'org' | 'user';
}

export interface ListReposOptions {
  owner: string;
  types?: RepoType[];
  token?: string | null;
  search?: string;
  limit?: number;
}

export interface ApiError {
  status: number;
  message: string;
  isRateLimit: boolean;
  isAuth: boolean;
}
