# SAGA

A local dashboard for agent requests, replies, tasks, and completion receipts. SAGA reads Markdown files in a Git repository you choose. It runs separately from that repository, so the application can manage different projects without carrying their private conversations in its own source tree.

The project is in an early trial. The interface uses the name **SAGA**; workspace names and participant labels are your own.

## Start

Requires **Node.js 22+** and **Git**. There are no runtime packages to install.

```sh
git clone https://github.com/Ignia-org/SAGA.git SAGA
cd SAGA
npm start
```

Open [SAGA locally](http://127.0.0.1:4318). On the first run, enter your Git repository's absolute path and either open its existing workspace or initialize mailboxes. The selected path is remembered in ignored local state (`.saga/local.json`), outside the managed repository's configuration.

To select a configured repository directly:

```sh
npm start -- /path/to/your/repository
```

On Windows, double-click `Start.cmd`. Keep the terminal open. Set the `PORT` environment variable to use a different listening port. Repository selection and settings changes do not require a restart; changing the listening port does.

## Getting started

Give each agent a stable participant ID and a role with a bounded responsibility, such as researcher or reviewer. Keep its role instructions and current priorities in a dedicated Git repository for communication and internal documentation. Each scheduled run reads those documents and its incoming messages, does useful work within its role, then publishes a factual report and separate requests. SAGA is your dashboard over that repository; the agent platform runs and schedules the agents.

### Prepare the shared repository

Create and clone your own communication repository, separate from the SAGA checkout and any application source repository. Initialize it from SAGA:

~~~sh
node src/cli.mjs init --root /path/to/team-docs --identity operator --participants operator,researcher,reviewer --title "Team workspace"
~~~

Add short role documents such as `roles/researcher.md` and a priorities document, then commit and push the configuration, mailboxes, and documents. Open this repository in SAGA. Choose your refresh and Git intervals in Settings; enable automatic pull and push if you want messages synchronized without manual publication.

Install the portable skill in the communication repository for your platform, using the commands below. Commit that copy so agent environments receive the helpers and protocol without needing access to SAGA itself. A copied skill is updated explicitly, not automatically.

### ChatGPT / Codex

Use a local project in the ChatGPT desktop app's Work/Codex environment with access to the communication checkout, Node.js 22+, Git, and the repositories required by the role. Install the repository skill from SAGA:

~~~sh
node src/cli.mjs install-skill --root /path/to/team-docs --destination .agents/skills/saga-mailbox
~~~

Codex discovers repository skills under `.agents/skills`. Add one short instruction in `AGENTS.md` to use `saga-mailbox` for exchanges. Start one chat per role and test the prompt below. [OpenAI skill setup](https://learn.chatgpt.com/docs/build-skills).

Ask the app to schedule that role's prompt at your chosen cadence, or configure it in Scheduled. Select the local project and give it the required repository access. Local runs need the computer awake and the app running. Web-only scheduled chats cannot directly edit your local checkout; use a configured execution environment for this file-based workflow. [OpenAI scheduled tasks](https://learn.chatgpt.com/docs/automations?surface=app).

### Claude

Use Claude Code in Desktop's Code tab or its CLI, with the communication repository as the working folder and any role-specific repositories available. Install the same skill in Claude's project directory:

~~~sh
node src/cli.mjs install-skill --root /path/to/team-docs --destination .claude/skills/saga-mailbox
~~~

Add one instruction in `CLAUDE.md` to use `saga-mailbox` for exchanges. Start a role session and test the prompt below. Claude Code loads project skills from `.claude/skills`. [Claude skill setup](https://code.claude.com/docs/en/skills).

In Desktop's Code tab, create a local scheduled task in Routines with that prompt, working folder, and cadence. Test Run now and configure the file, command, and Git permissions needed for unattended runs. The computer must be awake and the app open. For short-lived CLI polling, `/loop 1h <role prompt>` repeats work while the session is running. [Claude Desktop scheduling](https://code.claude.com/docs/en/desktop-scheduled-tasks), [CLI scheduling](https://code.claude.com/docs/en/scheduled-tasks).

### Minimal role prompt

~~~text
You are researcher. Read roles/researcher.md and priorities.md in /path/to/team-docs.
Use saga-mailbox for communication as researcher; report to operator.
Handle incoming work and continue the role's priorities. Follow the role's scope and Git policy.
~~~

Use the same prompt in either platform; load the installed skill by name or give its `SKILL.md` path if it is not discovered. Specify commit/push authorization and the target branch in the role document once, rather than repeating the mailbox protocol in every prompt. Session references are optional; supply one when your scheduler already assigns it.

Each agent should use its own checkout of the communication repository. Start with one shared communication branch and stagger scheduled runs. Pull before reading, validate before committing, and publish only your own changes under the role's Git policy. Stop and report dirty-checkout or divergence problems instead of resetting another participant's work. Worktrees and cloud clones need an explicit publication path: SAGA displays files in its selected checkout, not every isolated run's working copy. Review the first few runs before increasing frequency.

## Try the example

```sh
npm run demo
```

This creates a separate local Git repository under ignored `.saga/demo`, with synthetic messages, tasks, a completion receipt awaiting review, and participant-to-participant traffic. It never imports real project data. Open the same local URL. Existing demo data is preserved on subsequent runs.

## Dashboard

- **Inbox**: messages addressed to your configured identity.
- **Your outbox**: requests and messages you own; edit, reply, update tasks, or close them.
- **Requests**: actionable request/question records, separate from reports.
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
| Git interval | 5 minutes | Pulls the active branch; `0` disables scheduled Git |
| Branch discovery | Enabled | Discovers local and remote Git branches without a list |
| Automatic branch fetch | Disabled | Independently refreshes all remote branches |
| Branch fetch interval | 5 minutes | Configurable from 1 to 1440 minutes |
| Sync on startup / after writes | Disabled | Explicit switches |
| Remote / required branch | `origin` / unrestricted | Optional branch guard |
| Cleanup | Review required | Automatic or disabled are also available |
| Receipt scan interval | 300 seconds | Runs only in automatic cleanup mode |
| Manual cleanup confirmation | Enabled | Can be disabled independently |
| Display timezone | `UTC` | No project-specific timezone is baked in |
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
The header shows uncommitted file counts and commits ahead/behind the locally known remote branch. Refresh does not fetch Git; remote counts update when Git synchronizes. **Push now** publishes the current branch even for commits created outside SAGA. **Auto push** enables commits and synchronization after writes; an existing publication pause can be released by confirming automatic push or an explicit push.

## Reading and writing

Message bodies use standard Markdown paragraphs: soft line wrapping is ignored visually, while explicit hard breaks and blank lines are retained. The locally bundled Marked and DOMPurify versions and licenses are under `src/vendor`; no runtime installation is needed. Raw HTML stays visible as text.

Inbox cards show the sender; outbox cards show the recipient. Participant monitoring keeps both sides. Add several participant or status filters to combine them: alternatives within each category, and both categories must match. Remove individual filter chips or choose Clear filters.

The composer stays alongside your inbox. Use the expand-window icon to detach it, drag its heading to move it, and resize its bottom corner on desktop. Use the dock-panel icon to restore the side panel. While it floats, the message list takes the full available width. Drafts are stored separately for each repository, branch, and operator. A copy of the last attempted send stays in browser storage even after success.

The compact branch indicator beside the active branch opens a popover listing incoming messages present or changed on other local and fetched remote branches. Fetch and check branches refreshes remote references. Enable automatic branch fetch and choose its interval in Settings. No branch names need to be configured; discovery can also be disabled. Differences are comparisons with the current inbox, not a read/unread receipt. Switch requires committed files, publication of pending dashboard commits, and compatible branch restrictions. A remote branch with a differing local counterpart must be synchronized explicitly first.

## Validation in CI

SAGA's own CI validates its synthetic example and runs the test suite. For a managed repository, see [the workflow template](examples/mailbox-validation.yml). SAGA is public, so the workflow can check out its pinned revision using the normal checkout token. The template makes the source repository and revision explicit. The included composite action can also validate your workspace directly. Update the pinned validator when adopting new protocol fields such as `session`.

```yaml
- uses: Ignia-org/SAGA@PINNED_REF
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

### Referencing repository files

Use Markdown links in message bodies:

```md
[Specification](repo:docs/specification.md)
[Study](repo:research/study.pdf)
[Notes](<repo:docs/meeting notes.md>)
```

Paths in messages start at the selected repository root; the explicit `repo:` prefix is optional. Markdown opens in a read-only dashboard preview. Links inside that preview resolve relative to the document directory unless prefixed with `repo:` or `/`. PDF opens in a new browser tab, where the reader can download it or open their preferred PDF application. Ordinary HTTPS links open externally.

Only Git-tracked Markdown and PDF files inside the selected repository can be viewed; symbolic links are rejected. The preview reads the current working copy on the selected branch, including uncommitted changes. Limits are 2 MiB for Markdown and 25 MiB for PDF. Viewing a file does not commit or synchronize it. File references supplement a self-contained report rather than replacing its explanation.
