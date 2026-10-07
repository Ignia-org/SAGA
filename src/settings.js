function settingsField(key, labelText, value, type = 'text', hint = '') {
  return `<label class="setting-field">${esc(labelText)}<input id="setting-${key}" aria-label="${esc(labelText)}" type="${type}" value="${esc(value ?? '')}" ${type === 'number' ? 'min="0" step="1"' : ''}>${hint ? '<span class="hint">'+esc(hint)+'</span>' : ''}</label>`;
}
function settingsChoice(key, labelText, value, choices) {
  return `<label class="setting-field">${esc(labelText)}<select id="setting-${key}" aria-label="${esc(labelText)}">${choices.map(([v,l])=>`<option value="${esc(v)}" ${value===v?'selected':''}>${esc(l)}</option>`).join('')}</select></label>`;
}
function settingsToggle(key, labelText, value, hint = '') {
  return `<label class="setting-toggle"><input id="setting-${key}" aria-label="${esc(labelText)}" type="checkbox" ${value?'checked':''}><span>${esc(labelText)}${hint?'<span class="hint">'+esc(hint)+'</span>':''}</span></label>`;
}
function participantRow(p = {id:'',label:'',aliases:[]}) {
  return `<div class="participant-row"><input data-participant="id" aria-label="Participant ID" placeholder="ID" value="${esc(p.id)}"><input data-participant="label" aria-label="Participant label" placeholder="Display name" value="${esc(p.label)}"><input data-participant="aliases" aria-label="Participant aliases" placeholder="Aliases, comma separated" value="${esc((p.aliases||[]).join(', '))}"><button data-remove-participant type="button">Remove</button></div>`;
}
function renderSettings(c) {
  const modes=[['approval','Review before cleanup'],['automatic','Clean up after valid receipts'],['off','Disabled']];
  const priorities=['low','normal','high','urgent'].map(v=>[v,v]);
  const statuses=['untriaged','open','in_progress','waiting','blocked','done'].map(v=>[v,v]);
  return `<form id="settingsForm">
    <section class="card panel"><h3>Repository</h3><p class="hint">SAGA runs separately from the repository holding your messages. Opening another workspace does not move its data.</p>
      <div class="settings-grid">${settingsField('root','Repository path',state.workspaceRoot)}<div class="setting-field"><span>Workspace selection</span><button id="openWorkspace" type="button">Open this repository</button></div></div>
      <p class="hint">Active branch: ${esc(state.branch)} · available remotes: ${esc(state.remotes?.join(', ')||'none')}${state.publicationHold?' · publication is held in local Git configuration':''}</p>
    </section>
    <section class="card panel"><h3>Workspace and participants</h3><div class="settings-grid">
      ${settingsField('title','Workspace name',c.title)}${settingsChoice('identity','Your identity',c.identity,c.participants.map(p=>[p.id,p.label]))}
      ${settingsField('mailboxDirectory','Mailbox directory',c.mailboxDirectory,'text','Repository-relative path. Existing workspaces require a valid directory; no silent data relocation.')}
      ${settingsField('legacyDirectory','Legacy directory (optional)',c.legacyDirectory,'text','Leave blank to disable the legacy view.')}
      ${settingsField('timeZone','Display timezone',c.timeZone,'text','IANA name, e.g. UTC or Europe/Paris.')}
      ${settingsField('importOffset','Offset for undated legacy times',c.importOffset,'text','Used only when importing date-only legacy messages, e.g. +02:00.')}
    </div><h4>Participants</h4><p class="hint">IDs stay stable. Rename display labels freely. Participants with existing mailbox files cannot be removed or have their ID renamed.</p>
      <div id="participantRows">${c.participants.map(participantRow).join('')}</div><button type="button" id="addParticipant">Add participant</button>
    </section>
    <section class="card panel"><h3>Refresh and presentation</h3><div class="settings-grid">
      ${settingsField('refreshSeconds','Interface refresh interval (seconds)',c.refreshSeconds,'number','0 means manual refresh. Otherwise at least 10 seconds.')}
      ${settingsField('pageSize','Messages per page',c.pageSize,'number')}${settingsField('defaultExpanded','Expanded messages per page',c.defaultExpanded,'number')}${settingsField('historyLimit','History commits to load',c.historyLimit,'number')}
      ${settingsChoice('defaultKind','Default message type',c.defaultKind,['request','question','decision','report','reply'].map(v=>[v,v]))}${settingsChoice('defaultPriority','Default priority',c.defaultPriority,priorities)}${settingsChoice('defaultStatus','Default message status',c.defaultStatus,statuses)}
    </div>${settingsToggle('showLegacy','Show legacy exchanges by default',c.showLegacy)}${settingsToggle('showMonitoring','Show participant monitoring',c.showMonitoring)}</section>
    <section class="card panel"><h3>Git automation</h3><p class="hint">A push publishes every ahead commit on the current branch. Existing staged edits and branch divergence stop automation.</p>
      ${settingsToggle('autoCommit','Commit dashboard writes automatically',c.autoCommit,'When disabled, SAGA saves files for you to commit manually.')}
      ${settingsToggle('autoPull','Pull automatically',c.autoPull)}${settingsToggle('autoPush','Push pending dashboard commits automatically',c.autoPush)}
      ${settingsToggle('syncOnStart','Synchronize when SAGA starts',c.syncOnStart)}${settingsToggle('syncAfterWrite','Synchronize after a write',c.syncAfterWrite)}
      <div class="settings-grid">${settingsField('syncSeconds','Scheduled Git interval (seconds)',c.syncSeconds,'number','0 disables scheduled Git. Independent from interface refresh.')}${settingsField('gitRemote','Git remote',c.gitRemote)}${settingsField('expectedBranch','Required branch (optional)',c.expectedBranch,'text','Leave blank to use the currently checked-out branch.')}${settingsField('commitPrefix','Commit message prefix',c.commitPrefix)}</div>
      <div class="actions"><button id="pullNow" type="button">Pull now</button><button id="pushNow" type="button">Push pending commits</button></div>
    </section>
    <section class="card panel"><h3>Completion receipts</h3><div class="settings-grid">${settingsChoice('cleanup','Cleanup policy',c.cleanup,modes)}${settingsField('cleanupSeconds','Automatic receipt scan interval (seconds)',c.cleanupSeconds,'number','Independent from interface and Git intervals; minimum 10 seconds.')}</div>
      ${settingsToggle('confirmCleanup','Confirm manual cleanup and receipt dismissal',c.confirmCleanup)}
      <p class="hint">Only matching exact-version receipts can complete your own requests. Automatic cleanup requires automatic commits. A receipt is the recipient’s completion statement, not independent verification.</p>
    </section><div class="settings-save"><button id="saveSettings" type="submit" class="primary">Save settings</button><span class="hint">Changes are validated and applied without restarting.</span></div>
  </form>`;
}
function collectSettings() {
  const settings = {};
  for (const key of ['title','identity','mailboxDirectory','timeZone','importOffset','defaultKind','defaultPriority','defaultStatus','gitRemote','commitPrefix','cleanup']) settings[key]=$('setting-'+key).value.trim();
  for (const key of ['legacyDirectory','expectedBranch']) settings[key]=$('setting-'+key).value.trim()||null;
  for (const key of ['refreshSeconds','syncSeconds','cleanupSeconds','pageSize','defaultExpanded','historyLimit']) settings[key]=Number($('setting-'+key).value);
  for (const key of ['autoCommit','autoPull','autoPush','syncOnStart','syncAfterWrite','showLegacy','showMonitoring','confirmCleanup']) settings[key]=$('setting-'+key).checked;
  settings.participants=[...document.querySelectorAll('#participantRows .participant-row')].map(row=>({id:row.querySelector('[data-participant="id"]').value.trim(),label:row.querySelector('[data-participant="label"]').value.trim(),aliases:row.querySelector('[data-participant="aliases"]').value.split(',').map(a=>a.trim()).filter(Boolean)}));
  return settings;
}
function renderSetup() {
  return `<section class="card panel"><h3>Connect a repository</h3><p>SAGA keeps mailbox data in your own Git repository. Open an existing configured workspace or initialize a new one.</p>
    ${settingsField('root','Repository path',state.workspaceRoot)}<div class="actions"><button id="openWorkspace">Open existing workspace</button></div>
    <hr><h3>Initialize mailboxes</h3><div class="settings-grid">${settingsField('setupTitle','Workspace name','My workspace')}${settingsField('setupIdentity','Your participant ID','operator')}${settingsField('setupDirectory','Mailbox directory','mailboxes')}</div>
    <label class="setting-field">Participants (JSON)<textarea id="setupParticipants" aria-label="Setup participants">${esc(JSON.stringify([{id:'operator',label:'Operator'},{id:'contributor',label:'Contributor'}],null,2))}</textarea></label>
    <button id="initializeWorkspace" class="primary">Initialize this repository</button><p class="hint">Creates configuration and empty mailboxes. Initial files are committed locally. Automatic pulls and pushes remain off.</p>
  </section>`;
}
