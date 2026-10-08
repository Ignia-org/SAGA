import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Script } from 'node:vm';
import { createDashboard } from '../src/server.mjs';
import { run } from '../src/cli.mjs';
import { defaults } from '../src/preferences.mjs';
import { loadConfig, readStore, mailboxText, serializeRecord, parseMailbox, cleanupCandidates, recordHash, validateConfig } from '../src/protocol.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const config = () => ({ schema: 1, title: 'Reusable workspace', identity: 'coordinator', participants: ['coordinator', 'researcher', 'reviewer'].map(id => ({ id, label: id })), mailboxDirectory: 'mailboxes', cleanup: 'approval', syncSeconds: 60, autoPull: true, autoPush: true, syncAfterWrite: true, commitPrefix: 'exchange' });
const meta = (id, from = 'coordinator', to = 'researcher') => ({ schema: 1, id, from, to, kind: 'request', status: 'open', priority: 'normal', created: '2026-10-07T13:00:00Z', title: 'Review', reply_to: null });
async function fixture() {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'exchange-test-')), root = path.join(temp, 'root');await mkdir(root);
  git(root, 'init');git(root, 'config', 'user.email', 'test@example.com');git(root, 'config', 'user.name', 'Test');
  await writeFile(path.join(root, 'exchange.config.json'), JSON.stringify(config(), null, 2)+'\n');
  for (const category of ['outboxes', 'receipts']) {
    await mkdir(path.join(root, 'mailboxes', category), { recursive: true });
    for (const p of config().participants) await writeFile(path.join(root, 'mailboxes', category, p.id+'.md'), mailboxText(p.id, category, []));
  }
  await writeFile(path.join(root, 'unrelated.txt'), 'initial');git(root, 'add', '.');git(root, 'commit', '-m', 'initial');
  return { root, temp, dispose: () => rm(temp, { recursive: true, force: true }) };
}
async function start(root) {
  const app = await createDashboard(root, { noSync: true });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const call = (route, data, extra = {}) => fetch(base+'/api/'+route, { method: data === undefined ? 'GET' : 'POST', headers: { 'X-Dashboard-Token': app.token, 'Content-Type': 'application/json', ...extra }, body: data === undefined ? undefined : JSON.stringify(data) });
  return { ...app, call, base, state: async () => (await call('state')).json(), stop: () => new Promise(resolve => app.server.close(resolve)) };
}
async function send(app, body = '- [ ] Verify result', to = 'researcher') {
  const state = await app.state(), res = await app.call('message', { to, title: 'Review result', text: body, version: state.outboxVersion });
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  return (await res.json()).id;
}
async function receipt(root, temp, id, from = 'researcher', outcome = 'completed') {
  const bodyFile = path.join(temp, 'result.md');await writeFile(bodyFile, 'Verified the result. All requested work is complete.');
  await run(['receipt', id, '--root', root, '--from', from, '--outcome', outcome, '--body-file', bodyFile], () => {});
  git(root, 'add', '--', `mailboxes/receipts/${from}.md`);git(root, 'commit', '-m', 'receipt');
}
test('format, stable hashes, nested Markdown, ownership and duplicates', async () => {
  const c = config(), m = meta('m-example'), body = '## Body heading\n\n- [ ] Task';
  const text = mailboxText('coordinator', 'outboxes', [{ meta: m, body }]);
  const parsed = parseMailbox(text.replaceAll('\n', '\r\n'), c, 'outboxes/coordinator.md');
  assert.equal(parsed.length, 1);assert.equal(parsed[0].body, body);
  assert.equal(recordHash(m, body), recordHash(Object.fromEntries(Object.entries(m).reverse()), body+'\n'));
  assert.notEqual(recordHash(m, body), recordHash(m, body.replace('[ ]', '[x]')));
  assert.throws(() => parseMailbox(text, c, 'outboxes/researcher.md'), /sender/);
  assert.throws(() => parseMailbox(text.replace('"priority": "normal"', '"priority": "unknown"'), c), /priority/);
  assert.throws(() => parseMailbox(text.replace('<!-- /exchange -->', ''), c), /Unclosed/);
  assert.throws(() => parseMailbox(text+'unstructured text', c), /Unexpected/);
  assert.throws(() => validateConfig({ ...c, mailboxDirectory: '../escape' }), /Unsafe/);
  const f = await fixture();try {
    await writeFile(path.join(f.root, 'mailboxes/outboxes/coordinator.md'), text+serializeRecord(m, body));
    assert.match((await readStore(f.root, c)).errors.join(' '), /Duplicate/);
    assert.throws(() => execFileSync('node', [new URL('../src/cli.mjs', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), 'validate', '--root', f.root], { encoding: 'utf8', windowsHide: true, stdio: 'pipe' }), /Duplicate/);
  } finally { await f.dispose(); }
});
test('writes only the operator outbox, detects stale edits and protects Git staging', async () => {
  const f = await fixture();let app;
  try {
    app = await start(f.root);
    assert.equal((await fetch(app.base+'/api/state')).status, 403);
    assert.equal((await app.call('message', {}, { Origin: 'http://other.example' })).status, 403);
    await writeFile(path.join(f.root, 'unrelated.txt'), 'local work');
    const id = await send(app);let state = await app.state(), r = state.messages.find(r => r.meta.id === id);
    assert.equal(git(f.root, 'show', '--pretty=', '--name-only', 'HEAD'), 'mailboxes/outboxes/coordinator.md');
    assert.equal(await readFile(path.join(f.root, 'unrelated.txt'), 'utf8'), 'local work');
    assert.equal((await app.call('update', { id, sha256: r.sha256, line: 0, checked: true })).status, 200);
    assert.equal((await app.call('update', { id, sha256: r.sha256, status: 'done' })).status, 409);
    await run(['send','--root',f.root,'--from','researcher','--to','reviewer','--title','Peer request','--body-file',path.join(f.root,'unrelated.txt')],()=>{});
    git(f.root,'add','--','mailboxes/outboxes/researcher.md');git(f.root,'commit','-m','peer request');
    state=await app.state();const peer=state.messages.find(r=>r.meta.from==='researcher');
    assert.equal((await app.call('update',{id:peer.meta.id,sha256:peer.sha256,delete:true})).status,409);
    git(f.root,'add','unrelated.txt');
    const count=state.messages.length;
    assert.equal((await app.call('message',{to:'researcher',title:'blocked',text:'body',version:state.outboxVersion})).status,409);
    assert.equal((await app.state()).messages.length,count);assert.equal(git(f.root,'diff','--name-only','--cached'),'unrelated.txt');
  } finally { if(app)await app.stop();await f.dispose(); }
});
test('approval cleans only matching receipts and requests, preserves history and other outboxes', async () => {
  const f = await fixture();let app;
  try {
    app=await start(f.root);const id=await send(app);
    await receipt(f.root,f.temp,id);let state=await app.state(),candidate=state.candidates[0];assert.equal(candidate.eligible,true);
    assert.equal((await app.call('update',{id,sha256:candidate.request.sha256,text:'Changed instruction'})).status,200);
    state=await app.state();assert.equal(state.candidates[0].eligible,false);assert.match(state.candidates[0].reason,/changed/);
    assert.equal((await app.call('cleanup',{receiptIds:[candidate.receipt.meta.id],expected:{[candidate.receipt.meta.id]:candidate.request.sha256}})).status,409);
    await receipt(f.root,f.temp,id);state=await app.state();candidate=state.candidates.find(c=>c.eligible);
    const response=await app.call('cleanup',{receiptIds:[candidate.receipt.meta.id],expected:{[candidate.receipt.meta.id]:candidate.request.sha256}});
    assert.equal(response.status,200);state=await app.state();assert.equal(state.messages.some(r=>r.meta.id===id),false);
    assert.equal(state.candidates.length,1);assert.equal(state.candidates[0].reason,'Request no longer present');
    const paths=git(f.root,'show','--pretty=','--name-only','HEAD').split('\n').sort();assert.deepEqual(paths,['mailboxes/outboxes/coordinator.md','mailboxes/receipts/researcher.md']);
    const commits=(await (await app.call('history',{})).json()).commits;const close=commits.find(c=>c.title.startsWith('exchange: close'));
    const snapshot=await (await app.call('history',{commit:close.commit,file:'mailboxes/outboxes/coordinator.md',before:true})).json();assert.match(snapshot.text,/Changed instruction/);
    const stale=state.candidates[0].receipt;
    assert.equal((await app.call('receipt-dismiss',{id:stale.meta.id,sha256:stale.sha256})).status,200);
    assert.equal((await app.state()).candidates.length,0);
    const newId=await send(app,'Next request');assert.ok(newId);
  } finally {if(app)await app.stop();await f.dispose();}
});
test('blocked, wrong-sender, and edited-version receipts never qualify for cleanup', () => {
  const c=config(), request={meta:meta('m-request'),body:'Task',sha256:recordHash(meta('m-request'),'Task')};
  const base={...meta('m-receipt','researcher','coordinator'),kind:'receipt',status:'done',request_id:'m-request',request_sha256:request.sha256,outcome:'completed'};
  const check=m=>cleanupCandidates({messages:[request,{meta:m,body:'result'}]},c)[0];
  assert.equal(check(base).eligible,true);assert.equal(check({...base,outcome:'blocked'}).eligible,false);assert.equal(check({...base,from:'reviewer'}).eligible,false);assert.equal(check({...base,request_sha256:'a'.repeat(64)}).eligible,false);
});
test('publishes after restart, pulls remote receipts, and automatically cleans in a single commit', async () => {
  const f=await fixture();let app;
  try {
    const origin=path.join(f.temp,'origin.git'),peer=path.join(f.temp,'peer');git(f.temp,'init','--bare',origin);git(f.root,'remote','add','origin',origin);git(f.root,'push','-u','origin','HEAD');
    app=await start(f.root);const id=await send(app);await app.stop();app=await start(f.root);
    assert.equal((await app.synchronize()).state,'ok');assert.throws(()=>git(f.root,'config','--get','saga.pendingBranch'));
    git(f.temp,'clone',origin,peer);git(peer,'config','user.email','peer@example.com');git(peer,'config','user.name','Peer');
    await receipt(peer,f.temp,id);git(peer,'push');assert.equal((await app.synchronize()).state,'ok');
    let current=await app.state();assert.equal(current.candidates.filter(c=>c.eligible).length,1);assert.equal(current.messages.some(r=>r.meta.id===id),true);
    assert.equal((await app.call('settings',{cleanup:'automatic',version:current.configVersion})).status,200);
    assert.equal(await app.processReceipts(),1);assert.equal((await app.synchronize()).state,'ok');current=await app.state();assert.equal(current.messages.length,0);
    git(peer,'pull','--ff-only');assert.doesNotMatch(await readFile(path.join(peer,'mailboxes/outboxes/coordinator.md'),'utf8'),new RegExp(id));
    const paths=git(f.root,'show','--pretty=','--name-only','HEAD').split('\n').sort();assert.deepEqual(paths,['mailboxes/outboxes/coordinator.md','mailboxes/receipts/researcher.md']);
  } finally {if(app)await app.stop();await f.dispose();}
});
test('pending publication cannot follow a different branch', async () => {
  const f=await fixture();let app;
  try {app=await start(f.root);await send(app);git(f.root,'checkout','-b','other');const s=await app.synchronize();assert.equal(s.state,'error');assert.match(s.message,/Pending publication belongs/);}finally{if(app)await app.stop();await f.dispose();}
});
test('initializer creates reusable mailboxes and refuses to overwrite configuration', async () => {
  const temp=await mkdtemp(path.join(os.tmpdir(),'exchange-init-'));
  try {
    const args=['init','--root',temp,'--identity','alice','--participants','alice,bob','--title','Another workspace'];
    await run(args,()=>{});const config=await loadConfig(temp);assert.equal(config.identity,'alice');
    const store=await readStore(temp,config);assert.equal(store.errors.length,0);assert.equal(store.files.length,4);
    await assert.rejects(()=>run(args,()=>{}),/EEXIST/);
    await rm(path.join(temp,'mailboxes/outboxes'),{recursive:true,force:true});assert.match((await readStore(temp,config)).errors.join(' '),/missing/);
  } finally {await rm(temp,{recursive:true,force:true});}
});
test('a publication hold prevents indirect automatic pushes', async()=>{
  const f=await fixture();let app;
  try{app=await start(f.root);await send(app);git(f.root,'config','--local','dashboard.publicationHold','true');const s=await app.synchronize();assert.equal(s.state,'error');assert.match(s.message,/publication is paused/);assert.ok(git(f.root,'config','--get','saga.pendingBranch'));}finally{if(app)await app.stop();await f.dispose();}
});
test('UI script parses and serves an English interface', async () => {
  const f=await fixture();let app;
  try {app=await start(f.root);const html=await(await fetch(app.base)).text();new Script(html.split('<script>')[1].split('</script>')[0]);assert.match(html,/<html lang="en">/);assert.match(html,/Participant monitoring/);assert.doesNotMatch(html,/__TOKEN__/);}finally{if(app)await app.stop();await f.dispose();}
});
test('mailbox symlinks are rejected', {skip:process.platform==='win32'?'Windows symlink creation requires extra privileges':false}, async()=>{
  const f=await fixture();try{const link=path.join(f.root,'mailboxes/outboxes/coordinator.md');await rm(link);await symlink(path.join(f.root,'unrelated.txt'),link);assert.match((await readStore(f.root,config())).errors.join(' '),/Unknown owner|Symlinks/);}finally{await f.dispose();}
});
test('new workspaces opt in to Git automation and expose validated timing controls',()=>{
  const c=validateConfig({schema:1,title:'Independent',identity:'alice',participants:[{id:'alice',label:'Alice'},{id:'bob',label:'Bob'}],mailboxDirectory:'messages',cleanup:'approval'});
  assert.equal(c.refreshSeconds,60);assert.equal(c.syncSeconds,300);assert.equal(c.autoPull,false);assert.equal(c.autoPush,false);assert.equal(c.syncOnStart,false);assert.equal(c.syncAfterWrite,false);
  assert.equal(validateConfig({...c,refreshSeconds:0,syncSeconds:0}).refreshSeconds,0);
  assert.throws(()=>validateConfig({...c,refreshSeconds:5}),/refreshSeconds/);assert.throws(()=>validateConfig({...c,autoCommit:false,autoPush:true}),/Automatic push/);
  assert.throws(()=>validateConfig({...c,autoCommit:false,cleanup:'automatic'}),/Automatic cleanup/);assert.throws(()=>validateConfig({...c,timeZone:'invalid-zone'}),/timezone/);
});
test('settings update all preferences without hardcoded identities and support manual commits',async()=>{
  const f=await fixture();let app;
  try{
    app=await start(f.root);const initial=await app.state(),head=git(f.root,'rev-parse','HEAD');
    const settings={title:'Independent project',identity:'reviewer',refreshSeconds:120,syncSeconds:0,cleanupSeconds:600,autoCommit:false,autoPull:false,autoPush:false,syncAfterWrite:false,syncOnStart:false,timeZone:'Europe/Paris',gitRemote:'origin',pageSize:12,defaultExpanded:1,historyLimit:15,defaultKind:'question',defaultPriority:'high',defaultStatus:'waiting',showMonitoring:false,confirmCleanup:false,commitPrefix:'team'};
    assert.equal((await app.call('settings',{settings,version:initial.configVersion})).status,200);
    const current=await app.state();for(const [key,value]of Object.entries(settings))assert.equal(current.config[key],value);
    assert.equal(git(f.root,'rev-parse','HEAD'),head);assert.equal((await app.call('settings',{settings,version:initial.configVersion})).status,409);
    const res=await app.call('message',{to:'researcher',title:'Question',text:'A question',version:current.outboxVersion});assert.equal(res.status,200);
    const record=(await app.state()).messages[0];assert.equal(record.meta.from,'reviewer');assert.equal(record.meta.kind,'question');assert.equal(record.meta.priority,'high');assert.equal(record.meta.status,'waiting');assert.equal(git(f.root,'rev-parse','HEAD'),head);
    assert.equal((await app.synchronize()).state,'idle');
  }finally{if(app)await app.stop();await f.dispose();}
});
test('workspace selection is validated and initialization commits only its new files',async()=>{
  const f=await fixture(),g=await fixture();let app;
  try{
    app=await start(f.root);const response=await app.call('workspace',{root:g.root});assert.equal(response.status,200);assert.equal((await app.state()).workspaceRoot,await (await import('node:fs/promises')).realpath(g.root));
    const unrelated=path.join(g.root,'nested');await mkdir(unrelated);assert.equal((await app.call('workspace',{root:unrelated})).status,409);assert.equal((await app.state()).workspaceRoot,await (await import('node:fs/promises')).realpath(g.root));
    const empty=path.join(f.temp,'new-workspace');await mkdir(empty);git(empty,'init');git(empty,'config','user.name','Test');git(empty,'config','user.email','test@example.com');
    const setup={schema:1,title:'New workspace',identity:'alice',participants:[{id:'alice',label:'Alice'},{id:'bob',label:'Bob'}],mailboxDirectory:'communications',cleanup:'approval'};
    assert.equal((await app.call('workspace',{root:empty,initialize:true,config:setup})).status,200);
    const state=await app.state();assert.equal(state.config.identity,'alice');assert.equal(state.config.autoPush,false);assert.equal(state.errors.length,0);assert.match(git(empty,'log','-1','--oneline'),/initialize workspace/);
    assert.equal((await app.call('workspace',{root:empty,initialize:true,config:setup})).status,409);
  }finally{if(app)await app.stop();await f.dispose();await g.dispose();}
});
test('portable skill helpers are synchronized and installation never overwrites a skill',async()=>{
  const f=await fixture();
  try{
    for(const file of ['cli.mjs','protocol.mjs','preferences.mjs'])assert.equal(await readFile(new URL('../src/'+file,import.meta.url),'utf8'),await readFile(new URL('../skills/saga-mailbox/scripts/'+file,import.meta.url),'utf8'));
    assert.equal(await readFile(new URL('../docs/PROTOCOL.md',import.meta.url),'utf8'),await readFile(new URL('../skills/saga-mailbox/references/PROTOCOL.md',import.meta.url),'utf8'));
    await run(['install-skill','--root',f.root,'--destination','skills/saga-mailbox'],()=>{});await assert.rejects(()=>run(['install-skill','--root',f.root,'--destination','skills/saga-mailbox'],()=>{}),/already exists/);
    const output=execFileSync('node',[path.join(f.root,'skills/saga-mailbox/scripts/cli.mjs'),'validate','--root',f.root],{encoding:'utf8',windowsHide:true});assert.match(output,/Valid:/);
  }finally{await f.dispose();}
});

