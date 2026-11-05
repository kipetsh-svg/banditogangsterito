/* Firebase, lobby UI, room presence, and cooperative game flow. */
const firebaseConfig = {
    apiKey: 'AIzaSyDCBEArE3TebFxTiaK-6Q7DxWf8GloOuUg',
    authDomain: 'bandito-83823.firebaseapp.com',
    databaseURL: 'https://bandito-83823-default-rtdb.firebaseio.com/',
    projectId: 'bandito-83823',
    storageBucket: 'bandito-83823.firebasestorage.app',
    messagingSenderId: '434862103332',
    appId: '1:434862103332:web:f470c708e8d88a4f69b1b1',
    measurementId: 'G-TTN8Z732BH',
};
let mpAuth = null,
    mpDb = null,
    mpUid = null,
    mpRoomCode = null,
    mpRoomRef = null,
    mpRoomListener = null,
    mpRoomData = null,
    mpBusy = false,
    mpCelebrated = false,
    mpTimerInterval = null,
    mpPresenceRef = null,
    mpPresenceHandler = null;
const mpReadyMessage = 'Кооператив готов. Создай комнату или введи код.';
function mpMessage(t) {
    const e = $('#mpMessage');
    if (e) e.textContent = t;
}
function mpName() {
    return (localStorage.getItem('banditoPlayerName') || '').trim().slice(0, 18);
}
function mpEnsureName() {
    const input = $('#mpName');
    const value = (input?.value || '').trim().slice(0, 18);
    if (!value) {
        input?.focus();
        snackbar('Сначала введи имя — так друзья узнают тебя в комнате', 'error');
        return false;
    }
    localStorage.setItem('banditoPlayerName', value);
    if (input) input.value = value;
    return true;
}
function mpCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
}
const lobbyNameInput = $('#mpName');
if (lobbyNameInput) {
    lobbyNameInput.value = mpName();
    lobbyNameInput.addEventListener('change', async () => {
        const value = lobbyNameInput.value.trim().slice(0, 18);
        lobbyNameInput.value = value;
        localStorage.setItem('banditoPlayerName', value);
        if (mpRoomRef && mpUid) {
            try {
                await mpRoomRef.child('players/' + mpUid + '/name').set(value);
            } catch (e) {
                snackbar('Не удалось обновить имя: ' + e.message, 'error');
            }
        }
    });
}
/* Keep both states inside one fixed multiplayer card. */
const coopPanel = $('#coopCard'),
    lobbyPanel = $('#mpLobby');
