/* One-off notifications that hide on their own. Persistent hints stay in the page markup. */
let snackbarTimer = null;
function snackbar(text, kind = '') {
    const el = document.getElementById('snackbar');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('snackbar--error', kind === 'error');
    el.classList.add('snackbar--visible');
    clearTimeout(snackbarTimer);
    snackbarTimer = setTimeout(() => el.classList.remove('snackbar--visible'), kind === 'error' ? 5000 : 3000);
}
