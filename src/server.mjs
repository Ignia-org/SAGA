import http from 'node:http';
import { readFile, writeFile, realpath, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, randomUUID } from 'node:crypto';
import { defaults } from './preferences.mjs';
import { hash, loadConfig, validateConfig, safePath, readStore, cleanupCandidates, mailboxText, parseMailbox, recordHash, validateRecord } from './protocol.mjs';

const exec = promisify(execFile), here = path.dirname(fileURLToPath(import.meta.url));
export const version = hash;
export async function createDashboard(root, options = {}) {
  root = await realpath(root);
  const token = randomBytes(24).toString('hex'); let queue = Promise.resolve();
  const sync = { state: 'idle', message: 'Ready', last: null };
  const git = (...args) => exec('git', args, { cwd: root, timeout: 30000, maxBuffer: 8e6, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).then(r => r.stdout.trim());
  const locked = fn => { const job = queue.then(fn); queue = job.catch(() => {}); return job; };
  const read = async relative => readFile(await safePath(root, relative), 'utf8').catch(e => { if (e.code === 'ENOENT') return null; throw e; });
  async function pendingBranch() { return git('config', '--local', '--get', 'saga.pendingBranch').catch(() => git('config', '--local', '--get', 'dashboard.pendingBranch').catch(() => '')); }
  async function publicationHeld() { return (await git('config', '--local', '--get', 'saga.publicationHold').catch(() => '') === 'true') || (await git('config', '--local', '--get', 'dashboard.publicationHold').catch(() => '') === 'true'); }
  async function checkBranch(config) { const branch = await git('branch', '--show-current'); if (!branch) throw new Error('Checkout a branch first.'); if (config.expectedBranch && config.expectedBranch !== branch) throw new Error('Expected branch ' + config.expectedBranch + ', currently on ' + branch); return branch; }
  async function persist(changes, message, policy = null) {
    if (!changes.length) return;
    const config = policy || await loadConfig(root);
    if (config.autoCommit && await git('diff', '--name-only', '--cached')) throw new Error('Git has staged changes. Finish that commit before continuing.');
    const branch = await checkBranch(config);
    const pending = await pendingBranch(); if (pending && pending !== branch) throw new Error(`Pending publication belongs to branch ${pending}. Switch back before writing.`);
    for (const change of changes) {
      if (config.autoCommit && await git('status', '--porcelain', '--', change.relative)) throw new Error(`${change.relative} has uncommitted edits. Commit them first.`);
      if (await read(change.relative) !== change.old) throw new Error('A file changed during this action. Refresh and try again.');
    }
    if (config.autoCommit) await git('config', '--local', 'saga.pendingBranch', branch);
    for (const c of changes) {
      const file = await safePath(root, c.relative); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, c.next, 'utf8');
    }
    if (!config.autoCommit) { sync.state = 'saved'; sync.message = 'Saved · commit manually in Git'; return; }
    const paths = changes.map(c => c.relative);
    message = message.replace(/^exchange:/, config.commitPrefix + ':');
    try { await git('add', '--', ...paths); const hasHead = await git('rev-parse', '--verify', 'HEAD').then(() => true).catch(() => false); if (hasHead) await git('commit', '--only', '-m', message, '--', ...paths); else await git('commit', '-m', message); }
    catch (e) { sync.state = 'error'; sync.message = 'Saved on disk; commit failed. Finish the commit in Git: ' + (e.stderr || e.message); throw new Error(sync.message); }
    sync.state = 'pending'; sync.message = 'Committed · awaiting publication';
  }
  async function clean(receiptIds = null, expected = null) {
    const config = await loadConfig(root), store = await readStore(root, config);
    if (store.errors.length) throw new Error('Invalid mailbox format: ' + store.errors.join('\n'));
    let candidates = cleanupCandidates(store, config);
    if (receiptIds) {
      if (!Array.isArray(receiptIds) || !receiptIds.length) throw new Error('Choose a completion receipt.');
      candidates = receiptIds.map(id => {
        const c = candidates.find(c => c.receipt.meta.id === id);
        if (!c?.eligible) throw new Error(c?.reason || 'Unknown completion receipt.');
        if (!expected || expected[id] !== c.request.sha256) throw new Error('Request changed since your review. Refresh before approving.');
        return c;
      });
    } else candidates = candidates.filter(c => c.eligible);
    const requestIds = new Set(candidates.map(c => c.request.meta.id));
    candidates = cleanupCandidates(store, config).filter(c => c.eligible && requestIds.has(c.request.meta.id));
    for (const c of candidates) { for (const file of [c.request.file, c.receipt.file]) if (await git('status', '--porcelain', '--', file)) throw new Error('Commit request and receipt files before cleanup so Git retains their history.'); }
    const remove = new Set(candidates.flatMap(c => [c.request.meta.id, c.receipt.meta.id]));
    const changes = store.files.filter(f => f.records.some(r => remove.has(r.meta.id))).map(f => ({ relative: f.relative, old: f.text, next: mailboxText(path.basename(f.location, '.md'), f.location.split('/')[0], f.records.filter(r => !remove.has(r.meta.id))) }));
    await persist(changes, `exchange: close ${[...requestIds].join(', ')}`); return requestIds.size;
  }
  async function gitStatus(config) {
    const branch = await git('branch', '--show-current');
    const files = (await git('status', '--porcelain')).split('\n').filter(Boolean);
    const remoteRef = 'refs/remotes/' + config.gitRemote + '/' + branch;
    const counts = await git('rev-list', '--left-right', '--count', remoteRef + '...HEAD').catch(() => null);
    const [behind, ahead] = counts === null ? [null, null] : counts.split(/\s+/).map(Number);
    return { changedFiles: files.length, stagedFiles: (await git('diff', '--cached', '--name-only')).split('\n').filter(Boolean).length, ahead, behind, remoteRef, remoteKnown: counts !== null };
  }
  async function publish(config) {
    const branch = await checkBranch(config), status = await gitStatus(config);
    if (status.ahead === 0) {
      const pending = await pendingBranch();
      if (!pending || pending === branch) {
        await git('config', '--local', '--unset', 'saga.pendingBranch').catch(() => {});
        await git('config', '--local', '--unset', 'dashboard.pendingBranch').catch(() => {});
      }
      return;
    }
    const pending = await pendingBranch();
    if (pending && pending !== branch) throw new Error('Pending publication belongs to branch ' + pending + '. Switch back.');
    if (await publicationHeld()) throw new Error('Remote publication is paused. Local commits remain unpublished.');
    await git('push', config.gitRemote, 'HEAD:refs/heads/' + branch);
    await git('config', '--local', '--unset', 'saga.pendingBranch').catch(() => {});
    await git('config', '--local', '--unset', 'dashboard.pendingBranch').catch(() => {});
  }
  async function synchronize(operation = 'configured') {
    sync.state = 'syncing'; sync.message = 'Synchronizing…';
    try {
      if (!['configured','pull','push'].includes(operation)) throw new Error('Unknown synchronization operation.');
      const preferences = await loadConfig(root);
      if (operation === 'configured' && !preferences.autoPull && !preferences.autoPush) { sync.state = 'idle'; sync.message = 'Automatic Git synchronization disabled'; return sync; }
      if (await git('status', '--porcelain')) throw new Error('Local edits present. Automatic synchronization is paused until they are committed.');
      const config = await loadConfig(root), branch = await checkBranch(config);
      const push = operation === 'push' || (operation === 'configured' && config.autoPush);
      const pull = operation === 'pull' || (operation === 'configured' && config.autoPull);
      if (push) await publish(config);
      if (pull) await git('pull', '--ff-only', config.gitRemote, branch);
      const status = await gitStatus(config);
      const held = await publicationHeld() && status.ahead !== 0;
      sync.state = held ? 'pending' : 'ok'; sync.message = held ? 'Publication held · local work retained' : push || pull ? 'Synchronization complete' : 'Automatic Git synchronization disabled'; sync.last = new Date().toISOString();
    } catch (e) { sync.state = 'error'; sync.message = e.stderr?.trim() || e.message; }
    return sync;
  }
  let branchCacheKey = '', branchCache = [];
  const branchRefresh = { last: null, error: null, workspaceRoot: root };
  async function fetchBranchUpdates() {
    const config = await loadConfig(root); branchRefresh.workspaceRoot = root;
    try {
      await git('fetch', '--prune', config.gitRemote, '+refs/heads/*:refs/remotes/' + config.gitRemote + '/*');
      branchRefresh.last = new Date().toISOString(); branchRefresh.error = null; branchCacheKey = '';
    } catch (error) { branchRefresh.error = error.stderr?.trim() || error.message; throw error; }
  }
  async function branchSnapshot(ref, operator) {
    const config = validateConfig(JSON.parse(await git('show', ref + ':exchange.config.json')));
    const messages = [];
    for (const participant of config.participants) {
      const text = await git('show', ref + ':' + config.mailboxDirectory + '/outboxes/' + participant.id + '.md');
      for (const record of parseMailbox(text, config, 'outboxes/' + participant.id + '.md')) {
        if (record.meta.to === operator && record.meta.kind !== 'receipt') messages.push({ ...record, sha256: recordHash(record.meta, record.body) });
      }
    }
    return messages;
  }
  async function branchReferences(config) {
    const text = await git('for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads/', 'refs/remotes/' + config.gitRemote + '/');
    return text.split('\n').filter(Boolean).map(line => { const [ref, sha] = line.split(' '); const remote = ref.startsWith('refs/remotes/'); return { ref, sha, remote, name: remote ? ref.slice(('refs/remotes/' + config.gitRemote + '/').length) : ref.slice('refs/heads/'.length) }; }).filter(b => b.name !== 'HEAD');
  }
  async function branches(config, store) {
    const current = await git('branch', '--show-current'), references = await branchReferences(config);
    const incoming = new Map(store.messages.filter(r => r.meta.to === config.identity && r.meta.kind !== 'receipt').map(r => [r.meta.id, r.sha256]));
    const key = JSON.stringify([root, current, config.identity, config.gitRemote, references, [...incoming]]);
    if (key === branchCacheKey) return branchCache;
    const others = references.filter(b => !(b.name === current && !b.remote) && !references.some(x => x.ref !== b.ref && !x.remote && b.remote && x.name === b.name && x.sha === b.sha));
    const result = [];
    for (const branch of others) {
      try { const records = await branchSnapshot(branch.ref, config.identity); result.push({ ...branch, newMessages: records.filter(r => !incoming.has(r.meta.id)).length, updatedMessages: records.filter(r => incoming.has(r.meta.id) && incoming.get(r.meta.id) !== r.sha256).length }); }
      catch { result.push({ ...branch, error: 'No valid mailbox workspace' }); }
    }
    branchCacheKey = key; return branchCache = result;
  }
  async function switchBranch(data) {
    const config = await loadConfig(root);
    const branch = (await branchReferences(config)).find(b => b.ref === data.ref);
    if (!branch) throw new Error('Unknown branch. Fetch and check branches first.');
    if (await git('status', '--porcelain')) throw new Error('Commit or discard local file changes before switching branches.');
    if (config.expectedBranch && config.expectedBranch !== branch.name) throw new Error('Settings require branch ' + config.expectedBranch + '.');
    const targetConfig = validateConfig(JSON.parse(await git('show', branch.ref + ':exchange.config.json')));
    if (targetConfig.expectedBranch && targetConfig.expectedBranch !== branch.name) throw new Error('Target workspace requires another branch.');
    await branchSnapshot(branch.ref, targetConfig.identity);
    if (await pendingBranch()) {
      const status = await gitStatus(config); if (status.ahead === null || status.ahead > 0) throw new Error('Push pending dashboard commits before switching branches.');
    }
    if (branch.remote) {
      const local = (await branchReferences(config)).find(b => !b.remote && b.name === branch.name);
      if (local && local.sha !== branch.sha) throw new Error('Local branch differs from remote. Select the local branch and synchronize first.');
      if (local) await git('switch', branch.name); else await git('switch', '--track', '-c', branch.name, branch.ref);
    } else await git('switch', branch.name);
    await git('config', '--local', '--unset', 'saga.pendingBranch').catch(() => {});
    await git('config', '--local', '--unset', 'dashboard.pendingBranch').catch(() => {});
    configureSchedule(targetConfig, true); sync.state = 'idle'; sync.message = 'Switched to ' + branch.name; return { ok: true };
  }
  async function state() {
    let config; try { config = await loadConfig(root); } catch (e) { if (e.code === 'ENOENT') return { setupRequired: true, workspaceRoot: root }; throw e; }
    configureSchedule(config);
    const store = await readStore(root, config);
    const outbox = await read(`${config.mailboxDirectory}/outboxes/${config.identity}.md`);
    return { branchRefresh: branchRefresh.workspaceRoot === root ? { ...branchRefresh } : { last: null, error: null }, branches: config.discoverBranches ? await branches(config, store) : [], git: await gitStatus(config), workspaceRoot: root, publicationHold: await publicationHeld(), remotes: (await git('remote')).split('\n').filter(Boolean), config, configVersion: hash(await read('exchange.config.json')), outboxVersion: outbox === null ? null : hash(outbox), messages: store.messages, candidates: cleanupCandidates(store, config), errors: store.errors, sync: { ...sync }, branch: await git('branch', '--show-current'), pendingBranch: await pendingBranch() };
  }
  async function message(data) {
    const config = await loadConfig(root), store = await readStore(root, config);
    if (store.errors.length) throw new Error(store.errors.join('\n'));
    if (!config.participants.some(p => p.id === data.to && p.id !== config.identity)) throw new Error('Choose a configured recipient.');
    const relative = `${config.mailboxDirectory}/outboxes/${config.identity}.md`, old = await read(relative);
    if ((old === null ? null : hash(old)) !== data.version) throw new Error('Your outbox changed. Refresh before sending.');
    if (data.reply_to && !store.messages.some(m => m.meta.id === data.reply_to && m.meta.to === config.identity && m.meta.from === data.to && m.meta.kind !== 'receipt')) throw new Error('Reply target must be an incoming message from this recipient.');
    const meta = { schema: 1, id: 'm-' + randomUUID(), from: config.identity, to: data.to, kind: data.kind || config.defaultKind, status: config.defaultStatus, priority: data.priority || config.defaultPriority, created: new Date().toISOString(), title: data.title, reply_to: data.reply_to || null };
    if (meta.kind === 'receipt') throw new Error('Agents write receipts directly; use a reply here.');
    if (typeof data.text !== 'string') throw new Error('Message body must be text.'); validateRecord(meta, data.text, config);
    const records = store.files.find(f => f.relative === relative)?.records || [];
    await persist([{ relative, old, next: mailboxText(config.identity, 'outboxes', [{ meta, body: data.text }, ...records]) }], `exchange: send ${meta.id}`); return meta.id;
  }
  async function update(data) {
    const config = await loadConfig(root), store = await readStore(root, config);
    if (store.errors.length) throw new Error(store.errors.join('\n'));
    const record = store.messages.find(r => r.meta.id === data.id);
    if (!record || record.meta.from !== config.identity || record.meta.kind === 'receipt') throw new Error('Only your own outbox messages can be edited.');
    if (record.sha256 !== data.sha256) throw new Error('Message changed since your review. Refresh first.');
    const file = store.files.find(f => f.relative === record.file);
    if (data.delete) { await persist([{ relative: file.relative, old: file.text, next: mailboxText(config.identity, 'outboxes', file.records.filter(r => r.meta.id !== data.id)) }], `exchange: owner closed ${data.id}`); return; }
    if (typeof data.text === 'string') record.body = data.text;
    if (data.status) record.meta.status = data.status;
    if (data.line !== undefined) {
      const lines = record.body.split('\n');
      if (!Number.isInteger(data.line) || typeof data.checked !== 'boolean' || !/^\s*[-*+] \[[ xX]\]/.test(lines[data.line] || '')) throw new Error('Task not found.');
      lines[data.line] = lines[data.line].replace(/\[[ xX]\]/, data.checked ? '[x]' : '[ ]'); record.body = lines.join('\n');
    }
    validateRecord(record.meta, record.body, config);
    await persist([{ relative: file.relative, old: file.text, next: mailboxText(config.identity, 'outboxes', file.records.map(r => r.meta.id === data.id ? record : r)) }], `exchange: update ${data.id}`);
  }
  async function history(data) {
    // History access is constrained to structured mailbox files.
    const config = await loadConfig(root), prefix = config.mailboxDirectory;
    if (data.commit) {
      if (!/^[a-f0-9]{7,40}$/.test(data.commit) || typeof data.file !== 'string' || !data.file.startsWith(prefix + '/') || !/^\/(outboxes|receipts)\/[a-z][a-z0-9_-]{0,63}\.md$/.test(data.file.slice(prefix.length))) throw new Error('Invalid history reference.');
      const reference = `${data.commit}${data.before ? '^' : ''}:${data.file}`;
      return { text: await git('show', reference).catch(e => { if (/does not exist|exists on disk|invalid object name|not a valid object name/i.test(e.stderr || '')) return '(File did not exist at this point.)'; throw e; }) };
    }
    const log = await git('log', '-' + config.historyLimit, '--format=%H%x09%aI%x09%s', '--', prefix), commits = [];
    for (const line of log.split('\n').filter(Boolean)) {
      const [commit, date, title] = line.split('\t');
      const files = (await git('diff-tree', '--no-commit-id', '--name-only', '-r', '--root', commit, '--', prefix)).split('\n').filter(f => f.startsWith(prefix + '/') && f.endsWith('.md'));
      commits.push({ commit, date, title, files });
    }
    return { commits };
  }
  async function openWorkspace(data) {
    if (typeof data.root !== 'string' || !data.root.trim()) throw new Error('Enter a repository path.');
    const nextRoot = await realpath(path.resolve(data.root));
    const top = await exec('git', ['rev-parse', '--show-toplevel'], { cwd: nextRoot, timeout: 10000, windowsHide: true }).then(r => realpath(r.stdout.trim()));
    if (top.toLowerCase() !== nextRoot.toLowerCase()) throw new Error('Choose the Git repository root, not one of its subdirectories.');
    const previousRoot = root;
    try {
      if (data.initialize) {
        const config = validateConfig({ schema: 1, ...data.config });
        const existing = await readFile(await safePath(nextRoot, 'exchange.config.json'), 'utf8').catch(e => { if (e.code === 'ENOENT') return null; throw e; });
        if (existing !== null) throw new Error('This repository already has a configuration. Open it instead.');
        root = nextRoot;
        const changes = [{ relative: 'exchange.config.json', old: null, next: JSON.stringify(config, null, 2) + '\n' }];
        for (const category of ['outboxes', 'receipts']) for (const p of config.participants) changes.push({ relative: `${config.mailboxDirectory}/${category}/${p.id}.md`, old: null, next: mailboxText(p.id, category, []) });
        await persist(changes, 'exchange: initialize workspace', config);
      } else {
        const config = await loadConfig(nextRoot), store = await readStore(nextRoot, config);
        if (store.errors.length) throw new Error(store.errors.join('\n'));
        root = nextRoot;
      }
      if (options.localSettings) {
        await mkdir(path.dirname(options.localSettings), { recursive: true });
        await writeFile(options.localSettings, JSON.stringify({ workspaceRoot: root }, null, 2) + '\n');
      }
      const config = await loadConfig(root); configureSchedule(config, true);
      return { ok: true, workspaceRoot: root };
    } catch (e) { root = previousRoot; throw e; }
  }
  const server = http.createServer(async (req, res) => {
    const send = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    try {
      if (!/^127\.0\.0\.1:\d+$/.test(req.headers.host || '')) return send(403, { error: 'Host denied' });
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'" });
        return res.end((await readFile(path.join(here, 'dashboard.html'), 'utf8')).replace('__TOKEN__', token));
      }
      if (req.method === 'GET' && url.pathname === '/favicon.svg') {
        res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache' });
        return res.end(await readFile(path.join(here, 'favicon.svg'), 'utf8'));
      }
      if (req.method === 'GET' && url.pathname === '/settings.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(await readFile(path.join(here, 'settings.js'), 'utf8'));
      }
      if (req.headers['x-dashboard-token'] !== token) return send(403, { error: 'Access denied' });
      if (req.method === 'GET' && url.pathname === '/api/state') return send(200, await locked(state));
      if (req.method !== 'POST') return send(404, { error: 'Not found' });
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return send(403, { error: 'Origin denied' });
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 100000) return send(413, { error: 'Message too large' }); }
      const data = JSON.parse(body || '{}');
      if (url.pathname === '/api/sync') return await locked(async () => {
        if (data.releaseHold === true) {
          if (data.operation !== 'push') throw new Error('Publication hold can only be released by an explicit push.');
          await git('config', '--local', '--unset', 'saga.publicationHold').catch(() => {});
          await git('config', '--local', '--unset', 'dashboard.publicationHold').catch(() => {});
        }
        return synchronize(data.operation || 'configured');
      }).then(result => result.state === 'error' ? send(409, { ...result, error: result.message }) : send(200, result));
      if (url.pathname === '/api/history') return send(200, await locked(() => history(data)));
      const result = await locked(async () => {
        if (url.pathname === '/api/branches') {
          const config = await loadConfig(root);
          if (data.fetch === true) await fetchBranchUpdates();
          return { branches: await branches(config, await readStore(root, config)) };
        }
        if (url.pathname === '/api/branch') return switchBranch(data);
        if (url.pathname === '/api/workspace') return openWorkspace(data);
        if (url.pathname === '/api/message') return { id: await message(data) };
        if (url.pathname === '/api/update') { await update(data); return { ok: true }; }
        if (url.pathname === '/api/receipt-dismiss') {
          const config = await loadConfig(root), store = await readStore(root, config);
          if (store.errors.length) throw new Error(store.errors.join('\n'));
          const receipt = store.messages.find(r => r.meta.id === data.id);
          if (!receipt || receipt.meta.kind !== 'receipt' || receipt.meta.to !== config.identity) throw new Error('Only receipts addressed to you can be dismissed.');
          if (receipt.sha256 !== data.sha256) throw new Error('Receipt changed. Refresh before dismissing it.');
          const file = store.files.find(f => f.relative === receipt.file);
          await persist([{ relative: file.relative, old: file.text, next: mailboxText(receipt.meta.from, 'receipts', file.records.filter(r => r.meta.id !== receipt.meta.id)) }], `exchange: dismiss receipt ${receipt.meta.id}`);
          return { ok: true };
        }
        if (url.pathname === '/api/cleanup') {
          const config = await loadConfig(root); if (config.cleanup === 'off') throw new Error('Cleanup is disabled in Settings.');
          if (!Array.isArray(data.receiptIds)) throw new Error('Select receipts to approve.');
          return { cleaned: await clean(data.receiptIds, data.expected) };
        }
        if (url.pathname === '/api/settings') {
          const old = await read('exchange.config.json'); if (hash(old) !== data.version) throw new Error('Settings changed. Refresh first.');
          const previous = await loadConfig(root);
          const allowed = ['title', 'identity', 'participants', 'mailboxDirectory', 'cleanup', ...Object.keys(defaults)];
          const patch = data.settings || { cleanup: data.cleanup };
          if (Object.keys(patch).some(key => !allowed.includes(key))) throw new Error('Unknown setting.');
          if (data.releaseHold === true && patch.autoPush !== true) throw new Error('Enable automatic push to release the publication pause.');
          const config = validateConfig({ ...previous, ...patch });
          const checked = await readStore(root, config);
          if (checked.errors.length) throw new Error(checked.errors.join('\n') + '\nPaths must reference existing mailboxes; participants with mailbox files cannot be removed.');
          await persist([{ relative: 'exchange.config.json', old, next: JSON.stringify(config, null, 2) + '\n' }], 'exchange: update settings', config);
          if (data.releaseHold === true) {
            await git('config', '--local', '--unset', 'saga.publicationHold').catch(() => {});
            await git('config', '--local', '--unset', 'dashboard.publicationHold').catch(() => {});
          }
          configureSchedule(config); return { ok: true };
        }
        throw new Error('Unknown action');
      });
      send(200, result); if (!options.noSync) { const config = await loadConfig(root); if (config.syncAfterWrite && (config.autoPush || config.autoPull)) locked(synchronize); }
    } catch (e) { send(409, { error: e.message }); }
  });
  let timer, scheduleKey = '', nextSync = Infinity, nextCleanup = Infinity, nextBranches = Infinity;
  function configureSchedule(config, initial = false) {
    if (options.noSync) return;
    const key = JSON.stringify(config); if (!initial && key === scheduleKey) return;
    clearTimeout(timer); scheduleKey = key;
    nextSync = config.syncSeconds > 0 && (config.autoPull || config.autoPush) ? Date.now() + config.syncSeconds * 1000 : Infinity;
    nextBranches = config.discoverBranches && config.autoFetchBranches ? Date.now() + config.branchFetchMinutes * 60000 : Infinity;
    nextCleanup = config.cleanup === 'automatic' ? Date.now() + config.cleanupSeconds * 1000 : Infinity;
    arm();
  }
  function arm() {
    clearTimeout(timer); const due = Math.min(nextSync, nextCleanup, nextBranches); if (!Number.isFinite(due)) return;
    timer = setTimeout(() => locked(async () => {
      const config = await loadConfig(root); configureSchedule(config);
      if (Date.now() >= nextBranches) { nextBranches = Date.now() + config.branchFetchMinutes * 60000; try { await fetchBranchUpdates(); } catch {} }
      if (Date.now() >= nextSync) { nextSync = Date.now() + config.syncSeconds * 1000; await synchronize(); }
      if (Date.now() >= nextCleanup) {
        nextCleanup = config.cleanup === 'automatic' ? Date.now() + config.cleanupSeconds * 1000 : Infinity;
        if (config.cleanup === 'automatic') { const count = await clean(); if (count && config.syncAfterWrite) await synchronize(); }
      }
    }).catch(e => { sync.state = 'error'; sync.message = e.message; }).finally(arm), Math.max(1000, due - Date.now())); timer.unref();
  }
  server.on('listening', () => {
    if (options.noSync) return;
    locked(async () => { const config = await loadConfig(root); configureSchedule(config, true); if (config.discoverBranches && config.autoFetchBranches) { try { await fetchBranchUpdates(); } catch {} } if (config.syncOnStart && (config.autoPull || config.autoPush)) await synchronize(); }).catch(e => { if (e.code !== 'ENOENT') { sync.state = 'error'; sync.message = e.message; } });
  });
  server.on('close', () => clearTimeout(timer));
  return { server, sync, token, synchronize: (operation) => locked(() => synchronize(operation)), fetchBranchUpdates: () => locked(fetchBranchUpdates), processReceipts: () => locked(async () => { const config = await loadConfig(root); if (config.cleanup !== 'automatic') return 0; return clean(); }) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const localSettings = path.resolve(here, '../.saga/local.json');
  const remembered = await readFile(localSettings, 'utf8').then(JSON.parse).catch(() => ({}));
  const root = process.argv[2] ? path.resolve(process.argv[2]) : remembered.workspaceRoot || process.cwd();
  const { server } = await createDashboard(root, { localSettings });
  server.listen(Number(process.env.PORT || 4318), '127.0.0.1', () => console.log(`SAGA: http://127.0.0.1:${server.address().port}`));
  server.on('error', e => { console.error(e.message); process.exitCode = 1; });
}
