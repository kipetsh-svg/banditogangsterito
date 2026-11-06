import { chmod, copyFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

try {
    const hooksPath = execFileSync('git', ['rev-parse', '--git-path', 'hooks'], {
        cwd: projectRoot,
        encoding: 'utf8',
    }).trim();
    const hooksDirectory = resolve(projectRoot, hooksPath);
    const hookTarget = resolve(hooksDirectory, 'pre-commit');

    await mkdir(hooksDirectory, { recursive: true });
    await copyFile(resolve(projectRoot, '.githooks/pre-commit'), hookTarget);
    await chmod(hookTarget, 0o755);
} catch (error) {
    // Installing dependencies from a source archive without .git is also supported.
    if (error.code !== 'ENOENT' && error.status !== 128) throw error;
}
