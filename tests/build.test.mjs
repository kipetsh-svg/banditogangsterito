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
                `<link[^>]+rel="preload"[^>]+as="image"[^>]+href="[^"]*${name}\\.(?:webp|png|jpe?g)"`,
            ),
        );
    }
    assert.match(html, /id="brandLogo"[^>]+fetchpriority="high"/);
});

test('build optimizes raster assets to smaller WebP files when possible', () => {
    const sourceFiles = readdirSync(sourceImagesDirectory).filter((name) => /\.(?:png|jpe?g)$/i.test(name));
    assert.ok(sourceFiles.length > 0, 'No source raster images found');

    let originalBytes = 0;
    let outputBytes = 0;
    let convertedCount = 0;

    for (const sourceName of sourceFiles) {
        const sourcePath = join(sourceImagesDirectory, sourceName);
        const sourceSize = statSync(sourcePath).size;
        const webpName = sourceName.replace(/\.(?:png|jpe?g)$/i, '.webp');
        const webpPath = join(buildImagesDirectory, webpName);
        const originalBuildPath = join(buildImagesDirectory, sourceName);

        originalBytes += sourceSize;
        assert.ok(
            existsSync(webpPath) || existsSync(originalBuildPath),
            `Neither optimized nor original image was emitted for ${sourceName}`,
        );

        if (existsSync(webpPath)) {
            const webpSize = statSync(webpPath).size;
            assert.ok(webpSize < sourceSize, `WebP output is not smaller for ${sourceName}`);
            outputBytes += webpSize;
            convertedCount += 1;
        } else {
            outputBytes += statSync(originalBuildPath).size;
        }
    }

    assert.ok(convertedCount > 0, 'No images were converted to WebP');
    assert.ok(outputBytes < originalBytes, 'Image optimization did not reduce total image size');

    const tokensCss = readFileSync(resolve(buildDirectory, 'css/tokens.css'), 'utf8');
    for (const baseName of ['bandito-background-clean', 'bandito-background-clean-night']) {
        const extension = existsSync(join(buildImagesDirectory, `${baseName}.webp`)) ? 'webp' : 'jpg';
        assert.ok(tokensCss.includes(`${baseName}.${extension}`), `Missing CSS background reference for ${baseName}`);
    }

    const settingsJs = readFileSync(resolve(buildDirectory, 'js/settings.js'), 'utf8');
    for (const baseName of ['bandito-logo', 'bandito-logo-night-512']) {
        const extension = existsSync(join(buildImagesDirectory, `${baseName}.webp`)) ? 'webp' : 'png';
        assert.ok(settingsJs.includes(`${baseName}.${extension}`), `Missing theme logo reference for ${baseName}`);
    }
});
