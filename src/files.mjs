import { lstat, realpath, readFile } from 'node:fs/promises';
import path from 'node:path';

export async function readRepositoryFile(root, relative, git) {
  if (typeof relative !== 'string' || !relative || relative.length > 2048 || /[\\<>:"|?*\x00-\x1f]/.test(relative) || relative.startsWith('/') || relative.split('/').some(p => !p || p === '.' || p === '..' || p.toLowerCase() === '.git')) throw new Error('Invalid repository file path.');
  const extension = path.extname(relative).toLowerCase();
  if (!['.md', '.markdown', '.pdf'].includes(extension)) throw new Error('Only Markdown and PDF files can be viewed.');
  await git('ls-files', '--error-unmatch', '--', ':(literal)' + relative).catch(() => { throw new Error('File is not tracked in this repository.'); });
  let filename = root;
  for (const segment of relative.split('/')) {
    filename = path.join(filename, segment);
    if ((await lstat(filename)).isSymbolicLink()) throw new Error('Symbolic links cannot be previewed.');
  }
  const resolved = await realpath(filename), inside = path.relative(root, resolved);
  if (inside.startsWith('..' + path.sep) || inside === '..' || path.isAbsolute(inside)) throw new Error('File is outside this repository.');
  const stat = await lstat(resolved), limit = extension === '.pdf' ? 25 * 1024 * 1024 : 2 * 1024 * 1024;
  if (!stat.isFile() || stat.size > limit) throw new Error('File is not a regular file or exceeds the preview size limit.');
  const buffer = await readFile(resolved);
  if (buffer.length > limit) throw new Error('File exceeds the preview size limit.');
  return { path: relative, type: extension === '.pdf' ? 'pdf' : 'markdown', buffer };
}
