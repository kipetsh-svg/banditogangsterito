/* Single-player rules, board rendering, controls, and end screens. */
let all=[],deck=[],hand=[],placed=[],selected=-1,rotation=0,finished=false,exits=6,turnCount=0,hoverSpot=null,lastPlaced=null,animateLastPlacement=false;const defaultStats={games:0,wins:0,losses:0,best:null};let playerStats={...defaultStats,...(()=>{try{return JSON.parse(localStorage.getItem('banditoStats')||localStorage.getItem('bandidoStats')||'{}')||{}}catch{return {}}})()};function saveStats(){localStorage.setItem('banditoStats',JSON.stringify(playerStats));updateStats()}function updateStats(){const set=(id,v)=>{const el=$('#'+id);if(el)el.textContent=v};set('menuGames',playerStats.games);set('menuWins',playerStats.wins);set('menuLosses',playerStats.losses);set('menuBest',playerStats.best??'—');set('gameWins',playerStats.wins);set('turnCount',turnCount)}function finishGame(won){if(finished)return;finished=true;playerStats.games++;if(won){playerStats.wins++;if(playerStats.best===null||turnCount<playerStats.best)playerStats.best=turnCount}else playerStats.losses++;saveStats()}const clone=m=>m.map(r=>r.slice());function rot(m){let h=m.length,w=m[0].length,o=Array.from({length:w},()=>Array(h));for(let y=0;y<h;y++)for(let x=0;x<w;x++)o[x][h-1-y]=m[y][x];return o}function dims(m){return[m[0].length,m.length]}function edges(m){return{top:m[0],bottom:m[m.length-1],left:m.map(r=>r[0]),right:m.map(r=>r[r.length-1])}}function at(x,y){return placed.find(p=>p.x===x&&p.y===y)}
let boardIndex=null,indexedBoard=null,indexedBoardLength=-1;
function ensureBoardIndex(){
if(boardIndex&&indexedBoard===placed&&indexedBoardLength===placed.length)return boardIndex;
const index=new Map();
for(const p of placed)for(let y=0;y<p.m.length;y++)for(let x=0;x<p.m[y].length;x++)index.set((p.x+x)+','+(p.y+y),p.m[y][x]);
boardIndex=index;indexedBoard=placed;indexedBoardLength=placed.length;return index
}
function cellAt(gx,gy){const value=ensureBoardIndex().get(gx+','+gy);return value===undefined?null:value}
function valid(m,x,y){
const [w,h]=dims(m),index=ensureBoardIndex();let connected=false;
for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){
if(index.has((x+xx)+','+(y+yy)))return false;
const value=m[yy][xx];
for(const [dx,dy] of [[0,-1],[0,1],[-1,0],[1,0]]){
const adjacent=index.get((x+xx+dx)+','+(y+yy+dy));
if(adjacent===undefined)continue;
if(adjacent!==value)return false;
if(adjacent===1&&value===1)connected=true
}
}
return connected
}function shuffle(a){for(let i=a.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}function draw(){while(hand.length<3&&deck.length)hand.push(deck.pop())}function status(t,k=''){ $('#status').textContent=t;$('#status').className='status '+k}function opens(){let n=0;for(const p of placed){const [w,h]=dims(p.m);for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)if(p.m[yy][xx]===1)for(const [dx,dy] of [[0,-1],[0,1],[-1,0],[1,0]])if(cellAt(p.x+xx+dx,p.y+yy+dy)===null)n++}return n}function begin(n){if(!all.length)return;if(mpTimerInterval){clearInterval(mpTimerInterval);mpTimerInterval=null}$('#mpTimer').style.display='none';exits=n;let s=all.find(c=>c.id===(n===2?75:n===6?71:72));deck=shuffle(all.filter(c=>c.kind==='tunnel').map(c=>({id:c.id,m:clone(c.matrix)})));hand=[];placed=[{id:s.id,x:0,y:0,m:clone(s.matrix)}];lastPlaced=null;animateLastPlacement=false;selected=-1;rotation=0;finished=false;turnCount=0;hoverSpot=null;draw();$('#menu').classList.add('hidden');$('#play').classList.remove('hidden');$('#heading').textContent=n===2?'Bandito · лёгкая партия':'Bandito · '+n+' выходов';status('Выбери карту в руке.');render()}function rotated(m,r){let a=clone(m);for(let i=0;i<r;i++)a=rot(a);return a}function legalSpots(m){
const [w,h]=dims(m),candidates=new Set();
for(const p of placed)for(let py=0;py<p.m.length;py++)for(let px=0;px<p.m[py].length;px++){
if(p.m[py][px]!==1)continue;
for(const [dx,dy] of [[0,-1],[0,1],[-1,0],[1,0]])for(let y=0;y<h;y++)for(let x=0;x<w;x++){
if(m[y][x]!==1)continue;
candidates.add((p.x+px+dx-x)+','+(p.y+py+dy-y))
}
}
const spots=[];
for(const key of candidates){const comma=key.indexOf(','),x=Number(key.slice(0,comma)),y=Number(key.slice(comma+1));if(valid(m,x,y))spots.push([x,y])}
return spots
}function bestRotation(m){let best=0,count=-1;for(let r=0;r<4;r++){let n=legalSpots(rotated(m,r)).length;if(n>count){count=n;best=r}}return best}function canPlayAny(){return hand.some(card=>[0,1,2,3].some(r=>legalSpots(rotated(card.m,r)).length>0))}function render(){
const camera=$('#camera'),savedLeft=camera?.scrollLeft||0,savedTop=camera?.scrollTop||0;
if(selected>=hand.length)selected=-1;if(finished)selected=-1;
let minX=Math.min(...placed.map(p=>p.x)),minY=Math.min(...placed.map(p=>p.y)),maxX=Math.max(...placed.map(p=>p.x+dims(p.m)[0])),maxY=Math.max(...placed.map(p=>p.y+dims(p.m)[1]));
const legalByRotation=[];
if(selected>=0&&hand[selected]){
for(let r=0;r<4;r++){
const m=rotated(hand[selected].m,r),[w,h]=dims(m),spots=legalSpots(m);
legalByRotation.push({m,w,h,spots});
for(const [x,y] of spots){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x+w);maxY=Math.max(maxY,y+h)}
}
}
const c=cellSize,pad=36,b=$('#board');b.innerHTML='';b.style.width=(maxX-minX)*c+pad*2+'px';b.style.height=(maxY-minY)*c+pad*2+'px';
for(const p of placed){const [w,h]=dims(p.m),el=document.createElement('div');const isLatest=!!lastPlaced&&p.id===lastPlaced.id&&p.x===lastPlaced.x&&p.y===lastPlaced.y;const highlightLatest=!!mpRoomCode&&isLatest;const animateThis=isLatest&&animateLastPlacement;el.className='piece'+(highlightLatest?' latest':'')+(animateThis?' fresh':'');if(animateThis)animateLastPlacement=false;el.style.cssText=`left:${pad+(p.x-minX)*c}px;top:${pad+(p.y-minY)*c}px;width:${w*c}px;height:${h*c}px;grid-template-columns:repeat(${w},${c}px);grid-template-rows:repeat(${h},${c}px)`;p.m.flat().forEach(v=>{const q=document.createElement('i');q.className='pixel'+(v?'':' wall');el.append(q)});b.append(el)}
$('#hand').innerHTML='';const canAct=!mpRoomCode||mpRoomData?.game?.turnUid===mpUid;
hand.forEach((card,i)=>{const m=rotated(card.m,i===selected?rotation:0),btn=document.createElement('button');btn.className='handcard'+(i===selected?' selected':'');btn.type='button';btn.disabled=finished||!canAct;const mini=document.createElement('span');mini.className='mini';mini.style.cssText=`grid-template-columns:repeat(${m[0].length},7px);grid-template-rows:repeat(${m.length},7px)`;m.flat().forEach(v=>{const q=document.createElement('i');if(!v)q.className='wall';mini.append(q)});btn.append(mini);const label=document.createElement('small');label.textContent='Карта '+card.id;btn.append(label);btn.setAttribute('aria-pressed',String(i===selected));btn.onclick=()=>{if(btn.disabled)return;selected=i;rotation=0;status('Выбери подсвеченную точку на поле. Кнопка «Повернуть» меняет ориентацию карты.');render()};$('#hand').append(btn)});
$('#deckcount').textContent=deck.length;$('#openCount').textContent=opens();$('#turnCount').textContent=turnCount;$('#exchange').disabled=finished||!canAct||hand.length===0;$('#zoomReset').textContent=Math.round(cellSize/18*100)+'%';
if(selected>=0&&hand[selected]&&!finished&&canAct){
const ghost=document.createElement('div');ghost.className='piece';ghost.style.cssText='display:none;opacity:.62;pointer-events:none;border:1px dashed #64735f;z-index:5;left:0;top:0';b.append(ghost);
const offsets=[[-17,-17],[17,-17],[17,17],[-17,17]];
for(let r=0;r<legalByRotation.length;r++){
const {m,w:mw,h:mh,spots}=legalByRotation[r];
for(const [sx,sy] of spots){
const pin=document.createElement('button');pin.className='place-pin angle-'+r;pin.type='button';pin.title='Поставить карту · '+(r*90)+'°';pin.setAttribute('aria-label','Поставить карту, поворот '+(r*90)+' градусов, позиция '+sx+', '+sy);
pin.style.cssText='position:absolute;z-index:7;left:'+(pad+(sx-minX)*c+mw*c/2-16+offsets[r][0])+'px;top:'+(pad+(sy-minY)*c+mh*c/2-16+offsets[r][1])+'px';
pin.onmouseenter=()=>{
ghost.innerHTML='';ghost.style.width=(mw*c)+'px';ghost.style.height=(mh*c)+'px';
ghost.style.gridTemplateColumns='repeat('+mw+','+c+'px)';ghost.style.gridTemplateRows='repeat('+mh+','+c+'px)';
m.flat().forEach(v=>{const q=document.createElement('i');q.className='pixel'+(v?'':' wall');ghost.append(q)});
ghost.style.display='grid';ghost.style.left=(pad+(sx-minX)*c)+'px';ghost.style.top=(pad+(sy-minY)*c)+'px'
};
pin.onmouseleave=()=>{ghost.style.display='none'};
pin.onclick=e=>{e.stopPropagation();rotation=r;play(sx,sy,m)};
b.append(pin)
}
}
}
requestAnimationFrame(()=>{if(camera){camera.scrollLeft=savedLeft;camera.scrollTop=savedTop}})
}

