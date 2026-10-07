export const defaults = Object.freeze({
  refreshSeconds: 60,
  syncSeconds: 300,
  cleanupSeconds: 300,
  autoCommit: true,
  autoPull: false,
  autoPush: false,
  syncOnStart: false,
  syncAfterWrite: false,
  gitRemote: 'origin',
  expectedBranch: null,
  timeZone: 'UTC',
  importOffset: '+00:00',
  defaultKind: 'request',
  defaultPriority: 'normal',
  defaultStatus: 'open',
  pageSize: 50,
  defaultExpanded: 0,
  historyLimit: 60,
  showLegacy: false,
  showMonitoring: true,
  confirmCleanup: true,
  commitPrefix: 'saga'
});

export function withDefaults(config) { return { ...defaults, ...config }; }
export function validatePreferences(config) {
  const fail = message => { throw new Error(message); };
  for (const key of ['refreshSeconds', 'syncSeconds']) {
    if (!Number.isInteger(config[key]) || config[key] < 0 || config[key] > 86400 || (config[key] > 0 && config[key] < 10)) fail(`${key} must be 0 (manual) or 10–86400 seconds.`);
  }
  if (!Number.isInteger(config.cleanupSeconds) || config.cleanupSeconds < 10 || config.cleanupSeconds > 86400) fail('cleanupSeconds must be 10–86400 seconds.');
  for (const key of ['autoCommit', 'autoPull', 'autoPush', 'syncOnStart', 'syncAfterWrite', 'showLegacy', 'showMonitoring', 'confirmCleanup']) if (typeof config[key] !== 'boolean') fail(`${key} must be a boolean.`);
  if (config.autoPush && !config.autoCommit) fail('Automatic push requires automatic commits.');
  if (config.cleanup === 'automatic' && !config.autoCommit) fail('Automatic cleanup requires automatic commits to retain its history.');
  if (typeof config.gitRemote !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(config.gitRemote)) fail('gitRemote must be a Git remote name.');
  if (config.expectedBranch !== null && (typeof config.expectedBranch !== 'string' || !config.expectedBranch || config.expectedBranch.startsWith('-') || /[\s~^:?*\[\\]/.test(config.expectedBranch) || config.expectedBranch.includes('..') || config.expectedBranch.includes('@{'))) fail('expectedBranch must be a branch name or null.');
  try { new Intl.DateTimeFormat('en', { timeZone: config.timeZone }); } catch { fail('timeZone must be an IANA timezone such as UTC or Europe/Paris.'); }
  if (typeof config.importOffset !== 'string' || !/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(config.importOffset) || /^[-+]14:(?!00)/.test(config.importOffset)) fail('importOffset must be a timezone offset such as +00:00 or +02:00.');
  if (!['request', 'question', 'decision', 'report', 'reply'].includes(config.defaultKind)) fail('Invalid defaultKind.');
  if (!['low', 'normal', 'high', 'urgent'].includes(config.defaultPriority)) fail('Invalid defaultPriority.');
  if (!['untriaged', 'open', 'in_progress', 'waiting', 'blocked', 'done'].includes(config.defaultStatus)) fail('Invalid defaultStatus.');
  for (const [key, min, max] of [['pageSize', 1, 200], ['defaultExpanded', 0, 10], ['historyLimit', 1, 200]]) if (!Number.isInteger(config[key]) || config[key] < min || config[key] > max) fail(`${key} must be ${min}–${max}.`);
  if (typeof config.commitPrefix !== 'string' || !config.commitPrefix.trim() || config.commitPrefix.length > 60 || /[\r\n\0]/.test(config.commitPrefix)) fail('commitPrefix must be a short nonempty line.');
  return config;
}
