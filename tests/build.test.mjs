import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const buildDirectory = resolve(projectRoot, 'build');
const sourceImagesDirectory = resolve(projectRoot, 'assets/images');
const buildImagesDirectory = resolve(buildDirectory, 'assets/images');

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

test('critical backgrounds and logos are preloaded', () => {
    const html = readFileSync(resolve(buildDirectory, 'index.html'), 'utf8');
    const criticalAssets = [
        'bandito-background-clean',
        'bandito-logo',
        'bandito-background-clean-night',
        'bandito-logo-night-512',
    ];

    for (const name of criticalAssets) {
        assert.match(
            html,
            new RegExp(
                `<link[^>]+rel="preload"[^>]+as="image"[^>]+href="[^"]*${name}(?:-[^./"]+)?\\.(?:webp|png|jpe?g)"`
            )
        );
    }
    assert.match(html, /id="brandLogo"[^>]+fetchpriority="high"/);
});

test('all source images are emitted once as optimized, hashed WebP assets', () => {
    const sourceFiles = readdirSync(sourceImagesDirectory).filter((name) => /\.(?:png|jpe?g)$/i.test(name));
    const outputFiles = readdirSync(buildImagesDirectory);
    assert.ok(sourceFiles.length > 0, 'No source raster images found');

    let originalBytes = 0;
    let outputBytes = 0;

    for (const sourceName of sourceFiles) {
        const sourcePath = join(sourceImagesDirectory, sourceName);
        const sourceSize = statSync(sourcePath).size;
        const stem = sourceName.replace(/\.(?:png|jpe?g)$/i, '');
        const matches = outputFiles.filter((name) => name.startsWith(stem + '-') && /\.webp$/i.test(name));
        const rawDuplicates = outputFiles.filter((name) => name === sourceName);

        originalBytes += sourceSize;
        assert.equal(matches.length, 1, `Expected exactly one hashed WebP for ${sourceName}, got ${matches.length}`);
        assert.equal(rawDuplicates.length, 0, `Unhashed duplicate remains in build: ${sourceName}`);

        const optimizedSize = statSync(join(buildImagesDirectory, matches[0])).size;
        assert.ok(optimizedSize < sourceSize, `Optimized image is not smaller: ${sourceName}`);
        outputBytes += optimizedSize;
    }

    assert.ok(outputBytes < originalBytes, 'Image optimization did not reduce total image size');

    const builtFiles = walkFiles(buildDirectory);
    const references = builtFiles
        .filter((file) => /\.(?:html|css|js)$/i.test(file))
        .map((file) => readFileSync(file, 'utf8'))
        .join('\n');

    for (const sourceName of sourceFiles) {
        const stem = sourceName.replace(/\.(?:png|jpe?g)$/i, '');
        assert.match(
            references,
            new RegExp(stem + '-[a-zA-Z0-9_-]+\.webp'),
            `No built reference found for ${sourceName}`
        );
    }

    assert.equal(
        references.includes('assets/images/bandito-'),
        false,
        'Unhashed theme image references remain in built files'
    );
});

function walkFiles(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? walkFiles(path) : [path];
    });
}