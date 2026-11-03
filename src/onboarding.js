// First-run onboarding: choose, clone, or create the repository, then create or open its workspace.
const onboarding = { inspection: null, signature: '', working: '' };
const slugify = text => String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^[^a-z]+/, '').replace(/-+$/, '').slice(0, 64);
const pathSeparator = () => state?.platform === 'win32' ? '\\' : '/';
const examplePath = () => state?.platform === 'win32' ? 'C:\\Users\\you\\team-docs' : '/home/you/team-docs';
const box = (kind, html) => `<div class="setup-box ${kind}">${html}</div>`;

function onboardingSignature() { return JSON.stringify([state.workspaceRoot, state.problem, state.suggestedRoot]); }
function renderOnboarding() {
  const feed = document.getElementById('feed');
  if (document.getElementById('setupForm') && onboarding.signature === onboardingSignature()) return;
  onboarding.signature = onboardingSignature(); onboarding.inspection = null;
  feed.innerHTML = `<div id="setupForm" class="onboarding">
    ${state.problem ? box('warn', '<strong>The previous workspace cannot be opened.</strong><p>' + esc(state.problem) + '</p>') : ''}
    <section class="card panel">
      <p class="caption">Step 1 of 2</p>
      <h3>Where is your communication repository?</h3>
      <p>SAGA keeps messages as Markdown files in a Git repository that you own, separate from the SAGA application folder${state.appRoot ? ' (<code>' + esc(state.appRoot) + '</code>)' : ''}.</p>
      <p class="hint">Choose the repository folder on this computer with <strong>Browse</strong>, or paste its path. If it is not on this computer yet, choose where it should go: SAGA can clone it or create a new one.</p>
      <form class="path-row" data-setup-form="inspect"><input id="setup-root" aria-label="Repository folder" placeholder="${esc(examplePath())}" value="${esc(state.suggestedRoot || '')}" autocomplete="off" spellcheck="false"><button type="button" data-browse="setup-root" data-browse-then="inspect">Browse…</button><button class="primary" type="submit">Check folder</button></form>
      <div id="setupStatus" class="hint" role="status"></div>
    </section>
    <div id="setupResult"></div>
  </div>`;
  if (state.suggestedRoot) inspectFolder(state.suggestedRoot);
}