let coopContent = null;
if (coopPanel && lobbyPanel) {
    coopContent = document.createElement('div');
    coopContent.className = 'coop__content';
    while (coopPanel.firstChild) coopContent.append(coopPanel.firstChild);
    coopPanel.append(coopContent, lobbyPanel);
}
function mpSetSoloAvailability(locked) {
    document.querySelectorAll('[data-start]').forEach((button) => {
        button.disabled = locked || !all.length;
        button.title = locked ? 'Сначала выйди из комнаты' : '';
        button.setAttribute('aria-disabled', String(locked || !all.length));
    });
}
function mpSwapPanel(showLobby) {
    const lobby = $('#mpLobby');
    if (!coopContent || !lobby) return;
    const apply = () => {
        coopContent.classList.toggle('hidden', showLobby);
        lobby.classList.toggle('hidden', !showLobby);
    };
    if (document.startViewTransition) document.startViewTransition(apply);
    else apply();
}
function mpShowLobby(room) {
    mpSetSoloAvailability(true);
    $('#menu').classList.remove('hidden');
    $('#play').classList.add('hidden');
    if ($('#mpLobby').classList.contains('hidden')) mpSwapPanel(true);
    $('#mpRoomCode').textContent = mpRoomCode;
    const nameInput = $('#mpName');
    if (nameInput && !nameInput.matches(':focus')) nameInput.value = room.players?.[mpUid]?.name || mpName();
    const players = Object.entries(room.players || {}),
        online = players.filter(([, p]) => p.online !== false).length,
        list = $('#mpPlayers');
    const playerCount = $('#mpPlayerCount');
    if (playerCount) playerCount.textContent = 'Игроки · ' + players.length + ' из 4';
    const freeSlots = $('#mpFreeSlots');
    if (freeSlots) freeSlots.textContent = String(Math.max(0, 4 - players.length));
    list.replaceChildren();
    players.forEach(([id, p], index) => {
        const row = document.createElement('div');
        row.className = 'card card--raised lobby__player' + (p.online === false ? ' lobby__player--offline' : '');
        const avatar = document.createElement('span');
        avatar.className = 'avatar';
        avatar.textContent = (p.name || 'И').trim().slice(0, 1).toUpperCase() || 'И';
        const copy = document.createElement('span');
        copy.className = 'item lobby__player-info';
        const name = document.createElement('span');
        name.className = 'item__title';
        name.textContent = p.name || 'Игрок';
        const badges = document.createElement('span');
        badges.className = 'lobby__badges';
        if (id === room.owner) {
            const badge = document.createElement('span');
            badge.className = 'badge';
            badge.textContent = 'Создатель';
            badges.append(badge);
        }
        if (id === mpUid) {
            const badge = document.createElement('span');
            badge.className = 'badge';
            badge.textContent = 'Ты';
            badges.append(badge);
        }
        const state = document.createElement('span');
        state.className = 'presence lobby__player-presence' + (p.online === false ? ' presence--offline' : '');
        const dot = document.createElement('span');
        dot.className = 'presence__dot';
        state.append(dot, p.online === false ? 'Не в сети' : 'В сети');
        const head = document.createElement('span');
        head.className = 'lobby__player-head';
        head.append(name, state);
        copy.append(head, badges);
        row.append(avatar, copy);
        list.append(row);
    });
    for (let i = players.length; i < 4; i++) {
        const slot = document.createElement('button');
        slot.className = 'lobby__player lobby__player--empty';
        slot.type = 'button';
        slot.innerHTML = '<span class="avatar avatar--empty">＋</span><span class="item__title">Пригласить игрока</span>';
        slot.addEventListener('click', () => $('#mpInvite').click());
        list.append(slot);
    }
    const startButton = $('#mpStart');
    startButton.disabled = room.owner !== mpUid;
    startButton.textContent = players.length < 2 ? 'Начать одному' : 'Начать партию (' + players.length + ' игрока)';
    startButton.classList.toggle('btn--primary', players.length >= 2);
    $('#mpExits').disabled = room.owner !== mpUid;
    $('#mpLobbyMessage').textContent =
        room.owner === mpUid
            ? players.length < 2
                ? 'Можно начать одному или пригласить друзей.'
                : 'Все готовы? Начинай партию.'
            : 'Ждём, пока создатель начнёт игру.';
}
function mpAttach(code) {
    mpRoomCode = code;
    mpRoomRef = mpDb.ref('rooms/' + code);
    if (mpRoomListener) mpRoomRef.off('value', mpRoomListener);
    mpRoomListener = (s) => {
        const room = s.val();
        if (!room) {
            snackbar('Комната больше не существует', 'error');
            leaveMultiplayer(false);
            return;
        }
        mpRoomData = room;
        if (!room.game || !room.game.started) {
            mpShowLobby(room);
            return;
        }
        if (!room.game.finished) {
            document.querySelector('[data-end-screen]')?.remove();
            mpCelebrated = false;
        }
        $('#mpLobby').classList.add('hidden');
        $('#menu').classList.add('hidden');
        $('#play').classList.remove('hidden');
        const g = room.game;
        const previouslySelected = selected >= 0 && hand[selected] ? hand[selected].id : null;
        const previousLastKey = lastPlaced ? lastPlaced.id + '@' + lastPlaced.x + ',' + lastPlaced.y : null;
        placed = g.board || [];
        lastPlaced = placed.length ? placed[placed.length - 1] : null;
        const currentLastKey = lastPlaced ? lastPlaced.id + '@' + lastPlaced.x + ',' + lastPlaced.y : null;
        animateLastPlacement =
            !!previousLastKey && !!currentLastKey && previousLastKey !== currentLastKey && (g.turnCount || 0) > 0;
        deck = g.deck || [];
        hand = (g.hands && g.hands[mpUid]) || [];
        turnCount = g.turnCount || 0;
        exits = g.exits || 6;
        finished = !!g.finished;
        if (finished) {
            if (mpTimerInterval) {
                clearInterval(mpTimerInterval);
                mpTimerInterval = null;
            }
            $('#mpTimer').classList.add('hidden');
        } else {
            $('#mpTimer').classList.remove('hidden');
            mpStartTimer(g.turnStartedAt || Date.now());
        }
        selected = previouslySelected === null ? -1 : hand.findIndex((c) => c.id === previouslySelected);
        rotation = 0;
        $('#heading').textContent = 'Bandito · кооператив · ' + (g.exits || 6) + ' выходов · ' + code;
        render();
        const current = (room.players && room.players[g.turnUid] && room.players[g.turnUid].name) || 'игрок';
        status(
            finished
                ? g.won
                    ? 'Победа! Все туннели закрыты.'
                    : 'Поражение. Карты закончились.'
                : g.turnUid === mpUid
                  ? canPlayAny()
                      ? 'Твой ход. Выбери карту.'
                      : 'Нет доступных ходов. Нажми «Сбросить карты».'
                  : 'Ходит ' + current + '. Подожди своей очереди.'
        );
        if (finished) {
            showEndScreen(!!g.won);
            if (g.won && !mpCelebrated) {
                mpCelebrated = true;
                celebrate();
            }
        }
        $('#exchange').disabled = finished || g.turnUid !== mpUid || !hand.length || canPlayAny();
    };
    mpRoomRef.on('value', mpRoomListener, (e) => snackbar('Ошибка Firebase: ' + e.message, 'error'));
    mpWatchPresence(code);
}
function mpWatchPresence(code) {
    if (mpPresenceRef && mpPresenceHandler) mpPresenceRef.off('value', mpPresenceHandler);
    mpPresenceRef = mpDb.ref('.info/connected');
    mpPresenceHandler = async (snap) => {
        if (snap.val() !== true || mpRoomCode !== code || !mpUid) return;
        const playerRef = mpDb.ref('rooms/' + code + '/players/' + mpUid);
        try {
            await playerRef.onDisconnect().update({ online: false, lastSeen: firebase.database.ServerValue.TIMESTAMP });
            await playerRef.update({ online: true, lastSeen: firebase.database.ServerValue.TIMESTAMP });
        } catch (e) {
            snackbar('Не удалось обновить статус подключения: ' + e.message, 'error');
        }
    };
    mpPresenceRef.on('value', mpPresenceHandler);
}
async function mpClearPresence(code, uid) {
    if (mpPresenceRef && mpPresenceHandler) mpPresenceRef.off('value', mpPresenceHandler);
    mpPresenceRef = null;
    mpPresenceHandler = null;
    if (code && uid && mpDb) {
        try {
            await mpDb
                .ref('rooms/' + code + '/players/' + uid)
                .onDisconnect()
                .cancel();
        } catch {}
    }
}
async function mpStartTimer(startedAt) {
    if (mpTimerInterval) clearInterval(mpTimerInterval);
    const el = $('#mpTimer');
    if (!el) return;
    const draw = () => {
        const left = Math.max(0, 60 - Math.floor((Date.now() - startedAt) / 1000));
        el.textContent = left ? '⏱ До конца хода: ' + left + ' сек.' : '⏱ Время хода истекло';
        el.classList.toggle('notice--urgent', left <= 10);
        if (left === 0 && !finished && !mpBusy) {
            const currentUid = mpRoomData?.game?.turnUid;
            if (currentUid === mpUid) {
                snackbar('Время на ход истекло — ход переходит к следующему игроку');
                mpPassTurn();
            } else if (mpRoomData?.owner === mpUid && currentUid) {
                const player = mpRoomData?.players?.[currentUid];
                if (player?.online === false || Date.now() - startedAt >= 65000) {
                    mpPassTurn(currentUid);
                }
            }
        }
    };
    draw();
    mpTimerInterval = setInterval(draw, 250);
}
async function mpPassTurn(forUid = null) {
    if (!mpRoomCode || finished || mpBusy) return;
    const currentUid = mpRoomData?.game?.turnUid;
    const targetUid = forUid || currentUid;
    if (!currentUid || (targetUid !== mpUid && mpRoomData?.owner !== mpUid)) return;
    if (targetUid !== currentUid) return;
    mpBusy = true;
    try {
        await mpRoomRef.child('game').transaction((g) => {
            if (!g || g.finished || g.turnUid !== targetUid) return;
            const ids = Object.keys(g.hands || {});
            const i = ids.indexOf(targetUid);
            g.turnUid = ids[(i + 1) % ids.length];
            g.turnCount = (g.turnCount || 0) + 1;
            g.turnStartedAt = Date.now();
            return g;
        });
    } catch (e) {
        snackbar('Ошибка пропуска хода: ' + e.message, 'error');
    } finally {
        mpBusy = false;
    }
}
async function mpEnsureAuth() {
    if (mpUid) return mpUid;
    try {
        const cred = await mpAuth.signInAnonymously();
        mpUid = cred.user.uid;
        return mpUid;
    } catch (e) {
        throw new Error(
            e.code === 'auth/operation-not-allowed'
                ? 'В Firebase включи Authentication → Sign-in method → Anonymous.'
                : e.message
        );
    }
}
async function mpCreate() {
    if (mpBusy || !mpEnsureName()) return;
    mpBusy = true;
    mpMessage('Создаю комнату…');
    try {
        await mpEnsureAuth();
        let code = mpCode();
        await mpDb.ref('rooms/' + code).set({
            owner: mpUid,
            players: { [mpUid]: { name: mpName(), online: true, joinedAt: Date.now() } },
            createdAt: Date.now(),
            game: null,
        });
        mpAttach(code);
        mpMessage('Комната создана. Отправь друзьям код: ' + code);
    } catch (e) {
        mpMessage(mpReadyMessage);
        snackbar('Не получилось создать комнату: ' + e.message, 'error');
    } finally {
        mpBusy = false;
    }
}
async function mpJoin() {
    if (mpBusy || !mpEnsureName()) return;
    const code = $('#mpCode').value.replace(/\s+/g, '').toUpperCase();
    $('#mpCode').value = code;
    if (!/^[A-Z0-9]{6}$/.test(code)) {
        snackbar('Код должен состоять из 6 латинских букв и цифр, например K3F9QX', 'error');
        return;
    }
    mpBusy = true;
    mpMessage('Подключаюсь к комнате…');
    let roomRef = null,
        added = false;
    try {
        await mpEnsureAuth();
        roomRef = mpDb.ref('rooms/' + code);
        await roomRef.child('players/' + mpUid).set({ name: mpName(), online: true, joinedAt: Date.now() });
        added = true;
        const snap = await roomRef.once('value');
        const room = snap.val();
        if (!room || !room.owner || !room.players || !room.players[mpUid]) {
            await roomRef.child('players/' + mpUid).remove();
            added = false;
            mpMessage(mpReadyMessage);
            snackbar(
                'Комната ' + code + ' не найдена. Проверь код или попроси создателя прислать его ещё раз',
                'error'
            );
            return;
        }
        const count = Object.keys(room.players).length;
        if (count > 4) {
            await roomRef.child('players/' + mpUid).remove();
            added = false;
            mpMessage(mpReadyMessage);
            snackbar('В комнате уже максимальное количество игроков', 'error');
            return;
        }
        if (room.game?.started && !room.game.finished) {
            await roomRef.child('players/' + mpUid).remove();
            added = false;
            mpMessage(mpReadyMessage);
            snackbar('В этой комнате уже идёт партия. Подключиться можно после её завершения', 'error');
            return;
        }
        mpAttach(code);
        mpMessage('Ты в комнате ' + code);
    } catch (e) {
        if (added && roomRef) {
            try {
                await roomRef.child('players/' + mpUid).remove();
            } catch {}
        }
        mpMessage(mpReadyMessage);
        snackbar('Не удалось войти: ' + e.message, 'error');
    } finally {
        mpBusy = false;
    }
}
async function mpStart() {
    if (!mpRoomCode || mpRoomData?.owner !== mpUid) return;
    mpCelebrated = false;
    animateLastPlacement = false;
    const chosen = $('#mpExits').value;
    const n = chosen === '2' ? 2 : chosen === '5' ? 5 : 6;
    const startId = { 2: 75, 5: 72, 6: 71 }[n];
    const s = all.find((c) => c.id === startId);
    if (!s) {
        snackbar('Стартовая карта не найдена в колоде', 'error');
        return;
    }
    const players = Object.keys(mpRoomData.players || {});
    const cards = shuffle(
        all.filter((c) => c.kind === 'tunnel' && c.id !== s.id).map((c) => ({ id: c.id, m: clone(c.matrix) }))
    );
    const hands = {};
    players.forEach((id) => (hands[id] = cards.splice(0, 3)));
    const game = {
        started: true,
        exits: n,
        startCardId: s.id,
        board: [{ id: s.id, x: 0, y: 0, m: clone(s.matrix) }],
        deck: cards,
        hands,
        turnUid: players[0],
        turnCount: 0,
        turnStartedAt: Date.now(),
        finished: false,
        won: false,
    };
    try {
        await mpRoomRef.child('game').set(game);
    } catch (e) {
        snackbar('Не удалось начать: ' + e.message, 'error');
    }
}
async function mpPlay(x, y, m) {
    if (!mpRoomCode || finished || selected < 0 || mpBusy) return;
    if (mpRoomData?.game?.turnUid !== mpUid) {
        snackbar('Сейчас ход другого игрока', 'error');
        return;
    }
    mpBusy = true;
    try {
        const card = hand[selected];
        const result = await mpRoomRef.child('game').transaction((g) => {
            if (!g || g.finished || g.turnUid !== mpUid) return;
            const own = (g.hands && g.hands[mpUid]) || [];
            const idx = own.findIndex((c) => c.id === card.id);
            if (idx < 0) return;
            placed = g.board || [];
            if (!valid(m, x, y)) return;
            const board = g.board.slice();
            board.push({ id: card.id, x, y, m });
            own.splice(idx, 1);
            const pile = g.deck || [];
            if (pile.length) own.push(pile.pop());
            g.board = board;
            g.deck = pile;
            g.hands[mpUid] = own;
            g.turnCount = (g.turnCount || 0) + 1;
            g.turnStartedAt = Date.now();
            const oldPlaced = placed;
            placed = board;
            const open = opens();
            placed = oldPlaced;
            if (open === 0) {
                g.finished = true;
                g.won = true;
            } else if (!pile.length && Object.values(g.hands || {}).every((a) => !a.length)) {
                g.finished = true;
                g.won = false;
            } else {
                const ids = Object.keys(g.hands || {});
                const i = ids.indexOf(mpUid);
                g.turnUid = ids[(i + 1) % ids.length];
            }
            return g;
        });
        if (!result.committed) snackbar('Ход не принят: возможно, очередь уже перешла другому игроку', 'error');
    } catch (e) {
        snackbar('Ошибка хода: ' + e.message, 'error');
    } finally {
        mpBusy = false;
    }
}
async function mpExchange() {
    if (!mpRoomCode || finished || mpBusy || mpRoomData?.game?.turnUid !== mpUid) return;
    if (canPlayAny()) {
        snackbar('Сброс карт возможен только если нет доступных ходов', 'error');
        return;
    }
    mpBusy = true;
    try {
        await mpRoomRef.child('game').transaction((g) => {
            if (!g || g.finished || g.turnUid !== mpUid) return;
            const own = (g.hands && g.hands[mpUid]) || [];
            if (!own.length) return;
            const pile = own.concat(g.deck || []);
            const count = Math.min(own.length, pile.length);
            const newHand = [];
            for (let k = 0; k < count; k++) newHand.push(pile.pop());
            g.hands[mpUid] = newHand;
            g.deck = pile;
            const ids = Object.keys(g.hands || {});
            const i = ids.indexOf(mpUid);
            g.turnUid = ids[(i + 1) % ids.length];
            g.turnCount = (g.turnCount || 0) + 1;
            g.turnStartedAt = Date.now();
            return g;
        });
    } catch (e) {
        snackbar('Ошибка сброса: ' + e.message, 'error');
    } finally {
        mpBusy = false;
    }
}
async function leaveMultiplayer(showMenu = true) {
    const ref = mpRoomRef,
        uid = mpUid,
        listener = mpRoomListener;
    await mpClearPresence(mpRoomCode, uid);
    $('#mpTimer').classList.add('hidden');
    if (mpTimerInterval) {
        clearInterval(mpTimerInterval);
        mpTimerInterval = null;
    }
    if (ref && listener) ref.off('value', listener);
    if (ref && uid) {
        try {
            await ref.transaction((room) => {
                if (!room || !room.players || !room.players[uid]) return;
                delete room.players[uid];
                const remaining = Object.keys(room.players);
                if (!remaining.length) return null;
                if (room.owner === uid) room.owner = remaining[0];
                const game = room.game;
                if (game?.hands) delete game.hands[uid];
                if (game?.started && !game.finished) {
                    if (game.turnUid === uid) {
                        game.turnUid = remaining[0];
                        game.turnStartedAt = Date.now();
                    }
                    const noDeck = !(game.deck || []).length;
                    const noHands = Object.values(game.hands || {}).every((cards) => !cards.length);
                    if (noDeck && noHands) {
                        let openings = 0;
                        const tileAt = (x, y) => {
                            for (const p of game.board || []) {
                                const w = p.m[0].length,
                                    h = p.m.length;
                                if (x >= p.x && x < p.x + w && y >= p.y && y < p.y + h) return p.m[y - p.y][x - p.x];
                            }
                            return null;
                        };
                        for (const p of game.board || []) {
                            for (let y = 0; y < p.m.length; y++)
                                for (let x = 0; x < p.m[y].length; x++)
                                    if (p.m[y][x] === 1)
                                        for (const [dx, dy] of [
                                            [0, -1],
                                            [0, 1],
                                            [-1, 0],
                                            [1, 0],
                                        ])
                                            if (tileAt(p.x + x + dx, p.y + y + dy) === null) openings++;
                        }
                        game.finished = true;
                        game.won = openings === 0;
                    }
                }
                return room;
            });
        } catch (e) {
            snackbar('Не удалось обновить комнату при выходе: ' + e.message, 'error');
        }
    }
    mpRoomRef = null;
    mpRoomListener = null;
    mpSetSoloAvailability(false);
    mpRoomCode = null;
    mpRoomData = null;
    mpCelebrated = false;
    hand = [];
    placed = [];
    deck = [];
    selected = -1;
    $('#play').classList.add('hidden');
    mpSwapPanel(false);
    if (showMenu) $('#menu').classList.remove('hidden');
    mpMessage(mpReadyMessage);
    if (showMenu) snackbar('Ты вышел из комнаты');
}
$('#mpCreate').onclick = mpCreate;
$('#mpJoin').onclick = mpJoin;
$('#mpCode').addEventListener('input', () => {
    const input = $('#mpCode');
    input.value = input.value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6);
    $('#mpJoin').disabled = input.value.length !== 6;
});
$('#mpJoin').disabled = $('#mpCode').value.length !== 6;
$('#mpCode').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && $('#mpCode').value.length === 6) mpJoin();
});
$('#mpStart').onclick = mpStart;
$('#mpLeave').onclick = () => {
    if (confirm('Выйти из комнаты? Если ты создатель, права перейдут следующему игроку в списке.')) leaveMultiplayer();
};
async function mpInvite() {
    if (!mpRoomCode) return;
    const url = location.origin + location.pathname + '#' + mpRoomCode;
    try {
        if (navigator.share) await navigator.share({ title: 'Комната Bandito', text: 'Присоединяйся к моей партии!', url });
        else {
            await navigator.clipboard.writeText(url);
            snackbar('Ссылка-приглашение скопирована');
        }
    } catch (e) {
        if (e.name !== 'AbortError') {
            try {
                await navigator.clipboard.writeText(url);
                snackbar('Ссылка-приглашение скопирована');
            } catch {
                snackbar('Не удалось скопировать ссылку', 'error');
            }
        }
    }
}
$('#mpInvite').onclick = mpInvite;
$('#mpCopyCode').onclick = async () => {
    if (!mpRoomCode) return;
    try {
        await navigator.clipboard.writeText(mpRoomCode);
        snackbar('Код комнаты скопирован');
    } catch {
        const field = document.createElement('textarea');
        field.value = mpRoomCode;
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.append(field);
        field.select();
        try {
            document.execCommand('copy');
            snackbar('Код комнаты скопирован');
        } catch {
            snackbar('Не удалось скопировать код. Выдели его вручную', 'error');
        }
        field.remove();
    }
};
try {
    firebase.initializeApp(firebaseConfig);
    mpAuth = firebase.auth();
    mpDb = firebase.database();
    mpAuth.onAuthStateChanged((u) => {
        if (u) {
            mpUid = u.uid;
            mpMessage(mpReadyMessage);
            const invite = location.hash.slice(1).toUpperCase();
            if (/^[A-Z0-9]{6}$/.test(invite) && !mpRoomCode) {
                $('#mpCode').value = invite;
                if (confirm('Войти в комнату ' + invite + '?')) mpJoin();
            }
        } else mpMessage('Войди анонимно, чтобы играть онлайн.');
    });
} catch (e) {
    mpMessage('Firebase не загрузился: ' + e.message);
}
