// Entry point router — re-export semua yang dibutuhkan konsumen

export type { Route } from './router';
export { parseRoute, navigate, back, onNavigate, initRouter } from './router';