function identityFields(x) {
  if (x.gitUser.name && x.gitUser.email) return '';
  return `<div class="setup-identity"><h4>Your Git identity on this computer</h4><p class="hint">Git needs a name and email to record SAGA's commits. They are saved in this repository's local Git configuration only.</p>
    <div class="settings-grid">${settingsField('gitName', 'Your name', x.gitUser.name)}${settingsField('gitEmail', 'Your email', x.gitUser.email, 'email')}</div></div>`;
}
function agentRow(agent = { id: '', label: '', role: '' }) {
  return `<div class="setup-agent" data-setup-agent>
    <label class="setting-field">Display name<input data-agent="label" aria-label="Agent display name" placeholder="Researcher" value="${esc(agent.label)}"></label>
    <label class="setting-field">Participant ID<input data-agent="id" aria-label="Agent participant ID" placeholder="researcher" value="${esc(agent.id)}" ${agent.id ? '' : 'data-auto'} spellcheck="false"></label>
    <label class="setting-field">Role (optional)<input data-agent="role" aria-label="Agent role" placeholder="Investigates and verifies project questions." value="${esc(agent.role || '')}"></label>
    <button type="button" data-setup="remove-agent" aria-label="Remove agent">Remove</button>
  </div>`;
}
function personRow(p, me) {
  const locked = p.hasMailbox || p.messages, activity = [p.sent ? p.sent + ' sent' : '', p.received ? p.received + ' received' : ''].filter(Boolean).join(' · ');
  return `<div class="setup-person" data-setup-person ${p.aliases ? `data-aliases="${esc(JSON.stringify(p.aliases))}"` : ''} ${p.reportTo ? `data-report-to="${esc(p.reportTo)}"` : ''}>
    <label class="setup-me"><input type="radio" name="setupMe" ${me ? 'checked' : ''} aria-label="This is me">This is me</label>
    <label class="setting-field">Display name<input data-agent="label" aria-label="Participant display name" placeholder="Display name" value="${esc(p.label || '')}"></label>
    <label class="setting-field">Participant ID<input data-agent="id" aria-label="Participant ID" placeholder="id" value="${esc(p.id || '')}" ${p.id ? '' : 'data-auto'} ${locked ? 'readonly title="Existing mailboxes use this ID"' : ''} spellcheck="false"></label>
    <label class="setting-field">Role (optional)<input data-agent="role" aria-label="Participant role" placeholder="Responsibilities in one sentence" value="${esc(p.role || '')}"></label>
    ${locked ? `<span class="hint setup-activity">${esc(activity || 'Has a mailbox')}</span>` : (activity ? `<span class="hint setup-activity">${esc(activity)}</span>` : '') + '<button type="button" data-setup="remove-agent" aria-label="Remove participant">Remove</button>'}
  </div>`;
}
function discoveredSummary(d) {
  const count = d.participants.length + ' participant' + (d.participants.length === 1 ? '' : 's');
  if (d.source === 'history') return `<strong>Recovered from Git history.</strong> The last valid configuration (commit <code>${esc(d.commit.slice(0, 8))}</code>, ${esc(new Date(d.date).toLocaleDateString())}) lists ${count}. Names, roles and settings are restored; check who you are and confirm.`;
  if (d.source === 'channels') return `<strong>Earlier exchange files found.</strong> ${d.searched.channelFiles} file${d.searched.channelFiles === 1 ? '' : 's'} named like <code>${esc(d.channelFiles[0].split('/').pop())}</code> mention ${count}. Check their names and choose which one is you. Those files stay in place for reference; new messages use structured mailboxes.`;
  return `<strong>Existing mailboxes found</strong> in <code>${esc(d.mailboxDirectory)}/</code> with ${count}. Display names are derived from their IDs; adjust them and choose which participant is you.`;
}
function renderCreateForm(x) {
  const folderName = x.path.split(/[\\/]/).filter(Boolean).pop() || 'Team', d = x.discovered?.participants.length ? x.discovered : null, settings = d?.settings;
  const people = d ? `<h4>Participants</h4><p class="hint">Choose the participant that is you; the others are your agents. Participants that already have messages keep their ID. Suggested: <strong>${esc(d.participants.find(p => p.id === d.suggestedIdentity)?.label || '')}</strong>.</p>
    <div id="setupPeople">${d.participants.map(p => personRow(p, p.id === d.suggestedIdentity)).join('')}</div>
    <button type="button" data-setup="add-person">Add participant</button>`
    : `<h4>You</h4><p class="hint">Your identity in SAGA. Agents send their reports and questions to this participant.</p>
    <div class="settings-grid">${settingsField('setupLabel', 'Your display name', 'Operator')}${settingsField('setupIdentity', 'Your participant ID', 'operator', 'text', 'Lowercase letters, digits, - or _. It cannot be renamed once messages exist.')}</div>
    <h4>Agents</h4><p class="hint">One participant per recurring agent, each with a stable ID used in its prompt. You can add more later.</p>
    <div id="setupAgents">${agentRow({ id: 'researcher', label: 'Researcher', role: '' })}</div>
    <button type="button" data-setup="add-agent">Add agent</button>`;
  const searched = x.discovered?.searched, nothingFound = searched ? `<p class="hint">SAGA looked for existing participants and found none: no earlier <code>exchange.config.json</code> in Git history, no mailbox folders (<code>outboxes/</code> or <code>receipts/</code>), and no exchange files named like <code>sender-to-recipient.md</code>. If this repository already holds your exchanges, check that you selected its root folder.</p>` : '';
  const intro = d ? box('info', discoveredSummary(d)) : (x.workspace === 'empty' ? box('warn', esc(x.problem)) : '<p>This repository has no SAGA workspace yet. Describe who exchanges messages here; everything stays editable later in Settings.</p>') + nothingFound;
  return `<section class="card panel"><p class="caption">Step 2 of 2</p><h3>${d ? 'Restore the workspace' : 'Create the workspace'}</h3>
    ${intro}
    <div class="settings-grid">${settingsField('setupTitle', 'Workspace name', settings?.title || folderName.replace(/[-_]+/g, ' ').replace(/^./, c => c.toUpperCase()))}</div>
    ${people}
    <h4>Git synchronization</h4>
    ${x.remotes.length ? settingsToggle('setupAutoSync', 'Pull and push automatically with ' + x.remotes[0], Boolean(settings?.autoPull && settings?.autoPush), 'Agents on other computers see your messages without manual pushes. Off by default; change it any time in Settings.') : '<p class="hint">This repository has no Git remote. SAGA works locally; add a remote later (for example on GitHub) to exchange with agents on other computers.</p>'}
    <details class="setup-advanced"><summary>Advanced</summary>${settingsField('setupDirectory', 'Mailbox directory', d?.mailboxDirectory || 'mailboxes', 'text', 'Repository-relative folder holding one outbox and one receipt file per participant.')}</details>
    ${identityFields(x)}
    <div class="actions"><button class="primary" type="button" data-setup="initialize">${d ? 'Restore workspace' : 'Create workspace'}</button></div>
    <p class="hint">${d ? 'Writes <code>exchange.config.json</code>, keeps existing mailboxes unchanged, creates missing ones,' : 'Creates <code>exchange.config.json</code> and empty mailboxes,'} then commits them locally on branch ${esc(x.branch || '(new)')}.</p>
  </section>`;
}
function renderInspection(x) {
  const root = esc(x.path);
  if (!x.gitInstalled) return box('warn', '<strong>Git was not found on this computer.</strong><p>Install Git (<a href="https://git-scm.com/downloads" target="_blank" rel="noopener noreferrer">git-scm.com</a>), then restart SAGA.</p>');
  if (x.exists && !x.directory) return box('warn', esc(x.problem));
  if (x.insideApplication && !(x.isRepositoryRoot && x.workspace === 'valid')) return box('warn', '<strong>This is inside the SAGA application folder.</strong><p>Keep your messages in a separate repository, for example next to the SAGA folder rather than inside it.</p>');
  if (!x.repository && (!x.exists || x.empty)) return `<section class="card panel"><h3>${x.exists ? 'This folder is empty' : 'This folder does not exist yet'}</h3><p class="hint"><code>${root}</code></p>
    <div class="option-grid">
      <div class="option"><h4>Clone an existing repository</h4><p class="hint">On a new computer, get the communication repository your team already uses. Your existing Git credentials are used.</p>
        <form data-setup-form="clone"><label class="setting-field">Repository URL<input id="setup-url" placeholder="https://github.com/your-org/team-docs.git" autocomplete="off" spellcheck="false"></label><button class="primary" type="submit">Clone into this folder</button></form></div>
      <div class="option"><h4>Start a new repository</h4><p class="hint">For a new team workspace. SAGA creates an empty Git repository here; you can add a remote later.</p><button type="button" data-setup="create">Create Git repository</button></div>
    </div></section>`;
  if (!x.repository) return `<section class="card panel"><h3>This folder is not a Git repository</h3><p class="hint"><code>${root}</code> contains files but no Git history.</p>
    <p>If your communication repository is elsewhere, enter its path above, or enter a new empty folder to clone it. Otherwise SAGA can start a Git repository in this folder; existing files are left untouched.</p>
    <div class="actions"><button type="button" data-setup="create">Create a Git repository here</button></div></section>`;
  if (!x.isRepositoryRoot) return `<section class="card panel"><h3>This folder is inside another repository</h3><p>SAGA works from the repository root: <code>${esc(x.repository)}</code></p><div class="actions"><button class="primary" type="button" data-setup="use-top">Use the repository root</button></div></section>`;
  const r = x.remoteStatus, commits = n => n + ' new commit' + (n === 1 ? '' : 's'), updateButton = `<div class="actions"><button class="primary" type="button" data-setup="pull">Update from ${esc(r?.remote || 'remote')}</button></div>`;
  const remoteNote = !r ? '' : r.error ? `<p class="hint">SAGA could not check ${esc(r.remote)} for updates, so this folder may be out of date: ${esc(r.error.split('\n')[0])}</p>` : '';
  const outdated = r?.exists && r.behind > 0, outdatedBox = outdated ? box('info', `<strong>This folder is not up to date.</strong> ${esc(r.remote)}/${esc(r.branch)} has ${commits(r.behind)} that this folder does not have yet.${r.ahead ? ` This folder also has ${r.ahead} local commit${r.ahead === 1 ? '' : 's'}, so reconcile them in Git first (for example <code>git pull --rebase</code>).` : ' Updating fast-forwards the folder; it never creates a merge commit.'}`) + (r.ahead ? '' : updateButton) : '';
  if (outdated && r.workspace && x.workspace !== 'valid') return `<section class="card panel"><h3>A SAGA workspace exists on ${esc(r.remote)}</h3>${outdatedBox}<p class="hint">Update this folder to get its configuration and messages, instead of creating a new one.</p></section>`;
  if (x.workspace === 'valid') {
    const me = x.participants.find(p => p.id === x.identity);
    return `<section class="card panel"><h3>Workspace found: ${esc(x.title)}</h3>${outdatedBox}${remoteNote}
      <p>${x.participants.length} participants: ${x.participants.map(p => esc(p.label)).join(', ')}${x.branch ? ', on branch ' + esc(x.branch) : ''}.</p>
      <div class="settings-grid">${settingsChoice('openIdentity', 'You are', x.identity, x.participants.map(p => [p.id, p.label + ' (' + p.id + ')']))}</div>
      <p class="hint">The workspace is set up for <strong>${esc(me?.label || x.identity)}</strong>. Choosing someone else updates the shared workspace configuration and commits it.</p>
      ${identityFields(x)}<div class="actions"><button class="primary" type="button" data-setup="open">Open workspace</button></div>
      <p class="hint">SAGA remembers this folder on this computer.</p></section>`;
  }
  if (x.workspace === 'invalid') return `<section class="card panel"><h3>This workspace cannot be opened</h3>${box('warn', esc(x.problem))}
    ${x.discovered?.commit ? `<p>A valid version exists in Git history (${esc(new Date(x.discovered.date).toLocaleDateString())}). To restore it, run in the repository:</p><pre class="setup-command">git checkout ${esc(x.discovered.commit.slice(0, 12))} -- exchange.config.json</pre>` : ''}
    <p class="hint">Fix the file in the repository or restore it from Git, then check again. A recent pull may also have brought an incomplete change.</p><div class="actions"><button type="button" data-setup="recheck">Check again</button></div></section>`;
  if (x.isApplication || x.insideApplication) return box('warn', '<strong>This is the SAGA application folder.</strong><p>Choose or create a separate repository for your messages.</p>');
  return outdatedBox || remoteNote ? `<div class="setup-remote">${outdatedBox}${remoteNote}</div>` + renderCreateForm(x) : renderCreateForm(x);
}

