/* Single-player rules, board rendering, controls, and end screens. */
import { $ } from '#js/dom.js';
import { applySettings, saveSettings } from '#js/settings.js';
import { snackbar } from '#js/snackbar.js';
import {
    leaveMultiplayer,
    mpExchange,
    mpPlay,
    mpRoomCode,
    mpRoomData,
    mpStart,
    mpStopTimer,
    mpUid,
} from '#js/multiplayer.js';

// Current game state; multiplayer.js replaces it from the room snapshot.
export const state = {
    all: [],
    deck: [],
    hand: [],
    placed: [],
    selected: -1,
    rotation: 0,
    finished: false,
    exits: 6,
    turnCount: 0,
    hoverSpot: null,
    placementPreview: null,
    lastPlaced: null,
    animateLastPlacement: false,
};
const defaultStats = { games: 0, wins: 0, losses: 0, best: null };
let playerStats = {
    ...defaultStats,
    ...(() => {
        try {
            return (
                JSON.parse(localStorage.getItem('banditoStats') || localStorage.getItem('bandidoStats') || '{}') || {}
            );
        } catch {
            return {};
        }
    })(),
};
function saveStats() {
    localStorage.setItem('banditoStats', JSON.stringify(playerStats));
    updateStats();
}
function updateStats() {
    const set = (id, v) => {
        const el = $('#' + id);
        if (el) el.textContent = v;
    };
    set('gameWins', playerStats.wins);
    set('turnCount', state.turnCount);
}
function finishGame(won) {
    if (state.finished) return;
    state.finished = true;
    playerStats.games++;
    if (won) {
        playerStats.wins++;
        if (playerStats.best === null || state.turnCount < playerStats.best) playerStats.best = state.turnCount;
    } else playerStats.losses++;
    saveStats();
}
export const clone = (m) => m.map((r) => r.slice());
function rot(m) {
    let h = m.length,
        w = m[0].length,
        o = Array.from({ length: w }, () => Array(h));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o[x][h - 1 - y] = m[y][x];
    return o;
}
function dims(m) {
    return [m[0].length, m.length];
}
let boardIndex = null,
    indexedBoard = null,
    indexedBoardLength = -1;
