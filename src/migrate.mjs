import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, safePath, readStore, mailboxText, hash, validateRecord } from './protocol.mjs';

export function importSections(text) {
  text = text.replace(/\r\n/g, '\n');
  const starts = [...text.matchAll(/^## (.+)$/gm)];
  const pieces = [];
  if (!starts.length) return [{ title: 'Original mailbox notes', body: text.trim(), index: 0 }];
  const preamble = text.slice(0, starts[0].index).trim();
  if (preamble) pieces.push({ title: 'Original mailbox notes', body: preamble, index: 0 });
  starts.forEach((s, i) => pieces.push({ title: s[1].trim(), body: text.slice(s.index, starts[i + 1]?.index ?? text.length).trim(), index: i + 1 }));
  return pieces;
}
export function displayTitle(title) {
  return title.replace(/\p{Extended_Pictographic}|\p{Emoji_Presentation}|[\uFE0F\u200D★]/gu, '').replace(/\*\*|`/g, '').replace(/\s+/g, ' ').replace(/^[\s·—:-]+/, '').trim().slice(0, 200) || 'Imported exchange';
}
export async function migrate(root) {
  const config = await loadConfig(root);
  if (!config.legacyDirectory) throw new Error('Legacy display is already disabled. Migration will not guess a source directory or import twice.');
  const store = await readStore(root, config);
  if (store.errors.length) throw new Error(store.errors.join('\n'));
  const resolve = name => config.participants.find(p => [p.id, ...(p.aliases || [])].some(a => a.toLowerCase() === name.toLowerCase()))?.id;
  const names = (await readdir(await safePath(root, config.legacyDirectory))).filter(n => /^[\w-]+-to-[\w-]+\.md$/i.test(n)).sort();
  const byOwner = new Map(), ids = new Set(store.messages.map(r => r.meta.id)), summary = [];
  for (const name of names) {
    const [sender, recipient] = name.slice(0, -3).split(/-to-/i), from = resolve(sender), to = resolve(recipient.replace(/-\d{4}-.*$/, ''));
    if (!from || !to) throw new Error(`Configure participant aliases before importing ${name}.`);
    const source = `${config.legacyDirectory}/${name}`, text = await readFile(await safePath(root, source), 'utf8');
    let inheritedDate = name.match(/\d{4}-\d{2}-\d{2}/)?.[0];
    const oldestDate = [...text.matchAll(/\d{4}-\d{2}-\d{2}/g)].map(m => m[0]).sort()[0];
    const pieces = importSections(text).filter(p => p.body);
    for (const p of pieces) {
      const id = 'import-' + hash(`${source}\n${p.index}\n${p.body}`).slice(0, 32);
      if (ids.has(id)) throw new Error(`Message ${id} was already imported. Refusing duplicate migration.`);
      ids.add(id); inheritedDate = p.title.match(/\d{4}-\d{2}-\d{2}/)?.[0] || inheritedDate;
      const sortingDate = p.index === 0 ? oldestDate : inheritedDate;
      const created = sortingDate ? `${sortingDate}T00:00:00${config.importOffset}` : new Date().toISOString();
      const meta = { schema: 1, id, from, to, kind: 'report', status: 'untriaged', priority: 'normal', created, title: displayTitle(p.index === 0 ? `Mailbox conventions: ${name}` : p.title), reply_to: null };
      const provenance = `> Imported from ${source}. Historical state and reply links have not been reconciled. ${p.index === 0 && sortingDate ? 'Undated source conventions; sorted at the earliest date mentioned in the file.' : sortingDate ? 'Original date retained; sending time was not recorded.' : 'Original sending date is unknown; timestamp is the import time.'}`;
      const body = provenance + '\n\n' + p.body;
      validateRecord(meta, body, config, `outboxes/${from}.md`);
      if (!byOwner.has(from)) byOwner.set(from, []);
      byOwner.get(from).push({ meta, body });
    }
    // Ensure every original nonempty segment is retained, including preambles.
    const reassembled = pieces.map(p => p.body).join('\n\n');
    if (reassembled.replace(/\s/g, '') !== text.replace(/\s/g, '')) throw new Error(`Content verification failed for ${source}. No mailbox has been written.`);
    summary.push({ source, messages: pieces.length });
  }
  const writes = [];
  for (const [owner, imported] of byOwner) {
    const relative = `${config.mailboxDirectory}/outboxes/${owner}.md`, old = store.files.find(f => f.relative === relative);
    const records = [...(old?.records || []), ...imported].sort((a, b) => b.meta.created.localeCompare(a.meta.created));
    writes.push({ relative, old: old?.text ?? null, next: mailboxText(owner, 'outboxes', records) });
  }
  for (const w of writes) {
    const actual = await readFile(await safePath(root, w.relative), 'utf8').catch(e => { if (e.code === 'ENOENT') return null; throw e; });
    if (actual !== w.old) throw new Error('An outbox changed during migration. No mailbox has been written.');
  }
  for (const w of writes) await writeFile(await safePath(root, w.relative), w.next, 'utf8');
  const verification = await readStore(root, config);
  if (verification.errors.length) throw new Error(verification.errors.join('\n'));
  config.legacyDirectory = null;
  await writeFile(await safePath(root, 'exchange.config.json'), JSON.stringify(config, null, 2) + '\n');
  return { files: summary.length, imported: summary.reduce((n, f) => n + f.messages, 0), sources: summary };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await migrate(process.argv[2] ? path.resolve(process.argv[2]) : process.cwd()), null, 2)); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}
