/* Settings, theme switching, and saved preferences. */
import cornerLeftDay from '../assets/images/bandito-corner-left.png';
import cornerLeftNight from '../assets/images/bandito-corner-left-night.png';
import cornerRightDay from '../assets/images/bandito-corner-right.png';
import cornerRightNight from '../assets/images/bandito-corner-right-night.png';
import logoDay from '../assets/images/bandito-logo.png';
import logoNight from '../assets/images/bandito-logo-night-512.png';

const $ = (s) => document.querySelector(s);
const settingsDefaults = { reduceMotion: false, darkTheme: false };
function setNightTheme(enabled, animate = true) {
    const left = $('#cornerLeft'),
        right = $('#cornerRight'),
        logo = $('#brandLogo');
    const scene = $('#celestialScene'),
        shade = $('#themeShade');
    const finish = () => {
        document.body.classList.toggle('dark-theme', !!enabled);
        if (left)
            left.src = enabled
                ? 'assets/images/bandito-corner-left-night.png'
                : 'assets/images/bandito-corner-left.png';
        if (right)
            right.src = enabled
                ? 'assets/images/bandito-corner-right-night.png'
                : 'assets/images/bandito-corner-right.png';
        if (logo) logo.src = enabled ? 'assets/images/bandito-logo-night-512.png' : 'assets/images/bandito-logo.png';
        if (shade) shade.classList.remove('theme-shade--visible');
        if (scene) {
            scene.className = 'celestial';
        }
    };
    const currentlyNight = document.body.classList.contains('dark-theme');
    if (currentlyNight === !!enabled) {
        finish();
        return;
    }
    if (!animate || document.body.classList.contains('reduce-motion') || !scene || !shade) {
        finish();
        return;
    }
    scene.className = 'celestial celestial--active ' + (enabled ? 'celestial--to-night' : 'celestial--to-day');
    shade.classList.add('theme-shade--visible');
    window.setTimeout(finish, 1200);
}
function applySettings(animateTheme = false) {
    let saved = {};
    try {
        saved = JSON.parse(localStorage.getItem('banditoSettings') || '{}') || {};
    } catch {}
    const cfg = { ...settingsDefaults, ...saved };
    document.body.style.zoom = '1';
    document.body.classList.toggle('reduce-motion', !!cfg.reduceMotion);
    const motion = $('#reduceMotion');
    if (motion) motion.checked = !!cfg.reduceMotion;
    const dark = $('#darkTheme');
    if (dark) dark.checked = !!cfg.darkTheme;
    setNightTheme(!!cfg.darkTheme, animateTheme);
}
function saveSettings() {
    const cfg = { reduceMotion: $('#reduceMotion').checked, darkTheme: $('#darkTheme').checked };
    localStorage.setItem('banditoSettings', JSON.stringify(cfg));
    applySettings(true);
}
applySettings();


/* Keep settings dialog controls available even if later game code fails. */
const settingsDialog = $('#settingsModal');
const openSettingsButton = $('#openSettings');
const closeSettingsButton = $('#closeSettings');
if (openSettingsButton && settingsDialog) {
    openSettingsButton.addEventListener('click', () => settingsDialog.classList.remove('hidden'));
}
if (closeSettingsButton && settingsDialog) {
    closeSettingsButton.addEventListener('click', () => settingsDialog.classList.add('hidden'));
}
if (settingsDialog) {
    settingsDialog.addEventListener('click', (event) => {
        if (event.target === settingsDialog) settingsDialog.classList.add('hidden');
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') settingsDialog.classList.add('hidden');
    });
}
