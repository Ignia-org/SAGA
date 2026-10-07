import { mkdir, copyFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
for (const folder of ['skills/saga-mailbox/scripts/', 'skills/saga-mailbox/references/']) await mkdir(new URL(folder, root), { recursive: true });
for (const file of ['cli.mjs','protocol.mjs','preferences.mjs']) await copyFile(new URL('src/'+file,root),new URL('skills/saga-mailbox/scripts/'+file,root));
await copyFile(new URL('docs/PROTOCOL.md',root),new URL('skills/saga-mailbox/references/PROTOCOL.md',root));
console.log('Portable SAGA skill bundled.');
