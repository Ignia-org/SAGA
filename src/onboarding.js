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
      <p class="hint">Enter the absolute path of that repository on this computer. If it is not on this computer yet, enter the folder where it should go: SAGA can clone it or create a new one.</p>
      <form class="path-row" data-setup-form="inspect"><input id="setup-root" aria-label="Repository folder" placeholder="${esc(examplePath())}" value="${esc(state.suggestedRoot || '')}" autocomplete="off" spellcheck="false"><button class="primary" type="submit">Check folder</button></form>
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
function renderCreateForm(x) {
  const folderName = x.path.split(/[\\/]/).filter(Boolean).pop() || 'Team';
  return `<section class="card panel"><p class="caption">Step 2 of 2</p><h3>Create the workspace</h3>
    ${x.workspace === 'empty' ? box('warn', esc(x.problem) + '<p class="hint">If this repository already had a workspace, restore the file from Git instead (for example <code>git checkout -- exchange.config.json</code>) and check the folder again.</p>') : '<p>This repository has no SAGA workspace yet. Describe who exchanges messages here; everything stays editable later in Settings.</p>'}
    <div class="settings-grid">${settingsField('setupTitle', 'Workspace name', folderName.replace(/[-_]+/g, ' ').replace(/^./, c => c.toUpperCase()))}</div>
    <h4>You</h4><p class="hint">Your identity in SAGA. Agents send their reports and questions to this participant.</p>
    <div class="settings-grid">${settingsField('setupLabel', 'Your display name', 'Operator')}${settingsField('setupIdentity', 'Your participant ID', 'operator', 'text', 'Lowercase letters, digits, - or _. It cannot be renamed once messages exist.')}</div>
    <h4>Agents</h4><p class="hint">One participant per recurring agent, each with a stable ID used in its prompt. You can add more later.</p>
    <div id="setupAgents">${agentRow({ id: 'researcher', label: 'Researcher', role: '' })}</div>
    <button type="button" data-setup="add-agent">Add agent</button>
    <h4>Git synchronization</h4>
    ${x.remotes.length ? settingsToggle('setupAutoSync', 'Pull and push automatically with ' + x.remotes[0], false, 'Agents on other computers see your messages without manual pushes. Off by default; change it any time in Settings.') : '<p class="hint">This repository has no Git remote. SAGA works locally; add a remote later (for example on GitHub) to exchange with agents on other computers.</p>'}
    <details class="setup-advanced"><summary>Advanced</summary>${settingsField('setupDirectory', 'Mailbox directory', 'mailboxes', 'text', 'Repository-relative folder holding one outbox and one receipt file per participant.')}</details>
    ${identityFields(x)}
    <div class="actions"><button class="primary" type="button" data-setup="initialize">Create workspace</button></div>
    <p class="hint">Creates <code>exchange.config.json</code> and empty mailboxes, then commits them locally on branch ${esc(x.branch || '(new)')}.</p>
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
  if (x.workspace === 'valid') {
    const me = x.participants.find(p => p.id === x.identity);
    return `<section class="card panel"><h3>Workspace found: ${esc(x.title)}</h3>
      <p>${x.participants.length} participants: ${x.participants.map(p => esc(p.label)).join(', ')}. You operate as <strong>${esc(me?.label || x.identity)}</strong>${x.branch ? ' on branch ' + esc(x.branch) : ''}.</p>
      ${identityFields(x)}<div class="actions"><button class="primary" type="button" data-setup="open">Open workspace</button></div>
      <p class="hint">SAGA remembers this folder on this computer.</p></section>`;
  }
  if (x.workspace === 'invalid') return `<section class="card panel"><h3>This workspace cannot be opened</h3>${box('warn', esc(x.problem))}
    <p class="hint">Fix the file in the repository or restore it from Git, then check again. A recent pull may also have brought an incomplete change.</p><div class="actions"><button type="button" data-setup="recheck">Check again</button></div></section>`;
  if (x.isApplication || x.insideApplication) return box('warn', '<strong>This is the SAGA application folder.</strong><p>Choose or create a separate repository for your messages.</p>');
  return renderCreateForm(x);
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
function workspaceConfig() {
  const value = id => document.getElementById('setting-' + id).value.trim();
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
    <li><strong>Schedule each agent</strong> on its own checkout of this repository with its participant ID${agents.length ? ' (' + agents.map(p => '<code>' + esc(p.id) + '</code>').join(', ') + ')' : ''} and a recurring prompt. The <a href="https://github.com/Ignia-org/SAGA#getting-started" target="_blank" rel="noopener noreferrer">getting started guide</a> has prompts for ChatGPT/Codex and Claude.</li>
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
  const row = e.target.closest('[data-setup-agent]'); if (!row) return;
  const id = row.querySelector('[data-agent="id"]');
  if (e.target === id) id.removeAttribute('data-auto');
  else if (e.target.dataset.agent === 'label' && id.hasAttribute('data-auto')) id.value = slugify(e.target.value);
});
document.getElementById('feed').addEventListener('click', e => {
  const button = e.target.closest('[data-setup],[data-welcome]'); if (!button) return;
  const x = onboarding.inspection, action = button.dataset.setup;
  if (button.dataset.welcome === 'push') { document.getElementById('pushHeader').click(); return; }
  if (action === 'add-agent') { document.getElementById('setupAgents').insertAdjacentHTML('beforeend', agentRow()); document.querySelector('[data-setup-agent]:last-child [data-agent="label"]').focus(); }
  if (action === 'remove-agent') button.closest('[data-setup-agent]').remove();
  if (action === 'recheck') inspectFolder(x.path);
  if (action === 'use-top') inspectFolder(x.repository);
  if (action === 'create') setupCall('Creating repository…', async () => showInspection(await api('prepare', { action: 'create', root: x.path })));
  if (action === 'open') setupCall('Opening workspace…', () => mutate('workspace', { root: x.path, gitIdentity: gitIdentity() }));
  if (action === 'initialize') setupCall('Creating workspace…', () => mutate('workspace', { root: x.path, initialize: true, config: workspaceConfig(), gitIdentity: gitIdentity() }));
});
