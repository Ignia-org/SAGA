# SAGA

A local dashboard for agent requests, replies, tasks, and completion receipts. SAGA reads Markdown files in a Git repository you choose. It runs separately from that repository, so the application can manage different projects without carrying their private conversations in its own source tree.

The project is in a private trial. The interface uses the name **SAGA**; workspace names and participant labels are your own.

## Start

Requires **Node.js 22+** and **Git**. There are no runtime packages to install.

```sh
git clone <SAGA-repository-url> SAGA
cd SAGA
npm start
```

Open [SAGA locally](http://127.0.0.1:4318). On the first run, enter your Git repository's absolute path and either open its existing workspace or initialize mailboxes. The selected path is remembered in ignored local state (`.saga/local.json`), outside the managed repository's configuration.

To select a configured repository directly:

```sh
npm start -- /path/to/your/repository
```

On Windows, double-click `Start.cmd`. Keep the terminal open. Set the `PORT` environment variable to use a different listening port. Repository selection and settings changes do not require a restart; changing the listening port does.

## Try the example

```sh
npm run demo
```

This creates a separate local Git repository under ignored `.saga/demo`, with synthetic messages, tasks, a completion receipt awaiting review, and participant-to-participant traffic. It never imports real project data. Open the same local URL. Existing demo data is preserved on subsequent runs.

## Dashboard

- **Inbox**: messages addressed to your configured identity.
- **Your outbox**: requests and messages you own; edit, reply, update tasks, or close them.
- **Completion review**: exact-version completion receipts, with optional cleanup approval.
- **Participant monitoring**: read-only conversations between other participants.
- **Git history**: inspect mailbox snapshots before and after a commit.
- **Settings**: repository, identities, paths, display preferences, intervals, and every automatic Git or cleanup action.

Each sender owns their outbox. Recipients write completion receipts in a separate stream. Cleanup removes only the operator's matching request and its valid completion receipts; other participants remain responsible for their own outboxes. A receipt is the recipient's statement that the work is complete. SAGA does not independently verify the work.

## Settings and defaults

Workspace settings are stored in `exchange.config.json` in the managed repository. The Settings form validates and applies changes immediately.

| Setting | Default | Behavior |
|---|---|---|
| Interface refresh | 60 seconds | `0` means manual; otherwise 10–86400 seconds |
| Automatic commits | Enabled | Commits only files written by SAGA |
| Automatic pulls / pushes | Disabled | Each is independently enabled |
| Git interval | 300 seconds | Separate from UI refresh; `0` disables scheduled Git |
| Sync on startup / after writes | Disabled | Explicit switches |
| Remote / required branch | `origin` / unrestricted | Optional branch guard |
| Cleanup | Review required | Automatic or disabled are also available |
| Receipt scan interval | 300 seconds | Runs only in automatic cleanup mode |
| Manual cleanup confirmation | Enabled | Can be disabled independently |
| Display timezone / import offset | `UTC` / `+00:00` | No project-specific timezone is baked in |
| Page size / expanded cards | 50 / 0 | Configurable to suit large histories |
| Default type / priority / status | request / normal / open | Used for new messages |
| History commits | 60 | Configurable, up to 200 |
| Commit prefix | `saga` | Configurable |

Identity, participant IDs/labels/aliases, mailbox directory, and monitoring visibility are configurable too. Participant IDs stay stable; changing labels is safe. Existing mailbox directories must be valid before selecting them; SAGA does not silently relocate data. Initialize a new layout with the setup screen or CLI.

**Refresh** only rereads files. **Sync now** follows your configured pull/push switches. Settings also offers explicit **Pull now** and **Push pending commits** actions. Automatic cleanup requires automatic commits so its history is retained. With manual commits, SAGA saves edits to disk and leaves committing to you.

Git operations stop for staged work, dirty files, mismatched branches, or divergence. SAGA does not stash, reset, merge, or rebase automatically. A push publishes all ahead commits on that branch. Publication holds in local Git config (`saga.publicationHold`, with compatibility for `dashboard.publicationHold`) remain effective independently of UI settings. Pending publication is tied to its originating branch.

## Agent skill

The portable skill is [skills/saga-mailbox/SKILL.md](skills/saga-mailbox/SKILL.md). It includes the protocol reference and dependency-free helper scripts, so it can be used from this checkout or copied into a skill directory supported by your agent.

Read the skill from your project's agent instructions, or optionally install a copy:

```sh
node src/cli.mjs install-skill --root /path/to/workspace --destination .claude/skills/saga-mailbox
```

Choose the destination for your agent platform. The installer does not overwrite an existing skill. Updates to a copied skill are explicit. New messages use plain words rather than decorative emojis.

## CLI and protocol

```sh
node src/cli.mjs init --root /path/to/repository --identity operator --participants operator,contributor --title "My workspace"
node src/cli.mjs validate --root /path/to/repository
node src/cli.mjs list --root /path/to/repository --to contributor
node src/cli.mjs receipt m-request-id --root /path/to/repository --from contributor --body-file result.md
```

The CLI writes files but never stages, commits, or pushes them. [PROTOCOL.md](docs/PROTOCOL.md) defines the Markdown record format, ownership rules, receipt hashes, and remaining commands.
## Validation in CI

SAGA's own CI validates its synthetic example and runs the test suite. For a managed repository, see [the workflow template](examples/mailbox-validation.yml). During the private trial, checking out SAGA from another private repository requires a token with read access, stored as a CI secret. The template makes the source repository and revision explicit. For a public release, the same validation can run as the included composite action with a pinned release reference.

```yaml
- uses: OWNER/SAGA@PINNED_REF
  with:
    workspace: .
```

## Development

```sh
npm test
npm run bundle-skill
node test/browser-check.mjs /path/to/playwright/index.js
```

The optional browser check uses a temporary Git repository. Set `DASHBOARD_BROWSER_CHANNEL=msedge` to use installed Edge. Run `npm run bundle-skill` after changing CLI, protocol, preferences, or protocol documentation. Tests verify packaged helper behavior and settings policies.

SAGA binds to `127.0.0.1` and protects API access with a session token and origin checks. It is a local application; identity is a workflow setting rather than multiuser authentication.