function ensureBoardIndex() {
    if (boardIndex && indexedBoard === state.placed && indexedBoardLength === state.placed.length) return boardIndex;
    const index = new Map();
    for (const p of state.placed)
        for (let y = 0; y < p.m.length; y++)
            for (let x = 0; x < p.m[y].length; x++) index.set(p.x + x + ',' + (p.y + y), p.m[y][x]);
    boardIndex = index;
    indexedBoard = state.placed;
    indexedBoardLength = state.placed.length;
    return index;
}
function cellAt(gx, gy) {
    const value = ensureBoardIndex().get(gx + ',' + gy);
    return value === undefined ? null : value;
}
export function valid(m, x, y) {
    const [w, h] = dims(m),
        index = ensureBoardIndex();
    let connected = false;
    for (let yy = 0; yy < h; yy++)
        for (let xx = 0; xx < w; xx++) {
            if (index.has(x + xx + ',' + (y + yy))) return false;
            const value = m[yy][xx];
            for (const [dx, dy] of [
                [0, -1],
                [0, 1],
                [-1, 0],
                [1, 0],
            ]) {
                const adjacent = index.get(x + xx + dx + ',' + (y + yy + dy));
                if (adjacent === undefined) continue;
                if (adjacent !== value) return false;
                if (adjacent === 1 && value === 1) connected = true;
            }
        }
    return connected;
}
export function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
function draw() {
    while (state.hand.length < 3 && state.deck.length) state.hand.push(state.deck.pop());
}
export function status(t, k = '') {
    $('#status').textContent = t;
    $('#status').classList.toggle('hidden', k === 'win' || k === 'lose');
}
export function opens() {
    let n = 0;
    for (const p of state.placed) {
        const [w, h] = dims(p.m);
        for (let yy = 0; yy < h; yy++)
            for (let xx = 0; xx < w; xx++)
                if (p.m[yy][xx] === 1)
                    for (const [dx, dy] of [
                        [0, -1],
                        [0, 1],
                        [-1, 0],
                        [1, 0],
                    ])
                        if (cellAt(p.x + xx + dx, p.y + yy + dy) === null) n++;
    }
    return n;
}
function begin(n) {
    if (!state.all.length) return;
    mpStopTimer();
    state.exits = n;
    let s = state.all.find((c) => c.id === (n === 2 ? 75 : n === 6 ? 71 : 72));
    state.deck = shuffle(state.all.filter((c) => c.kind === 'tunnel').map((c) => ({ id: c.id, m: clone(c.matrix) })));
    state.hand = [];
    state.placed = [{ id: s.id, x: 0, y: 0, m: clone(s.matrix) }];
    state.lastPlaced = null;
    state.animateLastPlacement = false;
    state.selected = -1;
    state.rotation = 0;
    state.finished = false;
    state.turnCount = 0;
    state.hoverSpot = null;
    state.placementPreview = null;
    draw();
    $('#menu').classList.add('hidden');
    $('#play').classList.remove('hidden');
    $('#heading').textContent = n === 2 ? 'Bandito · лёгкая партия' : 'Bandito · ' + n + ' выходов';
    status('Выбери карту в руке.');
    render();
}
function rotated(m, r) {
    let a = clone(m);
    for (let i = 0; i < r; i++) a = rot(a);
    return a;
}
function legalSpots(m) {
    const [w, h] = dims(m),
        candidates = new Set();
    for (const p of state.placed)
        for (let py = 0; py < p.m.length; py++)
            for (let px = 0; px < p.m[py].length; px++) {
                if (p.m[py][px] !== 1) continue;
                for (const [dx, dy] of [
                    [0, -1],
                    [0, 1],
                    [-1, 0],
                    [1, 0],
                ])
                    for (let y = 0; y < h; y++)
                        for (let x = 0; x < w; x++) {
                            if (m[y][x] !== 1) continue;
                            candidates.add(p.x + px + dx - x + ',' + (p.y + py + dy - y));
                        }
            }
    const spots = [];
    for (const key of candidates) {
        const comma = key.indexOf(','),
            x = Number(key.slice(0, comma)),
            y = Number(key.slice(comma + 1));
        if (valid(m, x, y)) spots.push([x, y]);
    }
    return spots;
}
export function canPlayAny() {
    return state.hand.some((card) => [0, 1, 2, 3].some((r) => legalSpots(rotated(card.m, r)).length > 0));
}
export function render() {
    const camera = $('#camera'),
        savedLeft = camera?.scrollLeft || 0,
        savedTop = camera?.scrollTop || 0;
    if (state.selected >= state.hand.length) state.selected = -1;
    if (state.finished) state.selected = -1;
    let minX = Math.min(...state.placed.map((p) => p.x)),
        minY = Math.min(...state.placed.map((p) => p.y)),
        maxX = Math.max(...state.placed.map((p) => p.x + dims(p.m)[0])),
        maxY = Math.max(...state.placed.map((p) => p.y + dims(p.m)[1]));
    const legalByRotation = placementOptions();
    for (const { w, h, spots } of legalByRotation)
        for (const [x, y] of spots) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + w);
            maxY = Math.max(maxY, y + h);
        }
    const c = cellSize,
        pad = 36,
        b = $('#board');
    b.innerHTML = '';
    b.style.width = (maxX - minX) * c + pad * 2 + 'px';
    b.style.height = (maxY - minY) * c + pad * 2 + 'px';
    for (const p of state.placed) {
        const [w, h] = dims(p.m),
            el = document.createElement('div');
        const isLatest =
            !!state.lastPlaced &&
            p.id === state.lastPlaced.id &&
            p.x === state.lastPlaced.x &&
            p.y === state.lastPlaced.y;
        const highlightLatest = !!mpRoomCode && isLatest;
        const animateThis = isLatest && state.animateLastPlacement;
        el.className =
            'board__piece' +
            (highlightLatest ? ' board__piece--latest' : '') +
            (animateThis ? ' board__piece--fresh' : '');
        if (animateThis) state.animateLastPlacement = false;
        el.style.cssText = `left:${pad + (p.x - minX) * c}px;top:${pad + (p.y - minY) * c}px;width:${w * c}px;height:${h * c}px;grid-template-columns:repeat(${w},${c}px);grid-template-rows:repeat(${h},${c}px)`;
        p.m.flat().forEach((v) => {
            const q = document.createElement('i');
            q.className = 'board__cell' + (v ? '' : ' board__cell--wall');
            el.append(q);
        });
        b.append(el);
    }
    $('#hand').innerHTML = '';
    const canAct = !mpRoomCode || mpRoomData?.game?.turnUid === mpUid;
    const hasMoves = canAct && !state.finished && state.hand.length > 0 && canPlayAny();
    state.hand.forEach((card, i) => {
        const m = rotated(card.m, i === state.selected ? state.rotation : 0),
            btn = document.createElement('button');
        btn.className = 'hand-card' + (i === state.selected ? ' hand-card--selected' : '');
        btn.type = 'button';
        btn.disabled = state.finished || !canAct;
        const mini = document.createElement('span');
        mini.className = 'hand-card__mini';
        mini.style.cssText = `grid-template-columns:repeat(${m[0].length},7px);grid-template-rows:repeat(${m.length},7px)`;
        m.flat().forEach((v) => {
            const q = document.createElement('i');
            q.className = 'hand-card__cell' + (v ? '' : ' hand-card__cell--wall');
            mini.append(q);
        });
        btn.append(mini);
        const label = document.createElement('small');
        label.className = 'hand-card__label';
        label.textContent = 'Карта ' + card.id;
        btn.append(label);
        btn.setAttribute('aria-pressed', String(i === state.selected));
        btn.onclick = (e) => {
            if (btn.disabled) return;
            // A click with detail 0 comes from Enter or Space: keyboard selection opens the preview at once.
            selectCard(i, e.detail === 0);
        };
        btn.onfocus = () => {
            // Tabbing onto a card selects it and previews its first spot. Focus stays on the card,
            // so the next Tab reaches the next card; arrows or Enter move focus to «Поставить».
            if (focusingCard || btn.disabled || !btn.matches(':focus-visible')) return;
            if (state.selected === i && state.placementPreview) return;
            selectCard(i, true, false);
        };
        $('#hand').append(btn);
    });
    $('#deckcount').textContent = state.deck.length;
    $('#openCount').textContent = opens();
    $('#turnCount').textContent = state.turnCount;
    $('#exchange').disabled = state.finished || !canAct || state.hand.length === 0 || hasMoves;
    $('#zoomReset').textContent = Math.round((cellSize / 18) * 100) + '%';
    if (!mpRoomCode && canAct && !state.finished && state.hand.length > 0 && !hasMoves) {
        if (!state.deck.length) {
            finishGame(false);
            status('Поражение. Нет доступных ходов, а колода пуста.', 'lose');
            showEndScreen(false);
        } else status('Нет доступных ходов. Нажми «Сбросить карты», чтобы получить новые.');
    }
    const showPlacementPreview =
        !!state.placementPreview && state.selected >= 0 && !!state.hand[state.selected] && !state.finished && canAct;
    if (!showPlacementPreview) state.placementPreview = null;
    const previewPanel = $('#placementPreview');
    previewPanel.classList.toggle('hidden', !showPlacementPreview);
    if (state.selected >= 0 && state.hand[state.selected] && !state.finished && canAct) {
        const ghost = document.createElement('div');
        ghost.className = 'board__piece board__piece--ghost hidden';
        ghost.dataset.ghost = '';
        let previewPin = null;
        b.append(ghost);
        const offsets = [
            [-17, -17],
            [17, -17],
            [17, 17],
            [-17, 17],
        ];
        for (let r = 0; r < legalByRotation.length; r++) {
            const { m, w: mw, h: mh, spots } = legalByRotation[r];
            for (const [sx, sy] of spots) {
                const pin = document.createElement('button');
                pin.className = 'board__pin board__pin--' + r;
                pin.type = 'button';
                // Spots are not tab stops: the keyboard moves between them with the arrow keys.
                pin.tabIndex = -1;
                pin.title = 'Поставить карту · ' + r * 90 + '°';
                pin.setAttribute(
                    'aria-label',
                    'Поставить карту, поворот ' + r * 90 + ' градусов, позиция ' + sx + ', ' + sy
                );
                pin.style.cssText =
                    'left:' +
                    (pad + (sx - minX) * c + (mw * c) / 2 - 20 + offsets[r][0]) +
                    'px;top:' +
                    (pad + (sy - minY) * c + (mh * c) / 2 - 20 + offsets[r][1]) +
                    'px';
                const showGhost = () => {
                    ghost.innerHTML = '';
                    ghost.style.width = mw * c + 'px';
                    ghost.style.height = mh * c + 'px';
                    ghost.style.gridTemplateColumns = 'repeat(' + mw + ',' + c + 'px)';
                    ghost.style.gridTemplateRows = 'repeat(' + mh + ',' + c + 'px)';
                    m.flat().forEach((v) => {
                        const q = document.createElement('i');
                        q.className = 'board__cell' + (v ? '' : ' board__cell--wall');
                        ghost.append(q);
                    });
                    ghost.classList.remove('hidden');
                    ghost.style.left = pad + (sx - minX) * c + 'px';
                    ghost.style.top = pad + (sy - minY) * c + 'px';
                };
                pin.onpointerenter = (e) => {
                    if (state.placementPreview) {
                        // Touch keeps its preview until the tap; the click handler moves it.
                        if (e.pointerType !== 'mouse') return;
                        // A mouse hover leaves keyboard mode: hide the buttons, return focus to the selected card.
                        state.placementPreview = null;
                        previewPanel.classList.add('hidden');
                        previewPin?.classList.remove('board__pin--preview');
                        status('Выбери точку нужного цвета на поле для размещения карты.');
                        focusCard(state.selected);
                    }
                    showGhost();
                };
                // Pointer events, like pointerenter: all pointer events fire before the mouse ones,
                // so a mouseleave of the previous pin would hide the ghost the next pin has just shown.
                pin.onpointerleave = () => {
                    if (!state.placementPreview) ghost.classList.add('hidden');
                };
                if (
                    state.placementPreview &&
                    state.placementPreview.x === sx &&
                    state.placementPreview.y === sy &&
                    state.placementPreview.r === r
                ) {
                    showGhost();
                    pin.classList.add('board__pin--preview');
                    previewPin = pin;
                }
                let pointerType = '';
                pin.onpointerdown = (e) => {
                    pointerType = e.pointerType;
                };
                // A pressed spot must not take focus: the keyboard works through «Поставить» only.
                pin.onmousedown = (e) => e.preventDefault();
                pin.onclick = (e) => {
                    e.stopPropagation();
                    state.rotation = r;
                    // A mouse already previewed the card on hover, so it places at once.
                    // Touch and pen have no hover: the first tap shows the preview to confirm.
                    if (pointerType === 'mouse') {
                        state.placementPreview = null;
                        play(sx, sy, m);
                        return;
                    }
                    previewAt(sx, sy, r);
                };
                b.append(pin);
            }
        }
    }
    requestAnimationFrame(() => {
        if (camera) {
            camera.scrollLeft = savedLeft;
            camera.scrollTop = savedTop;
        }
    });
}

