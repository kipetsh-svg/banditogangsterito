/* Settings, theme switching, and saved preferences. */
const $=s=>document.querySelector(s);
const settingsDefaults={reduceMotion:false,darkTheme:false};
function setNightTheme(enabled,animate=true){
const left=$('.bandito-corner-left'),right=$('.bandito-corner-right'),logo=$('.brand-logo');
const scene=$('#celestialScene'),shade=$('#themeShade');
const finish=()=>{
document.body.classList.toggle('dark-theme',!!enabled);
if(left)left.src=enabled?'assets/images/bandito-corner-left-night.png':'assets/images/bandito-corner-left.png';
if(right)right.src=enabled?'assets/images/bandito-corner-right-night.png':'assets/images/bandito-corner-right.png';
if(logo)logo.src=enabled?'assets/images/bandito-logo-night-512.png':'assets/images/bandito-logo.png';
if(shade)shade.classList.remove('visible');
if(scene){scene.className='celestial-scene';}
};
const currentlyNight=document.body.classList.contains('dark-theme');
if(currentlyNight===!!enabled){finish();return}
if(!animate||document.body.classList.contains('reduce-motion')||!scene||!shade){finish();return}
scene.className='celestial-scene active '+(enabled?'to-night':'to-day');
shade.classList.add('visible');
window.setTimeout(finish,1200);
}
function applySettings(animateTheme=false){
let saved={};try{saved=JSON.parse(localStorage.getItem('banditoSettings')||'{}')||{}}catch{}
const cfg={...settingsDefaults,...saved};
document.body.style.zoom='1';
document.body.classList.toggle('reduce-motion',!!cfg.reduceMotion);
const motion=$('#reduceMotion');
if(motion)motion.checked=!!cfg.reduceMotion;
const dark=$('#darkTheme');
if(dark)dark.checked=!!cfg.darkTheme;
setNightTheme(!!cfg.darkTheme,animateTheme);
}
function saveSettings(){
const cfg={reduceMotion:$('#reduceMotion').checked,darkTheme:$('#darkTheme').checked};
localStorage.setItem('banditoSettings',JSON.stringify(cfg));
applySettings(true);
}
applySettings();
