import { createHash } from 'node:crypto';
import { readFile, readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { withDefaults, validatePreferences } from './preferences.mjs';

export const START = '<!-- exchange:v1 -->', END = '<!-- /exchange -->';
export const slug = /^[a-z][a-z0-9_-]{0,63}$/;
export const kinds = ['request', 'question', 'decision', 'report', 'reply', 'receipt'];
export const statuses = ['untriaged', 'open', 'in_progress', 'waiting', 'blocked', 'done'];
export const hash = text => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
function fail(message) { throw new Error(message); }
export function validateConfig(c) {
  c = withDefaults(c);
  if (c.schema !== 1 || typeof c.title !== 'string' || !c.title.trim()) fail('Configuration needs schema: 1 and a title.');
  if (!Array.isArray(c.participants) || !c.participants.length) fail('Configure at least one participant.');
  const ids = new Set(), aliases = new Set();
  for (const p of c.participants) {
    if (typeof p.id !== 'string' || !slug.test(p.id) || typeof p.label !== 'string' || !p.label.trim() || ids.has(p.id)) fail('Participant IDs must be unique lowercase slugs with labels.');
    ids.add(p.id);
    if (p.aliases !== undefined && (!Array.isArray(p.aliases) || p.aliases.some(a => typeof a !== 'string' || !a))) fail('Aliases must be strings.');
    for (const a of new Set([p.id, ...(p.aliases || [])].map(a => a.toLowerCase()))) {
      if (aliases.has(a)) fail(`Ambiguous participant alias: ${a}`); aliases.add(a);
    }
  }
  if (!ids.has(c.identity)) fail('Dashboard identity must be a configured participant.');
  for (const key of ['mailboxDirectory']) {
    if (typeof c[key] !== 'string' || !c[key] || path.isAbsolute(c[key]) || c[key].includes('\\') || c[key].split('/').some(s => !s || s === '.' || s === '..' || !/^[\w.-]+$/.test(s))) fail(`Unsafe ${key}. Use a repository-relative path.`);
  }
  if (!['approval', 'automatic', 'off'].includes(c.cleanup)) fail('Cleanup must be approval, automatic, or off.');
  return validatePreferences(c);
}
export async function safePath(root, relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(s => !s || s === '.' || s === '..' || !/^[\w.-]+$/.test(s))) fail('Unsafe repository path.');
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    try { if ((await lstat(current)).isSymbolicLink()) fail('Symlinks are not supported in mailbox paths.'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return current;
}
export async function loadConfig(root) { return validateConfig(JSON.parse(await readFile(await safePath(root, 'exchange.config.json'), 'utf8'))); }
export function validateRecord(meta, body, config, location) {
  const ids = new Set(config.participants.map(p => p.id));
  if (meta.schema !== 1 || typeof meta.id !== 'string' || !slug.test(meta.id)) fail('Message requires schema: 1 and a stable slug ID.');
  if (!ids.has(meta.from) || !ids.has(meta.to) || meta.from === meta.to) fail('Message sender and recipient must be different configured participants.');
  if (!kinds.includes(meta.kind) || !statuses.includes(meta.status) || !['low', 'normal', 'high', 'urgent'].includes(meta.priority)) fail('Invalid kind, status, or priority.');
  if (typeof meta.title !== 'string' || !meta.title.trim() || meta.title.length > 200 || /[\r\n]/.test(meta.title)) fail('Title must be one nonempty line, up to 200 characters.');
  if (typeof meta.created !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(meta.created) || Number.isNaN(Date.parse(meta.created))) fail('created must be an ISO timestamp with timezone.');
  if (meta.reply_to != null && (typeof meta.reply_to !== 'string' || !slug.test(meta.reply_to))) fail('reply_to must be a message ID or null.');
  if (!body.trim() || body.includes(START) || body.includes(END)) fail('Body cannot be empty or contain protocol delimiters.');
  if (meta.session !== undefined && (typeof meta.session !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(meta.session))) fail('session must be a short identifier using letters, digits, dots, underscores, or hyphens.');
  const allowed = ['schema', 'id', 'from', 'to', 'kind', 'status', 'priority', 'created', 'title', 'reply_to', 'session'];
  if (meta.kind === 'receipt') {
    allowed.push('request_id', 'request_sha256', 'outcome');
    if (typeof meta.request_id !== 'string' || !slug.test(meta.request_id) || !/^[a-f0-9]{64}$/.test(meta.request_sha256) || !['completed', 'blocked', 'rejected'].includes(meta.outcome)) fail('Receipt requires request_id, request_sha256, and outcome.');
    if (meta.status !== (meta.outcome === 'completed' ? 'done' : 'blocked')) fail('Receipt status must agree with outcome.');
  }
  if (Object.keys(meta).some(k => !allowed.includes(k))) fail('Unknown metadata field.');
  if (location && location !== `${meta.kind === 'receipt' ? 'receipts' : 'outboxes'}/${meta.from}.md`) fail('Messages belong in their sender’s outbox; receipts belong in their sender’s receipt file.');
}
export function recordHash(meta, body) {
  const sorted = Object.fromEntries(Object.entries(meta).sort(([a], [b]) => a.localeCompare(b)));
  return hash(JSON.stringify(sorted) + '\n' + body.replace(/\r\n/g, '\n').trim());
}
export function serializeRecord(meta, body) { return `${START}\n## ${meta.id}\n\`\`\`json\n${JSON.stringify(meta, null, 2)}\n\`\`\`\n\n${body.trim()}\n${END}\n`; }
export function parseMailbox(text, config, location) {
  text = text.replace(/\r\n/g, '\n'); const records = []; let offset = 0;
  while (true) {
    const start = text.indexOf(START, offset);
    const outside = text.slice(offset, start < 0 ? text.length : start);
    if (outside.trim() && !(offset === 0 && /^# [^\n]+\s*$/.test(outside))) fail('Unexpected text outside message blocks.');
    if (start < 0) break;
    const end = text.indexOf(END, start + START.length); if (end < 0) fail('Unclosed message block.');
    const raw = text.slice(start + START.length, end);
    const match = raw.match(/^\n## ([^\n]+)\n```json\n([\s\S]*?)\n```\n\n([\s\S]*)$/);
    if (!match) fail('Expected ID heading, fenced JSON metadata, and Markdown body.');
    const meta = JSON.parse(match[2]), body = match[3].trim();
    if (match[1] !== meta.id) fail('Heading must match metadata ID.');
    validateRecord(meta, body, config, location);
    records.push({ meta, body, sha256: recordHash(meta, body) }); offset = end + END.length;
  }
  return records;
}
export function mailboxText(owner, category, records) { return `# ${category === 'receipts' ? 'Completion receipts' : 'Outbox'}: ${owner}\n\n` + records.map(r => serializeRecord(r.meta, r.body)).join('\n'); }
export async function readStore(root, config) {
  const files = [], messages = [], errors = [], ids = new Set();
  const base = await safePath(root, config.mailboxDirectory);
  try {
    for (const entry of await readdir(base, { withFileTypes: true })) {
      if (!entry.isDirectory() || !['outboxes', 'receipts'].includes(entry.name)) errors.push(`${config.mailboxDirectory}/${entry.name}: unexpected entry`);
    }
  } catch (e) { if (e.code !== 'ENOENT') throw e; errors.push(`${config.mailboxDirectory}: mailbox directory is missing`); }
  for (const category of ['outboxes', 'receipts']) {
    const dir = await safePath(root, `${config.mailboxDirectory}/${category}`);
    const entries = await readdir(dir, { withFileTypes: true }).catch(e => { if (e.code === 'ENOENT') { errors.push(`${config.mailboxDirectory}/${category}: directory is missing`); return []; } throw e; });
    for (const entry of entries) {
      const location = `${category}/${entry.name}`, relative = `${config.mailboxDirectory}/${location}`;
      try {
        if (!entry.isFile() || !config.participants.some(p => entry.name === p.id + '.md')) fail('Unknown owner or unexpected mailbox entry.');
        const text = await readFile(await safePath(root, relative), 'utf8');
        const records = parseMailbox(text, config, location);
        for (const r of records) { if (ids.has(r.meta.id)) fail(`Duplicate ID: ${r.meta.id}`); ids.add(r.meta.id); }
        const file = { relative, location, text, version: hash(text), records }; files.push(file);
        messages.push(...records.map(r => ({ ...r, file: relative, fileVersion: file.version })));
      } catch (e) { errors.push(`${relative}: ${e.message}`); }
    }
  }
  return { files, messages, errors };
}
export function cleanupCandidates(store, config) {
  return store.messages.filter(r => r.meta.kind === 'receipt' && r.meta.to === config.identity).map(receipt => {
    const request = store.messages.find(m => m.meta.id === receipt.meta.request_id);
    let reason = null;
    if (receipt.meta.outcome !== 'completed') reason = `Outcome: ${receipt.meta.outcome}`;
    else if (!request) reason = 'Request no longer present';
    else if (request.meta.kind === 'receipt' || request.meta.from !== config.identity || request.meta.to !== receipt.meta.from) reason = 'Sender/recipient mismatch';
    else if (request.sha256 !== receipt.meta.request_sha256) reason = 'Request changed after acknowledgment';
    return { receipt, request: request || null, eligible: !reason, reason };
  });
}
