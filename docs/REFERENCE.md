# SAGA reference

Detailed behavior behind the [README](../README.md). The mailbox format itself is defined in [PROTOCOL.md](PROTOCOL.md).

## Settings and defaults

Workspace settings are stored in `exchange.config.json` in the communication repository. The **Settings** view validates changes and applies them immediately, without restarting SAGA. Only changing the listening port (`PORT`) requires a restart.

| Setting | Default | Behavior |
|---|---|---|
| Interface refresh | 60 seconds | `0` means manual; otherwise 10–86400 seconds |
| Automatic commits | Enabled | Commits only files written by SAGA |
| Automatic pulls / pushes | Disabled | Each is enabled independently; new workspaces opt in during setup or in Settings |
| Git interval | 5 minutes | Pulls the active branch; `0` disables scheduled Git |
| Branch discovery | Enabled | Discovers local and remote Git branches without a list |
| Automatic branch fetch | Enabled | Refreshes all remote branches independently |
| Branch fetch interval | 5 minutes | Configurable from 1 to 1440 minutes |
| Sync on startup / after writes | Disabled | The after-write switch controls pull synchronization; automatic push always follows a save |
| Remote / required branch | `origin` / unrestricted | Optional branch guard |
| Cleanup | Review required | Automatic or disabled are also available |
| Receipt scan interval | 300 seconds | Runs only in automatic cleanup mode |
| Manual cleanup confirmation | Enabled | Can be disabled independently |
| Display timezone | `UTC` | No project-specific timezone is built in |
| Page size / expanded cards | 50 / 0 | Configurable to suit large histories |
| Default type / priority / status | request / normal / open | Used for new messages |
| History commits | 60 | Configurable, up to 200 |
| Commit prefix | `saga` | Configurable |

Identity, participant IDs, labels and aliases, mailbox directory, and monitoring visibility are configurable too. Participant IDs stay stable; changing labels is safe. An existing mailbox directory must be valid before you select it: SAGA does not silently relocate data.

Interface refresh, the Git interval, branch fetching, and the receipt scan interval are separate timers. Agent schedules are independent of all of them.

The **Browse…** buttons in setup and in Settings → Repository open a folder browser served by SAGA itself, because a web page cannot read local folder paths. It lists subfolders (hidden folders excluded), labels Git repositories and SAGA workspaces, and offers shortcuts to your home, Documents, Desktop, the folder containing SAGA, and drives on Windows. Paths typed manually must be absolute; `~` and surrounding quotes are accepted.

When a repository has no usable configuration, setup looks for existing participants in two places. It reads the last valid `exchange.config.json` in Git history (up to 30 commits back), which also restores names, roles, aliases, report recipients, and settings. It also scans the repository, including hidden folders but not `.git` or `node_modules`, up to five levels deep. It reads mailbox folders (directories with `outboxes/` or `receipts/`), collecting their owners and every `from`/`to` in their messages, as well as exchange files of the earlier `<sender>-to-<recipient>.md` format, whose names become participant IDs. Earlier exchange files stay in place and are not imported. When nothing is found, setup says what it searched. The suggested identity is the configured identity from history, otherwise the participant that receives the most reports. Initialization keeps existing mailbox files unchanged, creates only missing ones, and refuses a participant list that would leave existing mailboxes or messages without an owner. Existing mailbox files that are not yet committed stay uncommitted for you to review.

When opening an existing workspace, setup lets you choose which participant you are. Choosing a different one updates `identity` in the shared configuration and commits it.

The repository you open is remembered in `.saga/local.json` inside the SAGA folder. That file is ignored by Git and is never written to the communication repository. If the remembered folder no longer exists, or its configuration is missing, empty, or invalid, SAGA shows the setup screen with the reason.

## Git synchronization

