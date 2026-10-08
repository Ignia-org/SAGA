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
- Link supporting repository files with `[Specification](repo:docs/specification.md)` or `[Study](repo:research/study.pdf)`. Paths start at the repository root. For spaces, use `[Notes](<repo:docs/meeting notes.md>)`. Link Git-tracked files: Markdown previews inside SAGA; PDF opens externally. Keep the message understandable without opening these files.
- Bodies are standard Markdown. Soft line wrapping is allowed and displays as a continuous paragraph. Separate paragraphs with blank lines. Use deliberate hard breaks, headings, lists, blockquotes, or fenced code only where their structure is useful.
- Do not use decorative emojis in subjects, headings, bullets, status labels, or bodies. State progress, warnings, and questions in plain words; use metadata for status and priority. Preserve symbols only as technical content or necessary quotations.
- After fully handling a received request, use `receipt <id> --from <your-id> --body-file <result-file>` with a concise result and evidence. The helper binds the receipt to the exact request version. For partial progress, send a reply; for a blocker, use outcome `blocked`. Never mark incomplete work `completed`.
- Do not modify other participants' outboxes. Receipts go in your separate receipt file and may be consumed by the dashboard. Refresh files before writing to preserve concurrent records.
- You own cleanup of requests you sent. After reviewing completion, remove fulfilled requests with `close <id> --from <your-id>`. The dashboard handles only its configured operator's requests under the workspace's cleanup policy.
- Record lasting decisions in a durable project document before removing their discussion. Git retains communication history; no Markdown archive is needed.
- Run `validate --root <workspace>` before committing. The CLI writes files but does not commit or push; follow your task's existing Git authorization.

## Titles and report writing

Apply this voice to titles, reports, requests, replies, and receipts. Use the agent's role-specific writing guidance when available; keep the shared rules below self-contained so no other skill is required.

- Write as a colleague handing over checked work: direct, neutral, concrete. Start with the outcome or finding. Describe changes when that helps explain the result; omit the chronological story of the session.
- No announcements, hype, applause, rhetorical suspense, or self-congratulation. Avoid stock openings such as “Great news”, “Mission accomplished”, “I am pleased to report”, “A major milestone”, and “Here's the exciting part”. No AI filler such as “seamless”, “robust”, “game-changing”, or “delve”. Do not replace useful detail with a slogan, dramatic contrast, or “not X, but Y” framing.
- Make the title identify the concrete subject and result, limitation, or requested action. A reader must be able to decide whether to expand the card from its title alone. Use sentence case and plain words. Do not put dates, session numbers, ticket IDs, emojis, all-caps announcements, Markdown emphasis, or a generic “Session report” in the title. The title describes the message, not its bookkeeping.
- Prefer “CSV export preserves formulas; date cells still lose formatting” over “Session 42: export milestone complete”. For requests, prefer “Choose whether exports should preserve date formatting” over “Decision needed”. Do not claim the whole feature is fixed when only one behavior was checked.
- The opening paragraph states what changed or was established and why it matters in concrete terms. Explain enough for a reader outside the session: the problem, the change or finding, the observed result, the checks performed, and remaining limits. Describe what was actually implemented, observed, proposed, or left unfinished; distinguish those states explicitly. Name the behavior instead of relying on a ticket, previous report, internal nickname, or unexplained acronym.
- Keep reports proportionate. A short report can use two or three paragraphs. For longer reports, use descriptive subheadings or Outcome, Verification, and Limits when useful. Omit empty sections, duplicated subject headings, routine step-by-step narration, and repeated summaries. Use bold only for a fact that needs attention, not entire paragraphs. Reserve checklists for real actions, not a decorative list of completed work.
- Put exact file links, document sections, commands, or source names beside the claims they verify. State the actual check and its result; say when a check could not run. Attribute external findings where used. Links supplement the explanation, so a reader can understand the report before opening them.
- Send every action or decision needed from a recipient as a separate request or question. The report may note the dependency, but the recipient must be able to act on the separate request without reconstructing the session.
- Keep session references in optional `session` metadata, using `--session`. A new independent scheduled session uses its assigned main number, for example `190`. Resuming a completed session for discussion or implementation creates a sub-session: `190a`, then `190b`, through `190z`, `190aa`, `190ab`. Keep the original numeric base. The next independent scheduled session uses the next assigned main number, not a suffix.
- Keep the same reference for all reports and requests during one active run. After its completion, a later continuation gets the next unused suffix under the original base. Reopening completed `190a` gives `190b`, not `190aa`. Add a new report with its own message ID; do not relabel or overwrite the earlier report. Correcting a typo does not create a sub-session.
- Numbering is scoped to the sender. Use the scheduler/task's reference or the agent's chosen durable state file. Persist the last main number and used suffixes outside transient mailboxes so cleanup cannot reset them. Do not infer counters from commit counts, chat length, or remaining messages, or allocate references concurrently for one agent. If no reliable numbering source is configured, omit `session`.
- Use canonical references such as `190` or `190a`: no leading zeros, uppercase suffixes, separators, or decimal numbers. The dashboard preserves the full reference and orders messages chronologically, without converting `190a` into a number. Titles still explain the work independently of numbering.

Imported records marked `untriaged` have not been reconciled. Do not infer that they are complete or bulk-delete them.
