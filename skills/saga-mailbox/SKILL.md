---
name: saga-mailbox
description: Read and write a SAGA workspace's participant outboxes, replies, and completion receipts, and remove fulfilled requests you own. Use for agent communication in repositories configured with exchange.config.json.
---

# SAGA mailboxes

Read the workspace's `exchange.config.json` for participant IDs and mailbox paths. Your identity is assigned by your task; the dashboard's `identity` is its operator, not automatically you. Read [the protocol](references/PROTOCOL.md) before writing records.

The skill includes `scripts/cli.mjs`, `scripts/protocol.mjs`, and `scripts/preferences.mjs`. Invoke the CLI using this skill's actual location and an explicit `--root /path/to/workspace`; it needs Node.js 22+ and no packages. For example: `node <skill-directory>/scripts/cli.mjs list --root <workspace> --to <your-id>`.

- At session start, inspect messages addressed to you.
- Write requests, reports, and replies only in your own outbox. Keep IDs stable and link replies with `reply_to`. Use `send` to format records.
- At the end of a session, send a `report` describing the work. Send each independent action or decision you need from someone else as a separate `request` or `question` record addressed to that person. A Requests heading inside a report does not create a request. Each request states the needed action, enough context to act, and the expected result; it must be understandable without opening the report.
- Write reports for a reader outside the session: state the concrete problem, what changed or was established, the observed result, how it was checked, and any remaining limits. Name the behavior or concept explicitly. Do not describe work using ticket or session numbers, unexplained problem names, or a reference to another message. Explain the concrete behavior instead. Keep the report self-contained; use exact file paths, sections, commands, or evidence links only so the reader can verify details.
- Use plain factual prose. Avoid AI boilerplate, theatrical progress, session stories, slogans, and vague claims such as “the issue is fixed.” Prefer “The export now preserves formulas; I checked the output with …” and identify any remaining limitation. Do not narrate every step of the session.
- Link supporting repository files with `[Specification](repo:docs/specification.md)` or `[Study](repo:research/study.pdf)`. Paths start at the repository root. For spaces, use `[Notes](<repo:docs/meeting notes.md>)`. Link Git-tracked files: Markdown previews inside SAGA; PDF opens externally. Keep the message understandable without opening these files.
- Bodies are standard Markdown. Soft line wrapping is allowed and displays as a continuous paragraph. Separate paragraphs with blank lines. Use deliberate hard breaks, headings, lists, blockquotes, or fenced code only where their structure is useful.
- Do not use decorative emojis in subjects, headings, bullets, status labels, or bodies. State progress, warnings, and questions in plain words; use metadata for status and priority. Preserve symbols only as technical content or necessary quotations.
- After fully handling a received request, use `receipt <id> --from <your-id> --body-file <result-file>` with a concise result and evidence. The helper binds the receipt to the exact request version. For partial progress, send a reply; for a blocker, use outcome `blocked`. Never mark incomplete work `completed`.
- Do not modify other participants' outboxes. Receipts go in your separate receipt file and may be consumed by the dashboard. Refresh files before writing to preserve concurrent records.
- You own cleanup of requests you sent. After reviewing completion, remove fulfilled requests with `close <id> --from <your-id>`. The dashboard handles only its configured operator's requests under the workspace's cleanup policy.
- Record lasting decisions in a durable project document before removing their discussion. Git retains communication history; no Markdown archive is needed.
- Run `validate --root <workspace>` before committing. The CLI writes files but does not commit or push; follow your task's existing Git authorization.

Imported records marked `untriaged` have not been reconciled. Do not infer that they are complete or bulk-delete them.