function setupStatus(text) { const status = document.getElementById('setupStatus'); if (status) status.textContent = text; }
function showInspection(x) {
  onboarding.inspection = x; const input = document.getElementById('setup-root'); if (input && x) input.value = x.path;
  const result = document.getElementById('setupResult'); if (result) result.innerHTML = x ? renderInspection(x) : '';
}
async function setupCall(label, fn) {
  if (onboarding.working) return; onboarding.working = label; notice(''); setupStatus(label);
  document.querySelectorAll('#setupForm button').forEach(b => { b.disabled = true; });
  try { return await fn(); } catch (e) { notice(e.message); return null; }
  finally { onboarding.working = ''; setupStatus(''); document.querySelectorAll('#setupForm button').forEach(b => { b.disabled = false; }); }
}
function inspectFolder(root) { return setupCall('Checking folder…', async () => showInspection(await api('inspect', { root }))); }
function gitIdentity() {
  const name = document.getElementById('setting-gitName'), email = document.getElementById('setting-gitEmail');
  return name && email ? { name: name.value.trim(), email: email.value.trim() } : undefined;
}
function discoveredConfig(value) {
  const d = onboarding.inspection.discovered, rows = [...document.querySelectorAll('[data-setup-person]')];
  const mine = rows.find(row => row.querySelector('[name="setupMe"]').checked);
  if (!mine) throw new Error('Choose which participant is you.');
  const read = (row, name) => row.querySelector(`[data-agent="${name}"]`).value.trim();
  const people = rows.map(row => {
    const person = { id: read(row, 'id') || slugify(read(row, 'label')), label: read(row, 'label') || read(row, 'id') };
    if (read(row, 'role')) person.role = read(row, 'role');
    if (row.dataset.aliases) person.aliases = JSON.parse(row.dataset.aliases);
    if (row.dataset.reportTo) person.reportTo = row.dataset.reportTo;
    return { row, person };
  }).filter(x => x.person.id || x.person.label);
  const identity = people.find(x => x.row === mine)?.person.id, ids = new Set(people.map(x => x.person.id));
  for (const { person } of people) {
    if (person.reportTo && (person.reportTo === person.id || !ids.has(person.reportTo))) delete person.reportTo;
    if (!person.reportTo && person.id !== identity && d.source !== 'history') person.reportTo = identity;
  }
  const { participants, identity: _identity, title, mailboxDirectory, schema, ...settings } = d.settings || {};
  const sync = document.getElementById('setting-setupAutoSync')?.checked === true;
  return { ...settings, schema: 1, title: value('setupTitle'), identity, participants: people.map(x => x.person), mailboxDirectory: value('setupDirectory') || 'mailboxes', cleanup: settings.cleanup || 'approval', autoPull: sync, autoPush: sync, syncAfterWrite: sync || Boolean(settings.syncAfterWrite) };
}
function workspaceConfig() {
  const value = id => document.getElementById('setting-' + id).value.trim();
  if (onboarding.inspection?.discovered?.participants.length) return discoveredConfig(value);
  const me = { id: value('setupIdentity'), label: value('setupLabel') || value('setupIdentity') };
  const agents = [...document.querySelectorAll('[data-setup-agent]')].map(row => {
    const field = name => row.querySelector(`[data-agent="${name}"]`).value.trim();
    const agent = { id: field('id') || slugify(field('label')), label: field('label') || field('id') };
    if (field('role')) agent.role = field('role');
    if (agent.id || agent.label) agent.reportTo = me.id;
    return agent;
  }).filter(a => a.id || a.label);
  const sync = document.getElementById('setting-setupAutoSync')?.checked === true;
  return { schema: 1, title: value('setupTitle'), identity: me.id, participants: [me, ...agents], mailboxDirectory: value('setupDirectory') || 'mailboxes', cleanup: 'approval', ...(sync ? { autoPull: true, autoPush: true, syncAfterWrite: true } : {}) };
}