// Legal spots of the selected card for every rotation, in reading order: top to bottom, left to right.
// A symmetric card looks the same in several rotations (a straight line at 0° and 180°):
// such a repeated rotation gets no spots, so each distinct placement has a single pin.
function placementOptions() {
    if (state.selected < 0 || !state.hand[state.selected]) return [];
    const options = [],
        seen = new Set();
    for (let r = 0; r < 4; r++) {
        const m = rotated(state.hand[state.selected].m, r),
            [w, h] = dims(m),
            key = JSON.stringify(m),
            spots = seen.has(key) ? [] : legalSpots(m).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
        seen.add(key);
        options.push({ m, w, h, spots });
    }
    return options;
}

function previewAt(x, y, r) {
    const current = state.placementPreview;
    if (current && current.x === x && current.y === y && current.r === r) return;
    const spots = placementOptions()[r].spots,
        index = spots.findIndex(([sx, sy]) => sx === x && sy === y);
    state.rotation = r;
    state.placementPreview = { x, y, r };
    status(
        'Поворот ' + r * 90 + '°, место ' + (index + 1) + ' из ' + spots.length + '. Нажми «Поставить» или «Отмена».'
    );
    render();
}

// Scrolls the camera so the previewed card is fully visible. Runs after render() restores the scroll.
function revealPreview() {
    requestAnimationFrame(() => {
        const camera = $('#camera'),
            ghost = $('#board [data-ghost]');
        if (!camera || !ghost) return;
        const view = camera.getBoundingClientRect(),
            box = ghost.getBoundingClientRect(),
            margin = 24;
        if (box.left < view.left + margin) camera.scrollLeft -= view.left + margin - box.left;
        else if (box.right > view.right - margin)
            camera.scrollLeft += Math.min(box.right - view.right + margin, box.left - view.left - margin);
        if (box.top < view.top + margin) camera.scrollTop -= view.top + margin - box.top;
        else if (box.bottom > view.bottom - margin)
            camera.scrollTop += Math.min(box.bottom - view.bottom + margin, box.top - view.top - margin);
    });
}

