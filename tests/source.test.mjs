import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

function localReferences(html) {
    return [...html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)]
        .map((match) => match[1])
        .filter((value) => value && !/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value))
        .map((value) => decodeURIComponent(value.split(/[?#]/, 1)[0]).replace(/^\.\//, ''));
}

test('all local resources referenced by index.html exist', () => {
    const html = readFileSync(resolve(projectRoot, 'index.html'), 'utf8');
    for (const reference of localReferences(html)) {
        assert.ok(existsSync(resolve(projectRoot, reference)), `Missing local resource: ${reference}`);
    }
});

test('settings module exposes callbacks used by the classic game script', () => {
    const settings = readFileSync(resolve(projectRoot, 'js/settings.js'), 'utf8');
    const game = readFileSync(resolve(projectRoot, 'js/game.js'), 'utf8');

    assert.match(settings, /window\.applySettings = applySettings/);
    assert.match(settings, /window\.saveSettings = saveSettings/);
    assert.match(game, /window\.saveSettings\(\)/);
    assert.match(game, /window\.applySettings\(\)/);
});

// Any DOM lookup returns a stub that absorbs property access, calls and assignments.
// Tree traversal yields null so the stub behaves like an empty element in loops.
const emptyTreeProperties = new Set(['firstChild', 'lastChild', 'nextSibling', 'previousSibling', 'parentNode']);

function createStub() {
    const stub = new Proxy(function () {}, {
        get: (_target, property) => {
            if (property === Symbol.toPrimitive) return () => '';
            if (property === Symbol.iterator) return function* () {};
            if (property === 'then' || emptyTreeProperties.has(property)) return undefined;
            return stub;
        },
        set: () => true,
        apply: () => stub,
        construct: () => stub,
    });
    return stub;
}

test('classic scripts load in index.html order without runtime errors', () => {
    const html = readFileSync(resolve(projectRoot, 'index.html'), 'utf8');
    // Module scripts are deferred and run after classic scripts, so they cannot provide globals at load time.
    const classicScripts = [...html.matchAll(/<script(?![^>]*type="module")[^>]*src="(js\/[^"]+)"/g)].map(
        (match) => match[1]
    );
    assert.ok(classicScripts.length > 0, 'No classic scripts found in index.html');

    const storage = new Map();
    const context = vm.createContext({
        console,
        document: createStub(),
        navigator: createStub(),
        firebase: createStub(),
        localStorage: {
            getItem: (key) => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, String(value)),
            removeItem: (key) => storage.delete(key),
        },
        matchMedia: () => ({ matches: false }),
        fetch: () => new Promise(() => {}),
        requestAnimationFrame: () => 0,
        setTimeout: () => 0,
        clearTimeout: () => {},
        setInterval: () => 0,
        clearInterval: () => {},
        addEventListener: () => {},
    });
    context.window = context;

    for (const script of classicScripts) {
        const source = readFileSync(resolve(projectRoot, script), 'utf8');
        assert.doesNotThrow(() => vm.runInContext(source, context, { filename: script }), `${script} failed to load`);
    }
});

test('all game scripts pass the JavaScript parser', () => {
    const scriptsDirectory = resolve(projectRoot, 'js');
    const scripts = readdirSync(scriptsDirectory).filter((name) => name.endsWith('.js'));
    assert.ok(scripts.length > 0, 'No game scripts found');

    for (const script of scripts) {
        const file = join(scriptsDirectory, script);
        const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
        assert.equal(result.status, 0, `${script} has a syntax error:\n${result.stderr}`);
    }
});

test('the card data is structurally valid and contains all supported starting cards', () => {
    const data = JSON.parse(readFileSync(resolve(projectRoot, 'resources/bandido-matrices/cards.json'), 'utf8'));
    assert.ok(Array.isArray(data.cards) && data.cards.length > 0, 'Card list is empty');

    const ids = new Set();
    for (const card of data.cards) {
        assert.ok(Number.isInteger(card.id), 'Every card needs an integer ID');
        assert.ok(!ids.has(card.id), `Duplicate card ID: ${card.id}`);
        ids.add(card.id);

        if (card.kind === 'back') {
            assert.equal(card.matrix, null, 'The card back must not have a playable matrix');
            continue;
        }

        assert.ok(Array.isArray(card.matrix) && card.matrix.length > 0, `Card ${card.id} has no matrix`);
        const width = card.matrix[0].length;
        assert.ok(width > 0, `Card ${card.id} has an empty row`);
        for (const row of card.matrix) {
            assert.equal(row.length, width, `Card ${card.id} has a non-rectangular matrix`);
            assert.ok(
                row.every((cell) => cell === 0 || cell === 1),
                `Card ${card.id} contains an invalid cell`
            );
        }
    }

    const starts = new Map(data.cards.filter((card) => card.kind === 'start').map((card) => [card.id, card.exitCount]));
    assert.equal(starts.get(75), 2, 'Two-exit start card is missing');
    assert.equal(starts.get(72), 5, 'Five-exit start card is missing');
    assert.equal(starts.get(71), 6, 'Six-exit start card is missing');
});
