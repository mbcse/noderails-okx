/**
 * Next webpack Watchpack uses fs.watch (kqueue/FSEvents) per directory.
 * Several Next apps plus tsx in this repo exhaust macOS watches and log
 * `EMFILE: too many open files, watch`. Poll + ignore keeps HMR on source.
 */
export function applyNextDevWatchOptions(config) {
  config.watchOptions = {
    ...config.watchOptions,
    ignored: ['**/.git/**', '**/node_modules/**', '**/.next/**', '**/dist/**'],
    poll: 1000,
    aggregateTimeout: 300,
  };
  return config;
}
