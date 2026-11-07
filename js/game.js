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
    // The keyboard moved to the selected card, but Enter or Space has not confirmed it yet.
    cardPending: false,
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
async function begin(n) {
    if (!state.all.length) return;
    // The solo modes stay clickable next to the coop lobby: a solo game leaves the room first,
    // otherwise the room's turn order keeps every card in the hand disabled.
    if (mpRoomCode) await leaveMultiplayer();
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
    centerCamera();
    focusHand();
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
// The placed cards plus boardMargin cells on each side (1.5 card lengths) form the play area.
// The board is the play area joined with the camera's view: a play area inside the view does not scroll,
// a part outside the view can be scrolled to.
const boardMargin = 9;
// Board px of cell (0, 0) and the cell size at the last render. A new card keeps the view where it was,
// so the cards stay at the same place on the screen; the zoom and a resize keep the cell in the middle.
let boardOrigin = null;
// Centres the play area in the camera (a new game).
export function centerCamera() {
    boardOrigin = null;
    render({ hand: false });
}
// A resize keeps the zoom in percent (100% differs on narrow screens) and the cell in the middle of the view.
window.addEventListener('resize', () => {
    const base = baseCellSize(),
        crossed = base !== zoomBase;
    if (crossed) {
        cellSize = clampCell(Math.round((cellSize * base) / zoomBase / 2) * 2);
        zoomBase = base;
    }
    // Crossing the narrow breakpoint turns the cards in the hand, so the hand is rebuilt too.
    if (!$('#play').classList.contains('hidden')) render({ hand: crossed });
});
// hand: false keeps the hand as it is (zoom changes only the board).
export function render({ hand = true } = {}) {
    const camera = $('#camera'),
        savedLeft = camera?.scrollLeft || 0,
        savedTop = camera?.scrollTop || 0;
    if (state.selected >= state.hand.length) state.selected = -1;
    if (state.finished) state.selected = -1;
    // Spots touch the placed cards, so they always lie inside the margin.
    const minX = Math.min(...state.placed.map((p) => p.x)) - boardMargin,
        minY = Math.min(...state.placed.map((p) => p.y)) - boardMargin,
        maxX = Math.max(...state.placed.map((p) => p.x + dims(p.m)[0])) + boardMargin,
        maxY = Math.max(...state.placed.map((p) => p.y + dims(p.m)[1])) + boardMargin;
    const legalByRotation = placementOptions();
    const c = cellSize,
        b = $('#board'),
        viewW = camera?.clientWidth || 0,
        viewH = camera?.clientHeight || 0,
        // The view's top left corner in px of the current scale, measured from cell (0, 0).
        viewX = Math.round(
            boardOrigin
                ? ((savedLeft + boardOrigin.w / 2 - boardOrigin.x) / boardOrigin.c) * c - viewW / 2
                : ((minX + maxX) / 2) * c - viewW / 2
        ),
        viewY = Math.round(
            boardOrigin
                ? ((savedTop + boardOrigin.h / 2 - boardOrigin.y) / boardOrigin.c) * c - viewH / 2
                : ((minY + maxY) / 2) * c - viewH / 2
        ),
        left = Math.min(minX * c, viewX),
        top = Math.min(minY * c, viewY),
        right = Math.max(maxX * c, viewX + viewW),
        bottom = Math.max(maxY * c, viewY + viewH),
        padX = minX * c - left,
        padY = minY * c - top,
        scrollLeft = viewX - left,
        scrollTop = viewY - top;
    boardOrigin = { x: -left, y: -top, c, w: viewW, h: viewH };
    b.innerHTML = '';
    b.style.width = right - left + 'px';
    b.style.height = bottom - top + 'px';
    b.style.setProperty('--board-cell', c + 'px');
    // The pins grow with the zoom more gently than the cells: 12px at the smallest zoom, 20px at the largest,
    // in whole 2px steps, so the pin stays centred in its 40px box without half pixels.
    const zoomShare = (c - clampCell(0)) / (clampCell(Infinity) - clampCell(0)),
        pinSize = 12 + 2 * Math.round(4 * zoomShare);
    b.style.setProperty('--board-pin-size', pinSize + 'px');
    for (const p of state.placed) {
        const [w, h] = dims(p.m),
            el = document.createElement('div');
        const isLatest =
            !!state.lastPlaced &&
            p.id === state.lastPlaced.id &&
            p.x === state.lastPlaced.x &&
            p.y === state.lastPlaced.y;
        const animateThis = isLatest && state.animateLastPlacement;
        el.className =
            'board__piece' +
            (isLatest && p !== state.placed[0] ? ' board__piece--latest' : '') +
            (animateThis ? ' board__piece--fresh' : '');
        if (animateThis) state.animateLastPlacement = false;
        el.style.cssText = `left:${padX + (p.x - minX) * c}px;top:${padY + (p.y - minY) * c}px;width:${w * c}px;height:${h * c}px;grid-template-columns:repeat(${w},${c}px);grid-template-rows:repeat(${h},${c}px)`;
        p.m.flat().forEach((v) => {
            const q = document.createElement('i');
            q.className = 'board__cell' + (v ? '' : ' board__cell--wall');
            el.append(q);
        });
        b.append(el);
    }
    const canAct = !mpRoomCode || mpRoomData?.game?.turnUid === mpUid;
    const hasMoves = canAct && !state.finished && state.hand.length > 0 && canPlayAny();
    if (hand) renderHand(canAct);
    $('#deckcount').textContent = state.deck.length;
    $('#openCount').textContent = opens();
    $('#turnCount').textContent = state.turnCount;
    $('#exchange').disabled = state.finished || !canAct || state.hand.length === 0 || hasMoves;
    $('#zoomLevel').textContent = Math.round((cellSize / zoomBase) * 100) + '%';
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
    boardTargets = [];
    hovered = null;
    boardCanAct = canAct;
    $('#board').classList.remove('board--pointing');
    if (state.selected >= 0 && state.hand[state.selected] && !state.finished && canAct) {
        const ghost = document.createElement('div');
        ghost.className = 'board__piece board__piece--ghost hidden';
        ghost.dataset.ghost = '';
        b.append(ghost);
        const pinOffset = pinOffsetsFor(legalByRotation);
        for (let r = 0; r < legalByRotation.length; r++) {
            const { m, w: mw, h: mh, spots } = legalByRotation[r];
            for (const [sx, sy] of spots) {
                const [ox, oy] = pinOffset(r, sx, sy),
                    left = padX + (sx - minX) * c,
                    top = padY + (sy - minY) * c,
                    pin = document.createElement('span');
                // The pin only marks the spot: the board picks the placement under the cursor (targetAt()).
                pin.className = 'board__pin board__pin--' + r;
                pin.setAttribute('aria-hidden', 'true');
                pin.dataset.spot = sx + ',' + sy + ',' + r;
                pin.style.cssText =
                    'left:' + (left + (mw * c) / 2 - 20 + ox) + 'px;top:' + (top + (mh * c) / 2 - 20 + oy) + 'px';
                const show = () => {
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
                    ghost.style.left = left + 'px';
                    ghost.style.top = top + 'px';
                };
                const target = { spot: pin.dataset.spot, x: sx, y: sy, r, m, pin, show, ghost };
                // The card's box and its pin centre, in px of the board.
                Object.assign(target, { left, top, w: mw * c, h: mh * c });
                Object.assign(target, { px: left + (mw * c) / 2 + ox, py: top + (mh * c) / 2 + oy });
                if (
                    state.placementPreview &&
                    state.placementPreview.x === sx &&
                    state.placementPreview.y === sy &&
                    state.placementPreview.r === r
                ) {
                    show();
                    pin.classList.add('board__pin--preview');
                    target.previewed = true;
                }
                boardTargets.push(target);
                b.append(pin);
            }
        }
        // The card changed under a resting cursor: its preview follows the cursor at once.
        if (!state.placementPreview) hoverTarget(targetAt(cursor));
    }
    if (camera) {
        camera.scrollLeft = scrollLeft;
        camera.scrollTop = scrollTop;
    }
    requestAnimationFrame(() => {
        if (camera) {
            camera.scrollLeft = scrollLeft;
            camera.scrollTop = scrollTop;
        }
    });
}

// Card ids of the last rendered hand: a card missing there has just been drawn and plays the deal animation once.
let shownHandIds = [],
    // The card selected at the last render: a change of the selection slides the cards up and down once.
    shownSelectedId = null;
// Each card in the hand lies at 0° or 180°, chosen at random once per card id, so a rebuild keeps it.
const handFlips = new Map();
function handFlip(id) {
    if (!handFlips.has(id)) handFlips.set(id, Math.random() < 0.5 ? 0 : 2);
    return handFlips.get(id);
}
// The hand is rebuilt separately from the board: zooming re-renders only the board.
function renderHand(canAct) {
    // Cards stand upright on wide screens and lie flat in the narrow bottom sheet.
    const upright = narrowScreen() ? 0 : 1;
    // Rebuilding the hand drops focus, so a focused card gets it back after the render.
    const focusedCard = [...$('#hand').children].indexOf(document.activeElement);
    $('#hand').innerHTML = '';
    state.hand.forEach((card, i) => {
        const m = rotated(card.m, upright + handFlip(card.id)),
            btn = document.createElement('button');
        btn.className =
            'hand-card' +
            (!shownHandIds.includes(card.id)
                ? ' hand-card--fresh'
                : i === state.selected && card.id !== shownSelectedId
                  ? ' hand-card--lifting'
                  : i !== state.selected && card.id === shownSelectedId
                    ? ' hand-card--lowering'
                    : '') +
            (i === state.selected ? ' hand-card--selected' + (state.cardPending ? ' hand-card--pending' : '') : '');
        btn.type = 'button';
        btn.disabled = state.finished || !canAct;
        const mini = document.createElement('span');
        mini.className = 'hand-card__mini';
        mini.style.cssText = `grid-template-columns:repeat(${m[0].length},var(--hand-card-size));grid-template-rows:repeat(${m.length},var(--hand-card-size))`;
        m.flat().forEach((v) => {
            const q = document.createElement('i');
            q.className = 'hand-card__cell' + (v ? '' : ' hand-card__cell--wall');
            mini.append(q);
        });
        btn.append(mini);
        btn.setAttribute('aria-label', 'Карта ' + card.id);
        // The hand is one radio group: a single tab stop (the selected card, else the first one), arrows pick a card.
        btn.setAttribute('role', 'radio');
        btn.setAttribute('aria-checked', String(i === state.selected));
        btn.tabIndex = i === (state.selected >= 0 ? state.selected : 0) ? 0 : -1;
        // Focus entering the hand from the keyboard with no card selected selects the focused card and shows its
        // spots. A mouse press focuses the card too, but the click selects it: a render here would swallow the click.
        btn.onfocus = () => {
            if (!restoringFocus && state.selected < 0 && !btn.disabled && btn.matches(':focus-visible'))
                selectCard(i, 'confirm');
        };
        btn.onclick = (e) => {
            if (btn.disabled) return;
            // A click with detail 0 comes from Enter or Space: it starts placing the card from the keyboard.
            selectCard(i, e.detail === 0 ? 'place' : undefined);
        };
        btn.dataset.cardId = card.id;
        $('#hand').append(btn);
    });
    shownHandIds = state.hand.map((card) => card.id);
    shownSelectedId = state.hand[state.selected]?.id ?? null;
    if (focusedCard >= 0) focusCard(focusedCard);
}

// The last mouse position on the screen: a render under a resting cursor previews the placement under it.
let cursor = null;
document.addEventListener(
    'pointermove',
    (e) => {
        cursor = e.pointerType === 'mouse' ? { x: e.clientX, y: e.clientY } : null;
    },
    true
);
// A cursor that left the window is not over the board any more.
document.addEventListener('pointerout', (e) => !e.relatedTarget && (cursor = null), true);
// The spot ("x,y,r") of the placement under the mouse cursor, if the cursor rests over one.
function spotAtCursor() {
    return targetAt(cursor)?.spot;
}

// Placements of the selected card drawn by the last render(): spot, card box and pin centre in px of the board.
let boardTargets = [],
    hovered = null,
    boardCanAct = false;
// The placement under a point of the screen: any point of a possible card counts, and where the cards of several
// placements overlap, the one with the pin nearest to the point wins. The point must be on the board itself,
// not under a button or the edge of the camera.
function targetAt(point) {
    if (!point || !boardTargets.length || !document.elementFromPoint(point.x, point.y)?.closest('#board')) return null;
    const box = $('#board').getBoundingClientRect(),
        x = point.x - box.left,
        y = point.y - box.top;
    let best = null,
        bestDistance = Infinity;
    for (const t of boardTargets) {
        if (x < t.left || x >= t.left + t.w || y < t.top || y >= t.top + t.h) continue;
        const distance = Math.hypot(x - t.px, y - t.py);
        if (distance < bestDistance) [best, bestDistance] = [t, distance];
    }
    return best;
}
// Hover: the ghost of the placement under the cursor and its pin lit; nothing hides the ghost unless it is a preview.
function hoverTarget(target) {
    if (target === hovered) return;
    hovered?.pin.classList.remove('board__pin--hover');
    hovered = target;
    $('#board').classList.toggle('board--pointing', !!target);
    if (target) {
        target.pin.classList.add('board__pin--hover');
        target.show();
    } else if (!state.placementPreview) boardTargets[0]?.ghost.classList.add('hidden');
}
const boardEl = $('#board');
let boardPointer = '',
    boardPointerType = '';
boardEl.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    // A drag of the camera is not a hover.
    if (panState?.moved) return hoverTarget(null);
    const target = targetAt({ x: e.clientX, y: e.clientY });
    if (state.placementPreview) {
        // Touch keeps its preview until the tap. The keyboard preview stays while the mouse is off the cards,
        // and an event without a move (Chrome repeats them after a render) is not a hover either.
        const position = e.screenX + ',' + e.screenY,
            moved = position !== boardPointer;
        boardPointer = position;
        if (!target || !moved) return;
        // A mouse hover leaves keyboard mode: hide the buttons, return focus to the selected card.
        state.placementPreview = null;
        $('#placementPreview').classList.add('hidden');
        boardTargets.find((t) => t.previewed)?.pin.classList.remove('board__pin--preview');
        state.cardPending = false;
        renderHand(boardCanAct);
        status('Выбери точку нужного цвета на поле для размещения карты.');
        focusCard(state.selected);
    }
    boardPointer = e.screenX + ',' + e.screenY;
    hoverTarget(target);
});
boardEl.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') hoverTarget(null);
});
boardEl.addEventListener('pointerdown', (e) => {
    boardPointerType = e.pointerType;
});
// A press on a placement must not take focus from the hand: the keyboard works through «Поставить» only.
boardEl.addEventListener('mousedown', (e) => {
    if (targetAt({ x: e.clientX, y: e.clientY })) e.preventDefault();
});
boardEl.addEventListener('click', (e) => {
    if (panDragged) return;
    const target = targetAt({ x: e.clientX, y: e.clientY });
    if (!target) return;
    state.rotation = target.r;
    // A mouse already previewed the card on hover, so it places at once.
    // Touch and pen have no hover: the first tap shows the preview to confirm.
    if (boardPointerType === 'mouse') {
        state.placementPreview = null;
        play(target.x, target.y, target.m);
        return;
    }
    previewAt(target.x, target.y, target.r);
});