- **Refresh** only rereads local files. It does not fetch from Git.
- **Sync now** follows your configured pull and push switches.
- **Push now** in the header publishes the current branch, including commits created outside SAGA. Settings also offers explicit **Pull now** and **Push pending commits** actions.
- **Auto push** in the header enables automatic commits and synchronization after writes.

Sending a message saves it locally first. Git publication then continues in the background, and the sync status reports a failure separately from the local save. Other writes wait for their publication attempt. A message reaches another checkout only after it is published and that checkout synchronizes.

Git operations stop when there are staged changes, uncommitted edits, a mismatched branch, or divergence. SAGA never stashes, resets, merges, or rebases automatically. A pull is fast-forward only. A push publishes all commits ahead on the branch, including the configuration commit that enables automatic push.

With manual commits, SAGA saves files and leaves committing to you. Automatic cleanup requires automatic commits, so that its history is retained.

The header shows uncommitted files and commits ahead or behind the locally known remote branch. Remote counts update when Git synchronizes.

A publication hold in local Git configuration (`saga.publicationHold`, or the older `dashboard.publicationHold`) pauses pushes independently of the settings. Release it by confirming automatic push or an explicit push. Pending publication is tied to the branch it was created on.

## Branches

The compact branch indicator beside the active branch opens a popover. It lists incoming messages present or changed on other local and fetched remote branches, compared with your current inbox. These comparisons are not read receipts.

**Fetch and check branches** refreshes remote references. Automatic branch fetch runs at startup and at the configured interval; disable it or change the interval in Settings. Fetch prunes deleted remote references. Local branches whose upstream has disappeared are hidden from the list, without deleting local work. No branch names need to be configured, and discovery can be disabled.

Switching branch requires committed files, published dashboard commits, and compatible branch restrictions. If a remote branch differs from its local counterpart, synchronize it explicitly first.

## Writing messages

Message bodies use standard Markdown. Soft line wrapping is ignored visually, while explicit hard breaks and blank lines are kept. Raw HTML is shown as text. The bundled Marked and DOMPurify libraries and their licenses are in `src/vendor`.

Inbox cards show the sender; outbox cards show the recipient. Participant monitoring shows both sides of conversations between other participants.

Each incoming message has its own inline reply draft. You can write the next reply while an earlier one is still sending, and a refresh does not replace a reply form you are using. Sends are processed one at a time and recheck your outbox version before saving.

Drafts stay in browser storage until the server confirms the save, and are stored separately per repository, branch, and identity. A failed or interrupted send keeps the text for review; SAGA never retries automatically, which could duplicate a message. A copy of the last attempted send stays in browser storage even after success.

**New message** opens the composer beside your inbox. The expand-window icon detaches it: drag its heading to move it and resize it from the bottom corner. The dock icon puts it back.

Clicking a message title marks its current version as read in this browser. A new or changed version becomes unread again. **Replied** means the original recipient sent a linked reply; it does not mean the request is completed.

Each sender owns its outbox. Recipients write completion receipts in a separate stream. Cleanup removes only your matching request and its valid receipts; other participants remain responsible for their own outboxes.

## Referencing repository files

Use Markdown links in message bodies:

```md
[Specification](repo:docs/specification.md)
[Study](repo:research/study.pdf)
[Notes](<repo:docs/meeting notes.md>)
```

Paths start at the repository root; the `repo:` prefix is optional. Markdown opens in a read-only preview. Links inside that preview resolve relative to the document's folder unless prefixed with `repo:` or `/`. PDFs open in a new browser tab. Ordinary HTTPS links open externally.

Only Git-tracked Markdown and PDF files inside the selected repository can be viewed, and symbolic links are rejected. The preview reads the current working copy on the selected branch, including uncommitted changes. Limits are 2 MiB for Markdown and 25 MiB for PDF. Viewing a file does not commit or synchronize anything. A message should explain its finding; a file reference supports it rather than replacing it.

## Participant directory and routing

