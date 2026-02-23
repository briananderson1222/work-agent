import debug from 'debug';

// Create plugin logger with app:plugin namespace
export const log = debug('app:plugin');

// Enable plugin logs in development by default
if (typeof window !== 'undefined' && !localStorage.getItem('debug')) {
  debug.enable('app:*');
}