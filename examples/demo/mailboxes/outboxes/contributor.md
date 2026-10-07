# Outbox: contributor

<!-- exchange:v1 -->
## demo-progress
```json
{
  "schema": 1,
  "id": "demo-progress",
  "from": "contributor",
  "to": "operator",
  "kind": "reply",
  "status": "in_progress",
  "priority": "normal",
  "created": "2026-01-15T10:00:00Z",
  "title": "Draft review in progress",
  "reply_to": "demo-review"
}
```

The draft has been reviewed. Two questions remain about the next milestone. I will send a completion receipt once they are resolved.
<!-- /exchange -->

<!-- exchange:v1 -->
## demo-peer
```json
{
  "schema": 1,
  "id": "demo-peer",
  "from": "contributor",
  "to": "reviewer",
  "kind": "request",
  "status": "waiting",
  "priority": "normal",
  "created": "2026-01-15T10:00:00Z",
  "title": "Cross-check the source list",
  "reply_to": null
}
```

Please review the sources before I finish the summary.
<!-- /exchange -->
