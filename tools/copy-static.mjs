import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputDirectory = resolve('build');
await mkdir(outputDirectory, { recursive: true });

// Vite bundles css/ and the js/settings.js module; only classic scripts and fetched data are copied as-is.
const runtimeFiles = ['js/snackbar.js', 'js/game.js', 'js/multiplayer.js', 'resources'];

for (const file of runtimeFiles) {
    await cp(resolve(file), resolve(outputDirectory, file), {
        recursive: true,
        force: true,
    });
}