// A pin stands at the centre of its future card. Rotations that share a centre are spread, in px of the current zoom.
// A pair goes along the long axis of its card, ±pairSpread cells from the centre. Cards lie on a 3-cell grid,
// so the closest pins of other spots are another pair 3 cells away along the axis or a card of the other
// orientation 1.5 cells away on both axes. The distances 2d, 3 − 2d and √2·(1.5 − d) are balanced at d ≈ 0.62:
// all of them are about 1.24 cells.
// 3 pins go along the long axis of the first rotation's card at quarters of its length;
// 4 pins form a rhombus: the pair in that card's orientation along its long axis, the other pair along the short
// one, at a quarter of the side — the gaps edge, pin, centre line, pin, edge are equal on both axes.
const pairSpread = 0.62;
function pinOffsetsFor(options) {
    const centre = (x, y, w, h) => x * 2 + w + ',' + (y * 2 + h),
        groups = new Map();
    options.forEach(({ w, h, spots }, r) => {
        for (const [x, y] of spots) {
            const key = centre(x, y, w, h);
            groups.set(key, [...(groups.get(key) || []), r]);
        }
    });
    return (r, x, y) => {
        const { w, h } = options[r],
            group = groups.get(centre(x, y, w, h)),
            n = group.length,
            i = group.indexOf(r);
        if (n === 1) return [0, 0];
        const first = options[group[0]],
            horizontal = first.w >= first.h,
            long = Math.max(first.w, first.h) * cellSize,
            short = Math.min(first.w, first.h) * cellSize,
            along = (axisHorizontal, shift) => (axisHorizontal ? [shift, 0] : [0, shift]);
        if (n === 2) return along(horizontal, (i ? 1 : -1) * pairSpread * cellSize);
        if (n === 3) return along(horizontal, long * ((i + 1) / 4 - 1 / 2));
        const sameOrientation = w >= h === horizontal,
            pair = group.filter((q) => options[q].w >= options[q].h === w >= h),
            sign = pair.indexOf(r) ? 1 : -1;
        return sameOrientation ? along(horizontal, (sign * long) / 4) : along(!horizontal, (sign * short) / 4);
    };
}