function renderWelcome() {
  const c = state.config, g = state.git, remote = state.remotes?.length ? (state.remotes.includes(c.gitRemote) ? c.gitRemote : null) : null, sep = pathSeparator();
  const agents = c.participants.filter(p => p.id !== c.identity);
  const command = `node "${state.appRoot}${sep}src${sep}cli.mjs" install-skill --root "${state.workspaceRoot}" --destination .agents/skills/saga-mailbox`;
  const share = !state.remotes?.length ? 'This repository has no Git remote yet. Add one (for example on GitHub) and push, so agents on other computers can read and write messages.'
    : !remote ? `Settings use remote <code>${esc(c.gitRemote)}</code>, which this repository does not have. Choose one of: ${state.remotes.map(esc).join(', ')}.`
    : g?.ahead === 0 ? `Published on <code>${esc(remote)}</code>.` + (c.autoPush ? ' Automatic push is on.' : ' Automatic push is off; use Push now after changes, or enable it in Settings.')
    : `Your local commits are not on <code>${esc(remote)}</code> yet. Push them so agents can see this workspace.<div class="actions"><button type="button" data-welcome="push">Push now</button></div>`;
  return `<section class="card panel welcome"><h3>Your workspace is ready</h3><p>Messages addressed to you will appear here. To get your agents working:</p><ol>
    <li><strong>Share the repository.</strong> ${share}</li>
    <li><strong>Install the SAGA skill</strong> once in this repository, then commit and push it. Skip this if <code>.agents/skills/saga-mailbox</code> already exists.<pre>${esc(command)}</pre></li>
    <li><strong>Schedule each agent</strong> on its own checkout of this repository with its participant ID${agents.length ? ' (' + agents.map(p => '<code>' + esc(p.id) + '</code>').join(', ') + ')' : ''} and a recurring prompt. The <a href="https://github.com/Ignia-org/SAGA#connect-your-agents" target="_blank" rel="noopener noreferrer">setup guide</a> has prompts for ChatGPT/Codex and Claude.</li>
    <li><strong>Send a first request</strong> with New message${agents.length ? '' : ' after adding an agent in Settings'}.</li>
  </ol></section>`;
}