function selectCard(i, keyboard, focusConfirm = true) {
    state.selected = i;
    state.rotation = 0;
    state.placementPreview = null;
    status('Выбери точку нужного цвета на поле для размещения карты.');
    if (!keyboard) {
        render();
        return;
    }
    // Keyboard mode: show the preview at the first available spot right away.
    moveKeyboardPreview();
    if (!state.placementPreview) render();
    else if (!focusConfirm) focusCard(i);
}

// Moves focus to a hand card without the focus handler selecting it again.
let focusingCard = false;
function focusCard(i) {
    focusingCard = true;
    $('#hand').children[i]?.focus();
    focusingCard = false;
}

// Keyboard placement: ↑/↓ rotate the card, ←/→ cycle the spots of the current rotation.
// Every spot is reachable: the rotation is picked with ↑/↓, the spot within it with ←/→.
function moveKeyboardPreview(key) {
    const options = placementOptions(),
        current = state.placementPreview;
    if (!options.some(({ spots }) => spots.length)) return;
    if (!current) {
        const r = options.findIndex(({ spots }) => spots.length);
        previewAt(...options[r].spots[0], r);
    } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
        const spots = options[current.r].spots,
            index = spots.findIndex(([x, y]) => x === current.x && y === current.y),
            next = spots[(index + (key === 'ArrowRight' ? 1 : -1) + spots.length) % spots.length];
        previewAt(...next, current.r);
    } else {
        // Keep the card roughly in place: pick the spot of the next rotation closest to the current one.
        const step = key === 'ArrowUp' ? 1 : 3,
            cx = current.x + options[current.r].w / 2,
            cy = current.y + options[current.r].h / 2;
        for (let k = 1; k < 4; k++) {
            const r = (current.r + step * k) % 4,
                { w, h, spots } = options[r];
            if (!spots.length) continue;
            const distance = ([x, y]) => (x + w / 2 - cx) ** 2 + (y + h / 2 - cy) ** 2;
            const nearest = spots.reduce((best, spot) => (distance(spot) < distance(best) ? spot : best));
            previewAt(...nearest, r);
            break;
        }
    }
    revealPreview();
    $('#placementConfirm').focus();
}