// Legal spots of the selected card for every rotation.
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
            spots = seen.has(key) ? [] : legalSpots(m);
        seen.add(key);
        options.push({ m, w, h, spots });
    }
    return options;
}

// All placements of the selected card in one circle, clockwise from 12 o'clock around the centre of the cards
// already on the board. Placements are grouped by the card position: groups go by the angle of the card centre
// (the nearer one first on the same line), and the pins of a group by their own angle around the same centre.
function placementCycle() {
    const minX = Math.min(...state.placed.map((p) => p.x)),
        minY = Math.min(...state.placed.map((p) => p.y)),
        maxX = Math.max(...state.placed.map((p) => p.x + dims(p.m)[0])),
        maxY = Math.max(...state.placed.map((p) => p.y + dims(p.m)[1])),
        cx = (minX + maxX) / 2,
        cy = (minY + maxY) / 2,
        clockwise = (dx, dy) => (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI);
    const cycle = [],
        options = placementOptions(),
        pinOffset = pinOffsetsFor(options);
    options.forEach(({ w, h, spots }, r) => {
        for (const [x, y] of spots) {
            const [ox, oy] = pinOffset(r, x, y),
                dx = x + w / 2 - cx,
                dy = y + h / 2 - cy,
                angle = clockwise(dx, dy),
                pinAngle = clockwise(dx + ox / cellSize, dy + oy / cellSize);
            // Pin angle relative to its group, in (-π, π], so a group at 12 o'clock does not split across 0°.
            const pinTurn = ((pinAngle - angle + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
            cycle.push({ x, y, r, angle, distance: Math.hypot(dx, dy), pinTurn });
        }
    });
    return cycle.sort((a, b) => a.angle - b.angle || a.distance - b.distance || a.pinTurn - b.pinTurn);
}

function previewAt(x, y, r) {
    const current = state.placementPreview;
    if (current && current.x === x && current.y === y && current.r === r) return;
    const cycle = placementCycle(),
        index = cycle.findIndex((p) => p.x === x && p.y === y && p.r === r);
    state.rotation = r;
    state.placementPreview = { x, y, r };
    // A preview means the card is chosen: it gets the thick outline.
    state.cardPending = false;
    status(
        'Позиция ' + (index + 1) + ' из ' + cycle.length + ', поворот ' + r * 90 + '°. Нажми «Поставить» или «Отмена».'
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

// mode 'place': start placing from the keyboard — preview at the first position, focus on «Поставить».
// mode 'confirm': the keyboard only moved to the card, Enter or Space must confirm it (only its border lights up).
// No mode: a mouse pick, the card is chosen at once.
const confirmCardMessage = 'Нажми Enter или пробел, чтобы подтвердить выбор карты.';
function selectCard(i, mode) {
    state.selected = i;
    state.rotation = 0;
    state.placementPreview = null;
    state.cardPending = mode === 'confirm';
    status(state.cardPending ? confirmCardMessage : 'Выбери точку нужного цвета на поле для размещения карты.');
    render();
    // The new pins must be on the board first: the preview starts at the pin under the cursor.
    if (mode === 'place') moveKeyboardPreview();
}

// Leaving the preview from the keyboard returns to the card, which needs a confirmation again.
function backToCard() {
    state.placementPreview = null;
    state.cardPending = true;
    status(confirmCardMessage);
    render();
    focusCard(state.selected);
}

// render() re-creates the hand, so focus is restored on the new button.
// A restored focus is not a user's choice: it must not select a card after Esc cleared the selection.
let restoringFocus = false;
function focusCard(i) {
    restoringFocus = true;
    // The hand is fixed to the bottom on phones: scrolling it into view would scroll the page under it.
    $('#hand').children[i]?.focus({ preventScroll: true });
    restoringFocus = false;
}

// Focus leaving the hand from the keyboard (Tab to the zoom buttons) drops the selection: the card goes down,
// the spots and the preview disappear. The placement buttons belong to the card and keep it. A mouse click outside
// the hand keeps it too: the card waits for a click on a spot. Re-rendering the hand and a blur
// of the window have no next element and keep the selection.
function dropSelectionOnFocusLeave(e) {
    const next = e.relatedTarget;
    if (state.selected < 0 || !next || next.closest('#hand, #placementPreview')) return;
    // The next element is focused after this event; a keyboard move gives it :focus-visible, a mouse click does not.
    setTimeout(() => {
        if (document.activeElement !== next || !next.matches(':focus-visible') || state.selected < 0) return;
        clearSelection();
    });
}
$('#hand').addEventListener('focusout', dropSelectionOnFocusLeave);
$('#placementPreview').addEventListener('focusout', dropSelectionOnFocusLeave);

function clearSelection() {
    state.selected = -1;
    state.rotation = 0;
    state.placementPreview = null;
    state.hoverSpot = null;
    state.cardPending = false;
    status('Выбери карту в руке.');
    render();
}

// Focus goes to the selected card; with none, the first card gets selected, so a new game starts with it active.
export function focusHand() {
    if (state.selected < 0) {
        const card = $('#hand').children[0];
        if (!card || card.disabled) return;
        selectCard(0, 'confirm');
    }
    focusCard(state.selected);
}

// Arrows inside the hand move the selection between the cards, wrapping around.
function moveCardSelection(key) {
    const cards = [...$('#hand').children],
        current = cards.indexOf(document.activeElement),
        step = key === 'ArrowUp' || key === 'ArrowLeft' ? -1 : 1;
    if (current < 0 || cards[current].disabled) return;
    const next = (current + step + state.hand.length) % state.hand.length;
    selectCard(next, 'confirm');
    focusCard(next);
}

// Keyboard placement walks the placement circle: ↑/← go to the previous position, ↓/→ to the next one.
function moveKeyboardPreview(key) {
    const cycle = placementCycle(),
        current = state.placementPreview;
    if (!cycle.length) return;
    const index = current ? cycle.findIndex((p) => p.x === current.x && p.y === current.y && p.r === current.r) : -1;
    // Without a preview it starts at the pin under the mouse cursor, else at the first position.
    const spot = spotAtCursor(),
        hovered = cycle.find((p) => p.x + ',' + p.y + ',' + p.r === spot);
    const step = key === 'ArrowUp' || key === 'ArrowLeft' ? -1 : 1,
        next = index < 0 ? hovered || cycle[0] : cycle[(index + step + cycle.length) % cycle.length];
    previewAt(next.x, next.y, next.r);
    revealPreview();
    $('#placementConfirm').focus();
}

$('#placementConfirm').onclick = (e) => {
    if (!state.placementPreview || state.selected < 0 || !state.hand[state.selected]) return;
    const { x, y, r } = state.placementPreview;
    const m = rotated(state.hand[state.selected].m, r);
    state.rotation = r;
    state.placementPreview = null;
    // Placed from the keyboard: focus returns to the hand, to the new card in the played card's slot.
    play(x, y, m, e.detail === 0);
};
$('#placementCancel').onclick = (e) => {
    // A click with detail 0 is Enter or Space: the keyboard goes back to the card.
    if (e.detail === 0) return backToCard();
    state.placementPreview = null;
    status('Выбери точку на поле.');
    render();
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
// 100% is a 24px cell, on narrow screens 18px; a game starts at 100%. The zoom changes the cell by 2px
// from about 50% to about 150%: 12–36px on the desktop, 8–28px (44–156%) on narrow screens.
const narrowScreen = () => window.matchMedia('(max-width:760px)').matches;
const baseCellSize = () => (narrowScreen() ? 18 : 24);
// The 100% cell the current zoom is measured against.
let zoomBase = baseCellSize(),
    cellSize = zoomBase;
const clampCell = (value) => Math.max(Math.floor(zoomBase / 4) * 2, Math.min(Math.ceil((zoomBase * 3) / 4) * 2, value));
// render() keeps the cell in the middle of the camera, so the zoom goes around the centre of the view.
function setZoom(next) {
    const value = clampCell(next);
    if (value === cellSize) return;
    cellSize = value;
    render({ hand: false });
}
$('#zoomOut').onclick = () => setZoom(cellSize - 2);
$('#zoomIn').onclick = () => setZoom(cellSize + 2);
const cameraEl = $('#camera');
let panState = null,
    // A drag of the camera ends with a click, which must not place a card.
    panDragged = false;
cameraEl.addEventListener('pointerdown', (e) => {
    if ((e.pointerType === 'mouse' && e.button !== 0) || e.target.closest('button')) return;
    panDragged = false;
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
    panDragged = panState.moved;
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
document.addEventListener('keydown', (e) => {
    if ($('#play').classList.contains('hidden') || e.altKey || e.ctrlKey || e.metaKey) return;
    if (!$('#settingsModal').classList.contains('hidden')) return;
    if (e.target.closest?.('input,textarea,select,[contenteditable="true"]')) return;
    const selectedCard = $('#hand').children[state.selected],
        arrow = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key);
    if (e.code === 'Equal' || e.code === 'NumpadAdd') {
        setZoom(cellSize + 2);
    } else if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
        setZoom(cellSize - 2);
    } else if (arrow && e.target.closest?.('#hand')) {
        e.preventDefault();
        moveCardSelection(e.key);
    } else if (['1', '2', '3'].includes(e.key)) {
        const index = Number(e.key) - 1;
        if (state.hand[index] && !state.finished && !$('#hand').children[index].disabled) {
            selectCard(index, 'place');
        }
    } else if (arrow && selectedCard && !selectedCard.disabled) {
        e.preventDefault();
        moveKeyboardPreview(e.key);
    } else if (e.key === 'Escape' && state.placementPreview) {
        backToCard();
    } else if (e.key === 'Escape' && state.selected >= 0) {
        const focused = [...$('#hand').children].indexOf(document.activeElement);
        state.selected = -1;
        render();
        focusCard(focused);
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
// keepHand: the turn came from the keyboard, so the card in the played card's slot gets selected for the next turn.
function play(x, y, m, keepHand = false) {
    // A card chosen with the keyboard keeps the keyboard in the hand even when the mouse places it.
    const keyboardHand =
        keepHand || (document.activeElement?.closest?.('#hand') && document.activeElement.matches(':focus-visible'));
    if (mpRoomCode) {
        mpPlay(x, y, m, keyboardHand);
        return;
    }
    if (state.finished || state.selected < 0 || !valid(m, x, y)) return;
    const index = state.selected,
        card = state.hand[index];
    // The drawn card takes the place of the played one, so the other cards stay where they were.
    if (state.deck.length) state.hand[index] = state.deck.pop();
    else state.hand.splice(index, 1);
    const newPiece = { id: card.id, x, y, m };
    state.placed.push(newPiece);
    state.lastPlaced = newPiece;
    state.animateLastPlacement = true;
    state.turnCount++;
    state.selected = -1;
    state.rotation = 0;
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
    // The played card's slot stays selected: with the drawn card, or, when the deck is empty and the hand
    // closed up to the left, with the card that moved into it (the last card if the slot is gone).
    // After a keyboard turn the card waits for a confirmation; after a mouse turn its spots show at once.
    // It is selected before the single render, so the render does not cut the deal animation of the new card.
    const next = state.finished ? -1 : Math.min(index, state.hand.length - 1);
    if (next >= 0) {
        state.selected = next;
        state.cardPending = keyboardHand;
        if (keyboardHand) status(confirmCardMessage);
    }
    render();
    if (next >= 0 && keyboardHand) focusCard(next);
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
