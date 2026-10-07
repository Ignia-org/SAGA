import { readFile, writeFile, mkdir, realpath, cp, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { loadConfig, validateConfig, readStore, safePath, validateRecord, mailboxText, hash } from './protocol.mjs';

export async function run(args, write = console.log) {
  const command = args[0], flags = {}, positional = [];
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) { if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for ${args[i]}`); flags[args[i].slice(2)] = args[++i]; }
    else positional.push(args[i]);
  }
  const root = await realpath(flags.root || process.cwd());
  if (command === 'install-skill') {
    if (!flags.destination) throw new Error('--destination must be a repository-relative skill directory.');
    const destination = await safePath(root, flags.destination);
    if (await access(destination).then(() => true).catch(() => false)) throw new Error('Skill destination already exists. Installation never overwrites an existing skill.');
    const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../skills/saga-mailbox');
    await access(path.join(source, 'SKILL.md')).catch(() => { throw new Error('Run install-skill from the SAGA application checkout, not a copied skill helper.'); });
    await mkdir(path.dirname(destination), { recursive: true }); await cp(source, destination, { recursive: true, errorOnExist: true, force: false });
    write(`SAGA skill installed at ${flags.destination}. No files have been committed.`); return;
  }
  if (command === 'init') {
    const ids = (flags.participants || '').split(',').filter(Boolean);
    const config = validateConfig({ schema: 1, title: flags.title || 'Exchange workspace', identity: flags.identity, participants: ids.map(id => ({ id, label: id })), mailboxDirectory: flags['mailbox-directory'] || 'mailboxes', cleanup: 'approval' });
    await writeFile(await safePath(root, 'exchange.config.json'), JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
    for (const category of ['outboxes', 'receipts']) {
      await mkdir(await safePath(root, `${config.mailboxDirectory}/${category}`), { recursive: true });
      for (const id of ids) await writeFile(await safePath(root, `${config.mailboxDirectory}/${category}/${id}.md`), mailboxText(id, category, []), { flag: 'wx' });
    }
    write('Initialized. Commit the configuration and mailboxes before starting the dashboard.'); return;
  }
  const config = await loadConfig(root), store = await readStore(root, config);
  if (store.errors.length) throw new Error(store.errors.join('\n'));
  if (command === 'validate') { write(`Valid: ${store.messages.length} records in ${store.files.length} structured mailboxes.`); return; }
  if (command === 'list') {
    const records = store.messages.filter(r => (!flags.to || r.meta.to === flags.to) && (!flags.from || r.meta.from === flags.from));
    write(JSON.stringify(records.map(r => ({ ...r.meta, sha256: r.sha256, body: r.body, file: r.file })), null, 2)); return;
  }
  if (!['receipt', 'send', 'close'].includes(command)) throw new Error('Commands: init, validate, list, send, receipt, close. See PROTOCOL.md for arguments.');
  if (!config.participants.some(p => p.id === flags.from)) throw new Error('--from must be your configured participant ID.');
  if (command === 'close') {
    const r = store.messages.find(r => r.meta.id === positional[0]);
    if (!r || r.meta.from !== flags.from || r.meta.kind === 'receipt') throw new Error('Only the sender can close its own outbox message.');
    const file = store.files.find(f => f.relative === r.file);
    if (hash(await readFile(await safePath(root, file.relative), 'utf8')) !== file.version) throw new Error('Outbox changed. Retry after reading it.');
    await writeFile(await safePath(root, file.relative), mailboxText(flags.from, 'outboxes', file.records.filter(x => x.meta.id !== r.meta.id)), 'utf8');
    write(`Removed ${r.meta.id} from your outbox. Commit this change to retain Git history.`); return;
  }
  if (!flags['body-file']) throw new Error('--body-file is required.');
  const body = await readFile(path.resolve(root, flags['body-file']), 'utf8');
  const meta = { schema: 1, id: 'm-' + randomUUID(), from: flags.from, to: flags.to, kind: flags.kind || 'request', status: 'open', priority: flags.priority || 'normal', created: new Date().toISOString(), title: flags.title, reply_to: flags['reply-to'] || null };
  if (command === 'receipt') {
    const request = store.messages.find(r => r.meta.id === positional[0]);
    if (!request || request.meta.to !== flags.from || request.meta.kind === 'receipt') throw new Error('Receipt must acknowledge an existing message addressed to you.');
    meta.kind = 'receipt'; meta.to = request.meta.from; meta.title = 'Completion: ' + request.meta.title.slice(0, 188);
    meta.request_id = request.meta.id; meta.request_sha256 = request.sha256; meta.outcome = flags.outcome || 'completed';
    meta.status = meta.outcome === 'completed' ? 'done' : 'blocked'; meta.reply_to = request.meta.id;
  }
  if (command === 'send' && meta.kind === 'receipt') throw new Error('Use the receipt command to create completion receipts.');
  validateRecord(meta, body, config);
  if (meta.reply_to && !store.messages.some(r => r.meta.id === meta.reply_to && r.meta.from === meta.to && r.meta.to === meta.from)) throw new Error('Reply target must be a message addressed to you by this recipient.');
  const category = meta.kind === 'receipt' ? 'receipts' : 'outboxes', relative = `${config.mailboxDirectory}/${category}/${meta.from}.md`;
  const existing = store.files.find(f => f.relative === relative), file = await safePath(root, relative);
  const current = await readFile(file, 'utf8').catch(e => { if (e.code === 'ENOENT') return null; throw e; });
  if ((current === null ? null : hash(current)) !== (existing?.version || null)) throw new Error('Mailbox changed. Retry after reading it.');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, mailboxText(meta.from, category, [{ meta, body }, ...(existing?.records || [])]), 'utf8');
  write(`${meta.id} written to ${relative}. Commit your changes; the CLI never stages, commits, or pushes automatically.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await run(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exitCode = 1; }
}
