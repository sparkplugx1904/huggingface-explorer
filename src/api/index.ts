// Re-export seluruh API layer HuggingStudio

export type { RepoInfo, OrgInfo, RepoType, ListReposOptions, ApiError } from './types.js';
export { hfFetch } from './hf-client.js';
export { listUserRepos, listUserOrgs, getRepoInfo } from './repos.js';
export type {
  CommitItem,
  CommitAuthor,
  CommitDiffResult,
  CommitDiffFile,
  DeletedFileEntry,
  FetchCommitsOptions,
  RevertCommitParams,
  RestoreFileParams,
} from './history.js';
export {
  fetchCommitHistory,
  fetchCommitDiff,
  parseGitDiff,
  revertCommit,
  restoreFileVersion,
  getRecentlyDeletedFiles,
} from './history.js';
export type {
  DeletedFileInfo,
  DeletedFileAuthor,
  DetectDeletedFilesOptions,
  RestoreDeletedResult,
  RestoreAllProgress,
  RestoreAllResult,
  ParsedDeletedEntry,
} from './deleted-recovery.js';
export {
  detectRecentlyDeletedFiles,
  restoreDeletedFile,
  restoreAllDeletedFiles,
  parseDeletedFilesFromDiff,
  buildCommitDiffUrl,
} from './deleted-recovery.js';
