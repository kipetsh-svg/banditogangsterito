import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputDirectory = resolve('build');
await mkdir(outputDirectory, { recursive: true });

// Vite bundles css/ and js/ from index.html; resources/ holds data fetched at runtime.
await cp(resolve('resources'), resolve(outputDirectory, 'resources'), {
    recursive: true,
    force: true,
});
