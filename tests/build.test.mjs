import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const buildDirectory = resolve(projectRoot, 'build');

function localReferences(html) {
    return [...html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)]
        .map((match) => match[1])
        .filter((value) => value && !/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value))
        .map((value) => decodeURIComponent(value.split(/[?#]/, 1)[0]).replace(/^\.\//, ''));
}

test('production build contains index.html and every referenced local asset', () => {
    const indexPath = resolve(buildDirectory, 'index.html');
    assert.ok(existsSync(indexPath), 'Vite did not produce build/index.html');

    const html = readFileSync(indexPath, 'utf8');
    assert.match(html, /<title>Bandito — карточная игра<\/title>/);

    for (const reference of localReferences(html)) {
        assert.ok(existsSync(resolve(buildDirectory, reference)), `Build output is missing: ${reference}`);
    }
});

test('runtime scripts and dynamically loaded card data are present in the build', () => {
    for (const file of [
        'js/settings.js',
        'js/snackbar.js',
        'js/game.js',
        'js/multiplayer.js',
        'resources/bandido-matrices/cards.json',
    ]) {
        assert.ok(existsSync(resolve(buildDirectory, file)), `Missing runtime file in build: ${file}`);
    }
});
