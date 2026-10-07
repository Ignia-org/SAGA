# Outbox: operator

<!-- exchange:v1 -->
## demo-review
```json
{
  "schema": 1,
  "id": "demo-review",
  "from": "operator",
  "to": "contributor",
  "kind": "request",
  "status": "open",
  "priority": "normal",
  "created": "2026-01-15T10:00:00Z",
  "title": "Review the project draft",
  "reply_to": null
}
```

- [ ] Review the draft
- [ ] Summarize remaining questions

Keep the result concise and link any evidence.
<!-- /exchange -->

<!-- exchange:v1 -->
## demo-delivery
```json
{
  "schema": 1,
  "id": "demo-delivery",
  "from": "operator",
  "to": "reviewer",
  "kind": "request",
  "status": "open",
  "priority": "normal",
  "created": "2026-01-15T10:00:00Z",
  "title": "Verify the delivery checklist",
  "reply_to": null
}
```

- [ ] Verify the files are readable
- [ ] Check that the instructions are complete
<!-- /exchange -->