document.getElementById('feed').addEventListener('submit', e => {
  const form = e.target.closest('[data-setup-form]'); if (!form) return; e.preventDefault();
  if (form.dataset.setupForm === 'inspect') inspectFolder(document.getElementById('setup-root').value);
  if (form.dataset.setupForm === 'clone') {
    const root = onboarding.inspection?.path, url = document.getElementById('setup-url').value;
    setupCall('Cloning… this can take a while for large repositories.', async () => showInspection(await api('prepare', { action: 'clone', root, url })));
  }
});
document.getElementById('feed').addEventListener('input', e => {
  const row = e.target.closest('[data-setup-agent],[data-setup-person]'); if (!row) return;
  const id = row.querySelector('[data-agent="id"]');
  if (e.target === id) id.removeAttribute('data-auto');
  else if (e.target.dataset.agent === 'label' && id.hasAttribute('data-auto')) id.value = slugify(e.target.value);
});
document.getElementById('feed').addEventListener('click', e => {
  const button = e.target.closest('[data-setup],[data-welcome]'); if (!button) return;
  const x = onboarding.inspection, action = button.dataset.setup;
  if (button.dataset.welcome === 'push') { document.getElementById('pushHeader').click(); return; }
  if (action === 'add-agent') { document.getElementById('setupAgents').insertAdjacentHTML('beforeend', agentRow()); document.querySelector('[data-setup-agent]:last-child [data-agent="label"]').focus(); }
  if (action === 'add-person') { document.getElementById('setupPeople').insertAdjacentHTML('beforeend', personRow({ id: '', label: '' }, false)); document.querySelector('[data-setup-person]:last-child [data-agent="label"]').focus(); }
  if (action === 'remove-agent') button.closest('[data-setup-agent],[data-setup-person]').remove();
  if (action === 'recheck') inspectFolder(x.path);
  if (action === 'use-top') inspectFolder(x.repository);
  if (action === 'pull') setupCall('Updating folder…', async () => showInspection(await api('prepare', { action: 'pull', root: x.path })));
  if (action === 'create') setupCall('Creating repository…', async () => showInspection(await api('prepare', { action: 'create', root: x.path })));
  if (action === 'open') setupCall('Opening workspace…', () => mutate('workspace', { root: x.path, gitIdentity: gitIdentity(), identity: document.getElementById('setting-openIdentity')?.value }));
  if (action === 'initialize') { let config; try { config = workspaceConfig(); } catch (error) { notice(error.message); return; } setupCall('Creating workspace…', () => mutate('workspace', { root: x.path, initialize: true, config, gitIdentity: gitIdentity() })); }
});

