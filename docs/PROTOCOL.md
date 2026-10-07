# Exchange protocol v1

Participant IDs, labels, aliases, dashboard identity, directory paths, and cleanup policy are defined in the repository's `exchange.config.json`. No participant has a special hardcoded role. IDs are lowercase slugs; `from` and `to` must be configured IDs.

## Ownership and files

Under `mailboxDirectory`, each participant writes only:

- `outboxes/<own-id>.md`: requests, questions, decisions, reports, and replies sent to any other participant.
- `receipts/<own-id>.md`: completion statements for messages received from others. This is the separate completion inbox stream when viewed by recipients.

At session start, read `outboxes/*.md` and filter records where `to` is your ID. Read completion receipts where `to` is your ID too. Legacy channels remain readable at `legacyDirectory`, but write new messages using this protocol.

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

IDs must be globally unique lowercase slugs of up to 64 characters. Keep the ID stable when editing a message. `kind`: `request`, `question`, `decision`, `report`, `reply`, `receipt`. `status`: `untriaged`, `open`, `in_progress`, `waiting`, `blocked`, `done`. `priority`: `low`, `normal`, `high`, `urgent`. `created`: ISO timestamp including timezone. `title`: one line, at most 200 characters. `reply_to`: incoming message ID or null. Do not add unknown metadata fields or use the record delimiters in message bodies.

Use plain words rather than decorative emojis in new subjects, headings, bullets, and bodies. Imported historical text is retained verbatim, including its original notation. Imported sessions have status `untriaged`; no completion, priority, reply linkage, or receipt is inferred. Their original source heading is retained in the body when the display title must be shortened. Dates without times use midnight with the configured `importOffset`; this is a sorting convention, not a recovered sending time.

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
node src/cli.mjs send --from researcher --to coordinator --kind reply --reply-to m-example-001 --title "Export result" --body-file result.md --root /path/to/workspace
node src/cli.mjs receipt m-example-001 --from researcher --outcome completed --body-file result.md --root /path/to/workspace
node src/cli.mjs close m-owned-request --from researcher --root /path/to/workspace
```

The CLI checks the format and writes files. It does **not** stage, commit, or push. Commit your own mailbox changes using your normal agent workflow, then publish them so the dashboard can pull them. `list` outputs IDs, hashes, bodies, and paths as JSON. `validate` exits nonzero for malformed records, duplicate IDs, unknown participants, incorrect ownership, unexpected files, unsafe paths, or invalid configuration. Stale/dangling receipts and replies are permitted because their original messages may have been edited or cleaned already. Legacy free-form Markdown is excluded from strict validation.

From the separate SAGA checkout, initialize arbitrary participant identities in a workspace repository:

```sh
node src/cli.mjs init --root /path/to/repository --identity coordinator --participants coordinator,researcher --title "Research workspace"
node src/server.mjs /path/to/repository
```

Commit the generated config and mailboxes before starting. Initialization never overwrites an existing configuration.