Each participant has a stable `id` and a display `label`. An optional `role` describes its responsibilities in one or two sentences (up to 1000 characters). An optional `reportTo` names another participant who receives its routine reports. All of these are editable in Settings.

~~~json
{
  "id": "reviewer",
  "label": "Reviewer",
  "role": "Reviews changes for correctness and identifies defects. Owns requests for independent verification.",
  "reportTo": "coordinator"
}
~~~

Keep the roster and coordination responsibilities in `exchange.config.json`. Detailed task scope and inbox priorities belong in each agent's own instructions, which take precedence over directory defaults. Agents read the directory with:

```sh
node <skill-directory>/scripts/cli.mjs participants --root /path/to/team-docs [--id reviewer]
```

Agents route requests, blockers, dependencies, and findings to their declared owners rather than notifying everyone. An explicit reporting destination in the task wins; otherwise the participant's `reportTo` applies. Ambiguous ownership needs clarification. Receipts and replies always go back to the original conversation. Updating the directory changes routing guidance for all agents after they synchronize, without rewriting every prompt. It does not grant additional execution authority.

Removing a participant requires reconciling its existing mailbox files and any `reportTo` references first.

## Session numbering

An agent may keep its memory in a state file or another durable mechanism. Its scheduler or state supplies session numbers: an independent run uses `190`; returning to that completed run uses `190a`, then `190b`; the next independent run uses `191`. Session references are optional and separate from titles. The skill defines the continuation rules.

## Agent skill

The portable skill is [skills/saga-mailbox/SKILL.md](../skills/saga-mailbox/SKILL.md). It includes the protocol reference and dependency-free helper scripts, so an agent can use it without access to SAGA.

```sh
node src/cli.mjs install-skill --root /path/to/team-docs --destination .agents/skills/saga-mailbox
```

Choose the destination expected by your agent platform (`.agents/skills/…` for Codex, `.claude/skills/…` for Claude). The installer never overwrites an existing skill, so updating an installed copy is an explicit step. You can also reference the skill from `AGENTS.md` or `CLAUDE.md`.

Agents with access to other repositories need that access and its Git policy configured explicitly. Isolated worktrees or cloud clones need a defined way to publish to the branch your dashboard pulls.

## Command-line tool

Run from the SAGA folder (or from an installed skill's `scripts/cli.mjs`):

```sh
node src/cli.mjs init --root /path/to/team-docs --identity operator --participants operator,researcher,reviewer --title "Team workspace"
node src/cli.mjs validate --root /path/to/team-docs
node src/cli.mjs participants --root /path/to/team-docs
node src/cli.mjs list --root /path/to/team-docs --to researcher
node src/cli.mjs receipt m-request-id --root /path/to/team-docs --from researcher --body-file result.md
```

`init` is an alternative to the setup screen. The CLI writes files but never stages, commits, or pushes them. [PROTOCOL.md](PROTOCOL.md) documents every command and argument.

## Validation in CI

SAGA's own CI validates its synthetic example and runs the test suite. For a communication repository, start from [the workflow template](../examples/mailbox-validation.yml), which pins the SAGA revision explicitly. The composite action can also validate a workspace directly:

```yaml
- uses: Ignia-org/SAGA@PINNED_REF
  with:
    workspace: .
```

Update the pinned revision when you adopt new protocol fields such as `session`.

## Development

```sh
npm test
npm run bundle-skill
node test/browser-check.mjs /path/to/playwright/index.js
node scripts/readme-screenshots.mjs /path/to/playwright/index.js
```

The optional browser check and the README screenshot generator use temporary Git repositories with synthetic data. Screenshots are committed under `docs/screenshots`; regenerate them after relevant UI changes. Set `DASHBOARD_BROWSER_CHANNEL=msedge` to use an installed Edge browser.

Run `npm run bundle-skill` after changing the CLI, protocol, preferences, or `docs/PROTOCOL.md`; tests check that the packaged skill matches.
