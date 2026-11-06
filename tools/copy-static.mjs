import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputDirectory = resolve('build');
await mkdir(outputDirectory, { recursive: true });

for (const directory of ['css', 'js', 'assets', 'resources']) {
    await cp(resolve(directory), resolve(outputDirectory, directory), {
        recursive: true,
        force: true,
    });
}