test('Git indicators count edits and manual push publishes commits made outside SAGA',async()=>{
 const f=await fixture();let app;try{
 const remote=path.join(f.temp,'remote.git');git(f.temp,'init','--bare',remote);git(f.root,'remote','add','origin',remote);git(f.root,'push','-u','origin','HEAD');app=await start(f.root);
 assert.equal((await app.state()).git.ahead,0);
 await writeFile(path.join(f.root,'unrelated.txt'),'changed');assert.equal((await app.state()).git.changedFiles,1);
 git(f.root,'add','unrelated.txt');assert.equal((await app.state()).git.stagedFiles,1);git(f.root,'commit','-m','external change');
 assert.equal((await app.state()).git.ahead,1);assert.equal((await app.synchronize('push')).state,'ok');assert.equal((await app.state()).git.ahead,0);
 }finally{if(app)await app.stop();await f.dispose();}
});

test('branch inbox differences and safe switching preserve local work',async()=>{
 const f=await fixture();let app;try{
 const original=git(f.root,'branch','--show-current');git(f.root,'checkout','-b','incoming');
 const record={meta:meta('m-other-branch','researcher','coordinator'),body:'New incoming request on this branch.'};
 await writeFile(path.join(f.root,'mailboxes/outboxes/researcher.md'),mailboxText('researcher','outboxes',[record]));git(f.root,'add','.');git(f.root,'commit','-m','branch message');git(f.root,'checkout',original);app=await start(f.root);
 assert.equal((await app.state()).branches.find(b=>b.name==='incoming').newMessages,1);
 await writeFile(path.join(f.root,'unrelated.txt'),'unfinished');assert.equal((await app.call('branch',{ref:'refs/heads/incoming'})).status,409);assert.equal(git(f.root,'branch','--show-current'),original);git(f.root,'restore','unrelated.txt');
 assert.equal((await app.call('branch',{ref:'refs/heads/missing'})).status,409);
 git(f.root,'config','saga.pendingBranch',original);assert.equal((await app.call('branch',{ref:'refs/heads/incoming'})).status,409);git(f.root,'config','--unset','saga.pendingBranch');
 assert.equal((await app.call('branch',{ref:'refs/heads/incoming'})).status,200);assert.equal((await app.state()).messages[0].meta.id,'m-other-branch');
 const favicon=await fetch(app.base+'/favicon.svg');assert.equal(favicon.status,200);assert.match(favicon.headers.get('content-type'),/svg/);
 }finally{if(app)await app.stop();await f.dispose();}
});

