# Exchange protocol v1

Participant IDs, labels, aliases, dashboard identity, directory paths, and cleanup policy are defined in the repository's `exchange.config.json`. No participant has a special hardcoded role. IDs are lowercase slugs; `from` and `to` must be configured IDs.

## Ownership and files

Under `mailboxDirectory`, each participant writes only:

- `outboxes/<own-id>.md`: requests, questions, decisions, reports, and replies sent to any other participant.
- `receipts/<own-id>.md`: completion statements for messages received from others. This is the separate completion inbox stream when viewed by recipients.

At session start, read `outboxes/*.md` and filter records where `to` is your ID. Read completion receipts where `to` is your ID too.

An outbox owner removes fulfilled requests from its own file. Never edit or remove someone else's outbox message. The dashboard is configured to act as its `identity`; it may remove that identity's requests and consume corresponding completion receipts from the dedicated receipt files. Ordinary replies/reports in another participant's outbox remain that participant's responsibility. Do not put strategic decisions solely in a transient mailbox: record lasting decisions in the relevant specification before cleanup.

## Record format

Files have one optional H1 header and zero or more delimited records. Metadata is JSON, not YAML, so the validator needs no dependencies. Markdown body headings do not start new records.

````markdown
# Outbox: coordinator

<!-- exchange:v1 -->
## m-example-001
```json
{
  "schema": 1,
  "id": "m-example-001",
  "from": "coordinator",
  "to": "researcher",
  "kind": "request",
  "status": "open",
  "priority": "normal",
  "created": "2026-10-07T13:00:00Z",
  "title": "Review export behavior",
  "reply_to": null
}
```

- [ ] Verify the exported formulas.
- [ ] Report the result and any remaining limitations.
<!-- /exchange -->
````

IDs must be globally unique lowercase slugs of up to 64 characters. Keep the ID stable when editing a message. `kind`: `request`, `question`, `decision`, `report`, `reply`, `receipt`. `status`: `untriaged`, `open`, `in_progress`, `waiting`, `blocked`, `done`. `priority`: `low`, `normal`, `high`, `urgent`. `created`: ISO timestamp including timezone. `title`: one line, at most 200 characters. `reply_to`: incoming message ID or null. Optional `session`: a sender-scoped positive integer string with an optional lowercase letter suffix, up to 64 characters, without leading zeros (for example `"190"`, `"190a"`, or `"190aa"`). Omit it when no reference was assigned; old records need no migration. It is displayed separately from the title and included in the record hash. Do not add unknown metadata fields or use the record delimiters in message bodies.

Use plain words rather than decorative emojis in new subjects, headings, bullets, and bodies.

## Reports and actionable requests

At session end, use a `report` record for completed work and findings. Use separate `request` or `question` records for actions or decisions needed from a recipient. One independent action per request allows its checklist, status, completion receipt, and cleanup to work independently. A heading inside a report does not create another record. The dashboard Requests view contains requests and questions sent by or addressed to the operator.

Reports must be understandable to a reader who did not follow the session. Explain the concrete problem, the change or finding, the observed result, the verification performed, and remaining limits. Do not use ticket/session numbers instead of explaining the work. Keep session references in metadata. Avoid unexplained shorthand, vague problem labels, and chronological session narratives. Put exact file paths, document sections, verification commands, or evidence links beside the claims they let a reader check. References supplement the explanation; they must not be required to understand it.

Each request is independently understandable: state the action or decision, the context necessary to act, and the expected result. Do not require the recipient to reconstruct its meaning from a report or another message.

Titles name the concrete subject and result, limitation, or requested action so the reader can decide whether to open the message. Use sentence case without announcements, hype, decorative emphasis, or session bookkeeping. Write neutral factual prose, separate observations from proposals, and qualify completion claims by what was actually checked. The mailbox skill defines the shared writing guidance.

## Sessions and continuations

A new independent scheduled session uses its assigned main number (`190`). After completion, a follow-up discussion or implementation uses the next unused sub-session under that numeric base: `190a`, `190b`, etc. Suffixes proceed `a` through `z`, then `aa`, `ab`. Reopening completed `190a` gives `190b`, not `190aa`. The next independent scheduled session uses the next assigned main number (`191`).

Messages in one active run may share its reference. References are scoped to the sender, so different agents can both have session `190`. Each message has its own globally unique ID. Add a new report for a continuation rather than rewriting the original. Correcting a typo does not require a sub-session.

The scheduler or agent's durable state supplies numbering. Keep allocation state outside transient mailboxes so cleanup cannot reset it. Do not infer numbering from remaining reports or commit counts. Omit the field if numbering is not configured. Validation checks canonical syntax, not historical continuity: cleaned messages cannot establish it. The dashboard displays full references and orders messages by `created` without converting them to numbers or sorting them lexically.

## Markdown display

Bodies use GitHub-flavored Markdown with standard paragraph behavior: a single source newline is a soft break; an empty line separates paragraphs. Two trailing spaces or a backslash produce an explicit hard break. Lists, headings, tables, quotations, inline code, and fenced code retain their structure. Raw HTML is displayed as text. Images are represented by their alternative text; executable links are removed. Editable checklists continue to refer to their original source lines.

## Completion receipts and cleanup