const defaultCellSize=()=>window.matchMedia('(max-width:760px)').matches?16:18;let cellSize=defaultCellSize();
function setZoom(next){const value=Math.max(12,Math.min(30,next));if(value===cellSize)return;const camera=$('#camera'),ratio=value/cellSize,cx=camera.scrollLeft+camera.clientWidth/2,cy=camera.scrollTop+camera.clientHeight/2;cellSize=value;render();requestAnimationFrame(()=>{camera.scrollLeft=Math.max(0,cx*ratio-camera.clientWidth/2);camera.scrollTop=Math.max(0,cy*ratio-camera.clientHeight/2)})}
$('#zoomOut').onclick=()=>setZoom(cellSize-2);$('#zoomIn').onclick=()=>setZoom(cellSize+2);$('#zoomReset').onclick=()=>setZoom(defaultCellSize());
const cameraEl=$('#camera');let panState=null;
cameraEl.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.button!==0||e.target.closest('button'))return;panState={id:e.pointerId,x:e.clientX,y:e.clientY,left:cameraEl.scrollLeft,top:cameraEl.scrollTop,moved:false}});
cameraEl.addEventListener('pointermove',e=>{if(!panState||panState.id!==e.pointerId)return;const dx=e.clientX-panState.x,dy=e.clientY-panState.y;if(!panState.moved&&Math.hypot(dx,dy)>5){panState.moved=true;cameraEl.classList.add('dragging');cameraEl.setPointerCapture(e.pointerId)}if(panState.moved){cameraEl.scrollLeft=panState.left-dx;cameraEl.scrollTop=panState.top-dy}});
function endPan(e){if(!panState||panState.id!==e.pointerId)return;cameraEl.classList.remove('dragging');panState=null}
cameraEl.addEventListener('pointerup',endPan);cameraEl.addEventListener('pointercancel',endPan);
cameraEl.addEventListener('wheel',e=>{if(!e.ctrlKey)return;e.preventDefault();setZoom(cellSize+(e.deltaY<0?2:-2))},{passive:false});
document.addEventListener('keydown',e=>{if($('#play').classList.contains('hidden')||e.altKey||e.ctrlKey||e.metaKey)return;if(e.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;if(['1','2','3'].includes(e.key)){const index=Number(e.key)-1;if(hand[index]&&!finished&&!$('#hand').children[index].disabled)$('#hand').children[index].click()}else if(e.key==='Escape'&&selected>=0){selected=-1;render()}});
function showEndScreen(won){if(document.querySelector('.end-screen'))return;const layer=document.createElement('div');layer.className='end-screen '+(won?'win':'lose');const multi=!!mpRoomCode,host=multi&&mpRoomData?.owner===mpUid;const difficulty=mpRoomData?.game?.exits||6;layer.innerHTML='<div class="end-card"><div class="end-mark">'+(won?'✓':'×')+'</div><h2 class="end-title">'+(won?'Победа!':'Поражение')+'</h2><p class="end-subtitle">'+(won?'Все туннели закрыты. Бандито пойман!':'Карты закончились, но выходы ещё остались.')+'</p>'+(multi?(host?'<label class="rematch-choice">Сложность реванша <select data-end="difficulty"><option value="2">2 выхода</option><option value="5">5 выходов</option><option value="6">6 выходов</option></select></label>':'<p class="end-subtitle">Ожидаем, пока создатель комнаты начнёт реванш.</p>'):'')+'<div class="end-actions">'+(multi?(host?'<button class="primary" data-end="rematch">Реванш</button>':'<button class="primary" disabled>Ждём реванша…</button>'):'<button class="primary" data-end="menu">В меню</button><button data-end="close">Посмотреть поле</button>')+(multi?'<button data-end="leave">Выйти из комнаты</button>':'')+'</div></div>';document.body.append(layer);const select=layer.querySelector('[data-end="difficulty"]');if(select)select.value=String(difficulty);const rematch=layer.querySelector('[data-end="rematch"]');if(rematch)rematch.onclick=()=>{const choice=select.value;$('#mpExits').value=choice;layer.remove();mpStart()};const menu=layer.querySelector('[data-end="menu"]');if(menu)menu.onclick=()=>{$('#newgame').click();layer.remove()};const close=layer.querySelector('[data-end="close"]');if(close)close.onclick=()=>layer.remove();const leave=layer.querySelector('[data-end="leave"]');if(leave)leave.onclick=()=>leaveMultiplayer()}
function celebrate(){const layer=document.createElement('div');layer.className='confetti-layer';layer.setAttribute('aria-hidden','true');for(const cls of ['confetti-ring','confetti-ring second']){const ring=document.createElement('i');ring.className=cls;layer.append(ring)}const colors=['#e6b85c','#718568','#d98272','#8b83b7','#6b9caf','#e8d9a8','#f08a5d'];for(let burst=0;burst<3;burst++){const group=document.createElement('div');group.className='confetti-burst';group.style.transform='translate('+((burst-1)*2)+'px,'+((burst-1)*-9)+'px)';for(let i=0;i<85;i++){const bit=document.createElement('i'),angle=Math.random()*Math.PI*2,speed=100+Math.random()*260;bit.className='confetti-bit'+(i%5===0?' circle':i%7===0?' ribbon':'');bit.style.background=colors[Math.floor(Math.random()*colors.length)];bit.style.setProperty('--dx',(Math.cos(angle)*speed)+'px');bit.style.setProperty('--dy',(Math.sin(angle)*speed)+'px');bit.style.setProperty('--duration',(0.65+Math.random()*0.45)+'s');bit.style.setProperty('--delay',(burst*.18+Math.random()*.12)+'s');bit.style.setProperty('--turn',(Math.random()*1100-550)+'deg');group.append(bit)}layer.append(group)}document.body.append(layer);setTimeout(()=>layer.remove(),1800)}
function play(x,y,m){if(mpRoomCode){mpPlay(x,y,m);return}if(finished||selected<0||!valid(m,x,y))return;let card=hand.splice(selected,1)[0];const newPiece={id:card.id,x,y,m};placed.push(newPiece);lastPlaced=newPiece;animateLastPlacement=true;turnCount++;selected=-1;rotation=0;draw();let n=opens();if(n===0){finishGame(true);status('Победа! Все туннели закрыты.','win');showEndScreen(true);celebrate()}else if(!deck.length&&!hand.length){finishGame(false);status('Поражение. Карты закончились, выходы остались.','lose');showEndScreen(false)}else status('Карта размещена.');render()}$('#exchange').onclick=()=>{if(mpRoomCode){mpExchange();return}if(finished||!hand.length)return;const count=hand.length;hand.forEach(c=>deck.unshift(c));hand=[];draw();selected=-1;rotation=0;hoverSpot=null;status('Тестовый сброс: '+count+' карт возвращены под низ колоды, взяты новые.');render()};$('#newgame').onclick=()=>{if(mpRoomCode){leaveMultiplayer();return}$('#play').classList.add('hidden');$('#menu').classList.remove('hidden')};document.querySelectorAll('[data-start]').forEach(b=>b.onclick=()=>begin(+b.dataset.start));updateStats();fetch('./resources/bandido-matrices/cards.json').then(r=>{if(!r.ok)throw Error('Ошибка загрузки колоды');return r.json()}).then(d=>{all=d.cards.filter(c=>c.matrix);document.querySelectorAll('[data-start]').forEach(b=>b.disabled=false);$('#loadstate').textContent='Колода загружена. Можно начинать.'}).catch(e=>{$('#loadstate').textContent='Не удалось загрузить колоду: '+e.message+'. Обнови страницу.';document.querySelectorAll('[data-start]').forEach(b=>b.disabled=true)});

$('#openSettings').onclick=()=>$('#settingsModal').classList.remove('hidden');
$('#closeSettings').onclick=()=>$('#settingsModal').classList.add('hidden');
$('#settingsModal').addEventListener('click',e=>{if(e.target.id==='settingsModal')$('#settingsModal').classList.add('hidden')});
$('#reduceMotion').addEventListener('change',saveSettings);
$('#darkTheme').addEventListener('change',saveSettings);
$('#resetSettings').onclick=()=>{localStorage.removeItem('banditoSettings');applySettings()};
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('#settingsModal').classList.add('hidden')});