// Folder picker: browsers cannot reveal local absolute paths, so the local server lists folders instead.
const picker = { path: null, separator: '/', input: null, then: null, sequence: 0 };
const folderIcon = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/></svg>';
function ensureFolderPicker() {
  if (document.getElementById('folderPicker')) return;
  document.body.insertAdjacentHTML('beforeend', `<dialog id="folderPicker" aria-label="Choose a folder"><div class="picker-heading"><h3>Choose a folder</h3><button type="button" data-picker="cancel" aria-label="Close">Close</button></div>
    <div id="pickerShortcuts" class="picker-shortcuts"></div>
    <form class="picker-location" data-picker-form><button type="button" data-picker="up" title="Parent folder" aria-label="Parent folder">↑</button><input id="pickerPath" aria-label="Current folder" spellcheck="false" autocomplete="off"><button type="submit">Go</button></form>
    <div id="pickerList" class="picker-list" aria-label="Folders"></div>
    <p id="pickerError" class="setup-box warn" hidden></p>
    <label class="setting-field">New folder name (optional)<input id="pickerNewName" placeholder="team-docs" spellcheck="false" autocomplete="off"><span class="hint">To clone or start a repository, choose where it goes and name the new folder here. SAGA creates it only when you confirm the next step.</span></label>
    <div class="actions picker-actions"><span id="pickerTarget" class="hint"></span><button type="button" data-picker="cancel">Cancel</button><button type="button" class="primary" data-picker="select">Select this folder</button></div></dialog>`);
  const dialog = document.getElementById('folderPicker');
  dialog.addEventListener('submit', e => { e.preventDefault(); browseTo(document.getElementById('pickerPath').value); });
  dialog.addEventListener('input', e => { if (e.target.id === 'pickerNewName') updatePickerTarget(); });
  dialog.addEventListener('click', e => {
    const button = e.target.closest('button'); if (!button) return;
    if (button.dataset.pickerOpen) browseTo(button.dataset.pickerOpen);
    if (button.dataset.picker === 'up' && picker.parent) browseTo(picker.parent);
    if (button.dataset.picker === 'cancel') dialog.close();
    if (button.dataset.picker === 'select') {
      const chosen = pickerTarget(); if (!chosen) return;
      const input = document.getElementById(picker.input); if (input) input.value = chosen;
      dialog.close(); if (picker.then === 'inspect') inspectFolder(chosen);
    }
  });
}
function pickerTarget() {
  const name = document.getElementById('pickerNewName').value.trim(), error = document.getElementById('pickerError');
  if (!picker.path) return null;
  if (!name) return picker.path;
  if (/[\\/:*?"<>|]/.test(name) || name === '.' || name === '..') { error.hidden = false; error.textContent = 'A folder name cannot contain \\ / : * ? " < > |.'; return null; }
  return picker.path.replace(/[\\/]+$/, '') + picker.separator + name;
}
function updatePickerTarget() {
  const name = document.getElementById('pickerNewName').value.trim();
  document.getElementById('pickerError').hidden = true;
  document.getElementById('pickerTarget').textContent = picker.path ? 'Selection: ' + (name ? picker.path.replace(/[\\/]+$/, '') + picker.separator + name : picker.path) : '';
}
async function browseTo(target) {
  const sequence = ++picker.sequence, list = document.getElementById('pickerList'), error = document.getElementById('pickerError');
  list.setAttribute('aria-busy', 'true');
  try {
    const result = await api('folders', target ? { path: target } : {});
    if (sequence !== picker.sequence) return;
    Object.assign(picker, { path: result.path, parent: result.parent, separator: result.separator });
    error.hidden = true; document.getElementById('pickerPath').value = result.path;
    document.querySelector('#folderPicker [data-picker="up"]').disabled = !result.parent;
    document.getElementById('pickerShortcuts').innerHTML = result.shortcuts.map(s => `<button type="button" data-picker-open="${esc(s.path)}">${esc(s.label)}</button>`).join('');
    list.innerHTML = result.folders.map(f => `<button type="button" data-picker-open="${esc(f.path)}">${folderIcon}<span>${esc(f.name)}</span>${f.workspace ? '<span class="badge">SAGA workspace</span>' : f.git ? '<span class="badge">Git repository</span>' : ''}</button>`).join('')
      + (result.truncated ? '<p class="hint">Only the first 500 folders are listed. Type a path above to go further.</p>' : '')
      || '<p class="hint picker-empty">No subfolders here.</p>';
    list.scrollTop = 0; updatePickerTarget();
  } catch (e) { if (sequence === picker.sequence) { error.hidden = false; error.textContent = e.message; } }
  finally { list.removeAttribute('aria-busy'); }
}
function openFolderPicker(inputId, then) {
  ensureFolderPicker(); Object.assign(picker, { input: inputId, then });
  document.getElementById('pickerNewName').value = '';
  document.getElementById('folderPicker').showModal();
  browseTo(document.getElementById(inputId)?.value.trim() || '');
}
document.addEventListener('click', e => {
  const button = e.target.closest('[data-browse]'); if (!button) return;
  e.preventDefault(); openFolderPicker(button.dataset.browse, button.dataset.browseThen);
});