test('already published commits clear stale intent despite a publication hold',async()=>{
 const f=await fixture();let app;try{
 const remote=path.join(f.temp,'remote.git');git(f.temp,'init','--bare',remote);git(f.root,'remote','add','origin',remote);git(f.root,'push','-u','origin','HEAD');
 git(f.root,'config','dashboard.publicationHold','true');git(f.root,'config','saga.pendingBranch',git(f.root,'branch','--show-current'));app=await start(f.root);
 assert.equal((await app.synchronize()).state,'ok');assert.throws(()=>git(f.root,'config','--get','saga.pendingBranch'));assert.equal(git(f.root,'config','--get','dashboard.publicationHold'),'true');
 }finally{if(app)await app.stop();await f.dispose();}
});

test('automatic branch fetch discovers remote branches without a list or changing local edits',async()=>{
 const f=await fixture();let app;try{
 const c={...config(),autoPull:false,autoPush:false,discoverBranches:true,autoFetchBranches:true,branchFetchMinutes:3};await writeFile(path.join(f.root,'exchange.config.json'),JSON.stringify(c));git(f.root,'add','.');git(f.root,'commit','-m','discovery settings');
 const branch=git(f.root,'branch','--show-current'),remote=path.join(f.temp,'remote.git'),peer=path.join(f.temp,'peer');git(f.temp,'init','--bare',remote);git(f.root,'remote','add','origin',remote);git(f.root,'push','-u','origin','HEAD');git(f.temp,'clone',remote,peer);git(peer,'config','user.name','Test');git(peer,'config','user.email','test@example.com');git(peer,'checkout','-b','new-team');
 await writeFile(path.join(peer,'mailboxes/outboxes/researcher.md'),mailboxText('researcher','outboxes',[{meta:meta('m-discovered','researcher','coordinator'),body:'Discovered incoming report.'}]));git(peer,'add','.');git(peer,'commit','-m','incoming message');git(peer,'push','origin','new-team');
 git(f.root,'config','remote.origin.fetch','+refs/heads/'+branch+':refs/remotes/origin/'+branch);await writeFile(path.join(f.root,'unrelated.txt'),'unfinished local work');
 app=await createDashboard(f.root);await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const state=await(await fetch('http://127.0.0.1:'+app.server.address().port+'/api/state',{headers:{'X-Dashboard-Token':app.token}})).json();
 assert.equal(state.branch,branch);assert.equal(await readFile(path.join(f.root,'unrelated.txt'),'utf8'),'unfinished local work');assert.equal(state.branches.find(b=>b.ref==='refs/remotes/origin/new-team').newMessages,1);assert.ok(state.branchRefresh.last);
 assert.throws(()=>validateConfig({...c,branchFetchMinutes:0}),/branchFetchMinutes/);
 }finally{if(app)await new Promise(resolve=>app.server.close(resolve));await f.dispose();}
});