$('#placementConfirm').onclick = (e) => {
    if (!state.placementPreview || state.selected < 0 || !state.hand[state.selected]) return;
    const { x, y, r } = state.placementPreview;
    const m = rotated(state.hand[state.selected].m, r);
    state.rotation = r;
    state.placementPreview = null;
    play(x, y, m);
    // Placed from the keyboard: stay in keyboard mode with the first card previewed.
    const first = $('#hand').children[0];
    if (e.detail === 0 && first && !first.disabled) {
        selectCard(0, true, false);
    }
};
$('#placementCancel').onclick = () => {
    state.placementPreview = null;
    status('Выбери точку на поле.');
    render();
    focusCard(state.selected);
};
$('#gameMenuToggle').onclick = () => {
    const menu = $('#gameMenu');
    const opening = menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !opening);
    $('#gameMenuToggle').setAttribute('aria-expanded', String(opening));
};
document.addEventListener('click', (e) => {
    if (!e.target.closest('.game__menu')) {
        $('#gameMenu').classList.add('hidden');
        $('#gameMenuToggle').setAttribute('aria-expanded', 'false');
    }
});
const defaultCellSize = () => (window.matchMedia('(max-width:760px)').matches ? 16 : 18);
let cellSize = defaultCellSize();
function setZoom(next) {
    const value = Math.max(12, Math.min(30, next));
    if (value === cellSize) return;
    const camera = $('#camera'),
        ratio = value / cellSize,
        cx = camera.scrollLeft + camera.clientWidth / 2,
        cy = camera.scrollTop + camera.clientHeight / 2;
    cellSize = value;
    render();
    requestAnimationFrame(() => {
        camera.scrollLeft = Math.max(0, cx * ratio - camera.clientWidth / 2);
        camera.scrollTop = Math.max(0, cy * ratio - camera.clientHeight / 2);
    });
}
$('#zoomOut').onclick = () => setZoom(cellSize - 2);
$('#zoomIn').onclick = () => setZoom(cellSize + 2);
$('#zoomReset').onclick = () => setZoom(defaultCellSize());
const cameraEl = $('#camera');
let panState = null;
cameraEl.addEventListener('pointerdown', (e) => {
    if ((e.pointerType === 'mouse' && e.button !== 0) || e.target.closest('button')) return;
    panState = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        left: cameraEl.scrollLeft,
        top: cameraEl.scrollTop,
        moved: false,
    };
});
cameraEl.addEventListener('pointermove', (e) => {
    if (!panState || panState.id !== e.pointerId) return;
    const dx = e.clientX - panState.x,
        dy = e.clientY - panState.y;
    if (!panState.moved && Math.hypot(dx, dy) > 5) {
        panState.moved = true;
        cameraEl.classList.add('game__camera--dragging');
        cameraEl.setPointerCapture(e.pointerId);
    }
    if (panState.moved) {
        cameraEl.scrollLeft = panState.left - dx;
        cameraEl.scrollTop = panState.top - dy;
    }
});
function endPan(e) {
    if (!panState || panState.id !== e.pointerId) return;
    cameraEl.classList.remove('game__camera--dragging');
    panState = null;
}
cameraEl.addEventListener('pointerup', endPan);
cameraEl.addEventListener('pointercancel', endPan);
cameraEl.addEventListener(
    'wheel',
    (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        setZoom(cellSize + (e.deltaY < 0 ? 2 : -2));
    },
    { passive: false }
);
// Physical keys, so the layout does not matter. As in Tetris, X rotates clockwise like ↑ and Z counterclockwise like ↓.
const placementKeys = {
    ArrowLeft: 'ArrowLeft',
    ArrowRight: 'ArrowRight',
    ArrowUp: 'ArrowUp',
    ArrowDown: 'ArrowDown',
    KeyX: 'ArrowUp',
    KeyZ: 'ArrowDown',
};
document.addEventListener('keydown', (e) => {
    if ($('#play').classList.contains('hidden') || e.altKey || e.ctrlKey || e.metaKey) return;
    if (!$('#settingsModal').classList.contains('hidden')) return;
    if (e.target.closest?.('input,textarea,select,[contenteditable="true"]')) return;
    const selectedCard = $('#hand').children[state.selected];
    if (['1', '2', '3'].includes(e.key)) {
        const index = Number(e.key) - 1;
        if (state.hand[index] && !state.finished && !$('#hand').children[index].disabled) {
            selectCard(index, true);
        }
    } else if (placementKeys[e.code] && selectedCard && !selectedCard.disabled) {
        e.preventDefault();
        moveKeyboardPreview(placementKeys[e.code]);
    } else if (e.key === 'Escape' && state.placementPreview) {
        state.placementPreview = null;
        status('Выбери точку на поле.');
        render();
        focusCard(state.selected);
    } else if (e.key === 'Escape' && state.selected >= 0) {
        state.selected = -1;
        render();
    }
});
export function showEndScreen(won) {
    if (document.querySelector('[data-end-screen]')) return;
    const layer = document.createElement('div');
    layer.className = 'end-screen' + (won ? '' : ' end-screen--lose');
    layer.dataset.endScreen = '';
    const multi = !!mpRoomCode,
        host = multi && mpRoomData?.owner === mpUid;
    const difficulty = mpRoomData?.game?.exits || 6;
    layer.innerHTML =
        '<div class="end-screen__card"><div class="end-screen__mark">' +
        (won ? '✓' : '×') +
        '</div><h2 class="end-screen__title">' +
        (won ? 'Победа!' : 'Поражение') +
        '</h2><p class="end-screen__subtitle">' +
        (won ? 'Все туннели закрыты. Бандито пойман!' : 'Карты закончились, но выходы ещё остались.') +
        '</p>' +
        (multi
            ? host
                ? '<label class="end-screen__rematch">Сложность реванша <select class="select" data-end="difficulty"><option value="2">2 выхода</option><option value="5">5 выходов</option><option value="6">6 выходов</option></select></label>'
                : '<p class="end-screen__subtitle">Ожидаем, пока создатель комнаты начнёт реванш.</p>'
            : '') +
        '<div class="end-screen__actions">' +
        (multi
            ? host
                ? '<button class="btn btn--lg btn--primary end-screen__action" data-end="rematch">Реванш</button>'
                : '<button class="btn btn--lg btn--primary end-screen__action" disabled>Ждём реванша…</button>'
            : '<button class="btn btn--lg btn--primary end-screen__action" data-end="menu">В меню</button>' +
              '<button class="btn btn--lg end-screen__action" data-end="close">Посмотреть поле</button>') +
        (multi ? '<button class="btn btn--lg end-screen__action" data-end="leave">Выйти из комнаты</button>' : '') +
        '</div></div>';
    document.body.append(layer);
    const select = layer.querySelector('[data-end="difficulty"]');
    if (select) select.value = String(difficulty);
    const rematch = layer.querySelector('[data-end="rematch"]');
    if (rematch)
        rematch.onclick = () => {
            const choice = select.value;
            $('#mpExits').value = choice;
            layer.remove();
            mpStart();
        };
    const menu = layer.querySelector('[data-end="menu"]');
    if (menu)
        menu.onclick = () => {
            $('#newgame').click();
            layer.remove();
        };
    const close = layer.querySelector('[data-end="close"]');
    if (close) close.onclick = () => layer.remove();
    const leave = layer.querySelector('[data-end="leave"]');
    if (leave) leave.onclick = () => leaveMultiplayer();
}
export function celebrate() {
    const layer = document.createElement('div');
    layer.className = 'confetti';
    layer.setAttribute('aria-hidden', 'true');
    for (const cls of ['confetti__ring', 'confetti__ring confetti__ring--second']) {
        const ring = document.createElement('i');
        ring.className = cls;
        layer.append(ring);
    }
    const colors = ['#e6b85c', '#718568', '#d98272', '#8b83b7', '#6b9caf', '#e8d9a8', '#f08a5d'];
    for (let burst = 0; burst < 3; burst++) {
        const group = document.createElement('div');
        group.className = 'confetti__burst';
        group.style.transform = 'translate(' + (burst - 1) * 2 + 'px,' + (burst - 1) * -9 + 'px)';
        for (let i = 0; i < 85; i++) {
            const bit = document.createElement('i'),
                angle = Math.random() * Math.PI * 2,
                speed = 100 + Math.random() * 260;
            bit.className =
                'confetti__bit' +
                (i % 5 === 0 ? ' confetti__bit--circle' : i % 7 === 0 ? ' confetti__bit--ribbon' : '');
            bit.style.background = colors[Math.floor(Math.random() * colors.length)];
            bit.style.setProperty('--dx', Math.cos(angle) * speed + 'px');
            bit.style.setProperty('--dy', Math.sin(angle) * speed + 'px');
            bit.style.setProperty('--duration', 0.65 + Math.random() * 0.45 + 's');
            bit.style.setProperty('--delay', burst * 0.18 + Math.random() * 0.12 + 's');
            bit.style.setProperty('--turn', Math.random() * 1100 - 550 + 'deg');
            group.append(bit);
        }
        layer.append(group);
    }
    document.body.append(layer);
    setTimeout(() => layer.remove(), 1800);
}
function play(x, y, m) {
    if (mpRoomCode) {
        mpPlay(x, y, m);
        return;
    }
    if (state.finished || state.selected < 0 || !valid(m, x, y)) return;
    let card = state.hand.splice(state.selected, 1)[0];
    const newPiece = { id: card.id, x, y, m };
    state.placed.push(newPiece);
    state.lastPlaced = newPiece;
    state.animateLastPlacement = true;
    state.turnCount++;
    state.selected = -1;
    state.rotation = 0;
    draw();
    let n = opens();
    if (n === 0) {
        finishGame(true);
        status('Победа! Все туннели закрыты.', 'win');
        showEndScreen(true);
        celebrate();
    } else if (!state.deck.length && !state.hand.length) {
        finishGame(false);
        status('Поражение. Карты закончились, выходы остались.', 'lose');
        showEndScreen(false);
    } else status('Карта размещена.');
    render();
}
$('#exchange').onclick = () => {
    if (mpRoomCode) {
        mpExchange();
        return;
    }
    if (state.finished || !state.hand.length) return;
    if (canPlayAny()) {
        snackbar('Сброс карт возможен только если нет доступных ходов', 'error');
        return;
    }
    const count = state.hand.length;
    state.hand.forEach((c) => state.deck.unshift(c));
    state.hand = [];
    draw();
    state.selected = -1;
    state.rotation = 0;
    state.hoverSpot = null;
    state.placementPreview = null;
    snackbar('Сброс карт: ' + count + ' карт возвращены под низ колоды, взяты новые');
    status('Выбери карту в руке.');
    render();
};
$('#newgame').onclick = () => {
    $('#gameMenu').classList.add('hidden');
    $('#gameMenuToggle').setAttribute('aria-expanded', 'false');
    state.placementPreview = null;
    if (mpRoomCode) {
        leaveMultiplayer();
        return;
    }
    $('#play').classList.add('hidden');
    $('#menu').classList.remove('hidden');
};
document.querySelectorAll('[data-start]').forEach((b) => (b.onclick = () => begin(+b.dataset.start)));
updateStats();
fetch('./resources/bandido-matrices/cards.json')
    .then((r) => {
        if (!r.ok) throw Error('Ошибка загрузки колоды');
        return r.json();
    })
    .then((d) => {
        state.all = d.cards.filter((c) => c.matrix);
        document.querySelectorAll('[data-start]').forEach((b) => (b.disabled = false));
        $('#loadstate').classList.remove('hidden');
        $('#loadstate').textContent = 'Колода загружена. Можно начинать.';
    })
    .catch((e) => {
        $('#loadstate').classList.remove('hidden');
        $('#loadstate').textContent = 'Не удалось загрузить колоду: ' + e.message + '. Обнови страницу.';
        document.querySelectorAll('[data-start]').forEach((b) => (b.disabled = true));
    });

$('#openSettings').onclick = () => $('#settingsModal').classList.remove('hidden');
$('#closeSettings').onclick = () => $('#settingsModal').classList.add('hidden');
$('#settingsModal').addEventListener('click', (e) => {
    if (e.target.id === 'settingsModal') $('#settingsModal').classList.add('hidden');
});
$('#reduceMotion').addEventListener('change', saveSettings);
$('#darkTheme').addEventListener('change', saveSettings);
$('#resetSettings').onclick = () => {
    localStorage.removeItem('banditoSettings');
    applySettings();
};
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') $('#settingsModal').classList.add('hidden');
});