Receipts use the same record structure, plus `request_id`, `request_sha256`, and `outcome` (`completed`, `blocked`, or `rejected`). `completed` uses status `done`; the other outcomes use status `blocked`. The receipt sender must be the original message recipient, and the receipt recipient must be the original message sender.

`request_sha256` is computed from sorted metadata keys and the trimmed Markdown body with LF line endings. Formatting JSON or Git's CRLF conversion does not change the hash. Editing metadata, body, or a checklist does. Use the CLI rather than calculating hashes by hand.

A completed receipt certifies that **the whole request**, including its checklist, was handled. Include a concise result, evidence, and remaining limitations in the receipt body. Do not mark partially completed work as completed; send a `reply` for progress or a blocked receipt for a blocker. You never need to tick another participant's request checkboxes. The dashboard operator can dismiss a receipt addressed to them without deleting its original request, including stale or obsolete receipts.

For the dashboard identity, cleanup can require approval (default), run automatically, or be disabled. Cleanup removes the matching request and its valid completion receipts in one commit. Old-version receipts, wrong participants, blocked/rejected receipts, and absent requests are visible for review but cannot trigger deletion. Agents continue to clean their own outboxes. Receipt files are transient; the dashboard may rewrite them when consuming receipts, so refresh the file immediately before writing.

## CLI

Run these commands from the SAGA checkout and provide the workspace root explicitly. An installed skill also provides scripts/cli.mjs inside its own directory. Body files below are your own temporary Markdown files; they are not protocol mailboxes.

```sh
node src/cli.mjs validate --root /path/to/workspace
node src/cli.mjs list --to researcher --root /path/to/workspace
node src/cli.mjs send --from researcher --to coordinator --kind report --session 42 --title "CSV export preserves formulas; date formatting remains unchanged" --body-file report.md --root /path/to/workspace
node src/cli.mjs send --from researcher --to coordinator --kind request --title "Review the exported formulas" --body-file request.md --root /path/to/workspace
node src/cli.mjs send --from researcher --to coordinator --kind reply --reply-to m-example-001 --title "Export result" --body-file result.md --root /path/to/workspace
node src/cli.mjs receipt m-example-001 --from researcher --outcome completed --body-file result.md --root /path/to/workspace
node src/cli.mjs close m-owned-request --from researcher --root /path/to/workspace
```

The CLI checks the format and writes files. It does **not** stage, commit, or push. Commit your own mailbox changes using your normal agent workflow, then publish them so the dashboard can pull them. `list` outputs IDs, hashes, bodies, and paths as JSON. `validate` exits nonzero for malformed records, duplicate IDs, unknown participants, incorrect ownership, unexpected files, unsafe paths, or invalid configuration. Stale/dangling receipts and replies are permitted because their original messages may have been edited or cleaned already.

From the separate SAGA checkout, initialize arbitrary participant identities in a workspace repository:

```sh
node src/cli.mjs init --root /path/to/repository --identity coordinator --participants coordinator,researcher --title "Research workspace"
node src/server.mjs /path/to/repository
```

Commit the generated config and mailboxes before starting. Initialization never overwrites an existing configuration.

### Referencing repository files

Use Markdown links in message bodies:

```md
[Specification](repo:docs/specification.md)
[Study](repo:research/study.pdf)
[Notes](<repo:docs/meeting notes.md>)
```

Paths in messages start at the selected repository root; the explicit `repo:` prefix is optional. Markdown opens in a read-only dashboard preview. Links inside that preview resolve relative to the document directory unless prefixed with `repo:` or `/`. PDF opens in a new browser tab, where the reader can download it or open their preferred PDF application. Ordinary HTTPS links open externally.

Only Git-tracked Markdown and PDF files inside the selected repository can be viewed; symbolic links are rejected. The preview reads the current working copy on the selected branch, including uncommitted changes. Limits are 2 MiB for Markdown and 25 MiB for PDF. Viewing a file does not commit or synchronize it. File references supplement a self-contained report rather than replacing its explanation.

## Participant directory and routing

Each participant has a stable `id` and display `label`. Optional `role` describes responsibilities in one or two sentences (maximum 1000 characters). Optional `reportTo` names another configured participant for routine session reports. These fields are editable in Settings; omissions are allowed without assigning implicit roles.

~~~json
{
  "id": "reviewer",
  "label": "Reviewer",
  "role": "Reviews changes for correctness and identifies defects. Owns requests for independent verification.",
  "reportTo": "coordinator"
}
~~~

Keep the roster and coordination responsibilities in `exchange.config.json`. Detailed task scope and inbox priorities belong in each agent's own instructions; those instructions take precedence over directory routing defaults. Use `participants --root /path/to/workspace` (optionally `--id reviewer`) to retrieve the current directory as JSON without parsing mailbox bodies. Run the helper from the SAGA checkout or the installed skill's `scripts/cli.mjs`. Synchronizing Git is separate and follows the agent's existing policy.

Route relevant requests, blockers, dependencies, and findings to their declared owners, rather than notifying everyone. The task's explicit reporting destination wins; otherwise use that participant's `reportTo`. Ambiguous ownership or a missing reporting contact needs clarification. Receipt and reply destinations remain determined by the original conversation. Updating the directory changes the routing guidance for all agents after they synchronize, without rewriting every prompt. It does not guarantee that every relevant message will be sent or grant additional execution authority. Participant removal still requires reconciling existing mailbox files and references, including `reportTo`.
