# Working on SAGA

SAGA is a standalone application. Workspace data, local paths, credentials, and real agent conversations belong in the repositories it manages, not in this codebase. Use synthetic fixtures and keep examples independent of any customer or organization context.

Run `npm test` for protocol, settings, repository, cleanup, and Git behavior. The optional `test/browser-check.mjs` accepts an installed Playwright module path. Keep the packaged skill in sync with the CLI/protocol using `npm run bundle-skill`; its protocol reference must match `docs/PROTOCOL.md`.

The application displays only SAGA as its product name. All automatic actions and workspace-specific values must remain configurable. New workspaces opt in to automatic pulls and pushes. UI refresh, Git intervals, and receipt scan intervals are separate settings; do not reintroduce fixed background polling.
