'use strict';
(function(){
const canvas=document.getElementById('c');
const err=document.getElementById('error');
if(!canvas?.getContext){err.classList.add('visible');return;}
let ctx;try{ctx=canvas.getContext('2d');if(!ctx)throw 0;}catch(_){err.classList.add('visible');return;}
ctx.imageSmoothingEnabled=true;
ctx.imageSmoothingQuality='high';

const ARENA={w:18,h:32};
/* Река и мосты в логических координатах (как на арене) */
const RIVER_Y0=15.1, RIVER_Y1=16.9;
const BRIDGE_XS=[ARENA.w*0.18, ARENA.w*0.82];
const BRIDGE_HALF=1.35;
const KILLS_PER_DEF=8;
const KILLS_PER_DEF_AI=10;
const MAX_DEF_TOWERS=2;
const FOCUS_MAX_DIST=14;
let respawns=[]; // отложенный респаун Кощея
let curseZones=[]; // проклятия Бабы-Яги

let W=0,H=0, field={x:0,y:0,w:0,h:0};
let state='menu';
let difficulty='easy';
let timeLeft=MATCH_TIME;
let elixirMe=ELIXIR_START_MAX, elixirAi=ELIXIR_START_MAX;
let elixirCap=ELIXIR_HARD_MAX;
let wave=1;
let waveT=WAVE_DURATION;
let prepT=0; // подготовка в начале боя
let doubleElixir=false;
let elixirWasteCd=0;
let doubleElixirAnnounced=false;
let deckMe=[], deckAi=[], handMe=[], handAi=[], nextMe=0, nextAi=0;
let selectedCard=null;
let units=[], buildings=[], projectiles=[], fx=[];
let towers=[];
let crownsMe=0, crownsAi=0;
let killsMe=0, killsAi=0;
let defCharges=0, placeDefMode=false;
let focusTarget=null; // {kind,ref} ручной фокус ЛКМ
let dragGhost=null;
let hoverTipUnit=null;
let timeSlow=0;
let bannerT=0;
let ambientT=0;
let lastTs=0;
let lastDrawDt=0.016;
let matchOver=false;
let tournament=null;
let stats={wins:0, battles:0, spells:0};
let aiTimer=1;
let hand3d=null;
let cardPlaying=false;

function load(k,d){try{return JSON.parse(localStorage.getItem(k)||JSON.stringify(d));}catch(_){return d;}}
function save(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(_){}}
let records=load('rr_records',[]);
let cardLevels=load('rr_levels',{});
let quests=load('rr_quests',null);
DEFAULT_DECK.forEach(id=>{if(!cardLevels[id])cardLevels[id]=1;});
Object.keys(CARDS).forEach(id=>{if(!cardLevels[id])cardLevels[id]=1;});

function ensureQuests(){
  const today=new Date().toDateString();
  if(!quests||quests.day!==today){
    quests={day:today, items:[
      {id:'win2',text:'Выиграй 2 боя',need:2,prog:0,reward:50},
      {id:'troop5',text:'Выставь 5 отрядов',need:5,prog:0,reward:30},
      {id:'crown1',text:'Снеси стрелецкую башню',need:1,prog:0,reward:40}
    ]};
    save('rr_quests',quests);
  }
}
ensureQuests();

/* Синтез/файлы — см. js/audio.js (GameAudio) */
function audio(){ if(window.GameAudio) GameAudio.resume(); }
function sfxPlace(){ if(window.GameAudio){ GameAudio.play('spawn'); GameAudio.play('card_play'); } }
function sfxShot(){ if(window.GameAudio) GameAudio.play('attack_ranged'); }
function sfxHit(){ if(window.GameAudio) GameAudio.play('hit'); }
function sfxTowerDown(){ if(window.GameAudio) GameAudio.play('tower_down'); }
function sfxWin(){ if(window.GameAudio) GameAudio.play('win'); }
function sfxLose(){ if(window.GameAudio) GameAudio.play('lose'); }
function sfxHover(){ if(window.GameAudio) GameAudio.play('tap'); }
function sfxTap(){ if(window.GameAudio) GameAudio.play('tap'); }
function sfxLegendary(){ if(window.GameAudio) GameAudio.play('spawn'); }
function sfxDeny(){ if(window.GameAudio) GameAudio.play('deny'); }
function sfxElixirFull(){ if(window.GameAudio) GameAudio.play('elixir_full'); }
function sfxDeath(){ if(window.GameAudio) GameAudio.play('death'); }
function sfxAttackMelee(){ if(window.GameAudio) GameAudio.play('attack_melee'); }


function resize(){
  const vv = window.visualViewport;
  const cssW = Math.max(1, Math.round((vv && vv.width) || window.innerWidth));
  const cssH = Math.max(1, Math.round((vv && vv.height) || window.innerHeight));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  if (ctx && ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  W = cssW; H = cssH;
  if (hand3d) hand3d.resize();

  const handEl = document.getElementById('hand3d');
  const trayEl = document.getElementById('hand-tray');
  const playing = state === 'play' && !matchOver;
  let handH = 0;
  if (playing) {
    if (handEl && !handEl.classList.contains('hidden'))
      handH = Math.max(handH, handEl.getBoundingClientRect().height || 0);
    if (trayEl && !trayEl.classList.contains('hidden'))
      handH = Math.max(handH, trayEl.getBoundingClientRect().height || 0);
  }
  /* Те же отступы, что на компе — телефон = уменьшенная копия */
  const phone = cssW <= 520;
  const marginTop = phone ? 28 : 40;
  const marginBot = playing
    ? Math.max(phone ? 250 : 180, Math.round(handH + (phone ? 8 : 24)))
    : 24;
  const sidePad = phone ? 8 : 12;
  const availH = Math.max(80, H - marginTop - marginBot);
  const availW = Math.max(80, W - sidePad * 2);
  const aspect = ARENA.w / ARENA.h;
  let fw = availW, fh = fw / aspect;
  if (fh > availH) { fh = availH; fw = fh * aspect; }
  /* Телефон: поле на весь доступный экран (cam 1.0) */
  if (phone) {
    const cam = 1.0;
    fw *= cam;
    fh *= cam;
  }
  field = {
    x: (W - fw) / 2,
    y: marginTop + (availH - fh) / 2,
    w: fw,
    h: fh
  };
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', resize);
  window.visualViewport.addEventListener('scroll', resize);
}
resize();

/** Эталон ширины поля (как на компе) — юниты/башни масштабируются пропорционально. */
const BOARD_REF_W = 360;
function boardScale(){
  const raw = field.w > 0 ? field.w / BOARD_REF_W : 1;
  /* На телефоне не раздувать юнитов/башни вместе с широким полем */
  if (isPhoneView()) return Math.min(raw, 0.72);
  return raw;
}
function isPhoneView(){
  return (W > 0 ? W : window.innerWidth) <= 520;
}
/** На телефоне юниты идут медленнее — карта «длиннее». */
function phoneWalkMul(){
  return isPhoneView() ? 0.78 : 1;
}
/** Юниты: −10% везде; на компе ещё −10%; на телефоне ×0.62 затем +15%. */
function unitSizeBoost(){
  const base = 1.23 * 0.83 * 0.9;
  if (isPhoneView()) return base * 0.62 * 1.15;
  return base * 0.9;
}
/** Башни на телефоне чуть меньше. */
function phoneTowerScale(){
  return isPhoneView() ? 0.82 : 1;
}
window.phoneTowerScale = phoneTowerScale;
/** Плоская доска + лёгкий угол камеры. */
function depthScale(ly){
  const t = Math.max(0, Math.min(1, (ly || 0) / ARENA.h));
  return 1.05 - t * 0.14;
}
function toScreen(lx, ly){
  return {
    x: field.x + (lx / ARENA.w) * field.w,
    y: field.y + field.h - ((ly / ARENA.h) * field.h),
    scale: depthScale(ly) * boardScale()
  };
}
function toLogic(sx,sy){
  return{x:((sx-field.x)/field.w)*ARENA.w, y:ARENA.h-((sy-field.y)/field.h)*ARENA.h};
}
function clampPlace(x,y,side){
  x=Math.max(0.5,Math.min(ARENA.w-0.5,x));
  if(side==='me') y=Math.max(0.5,Math.min(ARENA.h/2-0.3,y));
  else y=Math.max(ARENA.h/2+0.3,Math.min(ARENA.h-0.5,y));
  return{x,y};
}
function isValidPlace(lx,ly,side,id){
  const def=CARDS[id];
  if(!def)return false;
  if(lx<0.5||lx>ARENA.w-0.5||ly<0.5||ly>ARENA.h-0.5)return false;
  if(def.type==='spell')return true;
  if(side==='me')return ly<=ARENA.h/2-0.3;
  return ly>=ARENA.h/2+0.3;
}

function makeTowers(){
  /* Clash Royale: 2 стрелецких + башня князя (неактивна до потери одной стрелецкой) */
  const S=TOWER.strelets, K=TOWER.king;
  towers=[
    {side:'me',kind:'strelets',lane:'L',lx:3.2,ly:5.2,hp:S.hp,max:S.hp,alive:true,cd:0,active:true},
    {side:'me',kind:'king',lx:9,ly:2.2,hp:K.hp,max:K.hp,alive:true,cd:0,active:false},
    {side:'me',kind:'strelets',lane:'R',lx:14.8,ly:5.2,hp:S.hp,max:S.hp,alive:true,cd:0,active:true},
    {side:'ai',kind:'strelets',lane:'L',lx:3.2,ly:26.8,hp:S.hp,max:S.hp,alive:true,cd:0,active:true},
    {side:'ai',kind:'king',lx:9,ly:29.8,hp:K.hp,max:K.hp,alive:true,cd:0,active:false},
    {side:'ai',kind:'strelets',lane:'R',lx:14.8,ly:26.8,hp:S.hp,max:S.hp,alive:true,cd:0,active:true}
  ];
}
function towerDef(t){
  if(t.kind==='king') return TOWER.king;
  if(t.kind==='strelets') return TOWER.strelets;
  return TOWER.defense;
}
/** Пробудить башню князя после потери стрелецкой */
function activatePrince(side){
  const k=towers.find(t=>t.side===side&&t.kind==='king'&&t.alive);
  if(k && !k.active){
    k.active=true;
    toast(side==='me'?'Башня князя проснулась!':'Вражеский князь вступил в бой!');
  }
}
function countDef(side){return towers.filter(t=>t.side===side&&t.kind==='defense'&&t.alive).length;}
function placeDefense(side,lx,ly){
  if(countDef(side)>=MAX_DEF_TOWERS)return false;
  const p=clampPlace(lx,ly,side);
  const d=TOWER.defense;
  towers.push({side,kind:'defense',lx:p.x,ly:p.y,hp:d.hp,max:d.hp,alive:true,cd:0.3,active:true});
  sfxPlace();
  spawnBurst(p.x,p.y);
  return true;
}
function onEnemyKilled(killerSide){
  if(killerSide==='me'){
    killsMe++;
    if(killsMe%KILLS_PER_DEF===0&&countDef('me')<MAX_DEF_TOWERS){
      defCharges++;
      toast('Вышка готова — нажми 🗼 и поставь на своей половине');
      updateHUD();
    }
  }else{
    killsAi++;
    if(killsAi%KILLS_PER_DEF_AI===0&&countDef('ai')<MAX_DEF_TOWERS){
      const x=4+Math.random()*10,y=24+Math.random()*3;
      placeDefense('ai',x,y);
      toast('Враг построил вышку!');
    }
  }
}

function lvlMul(id){const lv=cardLevels[id]||1;return 1+(lv-1)*0.08;}

function startMatch(){
  audio();
  matchOver=false;state='play';
  timeLeft=MATCH_TIME;
  crownsMe=crownsAi=0;
  killsMe=killsAi=0;defCharges=0;placeDefMode=false;focusTarget=null;
  units=[];buildings=[];projectiles=[];fx=[];respawns=[];curseZones=[];
  if(typeof particles!=='undefined') particles.clear();
  vignette=0; flashWhite=0; timeSlow=0; bannerT=0; ambientT=0; hoverTipUnit=null;
  selectedCard=null;dragGhost=null;aiTimer=1;
  hideBanner();
  doubleElixir=false; doubleElixirAnnounced=false; elixirWasteCd=0;
  makeTowers();
  if(window.GameModels) GameModels.clearAll();
  const dealtMe=dealRoleBalanced(currentDeck(),4);
  const dealtAi=dealRoleBalanced(currentDeck(),4);
  deckMe=dealtMe.deck; handMe=dealtMe.hand; nextMe=dealtMe.next;
  deckAi=dealtAi.deck; handAi=dealtAi.hand; nextAi=dealtAi.next;
  beginWave(true);
  prepT=PREP_TIME;
  cardPlaying=false;
  aiTimer=PREP_TIME+0.5;
  document.getElementById('overlay').classList.add('hidden');
  document.getElementById('overlay').classList.remove('center-mode');
  document.getElementById('hand-tray').classList.remove('hidden');
  document.getElementById('elixir-wrap').style.display='block';
  if(hand3d) hand3d.setActive(true);
  renderHand();updateHUD();
  requestAnimationFrame(()=>{ resize(); if(hand3d) hand3d.resize(); });
  toast('В бой!');
}

/** Скорость регена: 1/ELIXIR_TICK; после 2 мин матча — ×2 (Clash Royale) */
function elixirRate(){
  const elapsed=MATCH_TIME-timeLeft;
  return (elapsed>=ELIXIR_DOUBLE_AT ? 2 : 1) / ELIXIR_TICK;
}
function updateElixir(dt){
  const elapsed=MATCH_TIME-timeLeft;
  if(!doubleElixirAnnounced && elapsed>=ELIXIR_DOUBLE_AT && prepT<=0){
    doubleElixir=true; doubleElixirAnnounced=true;
    toast('Двойной эликсир!');
  }
  const r=elixirRate()*dt;
  const wasFullMe=elixirMe>=elixirCap-1e-6;
  const wasFullAi=elixirAi>=elixirCap-1e-6;
  if(elixirMe<elixirCap)elixirMe=Math.min(elixirCap,elixirMe+r);
  else if(wasFullMe){
    elixirWasteCd-=dt;
    if(elixirWasteCd<=0){ toast('Эликсир полный — трать, иначе теряешь!'); sfxElixirFull(); elixirWasteCd=5; }
  }
  if(elixirAi<elixirCap)elixirAi=Math.min(elixirCap,elixirAi+r);
}
/** Волна: темп боя; кап всегда 10, старт матча — 5 эликсира */
function beginWave(isFirst){
  elixirCap=ELIXIR_HARD_MAX;
  if(isFirst){
    wave=1;
    elixirMe=ELIXIR_START_MAX;
    elixirAi=ELIXIR_START_MAX;
  } else {
    wave++;
    toast(`Волна ${wave}!`);
  }
  waveT=WAVE_DURATION;
}
function updateWaves(dt){
  if(prepT>0) return;
  waveT-=dt;
  if(waveT<=0) beginWave(false);
}
function cardCost(id){return CARDS[id].cost;}
function canPlay(side,id){
  if(prepT>0) return false;
  return (side==='me'?elixirMe:elixirAi)>=cardCost(id)+1e-6;
}
function spendElixir(side,cost){if(side==='me')elixirMe=Math.max(0,elixirMe-cost);else elixirAi=Math.max(0,elixirAi-cost);}
function cycleCard(side,idx){
  const deck=side==='me'?deckMe:deckAi;
  if(side==='me'){handMe[idx]=deck[nextMe%deck.length];nextMe++;}
  else{handAi[idx]=deck[nextAi%deck.length];nextAi++;}
}

function spawnTroop(side,id,lx,ly,opts){
  const def=CARDS[id];if(!def||def.type!=='troop')return;
  const m=lvlMul(id);const n=(opts&&opts.count!=null)?opts.count:(def.count||1);
  const spread=n>1?0.6:0;
  for(let i=0;i<n;i++){
    const x=lx+(i-(n-1)/2)*spread, y=ly+(Math.random()-0.5)*0.2;
    const u={
      side,id,name:def.name,emoji:def.emoji,
      x,y, hp:def.hp*m, max:def.hp*m, dmg:def.dmg*m,
      speed:def.speed, baseSpeed:def.speed, range:def.range, baseRange:def.range, atkCd:def.atkCd, cd:0.2,
      target:def.target, air:!!def.air,
      role:def.role, combatRole:def.combatRole||'dps',
      primaryRole:def.primaryRole||null, secondaryRole:def.secondaryRole||null,
      taunt:!!def.taunt, siege:!!def.siege,
      aggro:def.aggro||(def.taunt?1.8:1), splash:def.splash||0,
      hypnosis:def.hypnosis||0, immortal:!!def.immortal,
      armorAtHalf:!!def.armorAtHalf, armorUsed:false, armorT:0,
      stunOnHit:def.stun||def.stunOnHit||0, stunEvery:def.stunEvery||0, airBonus:def.airBonus||1,
      charge:def.charge||0, chargeMul:def.chargeMul||1,
      charged:false, chargeBoostT:0, bridgeCommit:null,
      critEvery:def.critEvery||0, critMul:def.critMul||1.5, hitCount:0,
      firstHitCrit:!!def.firstHitCrit, firstCritMul:def.firstCritMul||1.8, firstHitUsed:false,
      deathExplode:def.deathExplode||0, smokeDeath:!!def.smokeDeath,
      markOnHit:def.markOnHit||0, markMul:def.markMul||1.2,
      auraSlow:def.auraSlow||0, auraDot:def.auraDot||0, auraR:def.auraR||0,
      auraHeal:def.auraHeal||0, auraAtk:def.auraAtk||0,
      diveMul:def.diveMul||0, diveReady:false, volley:def.volley||0,
      dmgBlock:def.dmgBlock||0, dmgReduce:def.dmgReduce||0,
      lifesteal:def.lifesteal||0, berserk:def.berserk||0,
      elixirOnKill:def.elixirOnKill||0, spawnOnKill:def.spawnOnKill||null,
      poison:def.poison||null, freezeOnHit:def.freezeOnHit||0,
      atkSpeedStack:def.atkSpeedStack||null, atkSpdStacks:0,
      hook:!!def.hook, armorIgnore:!!def.armorIgnore,
      iceBreath:def.iceBreath||null, acidBreath:def.acidBreath||null,
      chain:def.chain||0, hitMul:def.hitMul||1,
      baseAtkCd:def.atkCd,
      allyAtkBuff:def.allyAtkBuff||0, allyBuffDur:def.allyBuffDur||0,
      ult:def.ult||null, ultDmg:(def.ultDmg||0)*m, ultSlow:def.ultSlow||0,
      ultHp:def.ultHp||0, ultStun:def.ultStun||0, ultTargets:def.ultTargets||0,
      ultUsed:false, ultCd:0, artKey:def.artKey||id,
      stealthT:def.stealthSpawn||0,
      kosteyPhase:0, kosteyRevives: def.immortal?1:0, kosteyTimer:0,
      markT:0, slowT:0, stunT:0, shieldHp:0, shieldT:0, immuneCC:0,
      atkBuffMul:1, atkBuffT:0,
      spawnAlpha: (def.shadowSpawn||def.stealthSpawn)?0.15:1,
      atkTarget:null, bob:Math.random()*6, atkAnim:0,
      dead:false, dying:false, deathTimer:0, gone:false
    };
    if(def.spawnDelay) u.cd=def.spawnDelay;
    if(opts&&opts.skeletonForm){
      u.kosteyPhase=1; u.name='Кощей (скелет)'; u.hp=u.max=300*m; u.dmg=40*m;
      u.immortal=false; u.id='kostey'; u.kosteyTimer=10; u.kosteyRevives=opts.revives!=null?opts.revives:0;
    }
    if(opts&&opts.reviveKostey){
      u.kosteyPhase=0; u.kosteyRevives=0; u.immortal=true;
      u.hp=u.max*0.5;
    }
    u.char=new Character(u);
    if(opts&&opts.skeletonForm) u.char.setWeapon('scythe');
    units.push(u);
    if(window.GameModels && GameModels.arena3d) GameModels.attachUnit(u);
    if(def.shadowSpawn||def.stealthSpawn){
      const s=toScreen(x,y);
      particles.burst(s.x,s.y,{count:10,colors:['#212121','#455a64','#90a4ae'],speed:45,life:0.45,size:2});
    }
    if(def.ult==='wave'||def.battlecry==='wave') castUltWave(u);
    if(def.battlecry==='healPulse'){
      const hr=def.auraR||3;
      const from=toScreen(u.x,u.y);
      units.forEach(a=>{
        if(a.side!==u.side||a.dying)return;
        if(Math.hypot(a.x-u.x,a.y-u.y)<=hr){
          a.hp=Math.min(a.max, a.hp+(def.auraHeal||40));
          const s=toScreen(a.x,a.y);
          if(a!==u){
            spawnHealBeam(from.x, from.y-18, s.x, s.y-22);
            spawnHealMark(s.x, s.y-28);
          }
        }
      });
      spawnHealMark(from.x, from.y-32);
      fx.push({type:'spell',x:u.x,y:u.y,r:hr,life:0.35,color:'#43a047'});
    }
    if(def.spawnStun){
      const sr=def.spawnStun.r||4, st=def.spawnStun.t||1.5;
      foes(u.side).forEach(e=>{
        if(Math.hypot(e.x-u.x,e.y-u.y)<=sr && !(e.immuneCC>0))
          e.stunT=Math.max(e.stunT||0, st);
      });
      fx.push({type:'spell',x:u.x,y:u.y,r:sr,life:0.45,color:'#a1887f'});
      if(u.side==='me' && i===0) toast('Бык-топорец: топот!');
    }
    if(def.bloodRoar||def.battlecry==='bloodRoar'){
      const br=def.bloodRoar||{atk:0.15,t:5};
      units.forEach(a=>{
        if(a.side!==u.side||a.dying)return;
        a.atkBuffMul=1+(br.atk||0.15);
        a.atkBuffT=Math.max(a.atkBuffT||0, br.t||5);
      });
      fx.push({type:'spell',x:u.x,y:u.y,r:4,life:0.4,color:'#e53935'});
      if(u.side==='me' && i===0) toast('Колдун: кровавый рёв!');
    }
    if(side==='me' && UNIT_QUIPS[id] && !def.summon){
      const rar = cardRarity(def);
      const grand = (rar==='legendary'||rar==='mythic'||rar==='epic') && def.cost>=4;
      // реплика здесь; для грандиозного выхода — в legendaryEntrance
      if(!grand && (!(def.count > 1) || i === 0)) toast(def.name + ': «' + UNIT_QUIPS[id] + '»');
    }
  }
}
function spawnBuilding(side,id,lx,ly){
  const def=CARDS[id];const m=lvlMul(id);
  const b={
    side,id,name:def.name,emoji:def.emoji,
    x:lx,y:ly,hp:def.hp*m,max:def.hp*m,dmg:(def.dmg||0)*m,
    range:def.range||0,atkCd:def.atkCd,cd:0.5,life:def.life,age:0,dead:false,atkFlash:0,
    spawnId:def.spawnId||null, spawnCount:def.spawnCount||1, role:def.role,
    combatRole:def.combatRole||'siege', siege:!!def.siege,
    splash:def.splash||0, rangeAura:def.rangeAura||0,
    deathExplode:def.deathExplode||0, artKey:def.artKey||id
  };
  b.char=new Character({side,id,x:lx,y:ly});
  buildings.push(b);
}
function castSpell(side,id,lx,ly){
  const def=CARDS[id];const m=lvlMul(id);
  const r=def.radius;
  const king=towers.find(t=>t.side===side&&t.kind==='king')||{lx:ARENA.w/2, ly:side==='me'?2:ARENA.h-2};
  if(id==='fireball'){
    launchFireball(side, king.lx, king.ly, lx, ly, def.dmg*m, r, 0, def.mainMul||1);
  } else if(id==='heal'){
    const heal=def.heal*m;
    fx.push({type:'spell',x:lx,y:ly,r,life:0.55,color:'#43a047'});
    if(window.playVfx) playVfx('heal', lx, ly, {def, r, lx, ly});
    const center=toScreen(lx,ly);
    units.forEach(u=>{
      if(u.side!==side||u.dying)return;
      if(Math.hypot(u.x-lx,u.y-ly)<=r){
        u.hp=Math.min(u.max, u.hp+heal);
        u.slowT=0;
        u.stunT=0;
        const s=toScreen(u.x,u.y);
        spawnHealBeam(center.x, center.y, s.x, s.y-20);
        spawnHealMark(s.x, s.y-26);
        particles.burst(s.x,s.y,{count:5,colors:['#69f0ae','#43a047','#fff'],speed:36,life:0.4,size:2,up:-18,gravity:10});
      }
    });
  } else if(id==='shield'){
    fx.push({type:'spell',x:lx,y:ly,r,life:0.7,color:'#ffd54f'});
    units.forEach(u=>{
      if(u.side!==side||u.dying)return;
      if(Math.hypot(u.x-lx,u.y-ly)<=r){
        u.shieldHp=def.shieldHp*m;
        u.shieldT=def.shieldDur||5;
        u.immuneCC=def.shieldDur||5;
        u.slowT=0; u.stunT=0;
      }
    });
  } else if(id==='yaga'){
    vignette=0.55;
    curseZones.push({side,x:lx,y:ly,r,dmg:40*m,life:def.duration||5,tick:0,slow:def.curseSlow||0.3});
    fx.push({type:'spell',x:lx,y:ly,r,life:0.6,color:'#7e57c2'});
    const enemies=foes(side);
    for(let i=0;i<3;i++){
      const e=enemies.length?enemies[(Math.random()*enemies.length)|0]:null;
      const tx=e?e.x:lx+(Math.random()-0.5)*2;
      const ty=e?e.y:ly+(Math.random()-0.5)*2;
      launchFireball(side, king.lx, king.ly, tx, ty, 100*m, 1.2, i*0.12, 1);
    }
  } else if(id==='morozko'){
    fx.push({type:'spell',x:lx,y:ly,r,life:0.75,color:'#81d4fa'});
    fx.push({type:'frost',x:lx,y:ly,r,life:0.9});
    if(window.playVfx) playVfx('frost', lx, ly, {def, r, lx, ly});
    units.forEach(u=>{
      if(u.side===side||u.dying)return;
      if(Math.hypot(u.x-lx,u.y-ly)<=r){
        if(!(u.immuneCC>0)){ u.stunT=Math.max(u.stunT||0, def.freeze||3); u.slowT=Math.max(u.slowT||0, (def.freeze||3)+1); }
        hurtUnit(u, (def.dmg||0)*m, side);
        const s=toScreen(u.x,u.y);
        particles.burst(s.x,s.y,{count:10,colors:['#e1f5fe','#81d4fa','#fff'],speed:50,life:0.5,size:2,up:-10});
      }
    });
    buildings.forEach(b=>{
      if(b.side===side||b.dead)return;
      if(Math.hypot(b.x-lx,b.y-ly)<=r){ b.hp-=(def.dmg||0)*m*0.7; if(b.hp<=0) destroyBuilding(b); }
    });
  }
  if(side==='me'){stats.spells++;}
  sfxHit();
}
function playCard(side,handIdx,lx,ly){
  const hand=side==='me'?handMe:handAi;
  const id=hand[handIdx];if(!id)return false;
  const def=CARDS[id];
  if(!def||def.type!=='troop')return false;
  if(!canPlay(side,id))return false;
  if(side==='me'&&!isValidPlace(lx,ly,side,id)){
    sfxDeny(); toast('Только на своей половине'); return false;
  }
  const pos=clampPlace(lx,ly,side);
  spendElixir(side,def.cost);
  spawnTroop(side,id,pos.x,pos.y);
  if(side==='me') bumpQuest('troop5',1);
  cycleCard(side,handIdx);
  sfxPlace();
  const rarity=cardRarity(def);
  if(side==='me'&&(rarity==='legendary'||rarity==='mythic'||rarity==='epic')&&def.cost>=4){
    legendaryEntrance(pos.x,pos.y,def);
  } else if(side==='me'){
    spawnBurst(pos.x,pos.y);
  }
  if(side==='me'){selectedCard=null;renderHand();}
  return true;
}
function legendaryEntrance(lx,ly,def){
  /* CR: без slow-mo и вспышки экрана — лёгкий spawn + реплика */
  sfxLegendary();
  if(window.playVfx){
    playVfx('gold', lx, ly, {def, r:1.4, count:10, life:0.35});
  } else {
    const s=toScreen(lx,ly);
    particles.burst(s.x,s.y,{count:10,colors:['#ffd54f','#fff59d'],speed:60,life:0.4,size:2,up:-20});
  }
  const quip = UNIT_QUIPS[def.id];
  if(quip) toast(def.name + ': «' + quip + '»');
}
function spawnBurst(lx,ly){
  if(window.playVfx){
    playVfx('gold', lx, ly, {r:1.2, count:8, life:0.3});
    return;
  }
  const s=toScreen(lx,ly);
  particles.burst(s.x,s.y,{count:8,colors:['#ffe082','#fff'],speed:50,life:0.3,size:2,up:-18});
}

function foes(side){return units.filter(u=>u.side!==side&&!u.dead&&!u.dying&&!u.gone&&!(u.stealthT>0));}

function targetPos(tgt){
  if(!tgt)return null;
  if(tgt.kind==='unit')return{x:tgt.ref.x,y:tgt.ref.y};
  if(tgt.kind==='bld')return{x:tgt.ref.x,y:tgt.ref.y};
  return{x:tgt.ref.lx,y:tgt.ref.ly};
}
function targetAlive(tgt){
  if(!tgt)return false;
  if(tgt.kind==='unit')return tgt.ref&&!tgt.ref.dead&&tgt.ref.hp>0;
  if(tgt.kind==='bld')return tgt.ref&&!tgt.ref.dead&&tgt.ref.hp>0;
  return tgt.ref&&tgt.ref.alive;
}

/** Ближайшая цель: провокация (Taunt) заставляет бить танков поблизости */
function nearestEnemyFor(u){
  let best=null,bs=1e9;
  const allUnits=[];
  for(const e of foes(u.side)){
    if(u.target==='ground'&&e.air)continue;
    allUnits.push(e);
  }
  const tauntNear=allUnits.filter(e=>{
    if(!e.taunt) return false;
    return pathCost(u.x,u.y,e.x,e.y,!!u.air)<=10;
  });
  const pool=tauntNear.length?tauntNear:allUnits;
  for(const e of pool){
    const d=pathCost(u.x,u.y,e.x,e.y,!!u.air);
    const s=scoreByAggro(d, e.aggro||1);
    if(s<bs){bs=s;best={kind:'unit',ref:e,d};}
  }
  /* Пока есть провокация рядом — здания/башни не приоритетнее */
  if(tauntNear.length && best) return best;
  for(const b of buildings){
    if(b.side===u.side||b.dead)continue;
    const d=pathCost(u.x,u.y,b.x,b.y,!!u.air);
    const s=scoreByAggro(d, 1);
    if(s<bs){bs=s;best={kind:'bld',ref:b,d};}
  }
  for(const t of towers){
    if(t.side===u.side||!t.alive)continue;
    const d=pathCost(u.x,u.y,t.lx,t.ly,!!u.air);
    const s=d*(t.kind==='king'?0.92:0.96);
    if(s<bs){bs=s;best={kind:'tower',ref:t,d};}
  }
  return best;
}

/** Цель с учётом фокуса ЛКМ (только для стороны игрока) */
function pickTargetFor(u){
  if(u.side==='me'&&focusTarget&&targetAlive(focusTarget)){
    const p=targetPos(focusTarget);
    const d=Math.hypot(p.x-u.x,p.y-u.y);
    if(d<=FOCUS_MAX_DIST){
      if(!(u.target==='ground'&&focusTarget.kind==='unit'&&focusTarget.ref.air))
        return{...focusTarget,d};
    }
  }
  return nearestEnemyFor(u);
}

function pickFocusAt(lx,ly){
  const hitR=1.4;
  let best=null,bd=hitR;
  for(const e of foes('me')){
    const d=Math.hypot(e.x-lx,e.y-ly);
    if(d<bd){bd=d;best={kind:'unit',ref:e};}
  }
  for(const b of buildings){
    if(b.side==='me'||b.dead)continue;
    const d=Math.hypot(b.x-lx,b.y-ly);
    if(d<bd){bd=d;best={kind:'bld',ref:b};}
  }
  for(const t of towers){
    if(t.side==='me'||!t.alive)continue;
    const d=Math.hypot(t.lx-lx,t.ly-ly);
    if(d<bd+0.6){bd=d;best={kind:'tower',ref:t};}
  }
  return best;
}

function damageTower(t,dmg){
  if(!t.alive)return;
  t.hp-=dmg;
  t.hurtT=0.22;
  if(window.GameAudio) GameAudio.play('tower_hit');
  if(t.hp<=0){
    t.hp=0;t.alive=false;sfxTowerDown();
    if(focusTarget&&focusTarget.kind==='tower'&&focusTarget.ref===t)focusTarget=null;
    if(t.kind==='strelets'){
      if(t.side==='ai'){crownsMe=Math.min(3,crownsMe+1);bumpQuest('crown1',1);toast('Стрелецкая башня падёт! 👑');}
      else{crownsAi=Math.min(3,crownsAi+1);toast('Твоя стрелецкая разрушена!');}
      activatePrince(t.side);
      updateHUD();
    } else if(t.kind==='king'){
      if(t.side==='ai'){crownsMe=Math.min(3,crownsMe+1);}
      else crownsAi=Math.min(3,crownsAi+1);
      endMatch(t.side==='ai');
    }
  }
}

/** Урон по юниту с учётом щита, блока Дружинника и брони Ильи */
function hurtUnit(tgt, amount, killerSide, opts){
  if(!tgt||tgt.dying||tgt.gone)return;
  opts=opts||{};
  let dmg=amount;
  if(tgt.shieldHp>0){
    const absorb=Math.min(tgt.shieldHp, dmg);
    tgt.shieldHp-=absorb; dmg-=absorb;
  }
  if(!opts.armorIgnore){
    if(tgt.dmgBlock>0) dmg*=(1-tgt.dmgBlock);
    if(tgt.armorT>0) dmg*=0.5;
  }
  if(tgt.dmgReduce>0) dmg*=(1-tgt.dmgReduce);
  if(tgt.armorShredT>0) dmg*=(1+(tgt.armorShred||0.2));
  tgt.hp-=dmg;
  if(tgt.armorAtHalf && !tgt.armorUsed && tgt.hp>0 && tgt.hp/tgt.max<0.5){
    tgt.armorUsed=true; tgt.armorT=4;
    toast(tgt.side==='me'?'Щит Ильи!':'Враг активировал щит!');
  }
  if(tgt.hp<=0) killUnit(tgt, killerSide, opts.killer);
  else if(tgt.char) tgt.char.setAnim('hit', true);
  return dmg;
}

function deathExplosion(victim){
  if(!victim.deathExplode)return;
  const r=2.4, dmg=victim.deathExplode;
  const s=toScreen(victim.x,victim.y);
  spawnExplosion(s.x,s.y,1.35);
  foes(victim.side).forEach(e=>{
    if(Math.hypot(e.x-victim.x,e.y-victim.y)<=r) hurtUnit(e, dmg, victim.side);
  });
  buildings.forEach(b=>{
    if(b.side===victim.side||b.dead)return;
    if(Math.hypot(b.x-victim.x,b.y-victim.y)<=r){ b.hp-=dmg; if(b.hp<=0) destroyBuilding(b); }
  });
  towers.forEach(t=>{
    if(t.side===victim.side||!t.alive)return;
    if(Math.hypot(t.lx-victim.x,t.ly-victim.y)<=r) damageTower(t, dmg*0.35);
  });
}
function destroyBuilding(b){
  if(!b||b.dead)return;
  b.dead=true;
  const boom=b.deathExplode||0;
  b.deathExplode=0;
  if(boom){
    const fake={side:b.side,x:b.x,y:b.y,deathExplode:boom};
    deathExplosion(fake);
  }
  if(focusTarget&&focusTarget.kind==='bld'&&focusTarget.ref===b) focusTarget=null;
}
/** Ульты: волна Садко, удар Добрыни, молнии Перуна */
function castUltWave(u){
  if(!u||u.dying)return;
  const r=3.2, dmg=u.ultDmg||150;
  fx.push({type:'wave',x:u.x,y:u.y,r:0.4,maxR:r,life:0.55,maxLife:0.55,color:'#4fc3f7'});
  const s=toScreen(u.x,u.y);
  particles.burst(s.x,s.y,{count:22,colors:['#4fc3f7','#81d4fa','#e1f5fe'],speed:90,life:0.55,size:3,up:-15});
  foes(u.side).forEach(e=>{
    if(Math.hypot(e.x-u.x,e.y-u.y)<=r){
      hurtUnit(e, dmg, u.side);
      if(!(e.immuneCC>0)){
        e.slowT=Math.max(e.slowT||0, u.ultSlow||2);
        e.stunT=Math.max(e.stunT||0, u.ultStun||1);
      }
    }
  });
  units.forEach(a=>{
    if(a.side!==u.side||a.dying||a===u)return;
    if(Math.hypot(a.x-u.x,a.y-u.y)<=r){
      a.atkBuffMul=1+(u.allyAtkBuff||0.2);
      a.atkBuffT=Math.max(a.atkBuffT||0, u.allyBuffDur||3);
    }
  });
  buildings.forEach(b=>{
    if(b.side===u.side||b.dead)return;
    if(Math.hypot(b.x-u.x,b.y-u.y)<=r){ b.hp-=dmg*0.6; if(b.hp<=0) destroyBuilding(b); }
  });
  if(u.side==='me') toast('Садко: пляска моря!');
}
function castUltSmash(u){
  if(!u||u.ultUsed)return;
  u.ultUsed=true;
  const r=2.6, dmg=u.ultDmg||300;
  const s=toScreen(u.x,u.y);
  spawnExplosion(s.x,s.y,1.5);
  fx.push({type:'spell',x:u.x,y:u.y,r,life:0.5,color:'#ffd54f'});
  foes(u.side).forEach(e=>{
    if(Math.hypot(e.x-u.x,e.y-u.y)<=r){
      hurtUnit(e, dmg, u.side);
      if(!(e.immuneCC>0)) e.stunT=Math.max(e.stunT||0, u.ultStun||1);
    }
  });
  buildings.forEach(b=>{
    if(b.side===u.side||b.dead)return;
    if(Math.hypot(b.x-u.x,b.y-u.y)<=r){ b.hp-=dmg*0.7; if(b.hp<=0) destroyBuilding(b); }
  });
  if(u.side==='me') toast('Добрыня: сокрушение!');
}
function castUltLightning(u){
  if(!u||u.dying)return;
  const n=u.ultTargets||3, dmg=u.ultDmg||250;
  const list=foes(u.side).slice().sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y)).slice(0,n);
  list.forEach((e,i)=>{
    fx.push({type:'lightning',x0:u.x,y0:u.y-0.3,x1:e.x,y1:e.y,life:0.35+i*0.05});
    hurtUnit(e, dmg, u.side);
    const s=toScreen(e.x,e.y);
    spawnExplosion(s.x,s.y,0.7);
  });
  if(!list.length){
    const t=towers.find(t=>t.side!==u.side&&t.alive);
    if(t){
      fx.push({type:'lightning',x0:u.x,y0:u.y-0.3,x1:t.lx,y1:t.ly,life:0.4});
      damageTower(t, dmg*0.5);
    }
  }
  if(u.side==='me') toast('Перун: гром!');
}

function killUnit(victim, killerSide, killer){
  if(!victim||victim.dying||victim.gone)return;
  if(victim.immortal && victim.id==='kostey' && victim.kosteyPhase===0){
    victim.kosteyPhase=1;
    victim.hp=victim.max=Math.round(CARDS.kostey.hp*0.35)*lvlMul('kostey');
    victim.dmg=Math.round(CARDS.kostey.dmg*0.35)*lvlMul('kostey');
    victim.name='Кощей (скелет)';
    victim.emoji='💀';
    victim.dying=false; victim.dead=false;
    victim.kosteyTimer=10;
    victim.kosteyRevives=1;
    victim.immortal=false;
    if(victim.char){
      victim.char.kind='skeleton';
      victim.char.anim=new SpriteAnim(getSheets('skeleton', victim.side==='me', 'scythe', 'kostey'));
      victim.char.setAnim('idle', true);
    }
    const s=toScreen(victim.x,victim.y);
    particles.burst(s.x,s.y,{count:14,colors:['#eceff1','#90a4ae'],speed:70,life:0.5,size:2});
    toast(victim.side==='me'?'Кощей стал скелетом!':'Вражеский Кощей стал скелетом!');
    sfxHit();
    return;
  }
  deathExplosion(victim);
  victim.dying=true; victim.dead=true; victim.deathTimer=0.85;
  victim.deathSpin=(Math.random()<0.5?-1:1)*(2.5+Math.random());
  if(victim.char) victim.char.setAnim('death', true);
  const s=toScreen(victim.x,victim.y);
  if(victim.smokeDeath){
    particles.burst(s.x,s.y,{count:16,colors:['#78909c','#90a4ae','#cfd8dc'],speed:50,life:0.7,size:3,up:-20});
  } else {
    particles.burst(s.x,s.y,{count:18,colors:['#ffe082','#90a4ae','#fff','#ef9a9a'],speed:110,life:0.65,size:3,up:-40});
  }
  if(killer && killer.elixirOnKill && killerSide){
    const amt=killer.elixirOnKill;
    if(killerSide==='me') elixirMe=Math.min(elixirCap, elixirMe+amt);
    else elixirAi=Math.min(elixirCap, elixirAi+amt);
    if(killerSide==='me') toast('Трофей: +'+amt+' эликсир');
  }
  if(killer && killer.spawnOnKill && killerSide && victim.id!==killer.spawnOnKill){
    spawnTroop(killerSide, killer.spawnOnKill, victim.x+(Math.random()-0.5)*0.4, victim.y+(Math.random()-0.5)*0.4);
  }
  if(killerSide) onEnemyKilled(killerSide);
  sfxHit();
  if(focusTarget&&focusTarget.kind==='unit'&&focusTarget.ref===victim) focusTarget=null;
}

/** Урон с учётом splash / критов / стана / бонуса по воздуху / WC-флагов */
function dealUnitDamage(attacker, primary, dmg){
  let amount=dmg;
  if(attacker.atkBuffMul>1) amount*=attacker.atkBuffMul;
  if(attacker.hitMul && attacker.hitMul!==1) amount*=attacker.hitMul;
  if(attacker.berserk && attacker.hp/attacker.max<0.5) amount*=(1+attacker.berserk);
  if(attacker.firstHitCrit && !attacker.firstHitUsed){
    attacker.firstHitUsed=true;
    amount*=attacker.firstCritMul||1.8;
  }
  if(attacker.diveMul && attacker.diveReady){
    amount*=attacker.diveMul;
    attacker.diveReady=false;
  }
  let armorPierce=false;
  if(attacker.critEvery){
    attacker.hitCount=(attacker.hitCount||0)+1;
    if(attacker.hitCount%attacker.critEvery===0){
      amount*=attacker.critMul||1.5;
      if(attacker.armorIgnore) armorPierce=true;
    }
  }
  if(primary.kind==='unit' && primary.ref.air && attacker.airBonus) amount*=attacker.airBonus;
  if(primary.kind==='unit' && primary.ref.markT>0) amount*=(primary.ref.markMul||1.2);
  /* Контрметы ролей (RPS: primaryRole → combatRole fallback) */
  if(primary.kind==='unit'){
    const atkR=attacker.primaryRole||attacker.combatRole;
    const defR=primary.ref.primaryRole||primary.ref.combatRole||(primary.ref.air?'air':null);
    amount*=roleDamageMul(atkR, defR);
  }
  if(primary.kind==='tower' && (attacker.siege||attacker.combatRole==='siege')) amount*=1.45;

  if(primary.kind==='unit'){
    const dealt=hurtUnit(primary.ref, amount, attacker.side, {killer:attacker, armorIgnore:armorPierce})||0;
    if(attacker.lifesteal>0 && dealt>0){
      attacker.hp=Math.min(attacker.max, attacker.hp+dealt*attacker.lifesteal);
    }
    if(attacker.stunOnHit && primary.ref && !primary.ref.dying && !(primary.ref.immuneCC>0)){
      primary.ref.stunT=Math.max(primary.ref.stunT||0, attacker.stunOnHit);
    }
    if(attacker.freezeOnHit && primary.ref && !primary.ref.dying && !(primary.ref.immuneCC>0)){
      primary.ref.stunT=Math.max(primary.ref.stunT||0, attacker.freezeOnHit);
    }
    if(attacker.stunEvery){
      attacker.stunHitCount=(attacker.stunHitCount||0)+1;
      if(attacker.stunHitCount%attacker.stunEvery===0 && primary.ref && !primary.ref.dying && !(primary.ref.immuneCC>0))
        primary.ref.stunT=Math.max(primary.ref.stunT||0, attacker.ultStun||1);
    }
    if(attacker.hypnosis && primary.ref && !primary.ref.dying && !(primary.ref.immuneCC>0)){
      primary.ref.slowT=Math.max(primary.ref.slowT||0, attacker.hypnosis);
    }
    if(attacker.markOnHit && primary.ref && !primary.ref.dying){
      primary.ref.markT=Math.max(primary.ref.markT||0, attacker.markOnHit);
      primary.ref.markMul=attacker.markMul||1.2;
    }
    if(attacker.poison && primary.ref && !primary.ref.dying){
      primary.ref.poisonT=Math.max(primary.ref.poisonT||0, attacker.poison.t||3);
      primary.ref.poisonDps=attacker.poison.dps||10;
      primary.ref.poisonSide=attacker.side;
    }
    if(attacker.acidBreath && primary.ref && !primary.ref.dying){
      primary.ref.armorShred=attacker.acidBreath.armor||0.2;
      primary.ref.armorShredT=Math.max(primary.ref.armorShredT||0, attacker.acidBreath.t||3);
    }
    if(attacker.iceBreath){
      const br=attacker.iceBreath;
      foes(attacker.side).forEach(e=>{
        if(Math.hypot(e.x-primary.ref.x,e.y-primary.ref.y)<=(br.r||3) && !(e.immuneCC>0))
          e.slowT=Math.max(e.slowT||0, br.t||2);
      });
    }
    if(attacker.hook && primary.ref && !primary.ref.dying && !(primary.ref.immuneCC>0)){
      const dx=attacker.x-primary.ref.x, dy=attacker.y-primary.ref.y;
      const dist=Math.hypot(dx,dy)||1;
      const pull=Math.min(2.2, Math.max(0.4, dist-0.9));
      primary.ref.x+=dx/dist*pull;
      primary.ref.y+=dy/dist*pull;
      primary.ref.stunT=Math.max(primary.ref.stunT||0, 0.35);
    }
    if(attacker.atkSpeedStack){
      const st=attacker.atkSpeedStack;
      attacker.atkSpdStacks=(attacker.atkSpdStacks||0)+1;
      const bonus=Math.min(st.cap||0.3, attacker.atkSpdStacks*(st.step||0.05));
      attacker.atkCd=(attacker.baseAtkCd||attacker.atkCd)*(1-bonus);
    }
    if(attacker.chain>1){
      const n=attacker.chain-1;
      const list=foes(attacker.side).filter(e=>e!==primary.ref && !e.dying)
        .sort((a,b)=>Math.hypot(a.x-primary.ref.x,a.y-primary.ref.y)-Math.hypot(b.x-primary.ref.x,b.y-primary.ref.y))
        .slice(0,n);
      list.forEach((e,i)=>{
        fx.push({type:'lightning',x0:primary.ref.x,y0:primary.ref.y-0.2,x1:e.x,y1:e.y,life:0.28+i*0.04});
        hurtUnit(e, amount*(0.7-i*0.15), attacker.side, {killer:attacker});
      });
    }
    if(attacker.splash>0){
      for(const e of foes(attacker.side)){
        if(e===primary.ref)continue;
        const d=Math.hypot(e.x-primary.ref.x, e.y-primary.ref.y);
        if(d<=attacker.splash){
          hurtUnit(e, amount*0.55, attacker.side, {killer:attacker, armorIgnore:armorPierce});
          if(attacker.acidBreath){
            e.armorShred=attacker.acidBreath.armor||0.2;
            e.armorShredT=Math.max(e.armorShredT||0, attacker.acidBreath.t||3);
          }
        }
      }
    }
  } else if(primary.kind==='bld'){
    primary.ref.hp-=amount;
    if(primary.ref.hp<=0) destroyBuilding(primary.ref);
    if(attacker.splash>0){
      for(const e of foes(attacker.side)){
        const d=Math.hypot(e.x-primary.ref.x, e.y-primary.ref.y);
        if(d<=attacker.splash) hurtUnit(e, amount*0.4, attacker.side, {killer:attacker});
      }
    }
  } else {
    damageTower(primary.ref, amount);
  }
  if(attacker.ult==='lightning'){
    attacker.ultCd=(attacker.ultCd||0)+1;
    if(attacker.ultCd>=3){ attacker.ultCd=0; castUltLightning(attacker); }
  }
  sfxHit();
}

function whichBridge(x){
  let best=BRIDGE_XS[0], d=1e9;
  for(const bx of BRIDGE_XS){
    const dd=Math.abs(x-bx);
    if(dd<d){d=dd;best=bx;}
  }
  return best;
}
function nearestBridgeX(x, preferX){
  let best=BRIDGE_XS[0], score=1e9;
  for(const bx of BRIDGE_XS){
    const s=Math.abs(x-bx)*0.55+Math.abs((preferX??x)-bx)*0.45;
    if(s<score){score=s;best=bx;}
  }
  return best;
}
function inRiver(y){return y>RIVER_Y0 && y<RIVER_Y1;}
function onBridge(x,y){
  if(!inRiver(y)) return true;
  return BRIDGE_XS.some(bx=>Math.abs(x-bx)<=BRIDGE_HALF);
}
function landSide(y){
  if(y<=RIVER_Y0) return 'me';
  if(y>=RIVER_Y1) return 'ai';
  return 'bridge';
}
/** Длина пути по арене (через мост), без телепорта */
function pathCost(x0,y0,x1,y1,air){
  if(air) return Math.hypot(x1-x0,y1-y0);
  const s0=landSide(y0), s1=landSide(y1);
  if(s0==='me'&&s1==='me') return Math.hypot(x1-x0,y1-y0);
  if(s0==='ai'&&s1==='ai') return Math.hypot(x1-x0,y1-y0);
  const cross=RIVER_Y1-RIVER_Y0;
  let best=1e9;
  for(const bx of BRIDGE_XS){
    let c=0;
    if(s0==='bridge'){
      c+=Math.abs(x0-bx)*0.5;
      const exitMe=Math.abs(y0-RIVER_Y0), exitAi=Math.abs(y0-RIVER_Y1);
      if(s1==='me') c+=exitMe+Math.hypot(x1-bx,y1-RIVER_Y0);
      else if(s1==='ai') c+=exitAi+Math.hypot(x1-bx,y1-RIVER_Y1);
      else c+=Math.hypot(x1-bx,y1-y0);
    } else if(s1==='bridge'){
      if(s0==='me') c+=Math.hypot(bx-x0,RIVER_Y0-y0)+Math.abs(y1-RIVER_Y0)+Math.abs(x1-bx)*0.5;
      else c+=Math.hypot(bx-x0,RIVER_Y1-y0)+Math.abs(y1-RIVER_Y1)+Math.abs(x1-bx)*0.5;
    } else {
      // разные берега: к мосту → через реку → к цели
      if(s0==='me') c+=Math.hypot(bx-x0,RIVER_Y0-y0)+cross+Math.hypot(x1-bx,y1-RIVER_Y1);
      else c+=Math.hypot(bx-x0,RIVER_Y1-y0)+cross+Math.hypot(x1-bx,y1-RIVER_Y0);
    }
    if(c<best) best=c;
  }
  return best;
}
/** Средний вес агро: сильные танки ближе по «ощущению», но дистанция важна */
function scoreByAggro(pathD, aggro){
  const ag=aggro||1;
  return pathD/(1+(ag-1)*0.55);
}
function needsRiverCross(y0,y1){
  const s0=landSide(y0), s1=landSide(y1);
  if(s0==='bridge'||s1==='bridge') return true;
  return s0!==s1;
}
/** Куда идти пешему: один выбранный мост, обход по суше, без рывков */
function steerPoint(u, tx, ty){
  if(u.air) return {x:tx,y:ty};
  const x=u.x, y=u.y;
  const s0=landSide(y), s1=landSide(ty);

  // В воде мимо моста — идём к своему мосту шагом (к центру моста по X, к ближайшему берегу по Y)
  if(s0==='bridge' && !onBridge(x,y)){
    const bx=whichBridge(x);
    const bank=Math.abs(y-RIVER_Y0)<=Math.abs(y-RIVER_Y1)?RIVER_Y0:RIVER_Y1;
    if(Math.abs(x-bx)>0.2) return {x:bx, y};
    return {x:bx, y:bank};
  }

  // На мосту: только вдоль своего моста, потом выход на нужный берег
  if(s0==='bridge' && onBridge(x,y)){
    const bx=u.bridgeCommit!=null?u.bridgeCommit:whichBridge(x);
    u.bridgeCommit=bx;
    // Цель на этом же мосту
    if(s1==='bridge' && Math.abs(whichBridge(tx)-bx)<=BRIDGE_HALF){
      return {x:bx, y:ty};
    }
    // Выйти на берег в сторону цели / базы противника
    let exitY;
    if(s1==='ai') exitY=RIVER_Y1+0.4;
    else if(s1==='me') exitY=RIVER_Y0-0.4;
    else exitY=(ty>=y)?RIVER_Y1+0.4:RIVER_Y0-0.4;
    return {x:bx, y:exitY};
  }

  // Разные берега — идём к выбранному мосту, затем через него
  if(s0!==s1){
    let prefer=tx;
    let best=BRIDGE_XS[0], sc=1e9;
    for(const bx of BRIDGE_XS){
      const c=Math.abs(x-bx)+Math.abs(tx-bx);
      if(c<sc){sc=c;best=bx;}
    }
    if(u.bridgeCommit==null || Math.abs(u.bridgeCommit-best)>BRIDGE_HALF*2){
      // переключить мост только если явно выгоднее и мы ещё не у входа
      if(u.bridgeCommit==null || Math.abs(x-u.bridgeCommit)>1.2)
        u.bridgeCommit=best;
    }
    const bx=u.bridgeCommit;
    // Сначала по суше к устью моста
    if(Math.abs(x-bx)>0.4){
      const mouthY=s0==='me'?RIVER_Y0-0.15:RIVER_Y1+0.15;
      return {x:bx, y:mouthY};
    }
    // Вход на мост
    if(s0==='me') return {x:bx, y:RIVER_Y1+0.35};
    return {x:bx, y:RIVER_Y0-0.35};
  }

  // Один берег — прямо к цели; сброс привязки к мосту
  u.bridgeCommit=null;
  return {x:tx,y:ty};
}
function moveUnit(u, tx, ty, sp){
  const wp=steerPoint(u, tx, ty);
  let dx=wp.x-u.x, dy=wp.y-u.y;
  let dist=Math.hypot(dx,dy)||1;
  let nx=u.x+dx/dist*sp;
  let ny=u.y+dy/dist*sp;

  if(!u.air){
    // На мосту держим X у центра моста — не уходим в воду
    if(inRiver(u.y) && onBridge(u.x,u.y)){
      const bx=u.bridgeCommit!=null?u.bridgeCommit:whichBridge(u.x);
      nx=u.x+Math.max(-sp, Math.min(sp, bx-u.x));
      if(!onBridge(nx, ny)){
        // шаг в воду — только вдоль моста по Y
        nx=bx;
        if(!onBridge(nx, ny)) ny=u.y;
      }
    } else if(inRiver(ny) && !onBridge(nx,ny)){
      // Нельзя сойти с берега в воду мимо моста — идём вдоль берега к мосту
      const bx=u.bridgeCommit!=null?u.bridgeCommit:nearestBridgeX(u.x, tx);
      ny=u.y;
      nx=u.x+Math.max(-sp, Math.min(sp, bx-u.x));
    }
  }
  u.x=Math.max(0.4, Math.min(ARENA.w-0.4, nx));
  u.y=Math.max(0.4, Math.min(ARENA.h-0.4, ny));
}

function updateUnits(dt){
  // аура Стрельбища
  const auras=buildings.filter(b=>!b.dead&&b.role==='aura'&&b.rangeAura);
  for(const u of units){
    if(u.gone) continue;
    if(u.dying){
      u.deathTimer-=dt;
      if(u.char) u.char.updateAnim(dt);
      if(u.deathTimer<=0) u.gone=true;
      continue;
    }
    if(u.hp<=0){ killUnit(u, null); continue; }

    if(u.stealthT>0){
      u.stealthT-=dt;
      u.spawnAlpha=0.25;
      if(u.stealthT<=0) u.spawnAlpha=1;
    } else if(u.spawnAlpha<1) u.spawnAlpha=Math.min(1, u.spawnAlpha+dt*2.5);
    if(u.armorT>0) u.armorT-=dt;
    if(u.markT>0) u.markT-=dt;
    if(u.armorShredT>0) u.armorShredT-=dt;
    if(u.poisonT>0){
      u.poisonT-=dt;
      u.poisonAcc=(u.poisonAcc||0)+dt;
      if(u.poisonAcc>=0.5){
        const tick=u.poisonAcc; u.poisonAcc=0;
        hurtUnit(u, (u.poisonDps||10)*tick, u.poisonSide||null);
      }
    }
    if(u.shieldT>0){ u.shieldT-=dt; if(u.shieldT<=0) u.shieldHp=0; }
    if(u.immuneCC>0) u.immuneCC-=dt;
    if(u.stunT>0) u.stunT-=dt;
    // Добрыня: ульт при <40% HP
    if(u.ult==='smash' && !u.ultUsed && u.hp>0 && u.hp/u.max<=(u.ultHp||0.4)) castUltSmash(u);
    // Леший: аура замедления + DoT
    if(u.auraSlow>0 && u.auraR>0){
      for(const e of foes(u.side)){
        if(Math.hypot(e.x-u.x,e.y-u.y)<=u.auraR && !(e.immuneCC>0))
          e.slowT=Math.max(e.slowT||0, 0.45);
      }
      if(u.auraDot>0){
        u.auraDotAcc=(u.auraDotAcc||0)+dt;
        if(u.auraDotAcc>=1){
          u.auraDotAcc=0;
          for(const e of foes(u.side)){
            if(Math.hypot(e.x-u.x,e.y-u.y)<=u.auraR)
              hurtUnit(e, u.auraDot*lvlMul(u.id), u.side);
          }
          const s=toScreen(u.x,u.y);
          particles.burst(s.x,s.y,{count:6,colors:['#aed581','#558b2f'],speed:30,life:0.4,size:2,up:-8});
        }
      }
    }
    // Василиса: аура лечения + бафф атаки
    if(u.auraHeal>0 && u.auraR>0){
      u.auraHealAcc=(u.auraHealAcc||0)+dt;
      if(u.auraHealAcc>=1){
        u.auraHealAcc=0;
        const healAmt=(u.auraHeal||0)*lvlMul(u.id);
        const from=toScreen(u.x,u.y);
        units.forEach(a=>{
          if(a.side!==u.side||a.dying)return;
          if(a===u)return;
          if(Math.hypot(a.x-u.x,a.y-u.y)>u.auraR)return;
          a.hp=Math.min(a.max, a.hp+healAmt);
          if(u.auraAtk>0){ a.atkBuffMul=1+u.auraAtk; a.atkBuffT=Math.max(a.atkBuffT||0, 1.2); }
          const s=toScreen(a.x,a.y);
          spawnHealBeam(from.x, from.y-18, s.x, s.y-22);
          spawnHealMark(s.x, s.y-28);
          particles.burst(s.x,s.y-10,{count:3,colors:['#69f0ae','#43a047','#fff'],speed:22,life:0.3,size:2,up:-14});
        });
      }
    }
    if(u.atkBuffT>0){ u.atkBuffT-=dt; if(u.atkBuffT<=0) u.atkBuffMul=1; }

    // Кощей-скелет: через 10 сек живым → возрождение 50% HP (1 раз)
    if(u.id==='kostey' && u.kosteyPhase===1 && u.kosteyTimer>0){
      u.kosteyTimer-=dt;
      if(u.kosteyTimer<=0 && u.kosteyRevives>0){
        u.kosteyRevives=0;
        u.kosteyPhase=0;
        u.immortal=false;
        const m=lvlMul('kostey');
        u.name='Кощей'; u.max=CARDS.kostey.hp*m; u.hp=u.max*0.5; u.dmg=CARDS.kostey.dmg*m;
        if(u.char){
          u.char.kind='skeleton';
          u.char.anim=new SpriteAnim(getSheets('skeleton', u.side==='me', 'scythe', 'kostey'));
          u.char.setAnim('idle', true);
        }
        toast(u.side==='me'?'Кощей возродился!':'Вражеский Кощей вернулся!');
        spawnBurst(u.x,u.y);
      }
    }

    u.bob=(u.bob||0)+dt*8;
    if(u.atkAnim>0) u.atkAnim-=dt;

    // скорость: slow / stun
    let spdMul=1;
    if(u.stunT>0) spdMul=0;
    else if(u.slowT>0){ u.slowT-=dt; spdMul=0.5; }
    u.speed=u.baseSpeed*spdMul*phoneWalkMul();

    // дальность от Стрельбища
    let rangeMul=1;
    for(const a of auras){
      if(a.side!==u.side)continue;
      if((u.role==='ranged'||u.role==='splash') && Math.hypot(u.x-a.x,u.y-a.y)<=a.range)
        rangeMul=Math.max(rangeMul, 1+(a.rangeAura||0));
    }
    u.range=(u.baseRange||u.range)*rangeMul;

    u.cd-=dt;
    if(u.stunT>0){
      if(u.char && u.char.anim.state==='attack'){ /* удар прерывается станом */ u.pendingAtk=null; }
      if(u.char){ u.char.setAnim('idle'); u.char.updateAnim(dt); }
      continue;
    }

    // Активная атака: стоим на месте, урон на hit-frame
    if(u.char && u.char.anim.state==='attack'){
      if(u.pendingAtk){
        const pt=u.pendingAtk.tgt;
        if(pt && pt.kind==='unit' && pt.ref && !pt.ref.dying && !pt.ref.gone){
          u.char.face = pt.ref.x>=u.x ? 1 : -1;
          u.pendingAtk.tx=pt.ref.x; u.pendingAtk.ty=pt.ref.y;
        } else if(pt && pt.kind==='bld' && pt.ref && !pt.ref.dead){
          u.char.face = pt.ref.x>=u.x ? 1 : -1;
          u.pendingAtk.tx=pt.ref.x; u.pendingAtk.ty=pt.ref.y;
        } else if(pt && pt.kind==='tower' && pt.ref && pt.ref.alive){
          u.char.face = pt.ref.lx>=u.x ? 1 : -1;
          u.pendingAtk.tx=pt.ref.lx; u.pendingAtk.ty=pt.ref.ly;
        }
      }
      u.char.updateAnim(dt);
      if(u.char.anim.consumeHit() && u.pendingAtk){
        const p=u.pendingAtk;
        const alive = p.tgt && (
          (p.tgt.kind==='unit' && p.tgt.ref && !p.tgt.ref.dying && !p.tgt.ref.gone) ||
          (p.tgt.kind==='bld' && p.tgt.ref && !p.tgt.ref.dead) ||
          (p.tgt.kind==='tower' && p.tgt.ref && p.tgt.ref.alive)
        );
        if(alive) dealUnitDamage(u, p.tgt, p.dmg);
        spawnAttackVfx(u, p.tx, p.ty);
        if(u.volley>1){
          for(let i=1;i<u.volley;i++){
            const tx=p.tx, ty=p.ty;
            setTimeout(()=>spawnAttackVfx(u, tx+(Math.random()-0.5)*0.3, ty+(Math.random()-0.5)*0.3), i*160);
          }
        }
        if(p.burst) spawnBurst(u.x, u.y);
      }
      if(u.char.anim.finished){
        u.char.setAnim('idle');
        u.pendingAtk=null;
      }
      continue;
    }

    const tgt=pickTargetFor(u);
    u.atkTarget=tgt;
    if(!tgt){
      if(u.char) u.char.setAnim('idle');
      if(u.char) u.char.updateAnim(dt);
      continue;
    }
    let tx,ty,range=u.range;
    if(tgt.kind==='unit'){tx=tgt.ref.x;ty=tgt.ref.y;}
    else if(tgt.kind==='bld'){tx=tgt.ref.x;ty=tgt.ref.y;}
    else{tx=tgt.ref.lx;ty=tgt.ref.ly;range+=0.4;}
    const d=Math.hypot(tx-u.x,ty-u.y);
    if(u.char) u.char.face = tx>=u.x ? 1 : -1;

    // заряд казака — ускорение, без телепорта через реку
    if(u.charge && !u.charged && d<=u.charge && d>range && !needsRiverCross(u.y, ty)){
      u.charged=true;
      u.chargeBoostT=0.55;
    }
    if(u.chargeBoostT>0){
      u.chargeBoostT-=dt;
      const boost=1.85;
      moveUnit(u, tx, ty, u.speed*dt/40*boost);
      if(u.char) u.char.setAnim('walk');
      if(u.char) u.char.updateAnim(dt);
      if(Math.hypot(tx-u.x,ty-u.y)<=range){
        u.chargeBoostT=0;
        const nFr=((u.char&&u.char.anim.sheets.attack)||[]).length||7;
        const atkDur=((u.char&&u.char.anim.delay.attack)||55)*nFr/1000;
        u.cd=u.atkCd; u.atkAnim=atkDur;
        u.pendingAtk={tgt, dmg:u.dmg*(u.chargeMul||1.45), tx, ty, burst:true};
        if(u.char) u.char.setAnim('attack', true);
      }
      continue;
    }

    // для атаки — прямая дистанция; урон только на hit-frame
    if(d<=range){
      if(u.cd<=0){
        const nFr=((u.char&&u.char.anim.sheets.attack)||[]).length||7;
        const atkDur=((u.char&&u.char.anim.delay.attack)||55)*nFr/1000;
        u.cd=u.atkCd; u.atkAnim=atkDur;
        u.pendingAtk={tgt, dmg:u.dmg, tx, ty};
        if(u.diveMul) u.diveReady=true;
        if(u.char) u.char.setAnim('attack', true);
      } else if(u.char && u.char.anim.state!=='hit'){
        u.char.setAnim('idle');
      }
      if(u.char){
        if(u.char.anim.state==='hit' && u.char.anim.finished) u.char.setAnim('idle');
        u.char.updateAnim(dt);
      }
    } else {
      if(u.char){
        if(u.char.anim.state==='hit' && u.char.anim.finished) u.char.setAnim('walk');
        else if(u.char.anim.state!=='hit') u.char.setAnim('walk');
      }
      const ease = easeInOutCubic(Math.min(1, d / 4));
      const sp = u.speed * dt / 40 * (0.65 + 0.35 * ease);
      moveUnit(u, tx, ty, sp);
      if(u.char) u.char.updateAnim(dt);
    }
  }
  units=units.filter(u=>!u.gone);
}

function updateBuildings(dt){
  for(const b of buildings){
    if(b.dead)continue;
    b.age+=dt;b.cd-=dt;
    if(b.atkFlash>0) b.atkFlash-=dt;
    if(b.age>=b.life){ destroyBuilding(b); continue; }
    if(b.hp<=0){ destroyBuilding(b); continue; }
    if(b.char){
      if(b.atkFlash>0) b.char.setAnim('attack');
      else b.char.setAnim('idle');
      b.char.updateAnim(dt);
    }
    if(b.role==='aura') continue;
    if(b.role==='turret'){
      if(b.cd<=0){
        const enemies=foes(b.side);
        if(enemies.length){
          b.cd=b.atkCd; b.atkFlash=0.4;
          if(b.char) b.char.setAnim('attack', true);
          const e=enemies[(Math.random()*enemies.length)|0];
          launchFireball(b.side, b.x, b.y, e.x, e.y, b.dmg, b.splash||1.5, 0, 1);
          sfxShot();
        }
      }
      continue;
    }
    if(b.role==='spawner' && b.spawnId && b.cd<=0){
      b.cd=b.atkCd; b.atkFlash=0.4;
      if(b.char) b.char.setAnim('attack', true);
      const sy = b.side==='me' ? b.y+0.8 : b.y-0.8;
      spawnTroop(b.side, b.spawnId, b.x, sy, {count:b.spawnCount||1});
      spawnBurst(b.x, sy);
      sfxPlace();
      continue;
    }
    if(b.dmg<=0) continue;
    let best=null,bd=1e9;
    for(const u of foes(b.side)){
      const raw=Math.hypot(u.x-b.x,u.y-b.y);
      if(raw>b.range)continue;
      const d=raw/(u.aggro||1);
      if(d<bd){bd=d;best=u;}
    }
    if(best&&b.cd<=0){
      b.cd=b.atkCd; b.atkFlash=0.45;
      if(b.char) b.char.setAnim('attack', true);
      hurtUnit(best, b.dmg, b.side);
      if(b.splash>0){
        for(const e of foes(b.side)){
          if(e===best)continue;
          if(Math.hypot(e.x-best.x,e.y-best.y)<=b.splash) hurtUnit(e, b.dmg*0.5, b.side);
        }
      }
      sfxShot();
      spawnAttackVfx({id:b.id, side:b.side, x:b.x, y:b.y}, best.x, best.y);
      const hit=toScreen(best.x,best.y);
      spawnHitSpark(hit.x, hit.y, b.id);
    }
  }
  buildings=buildings.filter(b=>!b.dead&&b.hp>0);
}

function updateTowers(dt){
  for(const t of towers){
    if(t.hurtT>0) t.hurtT-=dt;
    if(!t.alive||!t.active)continue;
    t.cd-=dt;
    if(t.cd>0)continue;
    const def=towerDef(t);
    let best=null,bd=1e9;
    for(const u of units){
      if(u.side===t.side||u.dead||u.dying||u.gone||(u.stealthT>0))continue;
      const raw=Math.hypot(u.x-t.lx,u.y-t.ly);
      if(raw>def.range)continue;
      const d=raw/(u.aggro||1); // провокация / танки — главная цель
      if(d<bd){bd=d;best=u;}
    }
    if(best){
      t.cd=def.atkCd;
      hurtUnit(best, def.dmg, t.side);
      const a=toScreen(t.lx,t.ly),c=toScreen(best.x,best.y);
      const col=t.kind==='strelets'?'#81d4fa':(t.kind==='defense'?'#a5d6a7':'#ffe082');
      projectiles.push({x:a.x,y:a.y-20,tx:c.x,ty:c.y,life:0.18,maxLife:0.18,color:col});
    }
  }
}

function aiThink(dt){
  if(matchOver||prepT>0)return;
  aiTimer-=dt;
  if(aiTimer>0)return;
  aiTimer=difficulty==='easy'?2.2:difficulty==='mid'?1.4:0.9;
  const threat=units.filter(u=>u.side==='me'&&u.y>ARENA.h*0.55);
  let idx=-1,card=null;
  for(let i=0;i<4;i++){
    const id=handAi[i];
    if(!canPlay('ai',id))continue;
    const def=CARDS[id];
    if(threat.length&&(def.role==='splash'||def.role==='ranged'||def.combatRole==='siege'||def.combatRole==='tank')){idx=i;card=id;break;}
    if(!card||def.cost>CARDS[card].cost){idx=i;card=id;}
  }
  if(idx<0)return;
  const def=CARDS[card];
  let lx,ly;
  if(threat.length){
    lx=3+Math.random()*12;ly=22+Math.random()*4;
  }else{
    const lane=Math.random()<0.5?5:13;
    lx=lane+Math.random()*2-1;ly=20+Math.random()*3;
  }
  playCard('ai',idx,lx,ly);
}

function showBanner(win){
  const el=document.getElementById('banner');
  el.classList.remove('win','lose','show');
  el.querySelector('.bn').textContent=win?'ПОБЕДА':'ПОРАЖЕНИЕ';
  el.classList.add(win?'win':'lose','show');
  bannerT=1.8;
  const cx=W/2,cy=H*0.42;
  particles.burst(cx,cy,{count:win?40:18,colors:win?['#ffd54f','#fff','#ff8a65']:['#90a4ae','#ef9a9a','#fff'],speed:win?160:80,life:0.9,size:3.5,up:-50});
}
function hideBanner(){
  const el=document.getElementById('banner');
  if(el){el.classList.remove('show','win','lose');}
  bannerT=0;
}
function endMatch(meWon){
  if(matchOver)return;
  matchOver=true;state='result';
  stats.battles++;
  if(meWon){stats.wins++;bumpQuest('win2',1);sfxWin();}else sfxLose();
  save('rr_stats',stats);
  const chest=meWon?(Math.random()<0.3?'Магический':'Золотой'):'Серебряный';
  const gold=(meWon?40:15)+crownsMe*10;
  const gem=meWon&&Math.random()<0.4?1:0;
  const cid=DEFAULT_DECK[Math.random()*DEFAULT_DECK.length|0];
  cardLevels[cid]=(cardLevels[cid]||1)+(meWon?1:0);
  if(cardLevels[cid]>1&&meWon)save('rr_levels',cardLevels);
  const score=crownsMe*100+stats.wins*10;
  records.push({score,crowns:crownsMe,date:new Date().toLocaleDateString('ru-RU'),win:meWon});
  records.sort((a,b)=>b.score-a.score);records=records.slice(0,5);save('rr_records',records);
  if(tournament){tournament.fights++;tournament.crowns+=crownsMe;}
  document.getElementById('res-title').textContent=meWon?'Победа!':'Поражение';
  document.getElementById('res-msg').textContent=`Короны ${crownsMe}:${crownsAi}`;
  document.getElementById('res-chest').textContent=`Сундук: ${chest} · +${gold} золота${gem?' · +'+gem+'💎':''}${meWon?' · '+CARDS[cid].name+' +ур.':''}`;
  renderRecords(document.getElementById('res-records'));
  document.getElementById('hand-tray').classList.add('hidden');
  document.getElementById('elixir-wrap').style.display='none';
  if(hand3d) hand3d.setActive(false);
  hideTip();
  showBanner(meWon);
  setTimeout(()=>{
    hideBanner();
    const ov=document.getElementById('overlay');
    ov.classList.remove('hidden');
    ov.classList.add('center-mode');
    showOnly('result');
  },1700);
}

function bumpQuest(id,n){
  ensureQuests();
  const q=quests.items.find(x=>x.id===id);
  if(q&&q.prog<q.need){q.prog=Math.min(q.need,q.prog+n);save('rr_quests',quests);}
}

function update(dt){
  ambientT+=dt;
  if(bannerT>0)bannerT-=dt;
  if(timeSlow>0){timeSlow-=dt; dt*=0.35;}
  if(state!=='play'||matchOver){
    if(typeof particles!=='undefined') particles.update(dt);
    updateFloatMarks(dt);
    for(let i=fx.length-1;i>=0;i--){
      const f=fx[i];f.life-=dt;
      if(f.type==='p'){f.x+=f.vx*dt;f.y+=f.vy*dt;}
      if(f.life<=0)fx.splice(i,1);
    }
    if(flashWhite>0)flashWhite-=dt;
    return;
  }
  timeLeft-=dt;
  if(prepT>0){
    const before=prepT;
    prepT=Math.max(0, prepT-dt);
    if(before>0 && prepT<=0){
      toast(difficulty==='hard'?'В бой! Сложный ИИ':'В бой!');
      renderHand();
    }
  }
  if(timeLeft<=0){
    if(timeLeft<=-60){
      const kingHp=s=>{
        const k=towers.find(t=>t.side===s&&t.kind==='king'&&t.alive);
        return k?k.hp:0;
      };
      endMatch(kingHp('me')>=kingHp('ai'));
      return;
    }
  }
  updateWaves(dt);
  updateElixir(dt);
  updateUnits(dt);
  updateBuildings(dt);
  updateTowers(dt);
  // Проклятие Бабы-Яги (DoT + замедление 30%)
  for(let i=curseZones.length-1;i>=0;i--){
    const z=curseZones[i];
    z.life-=dt; z.tick=(z.tick||0)+dt;
    units.forEach(u=>{
      if(u.side===z.side||u.dying)return;
      if(Math.hypot(u.x-z.x,u.y-z.y)<=z.r){
        if(!(u.immuneCC>0)) u.slowT=Math.max(u.slowT||0, 0.6);
      }
    });
    if(z.tick>=0.5){
      z.tick=0;
      units.forEach(u=>{
        if(u.side===z.side||u.dying)return;
        if(Math.hypot(u.x-z.x,u.y-z.y)<=z.r) hurtUnit(u, z.dmg, z.side);
      });
      fx.push({type:'spell',x:z.x,y:z.y,r:z.r,life:0.25,color:'#7e57c2'});
    }
    if(z.life<=0) curseZones.splice(i,1);
  }
  // устаревший буфер респауна (если остался)
  for(let i=respawns.length-1;i>=0;i--){
    const r=respawns[i];
    r.t-=dt;
    if(r.t<=0){
      spawnTroop(r.side, r.id, r.x, r.y, {count:1, reviveKostey:true});
      toast(r.side==='me'?'Кощей возродился!':'Вражеский Кощей вернулся!');
      spawnBurst(r.x, r.y);
      respawns.splice(i,1);
    }
  }
  aiThink(dt);
  for(let i=projectiles.length-1;i>=0;i--){
    const p=projectiles[i];
    if(p.delay>0){ p.delay-=dt; continue; }
    p.life-=dt;
    if(p.type==='fireball' || p.mage){
      p.frameAcc=(p.frameAcc||0)+dt*1000;
      if(p.frameAcc>70){ p.frameAcc=0; p.frame=((p.frame||0)+1)%(p.mage?MAGIC_FRAMES.length:FIREBALL_FRAMES.length); }
    }
    if(p.life<=0){
      if(p.spell && p.type==='fireball'){
        const s=toScreen(p.lx, p.ly);
        spawnExplosion(s.x, s.y, 1.2);
        applySpellDamage(p.side, p.lx, p.ly, p.dmg, p.radius, p.mainMul||1);
        fx.push({type:'spell',x:p.lx,y:p.ly,r:p.radius,life:0.35,color:'#ff7043'});
        sfxHit();
      }
      projectiles.splice(i,1);
    }
  }
  if(typeof particles!=='undefined') particles.update(dt);
  updateFloatMarks(dt);
  for(let i=fx.length-1;i>=0;i--){
    const f=fx[i];f.life-=dt;
    if(f.type==='explosion'||f.type==='hit'||f.type==='shock'||f.type==='spellPx'){
      f.frameAcc=(f.frameAcc||0)+dt*1000;
      const maxFr = f.type==='explosion' ? EXPLOSION_FRAMES.length-1
        : (f.type==='hit' ? HIT_FRAMES.length-1 : MAGIC_FRAMES.length-1);
      if(f.frameAcc>55){ f.frameAcc=0; f.frame=Math.min((f.frame||0)+1, maxFr); }
    }
    if(f.type==='p'){f.x+=f.vx*dt;f.y+=f.vy*dt;}
    if(f.life<=0)fx.splice(i,1);
  }
  if(flashWhite>0)flashWhite-=dt;
  if(vignette>0)vignette=Math.max(0,vignette-dt*1.2);
  updateHUD();
}

function drawArena(){
  if(window.GameArena && GameArena.drawArena){
    GameArena.drawArena(ctx, {W,H,field,ARENA,ambientT,BRIDGE_XS,drawBirch,roundRect});
    return;
  }
  _drawArenaLegacy();
}
function _drawArenaLegacy(){
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#4fc3f7');g.addColorStop(0.35,'#81d4fa');g.addColorStop(0.55,'#a5d6a7');g.addColorStop(1,'#2e7d32');
  ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  // облака
  ctx.fillStyle='rgba(255,255,255,0.55)';
  for(let i=0;i<4;i++){
    const cx=((ambientT*18*(0.4+i*0.15)+i*220)%(W+160))-80;
    const cy=28+i*16+(i%2)*8;
    roundRect(cx,cy,70+i*18,18,10);ctx.fill();
    roundRect(cx+20,cy-8,40,16,8);ctx.fill();
  }
  const x=field.x,y=field.y,w=field.w,h=field.h;
  ctx.fillStyle='#7cb342';roundRect(x,y,w,h,12);ctx.fill();
  // трава — лёгкое покачивание
  ctx.strokeStyle='rgba(46,125,50,0.35)';ctx.lineWidth=1.5;
  for(let i=0;i<28;i++){
    const gx=x+((i*47)%w);
    const gy=y+h*0.12+((i*31)%(h*0.76));
    const sway=Math.sin(ambientT*2.2+i)*2.5;
    ctx.beginPath();ctx.moveTo(gx,gy);ctx.lineTo(gx+sway,gy-7);ctx.stroke();
  }
  ctx.fillStyle='rgba(198,40,40,0.12)';ctx.fillRect(x,y,w,h/2);
  ctx.fillStyle='rgba(25,118,210,0.12)';ctx.fillRect(x,y+h/2,w,h/2);
  const mid=y+h/2;
  // река + мерцание
  ctx.fillStyle='#29b6f6';ctx.fillRect(x,mid-h*0.04,w,h*0.08);
  ctx.fillStyle=`rgba(255,255,255,${0.18+0.12*Math.sin(ambientT*3)})`;
  for(let i=0;i<7;i++){
    const ox=Math.sin(ambientT*1.6+i)*8;
    ctx.fillRect(x+i*w/7+8+ox,mid-2+(i%2),w/12,2.5);
  }
  ctx.fillStyle='#8d6e63';
  const bw=w*0.14;
  ctx.fillRect(x+w*0.18-bw/2,mid-h*0.055,bw,h*0.11);
  ctx.fillRect(x+w*0.82-bw/2,mid-h*0.055,bw,h*0.11);
  ctx.strokeStyle='rgba(255,255,255,0.06)';ctx.lineWidth=1;
  for(let i=1;i<ARENA.w;i++){const sx=x+(i/ARENA.w)*w;ctx.beginPath();ctx.moveTo(sx,y);ctx.lineTo(sx,y+h);ctx.stroke();}
  for(let j=1;j<ARENA.h;j++){const sy=y+h-(j/ARENA.h)*h;ctx.beginPath();ctx.moveTo(x,sy);ctx.lineTo(x+w,sy);ctx.stroke();}
  drawBirch(x-18,y+h*0.7);drawBirch(x+w+18,y+h*0.7);
}
function drawBirch(px,py){
  ctx.fillStyle='#efebe9';ctx.fillRect(px-3,py-40,6,40);
  ctx.strokeStyle='#212121';ctx.lineWidth=1;
  for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(px-3,py-8-i*7);ctx.lineTo(px+3,py-5-i*7);ctx.stroke();}
  ctx.fillStyle='#66bb6a';ctx.beginPath();ctx.arc(px,py-48,14,0,Math.PI*2);ctx.fill();
}
function roundRect(x,y,w,h,r){
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
}
function drawTower(t){
  if(window.GameArena && GameArena.drawTower){
    GameArena.drawTower(ctx, t, toScreen, roundRect);
    if(t.hurtT>0) flashWhite=Math.max(flashWhite,0.08);
    return;
  }
  const s=toScreen(t.lx,t.ly);
  const ts = phoneTowerScale();
  const dead=!t.alive;
  const isKing=t.kind==='king';
  const isStrelets=t.kind==='strelets';
  const isDef=t.kind==='defense';
  const teamCol = t.side==='me'
    ? {a:'#64b5f6', b:'#1565c0', roof:'#ffd54f'}
    : {a:'#ef9a9a', b:'#c62828', roof:'#ffcc80'};
  ctx.fillStyle='rgba(0,0,0,0.28)';
  ctx.beginPath();ctx.ellipse(s.x,s.y+8,(isKing?30:20)*ts,10*ts,0,0,Math.PI*2);ctx.fill();
  function stoneKeep(x,y,w,h,r){
    const g=ctx.createLinearGradient(x,y,x+w,y+h);
    g.addColorStop(0, dead?'#8d6e63':teamCol.a);
    g.addColorStop(0.55, dead?'#5d4037':teamCol.b);
    g.addColorStop(1, dead?'#3e2723':shade(teamCol.b, -20));
    ctx.fillStyle=g;
    roundRect(x,y,w,h,r);ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,0.18)';ctx.lineWidth=1.5;
    roundRect(x+3,y+6,w-6,h*0.28,3);ctx.stroke();
  }
  if(isDef){
    stoneKeep(s.x-14*ts,s.y-34*ts,28*ts,34*ts,5);
    ctx.fillStyle=dead?'#795548':teamCol.roof;
    ctx.beginPath();ctx.arc(s.x,s.y-34*ts,11*ts,Math.PI,0);ctx.fill();
  }else if(isStrelets){
    ctx.globalAlpha=dead?0.45:1;
    stoneKeep(s.x-17*ts,s.y-44*ts,34*ts,44*ts,6);
    ctx.fillStyle=dead?'#795548':teamCol.roof;
    for(let i=-1;i<=1;i++){
      roundRect(s.x-15*ts+i*11*ts,s.y-52*ts,9*ts,11*ts,2);ctx.fill();
    }
    ctx.fillStyle='#fff8e1';ctx.font=Math.round(12*ts)+'px system-ui';ctx.textAlign='center';
    if(!dead) ctx.fillText('🏹',s.x,s.y-24*ts);
    ctx.globalAlpha=1;
  }else{
    const asleep=!t.active&&t.alive;
    ctx.globalAlpha=dead?0.4:(asleep?0.55:1);
    const bw=44*ts,bh=60*ts;
    stoneKeep(s.x-bw/2,s.y-bh,bw,bh,7);
    ctx.fillStyle=dead?'#795548':teamCol.roof;
    ctx.beginPath();ctx.moveTo(s.x,s.y-bh-14*ts);ctx.lineTo(s.x+bw*0.45,s.y-bh+2*ts);ctx.lineTo(s.x-bw*0.45,s.y-bh+2*ts);ctx.closePath();ctx.fill();
    ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(s.x,s.y-bh-16*ts,3.5*ts,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=1;
    if(asleep){
      ctx.fillStyle='rgba(0,0,0,0.35)';
      roundRect(s.x-bw/2,s.y-bh,bw,bh,7);ctx.fill();
    }
  }
  if(t.hurtT>0){
    ctx.globalAlpha=Math.min(0.5,t.hurtT*2.2);
    ctx.fillStyle='#ff1744';
    if(isDef) roundRect(s.x-14*ts,s.y-34*ts,28*ts,34*ts,5);
    else if(isStrelets) roundRect(s.x-17*ts,s.y-44*ts,34*ts,44*ts,6);
    else roundRect(s.x-22*ts,s.y-60*ts,44*ts,60*ts,7);
    ctx.fill();
    ctx.globalAlpha=1;
    flashWhite=Math.max(flashWhite,0.08);
  }
  const showHp=t.alive&&(isStrelets||isDef||(isKing&&t.active));
  if(showHp){
    const pct=t.hp/t.max;
    const bh=(isKing?60:(isStrelets?44:34))*ts;
    const barH=Math.max(7,Math.round(10*ts));
    const barW=48*ts;
    ctx.fillStyle='#111';ctx.fillRect(s.x-barW/2,s.y-bh-18*ts,barW,barH);
    ctx.strokeStyle='rgba(255,255,255,0.35)';ctx.strokeRect(s.x-barW/2,s.y-bh-18*ts,barW,barH);
    ctx.fillStyle=pct>0.55?'#66bb6a':(pct>0.3?'#ffca28':'#ef5350');
    ctx.fillRect(s.x-barW/2,s.y-bh-18*ts,barW*pct,barH);
  }
}
/* ========== Пиксель-арт 90-х: SNES / Sega Genesis (1990–95) ==========
 * imageSmoothingEnabled = true везде.
 * Анимация — покадровая (4–8 кадров на действие), без интерполяции поз.
 * Палитры ограниченные; огонь: белый → жёлтый → красный → тёмно-красный.
 * FX — сменяющиеся пиксельные спрайты, без blur / фильтров / мягкой альфы.
 */
const PX = 48;
const sheetCache = Object.create(null);
let vignette = 0;
let flashWhite = 0;

/** Классическая палитра огня 16-bit (квантованные ступени) */
const FIRE_PAL = ['#ffffff', '#ffffaa', '#ffee00', '#ff8800', '#ff4400', '#cc2200', '#881100', '#440800'];
const MAGIC_PAL = ['#ffffff', '#e8d0ff', '#c080ff', '#8040d0', '#4820a0', '#201060'];
const ICE_PAL = ['#ffffff', '#e0f8ff', '#a0e0ff', '#40a0e0', '#2060a0', '#103060'];

function easeInOutCubic(t){
  return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;
}
function pxCanvas(){
  const c = document.createElement('canvas');
  c.width = PX; c.height = PX;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true;
  return {c, g};
}
function pfill(g, x, y, w, h, col){
  if(!col || col.indexOf('rgba')===0) return; /* запрет мягкой альфы в спрайтах */
  g.fillStyle = col;
  g.fillRect(x|0, y|0, w|0, h|0);
}
function pset(g, x, y, col){ pfill(g, x, y, 1, 1, col); }
/** Жёсткий чёрный контур — читаемость как у юнитов SNES */
function strokeBox(g, x, y, w, h, col){
  pfill(g, x-1, y, 1, h, col); pfill(g, x+w, y, 1, h, col);
  pfill(g, x, y-1, w, 1, col); pfill(g, x, y+h, w, 1, col);
}
/** Квантованный диттер вместо градиента */
function dither(g, x, y, w, h, col){
  for(let yy=0; yy<h; yy++) for(let xx=0; xx<w; xx++)
    if(((xx+yy)&1)===0) pset(g, x+xx, y+yy, col);
}
/** Жёсткая пиксельная тень под ногами (не ellipse+alpha) */
function paintHardShadow(g, cx, cy, w){
  const hw = (w||10)|0;
  pfill(g, cx-hw, cy, hw*2, 2, '#000000');
  pfill(g, cx-hw+2, cy+2, hw*2-4, 1, '#181818');
}
/** Язык пиксельного огня — несколько кадров палитры FIRE_PAL */
function paintPixelFlame(g, x, y, frame, scale){
  const sc = scale||1;
  const f = ((frame%8)+8)%8;
  const h = (6+((f%4)^2))*sc|0;
  const cols = [
    FIRE_PAL[Math.min(7, 3+((f)&3))],
    FIRE_PAL[Math.min(7, 2+(f%3))],
    FIRE_PAL[1],
    FIRE_PAL[0]
  ];
  pfill(g, x, y-h, 3*sc, h, cols[0]);
  pfill(g, x+sc, y-h-(2+(f&1))*sc, 2*sc, h, cols[1]);
  pfill(g, x+sc, y-h-4*sc, sc, 3*sc, cols[2]);
  if(f%2===0) pset(g, x+2*sc, y-h-5*sc, cols[3]);
  /* искры размером 1px */
  if(f&1) pset(g, x-sc, y-h-2*sc, FIRE_PAL[2]);
  if(f>3) pset(g, x+3*sc, y-h, FIRE_PAL[3]);
}
function shade(hex, amt){
  const n = parseInt(String(hex).replace('#',''), 16);
  if(Number.isNaN(n)) return hex;
  /* квантование к шагу 16 — «ограниченная» 16-bit палитра */
  let r = (n >> 16) + amt, gg = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
  r = Math.max(0, Math.min(255, r)); gg = Math.max(0, Math.min(255, gg)); b = Math.max(0, Math.min(255, b));
  r = (r>>4)<<4; gg = (gg>>4)<<4; b = (b>>4)<<4;
  return '#' + ((r << 16) | (gg << 8) | b).toString(16).padStart(6, '0');
}
function palAlly(kind){
  /* Светлые «игрушечные» палитры Clash Royale vibe — не мрачные */
  const base = {
    knight: {skin:'#ffe0b2', armor:'#64b5f6', accent:'#ffd54f', hair:'#6d4c41', weapon:'#eceff1', line:'#37474f', boot:'#5d4037'},
    archer: {skin:'#ffe0b2', armor:'#66bb6a', accent:'#c5e1a5', hair:'#33691e', weapon:'#8d6e63', line:'#37474f', boot:'#5d4037'},
    rider:  {skin:'#ffe0b2', armor:'#42a5f5', accent:'#ffca28', hair:'#455a64', weapon:'#ffe082', line:'#37474f', boot:'#5d4037'},
    skeleton:{skin:'#fffde7', armor:'#b0bec5', accent:'#80deea', hair:'#90a4ae', weapon:'#eceff1', line:'#546e7a', boot:'#78909c'},
    dragon: {skin:'#81c784', armor:'#43a047', accent:'#ffeb3b', hair:'#2e7d32', weapon:'#ff9800', line:'#1b5e20', boot:'#388e3c'},
    peasant:{skin:'#ffe0b2', armor:'#a1887f', accent:'#ffcc80', hair:'#6d4c41', weapon:'#8d6e63', line:'#4e342e', boot:'#5d4037'},
    bird:   {skin:'#ffb74d', armor:'#ffa726', accent:'#fff59d', hair:'#ef6c00', weapon:'#fffde7', line:'#e65100', boot:'#f57c00'},
    cannon: {skin:'#bcaaa4', armor:'#8d6e63', accent:'#ffd54f', hair:'#5d4037', weapon:'#fff176', line:'#3e2723', boot:'#4e342e'},
    mage:   {skin:'#ffe0b2', armor:'#7e57c2', accent:'#ea80fc', hair:'#4527a0', weapon:'#40c4ff', line:'#311b92', boot:'#5e35b1'},
    robber: {skin:'#ffe0b2', armor:'#78909c', accent:'#80cbc4', hair:'#455a64', weapon:'#cfd8dc', line:'#37474f', boot:'#546e7a'},
    leshy:  {skin:'#a5d6a7', armor:'#66bb6a', accent:'#dce775', hair:'#2e7d32', weapon:'#8d6e63', line:'#1b5e20', boot:'#558b2f'},
    orc:    {skin:'#9ccc65', armor:'#8d6e63', accent:'#ff8a65', hair:'#33691e', weapon:'#eceff1', line:'#33691e', boot:'#6d4c41', tusk:'#fff8e1'},
    dwarf:  {skin:'#ffcc80', armor:'#a1887f', accent:'#ffd54f', hair:'#6d4c41', weapon:'#eceff1', line:'#4e342e', boot:'#5d4037'},
    elf:    {skin:'#fff3e0', armor:'#26a69a', accent:'#69f0ae', hair:'#fff59d', weapon:'#b2ff59', line:'#00695c', boot:'#00897b'}
  };
  return base[kind] || base.peasant;
}
/** Палитра по фракции — светлые союзники; враги чуть контрастнее, но не «чёрный ужас» */
function palForCard(kind, ally, faction, cardId){
  let p;
  if(!ally){
    if(faction==='dark'){
      p = Object.assign({}, palAlly(kind==='skeleton'||kind==='mage'||kind==='dragon'?kind:'orc'));
      p.skin = kind==='skeleton'?'#f5f5f5':(kind==='dragon'?'#90caf9':'#b39ddb');
      p.armor='#7e57c2'; p.accent='#ce93d8'; p.hair='#5e35b1'; p.weapon='#e1bee7';
    } else if(faction==='forest'){
      p = Object.assign({}, palAlly(kind==='leshy'||kind==='dragon'||kind==='archer'?kind:'elf'));
      p.armor='#66bb6a'; p.accent='#c5e1a5'; p.skin='#dcedc8';
    } else if(faction==='neutral'){
      p = Object.assign({}, palAlly(kind));
      p.armor='#a1887f'; p.accent='#ffcc80';
    } else if(faction==='elf'){
      p = Object.assign({}, palAlly('elf'));
      p.armor='#26a69a'; p.accent='#80cbc4'; p.skin='#fff8e1';
    } else if(faction==='dwarf'){
      p = Object.assign({}, palAlly('dwarf'));
      p.armor='#8d6e63'; p.accent='#ffb74d'; p.skin='#ffe0b2';
    } else {
      p = Object.assign({}, palAlly('orc'));
      p.armor='#ef5350'; p.accent='#ffab91';
    }
    if(kind==='dragon'){
      if(faction==='dark'){ p.skin='#90caf9'; p.armor='#5c6bc0'; p.accent='#e1f5fe'; }
      else if(faction==='forest'){ p.skin='#81c784'; p.armor='#43a047'; p.accent='#f0f4c3'; }
      else { p.skin='#ef5350'; p.armor='#e53935'; p.accent='#ffcc80'; }
    }
    if(kind==='skeleton'){ p.skin='#fffde7'; p.armor='#b0bec5'; p.accent='#80deea'; }
    if(kind==='bird'){ p.skin='#ff8a65'; p.armor='#ff7043'; p.accent='#ffe082'; }
    if(kind==='leshy'){ p.skin='#aed581'; p.armor='#7cb342'; p.accent='#f0f4c3'; }
    if(kind==='cannon'){ p.armor='#8d6e63'; p.accent='#ffca28'; }
    if(kind==='mage'){ p.armor='#ab47bc'; p.accent='#ea80fc'; p.weapon='#40c4ff'; }
    p.line='#455a64';
    return p;
  }
  /* Союзник — чистый яркий стиль фракции */
  if(faction==='orc'){
    p = Object.assign({}, palAlly(kind==='dragon'||kind==='mage'||kind==='archer'?kind:'orc'));
    if(kind==='mage'){ p.armor='#ff7043'; p.accent='#ffab40'; p.weapon='#ffee58'; }
    if(kind==='dragon'){ p.skin='#66bb6a'; p.accent='#ffee58'; }
    return p;
  }
  if(faction==='dark'){
    p = Object.assign({}, palAlly(kind==='skeleton'||kind==='mage'||kind==='dragon'||kind==='rider'?kind:'robber'));
    p.armor='#9575cd'; p.accent='#e1bee7'; p.skin=kind==='skeleton'?'#fffde7':'#ffe0b2';
    p.hair='#7e57c2'; p.weapon='#ce93d8';
    if(kind==='dragon'){ p.skin='#81d4fa'; p.accent='#e1f5fe'; }
    if(kind==='mage'){ p.armor='#7e57c2'; p.accent='#ea80fc'; p.weapon='#80d8ff'; }
    if(kind==='rider'){ p.armor='#7e57c2'; p.accent='#ffd54f'; }
    return p;
  }
  if(faction==='forest'){
    p = Object.assign({}, palAlly(kind==='leshy'||kind==='dragon'||kind==='archer'||kind==='mage'?kind:'elf'));
    p.armor='#66bb6a'; p.accent='#dcedc8'; p.hair='#2e7d32'; p.skin='#f1f8e9';
    if(kind==='dragon'){ p.skin='#9ccc65'; p.accent='#ffee58'; }
    return p;
  }
  if(faction==='neutral'){
    p = Object.assign({}, palAlly(kind));
    p.armor='#a1887f'; p.accent='#ffcc80'; p.skin='#ffe0b2';
    return p;
  }
  if(faction==='elf'){
    p = Object.assign({}, palAlly(kind==='mage'||kind==='archer'||kind==='leshy'||kind==='bird'?kind:'elf'));
    if(kind==='mage'){
      if(cardId==='mag'){ p.armor='#ef5350'; p.accent='#ffee58'; p.weapon='#ff6e40'; p.hair='#b71c1c'; }
      else if(cardId==='perun'){ p.armor='#5c6bc0'; p.accent='#fff59d'; p.weapon='#ffee58'; p.hair='#283593'; }
      else if(cardId==='volhv'){ p.armor='#1565c0'; p.accent='#ffd54f'; p.weapon='#40c4ff'; p.hair='#fffde7'; p.skin='#ffe0b2'; }
      else if(cardId==='koldun'){ p.armor='#ff7043'; p.accent='#ffab40'; p.weapon='#ffee58'; p.hair='#bf360c'; }
      else { p.armor='#42a5f5'; p.accent='#ffee58'; p.weapon='#40c4ff'; p.hair='#1565c0'; }
    }
    p.armor = p.armor || '#26a69a'; p.accent = p.accent || '#69f0ae'; p.hair = p.hair || '#fff59d';
    return p;
  }
  if(faction==='dwarf'){
    p = Object.assign({}, palAlly(kind==='cannon'?'cannon':'dwarf'));
    if(kind==='knight'){ p.armor='#ff8a65'; p.accent='#ffd54f'; p.skin='#ffe0b2'; }
    return p;
  }
  /* alliance */
  p = Object.assign({}, palAlly(kind));
  if(kind==='mage'){ p.armor='#5c6bc0'; p.accent='#82b1ff'; p.weapon='#40c4ff'; }
  return p;
}
function palEnemy(kind){
  return palForCard(kind, false, 'orc');
}

function paintWeapon(g, pal, pose, weapon, bodyY, armR, armL){
  const O = pal.line || '#111';
  if(weapon === 'sword'){
    pfill(g, 34, 10+bodyY+armR, 3, 16, pal.weapon);
    pfill(g, 32, 22+bodyY+armR, 7, 3, pal.accent);
    pfill(g, 35, 10+bodyY+armR, 1, 10, shade(pal.weapon, 30));
  } else if(weapon === 'bow'){
    g.strokeStyle = pal.weapon; g.lineWidth = 2;
    g.beginPath(); g.arc(36, 24+bodyY+armR, 8, -1.2, 1.2); g.stroke();
    if(pose.draw){ pfill(g, 24, 24+bodyY, 10, 2, '#e8e0d0'); pfill(g, 33, 23+bodyY, 3, 4, '#c0a060'); }
  } else if(weapon === 'shield'){
    /* Крупный щит танка — читается с поля как у Рыцаря CR; на attack — вперёд */
    const sx = pose.shieldFwd ? -2 : 1;
    strokeBox(g, sx, 14+bodyY+armL, 14, 18, O);
    pfill(g, sx, 14+bodyY+armL, 14, 18, '#cfd8dc');
    pfill(g, sx+2, 16+bodyY+armL, 10, 14, '#78909c');
    pfill(g, sx+4, 18+bodyY+armL, 6, 10, pal.accent || '#ffd54f');
    pfill(g, sx+5, 20+bodyY+armL, 4, 4, '#fff8e1');
    strokeBox(g, sx, 14+bodyY+armL, 14, 18, '#212121');
  } else if(weapon === 'scythe'){
    pfill(g, 34, 6+bodyY+armR, 3, 22, '#687880');
    pfill(g, 24, 6+bodyY+armR, 12, 3, '#e0e4e8');
  } else if(weapon === 'staff'){
    pfill(g, 35, 6+bodyY+armR, 3, 22, '#a1887f');
    pfill(g, 32, 3+bodyY+armR, 9, 8, pal.weapon||'#40c4ff');
    pfill(g, 34, 5+bodyY+armR, 5, 4, '#fff59d');
    pset(g, 36, 4+bodyY+armR, '#fff');
    pset(g, 33, 7+bodyY+armR, '#fffde7');
    /* вспышка кристалла/посоха на hit-frame (маг / хилер) */
    if(pose.flash){
      pfill(g, 30, 1+bodyY+armR, 13, 12, pose.healPulse ? '#69f0ae' : '#fff59d');
      pfill(g, 33, 3+bodyY+armR, 7, 7, pose.healPulse ? '#fff' : '#40c4ff');
      pset(g, 36, 2+bodyY+armR, '#fff');
    }
  } else if(weapon === 'axe'){
    pfill(g, 34, 12+bodyY+armR, 3, 16, '#5a4030');
    pfill(g, 30, 10+bodyY+armR, 10, 6, pal.weapon);
    pfill(g, 31, 11+bodyY+armR, 8, 2, shade(pal.weapon, 25));
  } else if(weapon === 'spear'){
    pfill(g, 36, 4+bodyY+armR, 2, 28, '#6a5030');
    pfill(g, 34, 4+bodyY+armR, 6, 5, pal.weapon);
  }
}
/** Дуга удара на hit-кадре — уникальный след, не общая вспышка */
function paintSlashTrail(g, pose, color){
  if(!pose.slash) return;
  const col = color || '#fff8e1';
  for(let i = 0; i < 5; i++){
    const t = i / 4;
    const x = 28 + Math.cos(-0.4 + t * 1.4) * (10 + i);
    const y = 14 + Math.sin(-0.4 + t * 1.4) * (8 + i * 0.5) + (pose.bodyY || 0);
    pfill(g, x|0, y|0, 2, 2, col);
  }
  pfill(g, 36, 18+(pose.bodyY||0), 4, 2, col);
}

/** Люди Руси — роли: footman / archer / knight / mage / rider (WC2 vibe) */
function paintHumanoid(g, pal, pose, weapon, kind){
  const legL = pose.legL || 0, legR = pose.legR || 0;
  const armL = pose.armL || 0, armR = pose.armR || 0;
  const bodyY = pose.bodyY || 0;
  const O = pal.line || '#111';
  const isKnight = kind === 'knight';
  const isArcher = kind === 'archer';
  const isMage = kind === 'mage';
  const isRider = kind === 'rider';
  const isRobber = kind === 'robber';
  const cid = pose.cardId;
  /* Силуэт: широкий танк / высокий маг / стройный лучник */
  let torsoW = isKnight ? 22 : (isArcher || isRobber ? 18 : 20);
  let torsoH = isKnight ? 17 : 16;
  let headLift = 0;
  if(cid==='vityaz'||cid==='druzhinnik'||cid==='ilya'||cid==='dvorf'||cid==='grom'){
    torsoW = 26; torsoH = 18; /* широкий танк */
  } else if(cid==='volhv'||cid==='mag'||cid==='perun'||cid==='koldun'){
    torsoW = 16; torsoH = 18; headLift = -2; /* высокий худой маг */
  } else if(cid==='streltsy'||cid==='lesovik'||cid==='troll'){
    torsoW = 15; torsoH = 15; /* стройный лучник */
  } else if(cid==='skomorokh'||cid==='opolchenets'||cid==='razboyniki'){
    torsoW = 14; torsoH = 13; /* мелкий рой */
  }
  const torsoX = 24 - (torsoW >> 1);
  paintHardShadow(g, 24, 44, cid==='vityaz'?12:10);
  if(pose.dead){
    strokeBox(g, 8, 26, 28, 10, O);
    pfill(g, 8, 26, 28, 10, pal.armor);
    pfill(g, 30, 22, 10, 10, pal.skin);
    pfill(g, 8, 28, 28, 2, shade(pal.armor, -25));
    return;
  }
  // плащ (всадник / маг) — у мага светлый, не тёмный
  if(isRider || isMage){
    const cloak = isMage ? shade(pal.accent, 10) : shade(pal.armor, -15);
    const ch = isMage ? 22 : 18;
    strokeBox(g, 10, 14+bodyY+headLift, 8, ch, O);
    pfill(g, 10, 14+bodyY+headLift, 8, ch, cloak);
    dither(g, 11, 16+bodyY+headLift, 6, ch-4, shade(cloak, -20));
    if(cid==='volhv'||cid==='mag'){
      /* звёзды на мантии */
      pset(g, 12, 18+bodyY, '#ffee58'); pset(g, 14, 24+bodyY, '#fff'); pset(g, 11, 28+bodyY, '#ffee58');
    }
  }
  if(cid==='vityaz'){
    /* красный плащ за спиной — цветовая фишка танка */
    pfill(g, 34, 16+bodyY, 8, 20, '#e53935');
    strokeBox(g, 34, 16+bodyY, 8, 20, O);
    pfill(g, 36, 18+bodyY, 4, 14, '#ef5350');
  }
  strokeBox(g, 15, 34+bodyY, 6, 9+legL, O); pfill(g, 15, 34+bodyY, 6, 9+legL, pal.boot||pal.armor);
  strokeBox(g, 27, 34+bodyY, 6, 9+legR, O); pfill(g, 27, 34+bodyY, 6, 9+legR, pal.boot||pal.armor);
  pfill(g, 15, 41+bodyY+legL, 6, 2, shade(pal.boot||pal.armor, -20));
  pfill(g, 27, 41+bodyY+legR, 6, 2, shade(pal.boot||pal.armor, -20));
  strokeBox(g, torsoX, 18+bodyY+headLift, torsoW, torsoH, O);
  pfill(g, torsoX, 18+bodyY+headLift, torsoW, torsoH, pal.armor);
  pfill(g, torsoX+1, 19+bodyY+headLift, torsoW-2, 4, pal.accent);
  dither(g, torsoX+1, 24+bodyY+headLift, torsoW-2, 8, shade(pal.armor, -18));
  // наплечники: knight крупнее
  const pad = (cid==='vityaz'||isKnight) ? 6 : 4;
  pfill(g, torsoX-3, 18+bodyY+headLift, pad, isKnight ? 7 : 6, pal.armor); strokeBox(g, torsoX-3, 18+bodyY+headLift, pad, isKnight ? 7 : 6, O);
  pfill(g, torsoX+torsoW-1, 18+bodyY+headLift, pad, isKnight ? 7 : 6, pal.armor); strokeBox(g, torsoX+torsoW-1, 18+bodyY+headLift, pad, isKnight ? 7 : 6, O);
  if(isKnight||cid==='vityaz'){
    pfill(g, torsoX+2, 26+bodyY+headLift, torsoW-4, 2, shade(pal.accent, 20));
  }
  // голова + головной убор по роли
  const hy = 6+bodyY+headLift;
  strokeBox(g, 16, hy, 16, 13, O); pfill(g, 16, hy, 16, 13, pal.skin);
  if(cid==='vityaz'||(isKnight&&cid!=='druzhinnik')){
    strokeBox(g, 14, hy-4, 20, 10, O); pfill(g, 14, hy-4, 20, 10, '#b0bec5');
    pfill(g, 16, hy-2, 16, 3, '#eceff1');
    pfill(g, 20, hy+2, 8, 6, '#37474f'); /* забрало */
    pfill(g, 22, hy-6, 4, 3, '#e53935'); /* плюмаж */
  } else if(isKnight){
    strokeBox(g, 15, hy-3, 18, 8, O); pfill(g, 15, hy-3, 18, 8, '#90a0b0');
    pfill(g, 17, hy-1, 14, 2, shade('#90a0b0', 25));
    pfill(g, 22, hy+2, 4, 5, '#303840');
  } else if(isArcher||cid==='streltsy'){
    strokeBox(g, 13, hy-4, 22, 10, O); pfill(g, 13, hy-4, 22, 10, '#2e7d32');
    pfill(g, 13, hy+2, 7, 12, '#388e3c'); /* капюшон */
    pfill(g, 14, hy-2, 18, 3, '#66bb6a');
  } else if(isMage||cid==='volhv'||cid==='mag'){
    /* высокий колпак + звезда */
    pfill(g, 20, hy-8, 8, 5, '#ffee58');
    strokeBox(g, 14, hy-5, 20, 9, O); pfill(g, 14, hy-5, 20, 9, cid==='volhv'?'#1565c0':pal.armor);
    pfill(g, 16, hy-3, 16, 3, shade(cid==='volhv'?'#42a5f5':pal.accent, 20));
    pfill(g, 22, hy-10, 4, 4, '#fff59d');
    pset(g, 23, hy-11, '#fff');
    if(cid==='volhv'){
      /* белая борода Кошутки */
      pfill(g, 18, hy+8, 12, 6, '#fafafa');
      pfill(g, 19, hy+10, 10, 4, '#eceff1');
      pfill(g, 20, hy+13, 8, 3, '#fff');
    }
    pfill(g, 18, 20+bodyY+headLift, 12, 3, '#ffee58');
  } else if(isRobber){
    pfill(g, 16, hy-2, 16, 6, '#78909c');
    pfill(g, 18, hy+3, 12, 3, '#90a4ae');
  } else {
    pfill(g, 16, hy-1, 16, 4, pal.hair);
  }
  pfill(g, 19, hy+5, 2, 2, '#101010'); pfill(g, 27, hy+5, 2, 2, '#101010');
  pfill(g, 17, hy+2, 4, 2, shade(pal.skin, 20));
  strokeBox(g, 8, 20+bodyY+armL+headLift, 6, 10, O); pfill(g, 8, 20+bodyY+armL+headLift, 6, 10, pal.skin);
  strokeBox(g, 34, 20+bodyY+armR+headLift, 6, 10, O); pfill(g, 34, 20+bodyY+armR+headLift, 6, 10, pal.skin);
  paintWeapon(g, pal, pose, weapon, bodyY+headLift, armR, armL);
  if(weapon === 'shield'||cid==='vityaz'||cid==='druzhinnik'||cid==='dvorf'||cid==='ilya'||cid==='grom'||cid==='chernyvityaz'){
    /* Крупный щит — силуэт танка (Clash Knight vibe); на attack — вперёд */
    const sx = pose.shieldFwd ? -3 : 0, sy = 12+bodyY, sw = 15, sh = 20;
    strokeBox(g, sx, sy, sw, sh, '#111');
    pfill(g, sx, sy, sw, sh, '#eceff1');
    pfill(g, sx+2, sy+2, sw-4, sh-4, '#90a4ae');
    pfill(g, sx+3, sy+4, sw-6, sh-8, '#e53935');
    pfill(g, sx+5, sy+8, 5, 5, '#ffd54f');
    pfill(g, sx+6, sy+9, 3, 3, '#fff8e1');
    /* меч в правой руке */
    pfill(g, 34, 6+bodyY+armR, 3, 20, '#cfd8dc');
    pfill(g, 35, 6+bodyY+armR, 1, 16, '#fff');
    pfill(g, 32, 22+bodyY+armR, 7, 3, '#ffd54f');
  }
  if(cid==='streltsy'){
    /* колчан за спиной + длинный лук */
    pfill(g, 6, 14+bodyY, 5, 14, '#5d4037');
    pfill(g, 7, 16+bodyY, 3, 3, '#ffcc80');
    pfill(g, 7, 20+bodyY, 3, 3, '#ffcc80');
    g.strokeStyle = '#6d4c41'; g.lineWidth = 2;
    g.beginPath(); g.arc(40, 22+bodyY, 12, -1.3, 1.3); g.stroke();
    pfill(g, 28, 20+bodyY, 12, 2, '#ffe0b2'); /* тетива */
    if(pose.draw) pfill(g, 24, 21+bodyY, 8, 2, '#fff8e1');
  }
  if(cid==='volhv'){
    /* посох выше головы с кристаллом */
    pfill(g, 38, 0+bodyY, 3, 28, '#8d6e63');
    pfill(g, 35, -4+bodyY, 9, 8, pose.flash ? '#fff59d' : '#40c4ff');
    pfill(g, 37, -2+bodyY, 5, 4, pose.flash ? '#fff' : '#e1f5fe');
    pset(g, 39, -3+bodyY, '#fff');
    if(pose.flash){ pfill(g, 34, -6+bodyY, 11, 4, '#ffee58'); pfill(g, 40, 2+bodyY, 4, 4, '#80d8ff'); }
  }
  if(cid==='vasilisa' && (pose.healPulse || pose.flash)){
    /* зелёный пульс ауры хилера */
    pfill(g, 10, 8+bodyY, 4, 4, '#69f0ae');
    pfill(g, 34, 10+bodyY, 4, 4, '#69f0ae');
    pfill(g, 20, 2+bodyY, 8, 3, '#a5d6a7');
    pfill(g, 22, 0+bodyY, 4, 2, '#fff');
  }
  paintSlashTrail(g, pose, pal.accent);
  applyRusDetails(g, pal, pose, pose.cardId, bodyY+headLift);
}

/** Детали русской тематики по cardId (ушанка, сарафан, папаха…) */
function applyRusDetails(g, pal, pose, cardId, bodyY){
  if(!cardId || pose.dead) return;
  const y = bodyY || 0;
  if(cardId === 'opolchenets'){
    pfill(g, 14, 3+y, 5, 7, '#5d4037'); pfill(g, 29, 3+y, 5, 7, '#5d4037');
    pfill(g, 16, 2+y, 16, 5, '#6d4c41');
    pfill(g, 18, 14+y, 12, 3, '#6d4c41');
  } else if(cardId === 'druzhinnik'){
    strokeBox(g, 4, 18+y, 10, 12, pal.line||'#111');
    pfill(g, 4, 18+y, 10, 12, '#90a4ae');
    pfill(g, 6, 20+y, 6, 6, '#ffd54f');
    pfill(g, 16, 8+y, 16, 3, '#78909c');
  } else if(cardId === 'skomorokh'){
    /* Парни: пёстрые лоскуты + разные «шляпы» — читается как рой */
    pfill(g, 12, -2+y, 8, 5, '#e53935');
    pfill(g, 28, -1+y, 8, 5, '#1e88e5');
    pfill(g, 20, 0+y, 6, 4, '#ffd54f');
    pfill(g, 14, 18+y, 6, 8, '#9ccc65');
    pfill(g, 28, 20+y, 6, 6, '#8d6e63');
    pfill(g, 18, 10+y, 4, 2, '#212121'); /* повязка */
  } else if(cardId === 'volhv'){
    pfill(g, 16, 18+y, 16, 12, '#1565c0');
    pfill(g, 18, 20+y, 12, 2, '#ffd54f');
    pfill(g, 18, 12+y, 12, 5, '#fafafa'); /* борода дубль */
    pfill(g, 36, -2+y, 8, 7, '#40c4ff');
  } else if(cardId === 'vityaz'){
    pfill(g, 2, 16+y, 12, 16, '#90a4ae');
    pfill(g, 4, 18+y, 8, 10, '#e53935');
    pfill(g, 6, 21+y, 4, 4, '#ffd54f');
  } else if(cardId === 'streltsy'){
    pfill(g, 5, 12+y, 6, 16, '#5d4037');
    pfill(g, 6, 14+y, 4, 3, '#ffcc80');
    pfill(g, 13, 0+y, 22, 8, '#2e7d32');
  } else if(cardId === 'vasilisa'){
    /* Хилер: зелёный нимб + крест на посохе — мгновенно читается */
    pfill(g, 16, 0+y, 16, 5, '#43a047');
    pfill(g, 18, 1+y, 12, 3, '#81c784');
    pfill(g, 15, 20+y, 18, 12, '#ec407a');
    pfill(g, 17, 22+y, 14, 3, '#f8bbd0');
    pfill(g, 34, 4+y, 3, 22, '#8d6e63');
    pfill(g, 31, 2+y, 9, 8, '#66bb6a');
    pfill(g, 34, 0+y, 3, 12, '#fff');
    pfill(g, 31, 4+y, 9, 3, '#fff');
    pfill(g, 21, -2+y, 2, 2, '#69f0ae');
    pfill(g, 25, -4+y, 2, 2, '#fff');
    pfill(g, 29, -1+y, 2, 2, '#69f0ae');
  } else if(cardId === 'kazak'){
    pfill(g, 16, 0+y, 16, 7, '#3e2723');
    pfill(g, 18, 14+y, 12, 2, '#5d4037');
    pfill(g, 8, 22+y, 3, 10, '#cfd8dc');
  } else if(cardId === 'ilya'){
    pfill(g, 15, 2+y, 18, 6, '#ffd54f');
    pfill(g, 20, 8+y, 8, 4, '#ffecb3');
  } else if(cardId === 'dobrynya'){
    pfill(g, 15, 2+y, 18, 6, '#b0bec5');
    pfill(g, 22, 1+y, 4, 3, '#eceff1');
  } else if(cardId === 'perun'){
    pfill(g, 32, 2+y, 8, 5, '#fff59d');
    pfill(g, 34, 0+y, 2, 8, '#ffe082');
    pfill(g, 30, 4+y, 10, 2, '#fff');
  } else if(cardId === 'sadko'){
    pfill(g, 28, 22+y, 12, 6, '#8d6e63');
    pfill(g, 30, 20+y, 8, 2, '#ffe0b2');
  } else if(cardId === 'mag'){
    pfill(g, 16, 18+y, 16, 10, '#ef5350');
    pfill(g, 18, 20+y, 12, 3, '#ffee58');
    pfill(g, 32, 4+y, 8, 6, '#ff6e40');
    pfill(g, 34, 2+y, 4, 4, '#fff59d');
  } else if(cardId === 'koldun'){
    pfill(g, 16, 18+y, 16, 10, '#ff7043');
    pfill(g, 18, 20+y, 12, 3, '#ffab40');
    pfill(g, 33, 3+y, 7, 6, '#ffee58');
  } else if(cardId === 'kostey'){
    pfill(g, 16, 2+y, 16, 5, '#ffd54f');
    pfill(g, 18, 18+y, 12, 8, '#80deea');
    pfill(g, 20, 10+y, 3, 3, '#40c4ff'); pfill(g, 26, 10+y, 3, 3, '#40c4ff');
  } else if(cardId === 'upyr'){
    pfill(g, 16, 4+y, 16, 6, '#ce93d8');
    pfill(g, 18, 18+y, 12, 8, '#e1bee7');
  } else if(cardId === 'chernyvityaz'){
    pfill(g, 10, 16+y, 8, 16, '#b39ddb');
    pfill(g, 16, 2+y, 16, 5, '#ffd54f');
  }
}

/** Орки врага — grunt / archer / brute / mage (Calciumtrice / Doomland vibe) */
function paintOrc(g, pal, pose, weapon, kind){
  const legL = pose.legL || 0, legR = pose.legR || 0;
  const armL = pose.armL || 0, armR = pose.armR || 0;
  const bodyY = pose.bodyY || 0;
  const O = pal.line || '#081008';
  const isBrute = kind === 'knight' || weapon === 'shield';
  const isArcher = kind === 'archer' || weapon === 'bow';
  const isMage = kind === 'mage' || weapon === 'staff';
  const isRider = kind === 'rider';
  let wpn = weapon === 'none' ? 'axe' : weapon;
  if(!weapon || weapon === 'none'){
    if(isArcher) wpn = 'bow';
    else if(isMage) wpn = 'staff';
    else if(isBrute) wpn = 'shield';
    else wpn = 'axe';
  }
  const torsoW = isBrute ? 28 : (isArcher ? 20 : 24);
  const torsoX = 24 - (torsoW >> 1);
  const torsoH = isBrute ? 20 : 18;
  paintHardShadow(g, 24, 44, 10);
  if(pose.dead){
    strokeBox(g, 6, 28, 32, 10, O);
    pfill(g, 6, 28, 32, 10, pal.armor);
    pfill(g, 28, 24, 12, 10, pal.skin);
    pfill(g, 30, 30, 3, 2, pal.tusk||'#e8e0d0');
    return;
  }
  if(isRider){
    pfill(g, 8, 20+bodyY, 10, 16, shade(pal.armor, -30));
    strokeBox(g, 8, 20+bodyY, 10, 16, O);
  }
  strokeBox(g, 14, 34+bodyY, 7, 9+legL, O); pfill(g, 14, 34+bodyY, 7, 9+legL, pal.boot||'#2a2010');
  strokeBox(g, 27, 34+bodyY, 7, 9+legR, O); pfill(g, 27, 34+bodyY, 7, 9+legR, pal.boot||'#2a2010');
  strokeBox(g, torsoX, 17+bodyY, torsoW, torsoH, O);
  pfill(g, torsoX, 17+bodyY, torsoW, torsoH, pal.armor);
  pfill(g, torsoX+2, 19+bodyY, torsoW-4, 5, pal.accent);
  dither(g, torsoX+2, 25+bodyY, torsoW-4, 8, shade(pal.armor, -20));
  if(isBrute){
    pfill(g, torsoX-2, 16+bodyY, 6, 8, pal.armor); strokeBox(g, torsoX-2, 16+bodyY, 6, 8, O);
    pfill(g, torsoX+torsoW-4, 16+bodyY, 6, 8, pal.armor); strokeBox(g, torsoX+torsoW-4, 16+bodyY, 6, 8, O);
    pfill(g, torsoX+4, 28+bodyY, torsoW-8, 3, '#303030'); // пояс-броня
  }
  // голова: brute — шипастый шлем; archer — капюшон; mage — череп-корона
  const headW = isBrute ? 20 : 18;
  const headX = 24 - (headW >> 1);
  strokeBox(g, headX, 4+bodyY, headW, 14, O); pfill(g, headX, 4+bodyY, headW, 14, pal.skin);
  if(isBrute){
    strokeBox(g, headX-1, 2+bodyY, headW+2, 7, O); pfill(g, headX-1, 2+bodyY, headW+2, 7, '#4a3030');
    pfill(g, headX+3, 1+bodyY, 2, 4, '#c0c0c0'); pfill(g, headX+headW-5, 1+bodyY, 2, 4, '#c0c0c0');
  } else if(isArcher){
    pfill(g, headX-2, 2+bodyY, headW+4, 8, '#2a4018');
    pfill(g, headX-2, 8+bodyY, 5, 10, '#2a4018');
  } else if(isMage){
    /* яркий колпак вместо черепа */
    pfill(g, headX+2, -1+bodyY, headW-4, 6, '#ffee58');
    pfill(g, headX+1, 1+bodyY, headW-2, 5, pal.armor||'#ff7043');
    pfill(g, headX+4, 2+bodyY, headW-8, 2, '#fff59d');
  } else {
    pfill(g, headX, 3+bodyY, headW, 4, pal.hair);
  }
  pfill(g, headX+3, 9+bodyY, 3, 3, '#101010'); pfill(g, headX+headW-6, 9+bodyY, 3, 3, '#101010');
  pset(g, headX+4, 10+bodyY, '#e04030'); pset(g, headX+headW-5, 10+bodyY, '#e04030');
  pfill(g, headX+3, 15+bodyY, 3, 3, pal.tusk||'#e8e0d0');
  pfill(g, headX+headW-6, 15+bodyY, 3, 3, pal.tusk||'#e8e0d0');
  const armW = isBrute ? 8 : 7;
  strokeBox(g, 6, 18+bodyY+armL, armW, 12, O); pfill(g, 6, 18+bodyY+armL, armW, 12, pal.skin);
  strokeBox(g, 48-6-armW, 18+bodyY+armR, armW, 12, O); pfill(g, 48-6-armW, 18+bodyY+armR, armW, 12, pal.skin);
  paintWeapon(g, pal, pose, wpn, bodyY, armR, armL);
  if(wpn === 'shield'){
    pfill(g, 34, 10+bodyY+armR, 3, 14, pal.weapon);
    pfill(g, 32, 20+bodyY+armR, 7, 3, pal.accent);
  }
  paintSlashTrail(g, pose, '#ffcc80');
}

function paintSkeleton(g, pal, pose){
  const legL = pose.legL || 0, legR = pose.legR || 0, armR = pose.armR || 0, bodyY = pose.bodyY || 0;
  const O = pal.line || '#546e7a';
  paintHardShadow(g, 24, 44, 10);
  if(pose.dead){ pfill(g, 10, 30, 26, 8, pal.skin); dither(g, 12, 32, 20, 4, '#90a4ae'); return; }
  pfill(g, 17, 34+bodyY, 4, 9+legL, pal.skin); pfill(g, 28, 34+bodyY, 4, 9+legR, pal.skin);
  strokeBox(g, 16, 18+bodyY, 16, 15, O); pfill(g, 16, 18+bodyY, 16, 15, pal.skin);
  pfill(g, 18, 21+bodyY, 12, 1, '#80deea'); pfill(g, 18, 25+bodyY, 12, 1, '#80deea');
  strokeBox(g, 16, 6+bodyY, 16, 12, O); pfill(g, 16, 6+bodyY, 16, 12, pal.skin);
  pfill(g, 19, 10+bodyY, 3, 3, '#40c4ff'); pfill(g, 27, 10+bodyY, 3, 3, '#40c4ff');
  pset(g, 20, 11+bodyY, '#fff'); pset(g, 28, 11+bodyY, '#fff');
  pfill(g, 34, 10+bodyY+armR, 3, 18, pal.weapon||'#b0bec5');
  pfill(g, 8, 20+bodyY, 5, 9, pal.skin);
  paintSlashTrail(g, pose, '#80deea');
}

function paintDragon(g, pal, pose){
  const flap = pose.flap || 0, fire = pose.fire || 0;
  const O = pal.line || '#111';
  paintHardShadow(g, 24, 44, 12);
  if(pose.dead){ pfill(g, 8, 24, 30, 14, pal.skin); return; }
  strokeBox(g, 12, 20, 24, 16, O); pfill(g, 12, 20, 24, 16, pal.skin);
  pfill(g, 14, 22, 20, 5, pal.accent);
  dither(g, 14, 28, 20, 6, shade(pal.skin, -25));
  pfill(g, 2, 14-flap, 12, 8, pal.armor); strokeBox(g, 2, 14-flap, 12, 8, O);
  pfill(g, 34, 14-flap, 12, 8, pal.armor); strokeBox(g, 34, 14-flap, 12, 8, O);
  [[8,8],[18,4],[28,8]].forEach((o,i)=>{
    strokeBox(g, o[0], o[1], 9, 9, O); pfill(g, o[0], o[1], 9, 9, pal.skin);
    pset(g, o[0]+3, o[1]+4, '#fff'); pset(g, o[0]+4, o[1]+4, '#101010');
    /* Пиксельный огонь из пасти: белый→жёлтый→красный */
    if(fire > i) paintPixelFlame(g, o[0]+10, o[1]+6, fire+i, 1);
  });
  pfill(g, 4, 34+(pose.tail||0), 10, 4, pal.armor);
  if(pose.slash) paintSlashTrail(g, pose, FIRE_PAL[3]);
}

function paintBird(g, pal, pose){
  const flap = pose.flap || 0; const O = pal.line || '#111';
  const cid = pose.cardId;
  const wingAmp = (cid==='zharptica' || cid==='sokol') ? flap * 2 : flap;
  paintHardShadow(g, 23, 42, 9);
  if(pose.dead){ pfill(g, 14, 24, 18, 10, pal.skin); return; }
  const body = cid==='sokol' ? '#7e57c2' : (cid==='zharptica' ? '#ff6f00' : pal.skin);
  const wing = cid==='sokol' ? '#b39ddb' : (cid==='zharptica' ? '#ffab00' : pal.accent);
  const by = pose.bodyY || 0;
  strokeBox(g, 16, 16+by, 16, 14, O); pfill(g, 16, 16+by, 16, 14, body);
  pfill(g, 6, 16+by-wingAmp, 11, 7, wing); pfill(g, 31, 16+by-wingAmp, 11, 7, wing);
  if(cid==='zharptica' || cid==='sokol'){
    pfill(g, 4, 18+by-wingAmp, 4, 3, shade(wing, 30));
    pfill(g, 40, 18+by-wingAmp, 4, 3, shade(wing, 30));
  }
  pfill(g, 30, 14+by, 9, 8, cid==='solovey' ? '#8d6e63' : pal.hair);
  pset(g, 33, 17+by, '#fff');
  if(cid==='solovey') pfill(g, 36, 16+by, 5, 2, '#ffcc80');
  if(cid==='zharptica'){ pfill(g, 12, 28+by, 4, 6, '#ff9800'); pfill(g, 32, 28+by, 4, 6, '#ffeb3b'); pfill(g, 18, 18+by, 12, 4, '#fff59d'); }
  if(cid==='sokol'){ pfill(g, 18, 18+by, 12, 3, '#e1bee7'); }
  if(pose.chirp) pfill(g, 38, 18+by, 5, 2, '#fff8e0');
  if(pose.slash) paintSlashTrail(g, pose, cid==='zharptica' ? '#ff9800' : '#ffe0b2');
}

function paintLeshy(g, pal, pose){
  const bodyY = pose.bodyY || 0; const O = pal.line || '#081808';
  const armR = pose.armR || 0, armL = pose.armL || 0;
  paintHardShadow(g, 24, 44, 10);
  if(pose.dead){ pfill(g, 10, 26, 26, 12, pal.armor); return; }
  pfill(g, 18, 32+bodyY, 5, 12, '#5a4030'); pfill(g, 26, 32+bodyY, 5, 12, '#5a4030');
  strokeBox(g, 12, 14+bodyY, 24, 18, O); pfill(g, 12, 14+bodyY, 24, 18, pal.armor);
  dither(g, 14, 18+bodyY, 20, 10, shade(pal.armor, -15));
  pfill(g, 10, 6+bodyY, 28, 12, pal.accent);
  pfill(g, 18, 18+bodyY, 4, 4, '#f0d060'); pfill(g, 28, 18+bodyY, 4, 4, '#f0d060');
  // ветви-руки
  pfill(g, 4, 16+bodyY+armL, 8, 3, '#6d4c41');
  pfill(g, 36, 16+bodyY+armR, 8, 3, '#6d4c41');
  pfill(g, 2, 14+bodyY+armL, 4, 6, pal.accent);
  pfill(g, 42, 14+bodyY+armR, 4, 6, pal.accent);
  paintSlashTrail(g, pose, '#aed581');
}

function paintCannon(g, pal, pose){
  const O = pal.line || '#111';
  const cid = pose.cardId;
  const recoil = pose.recoil || 0;
  paintHardShadow(g, 24, 44, 14);
  if(cid === 'strelbishche'){
    strokeBox(g, 14, 10, 20, 28, O); pfill(g, 14, 10, 20, 28, '#8d6e63');
    pfill(g, 12, 8, 24, 6, '#6d4c41');
    pfill(g, 18, 14, 4, 8, '#ffe0b2'); pfill(g, 26, 14, 4, 8, '#ffe0b2');
    return;
  }
  if(cid === 'kuznitsa'){
    strokeBox(g, 10, 16, 28, 20, O); pfill(g, 10, 16, 28, 20, '#5d4037');
    pfill(g, 16, 20, 16, 10, '#ff6f00');
    pfill(g, 20, 18, 4, 4, '#ffeb3b');
    if(pose.blast){ pfill(g, 22, 8, 6, 6, '#ff9800'); pfill(g, 28, 10, 4, 4, '#ffeb3b'); }
    return;
  }
  pfill(g, 6, 32+recoil, 10, 10, '#2a1810'); pfill(g, 32, 32+recoil, 10, 10, '#2a1810');
  strokeBox(g, 12-recoil, 18+recoil, 24, 14, O); pfill(g, 12-recoil, 18+recoil, 24, 14, pal.armor);
  dither(g, 14-recoil, 20+recoil, 20, 10, shade(pal.armor, -20));
  const ang = pose.ang || 0;
  pfill(g, 18+ang-recoil, 10-ang+recoil, 20, 8, cid==='zharzmei' ? '#e53935' : pal.accent);
  pfill(g, 36+ang-recoil, 10-ang+recoil, 6, 8, '#101010');
  if(pose.blast){ pfill(g, 40, 8, 8, 8, '#f0d040'); pfill(g, 38, 10, 6, 5, '#e07020'); pfill(g, 44, 6, 4, 4, '#fffde7'); }
  if(pose.rock) pfill(g, 20, 12, 5, 5, '#8090a0');
}

const ORCISH = {peasant:1, knight:1, archer:1, rider:1, robber:1, mage:1, orc:1};

function framesFor(kind, ally, weapon, cardId){
  const faction = (CARDS[cardId] && CARDS[cardId].faction) || 'alliance';
  /* Союзные орки/тьма — силуэт орка; эльфы/лес/дворфы — свой paint; враг — орда */
  let paintKind = kind;
  if(!ally && ORCISH[kind]){
    paintKind = (faction==='forest'||faction==='elf'||faction==='neutral'||faction==='dwarf') ? kind : 'orc';
  }
  if(ally && (faction==='orc'||faction==='dark') && ORCISH[kind]) paintKind='orc';
  const pal = palForCard(kind, ally, faction, cardId);
  const sheets = {idle:[], walk:[], attack:[], hit:[], death:[]};
  const draw = (pose) => {
    pose.cardId = cardId;
    pose.faction = faction;
    const {c, g} = pxCanvas();
    if(paintKind === 'orc') paintOrc(g, pal, pose, weapon, kind);
    else if(kind === 'skeleton') paintSkeleton(g, pal, pose);
    else if(kind === 'dragon') paintDragon(g, pal, pose);
    else if(kind === 'bird') paintBird(g, pal, pose);
    else if(kind === 'cannon') paintCannon(g, pal, pose);
    else if(kind === 'leshy') paintLeshy(g, pal, pose);
    else paintHumanoid(g, pal, pose, weapon, kind);
    /* Дворфы — чуть приземистее: дорисовать «низкий» шлем-полоску */
    if(faction === 'dwarf' && !pose.dead && kind !== 'cannon' && kind !== 'dragon'){
      pfill(g, 16, 4+(pose.bodyY||0), 16, 3, pal.accent);
    }
    /* Бык — рога; великан/мясник — шире торс-метка */
    if(cardId === 'byk' && !pose.dead){
      const by = pose.bodyY||0;
      pfill(g, 12, 6+by, 4, 6, '#e8e0d0');
      pfill(g, 32, 6+by, 4, 6, '#e8e0d0');
      pfill(g, 11, 4+by, 3, 3, '#c0b090');
      pfill(g, 34, 4+by, 3, 3, '#c0b090');
    }
    if((cardId==='velikan'||cardId==='myasnik'||cardId==='brazhnik') && !pose.dead){
      pfill(g, 14, 20+(pose.bodyY||0), 20, 4, shade(pal.armor||'#555', -15));
    }
    if(cardId==='brazhnik' && !pose.dead){
      pfill(g, 30, 22+(pose.bodyY||0), 8, 10, '#8d6e63');
      pfill(g, 32, 24+(pose.bodyY||0), 4, 6, '#ffcc80');
    }
    return c;
  };
  for(let i = 0; i < 6; i++){
    const bob = (i % 2);
    const bob2 = (i>>1)&1;
    if(kind === 'dragon') sheets.idle.push(draw({flap: bob+(bob2?1:0), tail: bob}));
    else if(kind === 'bird'){
      const strong = cardId === 'zharptica' || cardId === 'sokol';
      sheets.idle.push(draw({flap: strong ? bob * 3 + bob2 : bob * 2 + bob2, bodyY: strong ? -bob : 0}));
    } else if(kind === 'cannon') sheets.idle.push(draw({ang: bob?1:0}));
    else if(cardId === 'vasilisa'){
      sheets.idle.push(draw({bodyY: bob ? 0 : 1, armL: bob, armR: bob ? 0 : 1, healPulse: bob2}));
    } else if(cardId === 'vityaz' || cardId === 'ilya' || cardId === 'druzhinnik'){
      sheets.idle.push(draw({bodyY: bob, armL: bob ? 0 : 1, armR: bob ? 1 : 0}));
    } else sheets.idle.push(draw({bodyY: bob, armL: bob ? 0 : 1, armR: bob ? 1 : 0}));
  }
  for(let i = 0; i < 8; i++){
    const phase = i % 4;
    const s = phase===0||phase===3 ? -2 : 2;
    const s2 = phase < 2 ? 1 : -1;
    if(kind === 'dragon') sheets.walk.push(draw({flap: (i % 4), tail: s}));
    else if(kind === 'bird'){
      const strong = cardId === 'zharptica' || cardId === 'sokol';
      sheets.walk.push(draw({flap: strong ? (i % 4) + 2 : (i % 4), bodyY: strong ? ((i % 2) ? -1 : 0) : 0}));
    } else if(kind === 'cannon') sheets.walk.push(draw({ang: s2}));
    else if(cardId === 'vityaz' || cardId === 'ilya' || cardId === 'druzhinnik'){
      const heavy = (i % 2) ? 2 : 0;
      sheets.walk.push(draw({legL: s, legR: -s, bodyY: heavy, armL: -s2, armR: s2}));
    } else if(cardId === 'skomorokh' || cardId === 'opolchenets' || cardId === 'razboyniki'){
      const jagged = (i % 3) - 1;
      sheets.walk.push(draw({legL: s + jagged, legR: -s - jagged, bodyY: (i % 3), armL: -s2 * 2, armR: s2 * 2}));
    } else sheets.walk.push(draw({legL: s, legR: -s, bodyY: i % 2, armL: -s2, armR: s2}));
  }
  if(kind === 'dragon'){
    // 8 кадров: пасть → разгорание → пик → спад (SNES fire cycle)
    [
      {flap: 0, fire: 0, tail: 1, bodyY: 0},
      {flap: 1, fire: 1, tail: 2, bodyY: 0},
      {flap: 2, fire: 2, tail: 2, bodyY: 1},
      {flap: 2, fire: 3, tail: 2, bodyY: 1, slash: 1},
      {flap: 1, fire: 3, tail: 1, bodyY: 0, slash: 1},
      {flap: 1, fire: 2, tail: 1, bodyY: 0},
      {flap: 0, fire: 1, tail: 0, bodyY: 0},
      {flap: 0, fire: 0, tail: 0, bodyY: 0}
    ].forEach(p => sheets.attack.push(draw(p)));
  } else if(kind === 'bird'){
    const strong = cardId === 'zharptica' || cardId === 'sokol';
    [
      {flap: strong?1:0, bodyY: -1},
      {flap: strong?3:1, bodyY: -2},
      {flap: strong?5:3, bodyY: -1, chirp: false},
      {flap: strong?5:3, bodyY: 1, chirp: true, slash: 1},
      {flap: strong?4:2, bodyY: 0, chirp: true, slash: 1},
      {flap: strong?2:1, bodyY: 0, chirp: true},
      {flap: 0, bodyY: 0}
    ].forEach(p => sheets.attack.push(draw(p)));
  } else if(kind === 'cannon'){
    [
      {ang: -1, rock: true, recoil: 0},
      {ang: -2, rock: true, recoil: 0},
      {ang: -2, rock: true, recoil: 1},
      {ang: 2, blast: true, slash: 1, recoil: 3},
      {ang: 3, blast: true, slash: 1, recoil: 4},
      {ang: 1, recoil: 2},
      {ang: 0, recoil: 0}
    ].forEach(p => sheets.attack.push(draw(p)));
  } else if(kind === 'leshy'){
    [
      {armR: -2, armL: -1, bodyY: 0},
      {armR: -3, armL: -2, bodyY: 0},
      {armR: -4, armL: -2, bodyY: 1},
      {armR: 4, armL: 3, bodyY: 1, slash: 1},
      {armR: 3, armL: 2, bodyY: 1, slash: 1},
      {armR: 2, armL: 1, bodyY: 0},
      {armR: 0, armL: 0, bodyY: 0}
    ].forEach(p => sheets.attack.push(draw(p)));
  } else if(kind === 'skeleton'){
    [
      {armR: -2, bodyY: 0},
      {armR: -3, bodyY: 0},
      {armR: -4, bodyY: 1},
      {armR: 5, bodyY: 1, slash: 1},
      {armR: 4, bodyY: 1, slash: 1},
      {armR: 2, bodyY: 0},
      {armR: 0, bodyY: 0}
    ].forEach(p => sheets.attack.push(draw(p)));
  } else if(weapon === 'bow'){
    [
      {armR: -1, armL: 1, bodyY: 0},
      {armR: -2, armL: 2, draw: true, bodyY: 0},
      {armR: -3, armL: 3, draw: true, bodyY: 0},
      {armR: -4, armL: 3, draw: true, bodyY: 1, slash: 1},
      {armR: 3, armL: 0, bodyY: 0, slash: 1},
      {armR: 1, armL: 0, bodyY: 0},
      {armR: 0, armL: 0, bodyY: 0}
    ].forEach(p => sheets.attack.push(draw(p)));
  } else if(weapon === 'staff'){
    const healer = cardId === 'vasilisa';
    const mage = cardId === 'volhv' || cardId === 'mag' || cardId === 'perun' || healer;
    [
      {armR: -2, armL: 1, bodyY: 0},
      {armR: -3, armL: 2, bodyY: 0},
      {armR: -3, armL: 2, bodyY: 1, flash: mage},
      {armR: 2, armL: -1, bodyY: 1, slash: 1, flash: true, healPulse: healer},
      {armR: 2, armL: 0, bodyY: 0, slash: 1, flash: true, healPulse: healer},
      {armR: 1, armL: 0, bodyY: 0, flash: mage, healPulse: healer},
      {armR: 0, armL: 0, bodyY: 0}
    ].forEach(p => sheets.attack.push(draw(p)));
  } else if(weapon === 'shield'){
    [
      {armL: -2, armR: -1, bodyY: 0, shieldFwd: 1},
      {armL: -3, armR: -2, bodyY: 0, shieldFwd: 1},
      {armL: -4, armR: -2, bodyY: 1, shieldFwd: 1},
      {armL: 3, armR: 4, bodyY: 1, slash: 1, shieldFwd: 1},
      {armL: 2, armR: 3, bodyY: 0, slash: 1, shieldFwd: 1},
      {armL: 1, armR: 2, bodyY: 0},
      {armL: 0, armR: 0, bodyY: 0}
    ].forEach(p => sheets.attack.push(draw(p)));
  } else if(weapon === 'spear'){
    [
      {armR: -2, armL: 1, bodyY: 0},
      {armR: -3, armL: 2, bodyY: 0},
      {armR: -4, armL: 2, bodyY: 0},
      {armR: 5, armL: -1, bodyY: 1, slash: 1},
      {armR: 4, armL: 0, bodyY: 0, slash: 1},
      {armR: 2, armL: 0, bodyY: 0},
      {armR: 0, armL: 0, bodyY: 0}
    ].forEach(p => sheets.attack.push(draw(p)));
  } else if(weapon === 'axe' || (!ally && (weapon === 'none' || !weapon))){
    [
      {armR: -2, armL: 1, bodyY: 0},
      {armR: -4, armL: 2, bodyY: 0},
      {armR: -5, armL: 2, bodyY: 1},
      {armR: 4, armL: -2, bodyY: 1, slash: 1},
      {armR: 3, armL: -1, bodyY: 0, slash: 1},
      {armR: 2, armL: 0, bodyY: 0},
      {armR: 0, armL: 0, bodyY: 0}
    ].forEach(p => sheets.attack.push(draw(p)));
  } else {
    // sword / default melee: 7 кадров SNES
    [
      {armR: -2, armL: 1, bodyY: 0},
      {armR: -3, armL: 2, bodyY: 0},
      {armR: -4, armL: 2, bodyY: 1},
      {armR: 5, armL: -2, bodyY: 1, slash: 1},
      {armR: 4, armL: -1, bodyY: 0, slash: 1},
      {armR: 2, armL: 0, bodyY: 0},
      {armR: 0, armL: 0, bodyY: 0}
    ].forEach(p => sheets.attack.push(draw(p)));
  }
  sheets.hitFrame = 3;
  for(let i = 0; i < 4; i++) sheets.hit.push(draw({bodyY: Math.min(2,i), armL: 2, armR: 2, flap: -1}));
  for(let i = 0; i < 6; i++) sheets.death.push(draw({dead: i > 3, bodyY: Math.min(3, i), armR: 3, flap: -2, legL: i, legR: -i}));
  return sheets;
}

function charKindFor(cardId){
  const def = CARDS[cardId];
  const c = def && def.costume;
  if(cardId === 'leshy' || cardId === 'velikan') return {kind:'leshy', weapon:'none'};
  if(c === 'dragon' || cardId === 'gorynych' || cardId === 'zmeika' || cardId === 'zmejlet' || cardId === 'zmejstud' || cardId === 'zverogon')
    return {kind:'dragon', weapon:'none'};
  if(c === 'skeleton' || cardId === 'kostey' || cardId === 'skelet' || cardId === 'ledkoldun')
    return {kind:'skeleton', weapon: cardId==='ledkoldun'?'staff':'scythe'};
  if(c === 'mage' || cardId === 'mag' || cardId === 'perun' || cardId === 'volhv' || cardId === 'koldun' || cardId === 'chernmag')
    return {kind:'mage', weapon:'staff'};
  if(c === 'rider' || cardId === 'kazak' || cardId === 'sadko' || cardId === 'chernyvityaz')
    return {kind:'rider', weapon:'sword'};
  if(cardId === 'solovey' || cardId === 'zharptica' || cardId === 'sokol') return {kind:'bird', weapon:'bow'};
  if(c === 'maiden' || cardId === 'vasilisa' || cardId === 'moredeva') return {kind:'peasant', weapon:'staff'};
  if(c === 'archer' || cardId === 'streltsy' || cardId === 'troll' || cardId === 'lesovik') return {kind:'archer', weapon:'bow'};
  if(cardId === 'druzhinnik' || cardId === 'dvorf' || cardId === 'ratay') return {kind:'knight', weapon:'shield'};
  if(cardId === 'grom' || cardId === 'byk' || cardId === 'myasnik') return {kind:'knight', weapon:'axe'};
  if(c === 'knight' || cardId === 'ilya' || cardId === 'vityaz' || cardId === 'dobrynya')
    return {kind:'knight', weapon:(cardId==='vityaz'||cardId==='dobrynya')?'shield':'sword'};
  if(c === 'robber' || cardId === 'razboyniki' || cardId === 'upyr' || cardId === 'lesvityaz') return {kind:'robber', weapon:'sword'};
  if(c === 'cannon' || cardId === 'samokhod') return {kind:'cannon', weapon:'none'};
  if(c === 'bull' || cardId === 'byk') return {kind:'knight', weapon:'axe'};
  if(c === 'butcher' || c === 'golem') return {kind:'knight', weapon:'axe'};
  if(cardId === 'opolchenets' || cardId === 'brazhnik') return {kind:'peasant', weapon:'axe'};
  if(c === 'peasant' || cardId === 'skomorokh') return {kind:'peasant', weapon:'spear'};
  if(c === 'orc') return {kind:'orc', weapon:'axe'};
  return {kind: 'peasant', weapon: 'spear'};
}

function getSheets(kind, ally, weapon, cardId){
  const smooth = window.VisualTheme ? VisualTheme.USE_SMOOTH_CHIBI : false;
  const key = 'v2_' + (smooth ? 's_' : 'p_') + kind + '_' + (ally ? 'a' : 'e') + '_' + (weapon || 'n') + '_' + (cardId || '');
  if(!sheetCache[key]){
    if(smooth && window.SmoothChibi) sheetCache[key] = SmoothChibi.framesFor(kind, ally, weapon, cardId);
    else sheetCache[key] = framesFor(kind, ally, weapon, cardId);
  }
  return sheetCache[key];
}

class SpriteAnim {
  constructor(sheets){
    this.sheets = sheets;
    this.state = 'idle';
    this.frame = 0;
    this.accum = 0;
    this.loop = true;
    this.finished = false;
    this.hitFrame = (sheets && sheets.hitFrame != null) ? sheets.hitFrame : 2;
    this.hitFired = false;
    this.delay = {idle: 140, walk: 70, attack: 55, hit: 70, death: 90};
  }
  setState(st, restart){
    if(this.state === st && !restart) return;
    this.state = st; this.frame = 0; this.accum = 0; this.finished = false;
    this.hitFired = false;
    this.loop = st === 'idle' || st === 'walk';
  }
  /** Активный кадр удара — один раз за цикл attack */
  consumeHit(){
    if(this.state !== 'attack' || this.hitFired) return false;
    if(this.frame < this.hitFrame) return false;
    this.hitFired = true;
    return true;
  }
  update(dt){
    const list = this.sheets[this.state] || this.sheets.idle;
    if(!list.length) return;
    this.accum += dt * 1000;
    const d = this.delay[this.state] || 120;
    while(this.accum >= d){
      this.accum -= d;
      if(this.frame + 1 >= list.length){
        if(this.loop) this.frame = 0;
        else { this.frame = list.length - 1; this.finished = true; }
      } else this.frame++;
    }
  }
  current(){
    const list = this.sheets[this.state] || this.sheets.idle;
    return list[this.frame] || list[0];
  }
}

class Character {
  constructor(opts){
    Object.assign(this, opts);
    const meta = charKindFor(opts.id);
    this.kind = meta.kind;
    this.weapon = opts.weapon || meta.weapon;
    this.cardId = opts.id;
    this.anim = new SpriteAnim(getSheets(this.kind, opts.side === 'me', this.weapon, opts.id));
    this.face = 1;
  }
  setWeapon(w){
    this.weapon = w;
    const st = this.anim.state;
    this.anim = new SpriteAnim(getSheets(this.kind, this.side === 'me', w, this.cardId || this.id));
    this.anim.setState(st, true);
  }
  setAnim(st, restart){ this.anim.setState(st, restart); }
  updateAnim(dt){ this.anim.update(dt); }
  draw(ctx, x, y, size){
    const img = this.anim.current();
    if(!img) return;
    ctx.imageSmoothingEnabled = true;
    const s = size || 48;
    const ix = Math.round(x), iy = Math.round(y);
    /* Жёсткая пиксельная тень — без alpha/ellipse */
    ctx.fillStyle = '#000000';
    ctx.fillRect(ix - ((s * 0.22) | 0), iy + ((s * 0.26) | 0), (s * 0.44) | 0, 3);
    ctx.fillStyle = '#181818';
    ctx.fillRect(ix - ((s * 0.16) | 0), iy + ((s * 0.26) | 0) + 3, (s * 0.32) | 0, 1);
    ctx.save();
    if(this.face < 0){
      ctx.translate(ix, iy); ctx.scale(-1, 1);
      ctx.drawImage(img, -s / 2, -s / 2, s, s);
    } else {
      ctx.drawImage(img, Math.round(ix - s / 2), Math.round(iy - s / 2), s, s);
    }
    ctx.restore();
  }
}

/** Пиксельный огненный шар: 8 кадров, палитра FIRE_PAL, без alpha */
function buildFireballFrames(){
  const frames = [];
  for(let i = 0; i < 8; i++){
    const {c, g} = pxCanvas();
    const cx = 24, cy = 24;
    /* ядро → оболочка → искры */
    pfill(g, cx-6, cy-6, 12, 12, FIRE_PAL[4]);
    pfill(g, cx-4, cy-4, 8, 8, FIRE_PAL[3]);
    pfill(g, cx-3, cy-3, 6, 6, FIRE_PAL[2]);
    pfill(g, cx-2, cy-2, 4, 4, FIRE_PAL[1]);
    pfill(g, cx-1, cy-1, 2, 2, FIRE_PAL[0]);
    paintPixelFlame(g, cx-8-(i%2), cy+2, i, 1);
    paintPixelFlame(g, cx+6+(i%2), cy+1, i+2, 1);
    pset(g, cx-10+(i%3), cy-4, FIRE_PAL[2+(i%3)]);
    pset(g, cx+9-(i%2), cy-3, FIRE_PAL[3]);
    frames.push(c);
  }
  return frames;
}
/** Пиксельный взрыв: белый → жёлтый → красный → тёмно-красный → угли */
function buildExplosionFrames(){
  const frames = [];
  for(let i = 0; i < 8; i++){
    const {c, g} = pxCanvas();
    const cx = 24, cy = 24;
    const r = 3 + i * 2;
    const core = i < 2 ? FIRE_PAL[0] : (i < 4 ? FIRE_PAL[2] : (i < 6 ? FIRE_PAL[4] : FIRE_PAL[6]));
    const mid = i < 3 ? FIRE_PAL[1] : (i < 5 ? FIRE_PAL[3] : FIRE_PAL[5]);
    pfill(g, cx-r, cy-r, r*2, r*2, core);
    pfill(g, cx-(r>>1), cy-(r>>1), r, r, mid);
    if(i < 5) pfill(g, cx-2, cy-2, 4, 4, FIRE_PAL[0]);
    for(let k = 0; k < 8; k++){
      const a = k / 8 * Math.PI * 2 + i * 0.4;
      const d = r + 2 + (k&1);
      pset(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, FIRE_PAL[Math.min(7, 2 + (i>>1) + (k&1))]);
    }
    /* угли в конце — твёрдые пиксели, не rgba-дым */
    if(i > 5){
      pfill(g, cx-4, cy+2, 3, 2, FIRE_PAL[7]);
      pfill(g, cx+2, cy+3, 2, 2, '#282828');
      pset(g, cx-6, cy, '#303030');
    }
    frames.push(c);
  }
  return frames;
}
/** Удар / магия / шок — тоже покадровые спрайты */
function buildHitFrames(){
  const frames = [];
  for(let i = 0; i < 5; i++){
    const {c, g} = pxCanvas();
    const r = 2 + i * 2;
    pfill(g, 24-r, 23, r*2, 2, FIRE_PAL[Math.min(4,i)]);
    pfill(g, 23, 24-r, 2, r*2, FIRE_PAL[Math.min(4,i)]);
    if(i > 1){
      pset(g, 24-r, 24-r, '#ffffff');
      pset(g, 24+r, 24-r, '#ffffff');
      pset(g, 24-r, 24+r, FIRE_PAL[2]);
      pset(g, 24+r, 24+r, FIRE_PAL[2]);
    }
    frames.push(c);
  }
  return frames;
}
function buildMagicFrames(){
  const frames = [];
  for(let i = 0; i < 6; i++){
    const {c, g} = pxCanvas();
    const r = 3 + i;
    pfill(g, 24-r, 24-r, r*2, r*2, MAGIC_PAL[Math.min(5, i)]);
    pfill(g, 24-(r>>1), 24-(r>>1), r, r, MAGIC_PAL[0]);
    for(let k=0;k<4;k++){
      const a = k*1.57 + i*0.5;
      pset(g, 24+Math.cos(a)*(r+2), 24+Math.sin(a)*(r+2), MAGIC_PAL[1]);
    }
    frames.push(c);
  }
  return frames;
}
const FIREBALL_FRAMES = buildFireballFrames();
const EXPLOSION_FRAMES = buildExplosionFrames();
const HIT_FRAMES = buildHitFrames();
const MAGIC_FRAMES = buildMagicFrames();

class ParticleSystem {
  constructor(){ this.items = []; }
  clear(){ this.items.length = 0; }
  burst(x, y, opts){
    const n = Math.min(opts.count || 8, opts.cap || 36);
    if(this.items.length > 220) this.items.splice(0, this.items.length - 180);
    const colors = opts.colors || FIRE_PAL.slice(0, 5);
    for(let i = 0; i < n; i++){
      const a = Math.random() * Math.PI * 2;
      const sp = (opts.speed || 70) * (0.4 + Math.random());
      this.items.push({
        x: x|0, y: y|0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + (opts.up || 0),
        life: opts.life || 0.4, max: opts.life || 0.4,
        palette: colors,
        size: Math.max(1, ((opts.size || 2) | 0)),
        gravity: opts.gravity != null ? opts.gravity : 40
      });
    }
  }
  update(dt){
    for(let i = this.items.length - 1; i >= 0; i--){
      const p = this.items[i];
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.gravity * dt;
      if(p.life <= 0) this.items.splice(i, 1);
    }
  }
  draw(ctx){
    ctx.imageSmoothingEnabled = true;
    for(const p of this.items){
      const t = 1 - Math.max(0, p.life / p.max);
      const pal = p.palette || FIRE_PAL;
      const idx = Math.min(pal.length - 1, (t * pal.length) | 0);
      const alpha = Math.max(0, 1 - t);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = pal[idx];
      const sz = Math.max(1.5, p.size * (1.2 - t * 0.4));
      ctx.beginPath();
      ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
const particles = new ParticleSystem();
/** Плавающие «+» и лучи хила — чёткие маркеры, без мягкого blur */
const floatMarks = [];
function spawnHealMark(sx, sy){
  floatMarks.push({kind:'plus', x:sx, y:sy, life:0.75, max:0.75, vy:-36});
}
function spawnHealBeam(x0, y0, x1, y1){
  floatMarks.push({kind:'beam', x0, y0, x1, y1, life:0.28, max:0.28});
}
function updateFloatMarks(dt){
  for(let i=floatMarks.length-1;i>=0;i--){
    const m=floatMarks[i];
    m.life-=dt;
    if(m.kind==='plus'){ m.y += (m.vy||0)*dt; }
    if(m.life<=0) floatMarks.splice(i,1);
  }
}
function drawFloatMarks(){
  for(const m of floatMarks){
    const a = Math.max(0, m.life / (m.max||0.5));
    if(m.kind==='beam'){
      ctx.globalAlpha = a * 0.85;
      ctx.strokeStyle = '#43a047';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(m.x0|0, m.y0|0);
      ctx.lineTo(m.x1|0, m.y1|0);
      ctx.stroke();
      ctx.strokeStyle = '#b9f6ca';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(m.x0|0, (m.y0|0)-1);
      ctx.lineTo(m.x1|0, (m.y1|0)-1);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = a;
      ctx.fillStyle = '#1b5e20';
      ctx.font = 'bold 14px Manrope,system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('+', (m.x|0)+1, (m.y|0)+1);
      ctx.fillStyle = '#69f0ae';
      ctx.fillText('+', m.x|0, m.y|0);
      ctx.globalAlpha = 1;
    }
  }
}

function spawnAttackVfx(u, tx, ty){
  if(window.GameCombat && GameCombat.spawnAttackVfx){
    GameCombat.spawnAttackVfx(u, tx, ty, {toScreen, projectiles, particles, fx, spawnHitSpark, CARDS, charKindFor});
    return;
  }
  _spawnAttackVfxLegacy(u, tx, ty);
}
function _spawnAttackVfxLegacy(u, tx, ty){
  const a = toScreen(u.x, u.y);
  const b = toScreen(tx, ty);
  const id = u.id;
  const kind = (u.char && u.char.kind) || (CARDS[id] && charKindFor(id).kind) || '';
  const weapon = (u.char && u.char.weapon) || '';
  const isDragon = kind === 'dragon' || id === 'gorynych' || id === 'zmeika' || id === 'zharzmei' || id === 'zmejlet' || id === 'zmejstud' || id === 'zverogon';
  const isCat = id === 'tsarpushka' || kind === 'cannon';
  const isArcher = kind === 'archer' || kind === 'bird' || weapon === 'bow';
  const isMage = kind === 'mage' || weapon === 'staff' || id === 'mag' || id === 'perun';
  const isWave = id === 'sadko';
  const isSkeleton = kind === 'skeleton' || id === 'kostey';
  const isLeshy = kind === 'leshy' || id === 'leshy';
  const isBird = kind === 'bird';

  if(isDragon || isCat){
    projectiles.push({
      type: 'fireball',
      x: a.x, y: a.y, tx: b.x, ty: b.y,
      life: isCat ? 0.45 : 0.3, maxLife: isCat ? 0.45 : 0.3,
      frame: 0, frameAcc: 0, fire: isDragon, rock: isCat, big: true
    });
    particles.burst(a.x, a.y, {count: 12, colors: FIRE_PAL.slice(0,5), speed: 90, life: 0.4, size: 2, up: -15});
  } else if(isArcher){
    projectiles.push({
      type: 'bolt', x: a.x, y: a.y - 8, tx: b.x, ty: b.y,
      life: 0.28, maxLife: 0.28, color: isBird ? '#ffe0b2' : '#ffe082', arrow: true
    });
    particles.burst(a.x, a.y - 6, {
      count: isBird ? 10 : 6,
      colors: isBird ? ['#fff8e1', '#ffcc80', '#e0e0e0'] : ['#fff8e1', '#ffe082'],
      speed: 50, life: 0.25, size: 2, up: -8
    });
  } else if(isMage){
    projectiles.push({
      type: 'bolt', x: a.x, y: a.y, tx: b.x, ty: b.y,
      life: 0.22, maxLife: 0.22, color: id === 'perun' ? '#fff59d' : '#ff9800', mage: true, frame: 0, frameAcc: 0
    });
    particles.burst(a.x, a.y, {count: 10, colors: id === 'perun' ? MAGIC_PAL : FIRE_PAL.slice(0,5), speed: 70, life: 0.35, size: 2, up: -12});
  } else if(isWave){
    projectiles.push({
      type: 'bolt', x: a.x, y: a.y, tx: b.x, ty: b.y,
      life: 0.2, maxLife: 0.2, color: '#4fc3f7'
    });
    fx.push({type:'wave',x:u.x,y:u.y,r:0.3,maxR:1.6,life:0.28,maxLife:0.28,color:'#4fc3f7'});
    particles.burst(a.x, a.y, {count: 10, colors: ['#4fc3f7', '#81d4fa', '#e1f5fe'], speed: 60, life: 0.3, size: 2, up: -10});
  } else if(isSkeleton){
    projectiles.push({
      type: 'slash', x: a.x, y: a.y, tx: b.x, ty: b.y,
      life: 0.2, maxLife: 0.2, color: '#cfd8dc'
    });
    particles.burst(b.x, b.y, {count: 10, colors: ['#eceff1', '#90a4ae', '#78909c'], speed: 55, life: 0.35, size: 2, up: -8});
  } else if(isLeshy){
    projectiles.push({
      type: 'slash', x: a.x, y: a.y, tx: b.x, ty: b.y,
      life: 0.2, maxLife: 0.2, color: '#aed581'
    });
    particles.burst(b.x, b.y, {count: 12, colors: ['#aed581', '#8bc34a', '#558b2f'], speed: 45, life: 0.4, size: 2, up: -15});
  } else {
    // melee: искры + slash
    projectiles.push({
      type: 'slash', x: a.x, y: a.y, tx: b.x, ty: b.y,
      life: 0.18, maxLife: 0.18, color: u.side === 'me' ? '#90caf9' : '#ef9a9a'
    });
    particles.burst(b.x, b.y, {count: 8, colors: ['#fff', '#ffe082', '#ffcc80'], speed: 75, life: 0.28, size: 2, up: -10, gravity: 35});
  }
  spawnHitSpark(b.x, b.y, id);
}
function spawnHitSpark(sx, sy, id){
  const fire = id==='gorynych'||id==='mag'||id==='fireball'||id==='zharptica'||id==='zmeika';
  const ice = id==='morozko'||id==='sadko';
  const colors = fire ? FIRE_PAL.slice(0,6) : ice ? ICE_PAL : ['#ffffff','#ffffaa','#ffee00','#ffcc80'];
  particles.burst(sx, sy, {count: 8, colors, speed: 70, life: 0.28, size: 2, up: -12, gravity: 40});
  fx.push({type:'hit', x:sx, y:sy, life:0.28, maxLife:0.28, frame:0, frameAcc:0});
}

function spawnExplosion(sx, sy, power){
  const p = power || 1;
  fx.push({type: 'explosion', x: sx, y: sy, life: 0.55, maxLife: 0.55, frame: 0, frameAcc: 0, power: p});
  particles.burst(sx, sy, {
    count: 18, colors: FIRE_PAL, speed: 140 * p, life: 0.5, size: 2, up: -35, gravity: 70
  });
  fx.push({type:'shock', x:sx, y:sy, life:0.35, maxLife:0.35, frame:0, frameAcc:0, power:p});
}

function launchFireball(side, fromX, fromY, toX, toY, dmg, radius, delay, mainMul){
  const a = toScreen(fromX, fromY);
  const b = toScreen(toX, toY);
  projectiles.push({
    type: 'fireball', spell: true, side,
    x: a.x, y: a.y, tx: b.x, ty: b.y,
    lx: toX, ly: toY, dmg, radius, mainMul: mainMul||1,
    life: 0.55 + (delay || 0), maxLife: 0.55,
    delay: delay || 0, frame: 0, frameAcc: 0
  });
}

function applySpellDamage(side, lx, ly, dmg, r, mainMul){
  let main=null, md=1e9;
  units.forEach(u=>{
    if(u.side===side||u.dying)return;
    const d=Math.hypot(u.x-lx,u.y-ly);
    if(d<=r && d<md){md=d;main=u;}
  });
  units.forEach(u=>{
    if(u.side===side||u.dying)return;
    const d=Math.hypot(u.x-lx,u.y-ly);
    if(d>r)return;
    const mul=(u===main?(mainMul||1):1)*(1-d/(r*1.5));
    hurtUnit(u, dmg*mul, side);
  });
  buildings.forEach(b=>{
    if(b.side===side||b.dead)return;
    const d=Math.hypot(b.x-lx,b.y-ly);
    if(d<=r){ b.hp-=dmg*(1-d/(r*1.5)); if(b.hp<=0) destroyBuilding(b); }
  });
  towers.forEach(t=>{
    if(t.side!==side&&t.alive){
      const d=Math.hypot(t.lx-lx,t.ly-ly);
      if(d<=r) damageTower(t, dmg*0.55);
    }
  });
}

function drawUnit(u){
  const s = toScreen(u.x, u.y);
  const bob = Math.sin(u.bob || 0) * 1.5;
  const x = Math.round(s.x), y = Math.round(s.y + bob);
  let roleScale = 1;
  if(u.role==='tank' || u.primaryRole==='tank' || u.primaryRole==='wincon') roleScale = 1.28;
  else if(u.role==='fast' && (CARDS[u.id]?.count||1)>1) roleScale = 0.85;
  else if(u.role==='ranged'||u.role==='splash') roleScale = 1.06;
  else if(u.char && u.char.kind==='cannon') roleScale = 1.12;
  let spawnPop = 1;
  if(u.spawnAlpha!=null && u.spawnAlpha < 1){
    const t = Math.min(1, u.spawnAlpha);
    spawnPop = t < 0.55 ? (0.2 + t * 1.7) : (1.15 - (t - 0.55) * 0.33);
  }
  const deskU = unitSizeBoost();
  const scale = (u.atkAnim > 0 ? 1.1 : 1) * roleScale * spawnPop * (s.scale || 1) * deskU;
  const alpha = (u.spawnAlpha!=null?u.spawnAlpha:1) * (u.dying ? Math.max(0,(u.deathTimer||0)/0.85) : 1);
  ctx.globalAlpha = alpha;
  /* CR: тень у ног + тонкое командное кольцо */
  const footR = 14 * roleScale * (s.scale || 1) * deskU;
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath(); ctx.ellipse(x, s.y + 7, footR, 4.5 * boardScale() * deskU, 0, 0, Math.PI * 2); ctx.fill();
  const team = (window.VisualTheme && VisualTheme.TEAM[u.side==='me'?'me':'ai']) || null;
  ctx.beginPath();
  ctx.ellipse(x, s.y + 6, footR * 0.93, 4.2 * boardScale() * deskU, 0, 0, Math.PI * 2);
  ctx.strokeStyle = team ? team.stroke : (u.side === 'me' ? 'rgba(100,181,246,0.75)' : 'rgba(239,154,154,0.75)');
  ctx.lineWidth = 2;
  ctx.stroke();
  if(u.auraHeal>0){
    ctx.globalAlpha = alpha * (0.35 + 0.25 * Math.sin(ambientT * 4));
    ctx.strokeStyle = 'rgba(129,199,132,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, s.y + 6, footR * 1.2, 5.5 * boardScale() * deskU, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = alpha;
  }
  ctx.save();
  if(u.dying){
    ctx.translate(x, y - 8);
    ctx.rotate((u.deathSpin || 1) * (1 - Math.max(0,(u.deathTimer||0)/0.85)) * Math.PI * 0.35);
    ctx.translate(-x, -(y - 8));
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if(u.char && u.char.anim){
    const fr = u.char.anim.current();
    const sz = Math.round(58 * scale);
    if(u.char.face < 0){
      ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0);
    }
    if(fr) ctx.drawImage(fr, x - sz/2, y - sz + 6, sz, sz);
  } else {
    ctx.font = Math.round(24 * scale) + 'px system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(u.emoji || '⚔️', x, y - 8);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  if(u.shieldHp>0){
    ctx.strokeStyle='rgba(255,213,79,0.7)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(x, y-6, 16, 0, Math.PI*2); ctx.stroke();
  }
  if(u.armorT>0){
    ctx.strokeStyle='rgba(100,181,246,0.8)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(x, y-6, 18, 0, Math.PI*2); ctx.stroke();
  }
  if(u.markT>0){
    ctx.strokeStyle='rgba(236,64,122,0.85)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(x, y-6, 15, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle='#ec407a'; ctx.font='10px system-ui'; ctx.textAlign='center';
    ctx.fillText('✦', x, y-22);
  }
  if(u.stealthT>0){
    ctx.strokeStyle='rgba(144,164,174,0.5)'; ctx.lineWidth=1;
    ctx.setLineDash([3,3]);
    ctx.beginPath(); ctx.arc(x, y-6, 17, 0, Math.PI*2); ctx.stroke();
    ctx.setLineDash([]);
  }
  if(u.auraSlow>0 && u.auraR>0){
    const ar = (u.auraR / ARENA.w) * field.w;
    ctx.strokeStyle='rgba(76,175,80,0.25)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(x, y, ar, 0, Math.PI*2); ctx.stroke();
  }
  if(u.auraHeal>0 && u.auraR>0){
    const ar = (u.auraR / ARENA.w) * field.w;
    ctx.strokeStyle='rgba(129,199,132,0.28)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(x, y, ar, 0, Math.PI*2); ctx.stroke();
  }
  if(focusTarget && focusTarget.kind === 'unit' && focusTarget.ref === u){
    ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y - 6, 18, 0, Math.PI * 2); ctx.stroke();
  }
  if(!u.dying){
    const pct = Math.max(0, u.hp / u.max);
    const bw = Math.round(30 * roleScale * boardScale() * deskU);
    const bh = Math.round(y - 34 * roleScale * boardScale() * deskU);
    const barH = Math.max(6, Math.round(8 * boardScale()));
    ctx.fillStyle = '#111'; ctx.fillRect(x - bw/2, bh, bw, barH);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
    ctx.strokeRect(x - bw/2 + 0.5, bh + 0.5, bw - 1, barH - 1);
    ctx.fillStyle = pct>0.55?(u.side==='me'?'#66bb6a':'#ef5350'):(pct>0.3?'#ffca28':'#ef5350');
    ctx.fillRect(x - bw/2, bh, bw * pct, barH);
  }
}

function drawBuilding(b){
  const s = toScreen(b.x, b.y);
  const pulse = b.atkFlash > 0 ? 1.08 : 1;
  const bs = (s.scale || 1) * pulse;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(s.x, s.y + 4, 16 * bs, 5 * bs, 0, 0, Math.PI * 2); ctx.fill();
  ctx.imageSmoothingEnabled = true;
  if(b.char && b.char.anim){
    const fr = b.char.anim.current();
    const sz = Math.round(52 * bs);
    if(fr) ctx.drawImage(fr, s.x - sz/2, s.y - sz + 6, sz, sz);
  } else {
    ctx.fillStyle = '#6d4c41';
    roundRect(s.x - 16 * bs, s.y - 30 * bs, 32 * bs, 28 * bs, 4); ctx.fill();
    ctx.font = Math.round(22 * bs) + 'px system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(b.emoji || '🏰', s.x, s.y - 14 * bs);
  }
  if(b.role==='aura'){
    ctx.strokeStyle='rgba(129,199,132,0.35)'; ctx.lineWidth=2;
    const rad=(b.range/ARENA.w)*field.w;
    ctx.beginPath(); ctx.arc(s.x,s.y,rad,0,Math.PI*2); ctx.stroke();
  }
  if(b.atkFlash > 0){
    ctx.globalAlpha = 0.35; ctx.fillStyle = '#ffd54f';
    ctx.beginPath(); ctx.arc(s.x, s.y - 12, 22, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  const pct = b.hp / b.max;
  const barH = 8;
  ctx.fillStyle = '#222'; ctx.fillRect(s.x - 16, s.y - 40, 32, barH);
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.strokeRect(s.x - 16, s.y - 40, 32, barH);
  ctx.fillStyle = '#ffa726'; ctx.fillRect(s.x - 16, s.y - 40, 32 * pct, barH);
}

function drawPixelProjectile(p){
  if(window.GameCombat && GameCombat.drawProjectile){
    GameCombat.drawProjectile(ctx, p, easeInOutCubic);
    return;
  }
  _drawPixelProjectileLegacy(p);
}
function _drawPixelProjectileLegacy(p){
  const ml = p.maxLife || 0.2;
  if(p.delay > 0) return;
  let t = 1 - p.life / ml;
  t = Math.max(0, Math.min(1, t));
  const et = easeInOutCubic(t);
  const x = p.x + (p.tx - p.x) * et;
  const y = p.y + (p.ty - p.y) * et - (p.type === 'fireball' ? Math.sin(et * Math.PI) * 28 : 0);
  ctx.imageSmoothingEnabled = true;
  if(p.type === 'fireball'){
    const fr = FIREBALL_FRAMES[p.frame % FIREBALL_FRAMES.length];
    const sz = p.big ? 36 : 28;
    ctx.drawImage(fr, (x - sz/2) | 0, (y - sz/2) | 0, sz, sz);
  } else if(p.rock){
    ctx.fillStyle = '#78909c';
    ctx.fillRect((x - 5) | 0, (y - 5) | 0, 10, 10);
    ctx.fillStyle = '#cfd8dc';
    ctx.fillRect((x - 3) | 0, (y - 3) | 0, 4, 4);
  } else if(p.type === 'slash'){
    /* Пиксельный slash — блоки, не stroke arc + alpha */
    const ang = Math.atan2(p.ty - p.y, p.tx - p.x);
    const col = p.color || '#ffffff';
    for(let i = 0; i < 5; i++){
      const t = i / 4;
      const px = x + Math.cos(ang - 0.6 + t * 1.2) * (8 + i * 2);
      const py = y + Math.sin(ang - 0.6 + t * 1.2) * (8 + i * 2);
      ctx.fillStyle = col;
      ctx.fillRect(px|0, py|0, 2, 2);
    }
  } else if(p.arrow){
    const ang = Math.atan2(p.ty - p.y, p.tx - p.x);
    const dx = Math.cos(ang), dy = Math.sin(ang);
    ctx.fillStyle = p.color || '#ffe082';
    for(let i = -3; i <= 3; i++){
      ctx.fillRect((x + dx * i * 2)|0, (y + dy * i * 2)|0, 2, 2);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect((x + dx * 8)|0, (y + dy * 8)|0, 2, 2);
  } else if(p.mage){
    const fr = MAGIC_FRAMES[((p.frame||0) + ((1-t)*MAGIC_FRAMES.length)|0) % MAGIC_FRAMES.length];
    ctx.drawImage(fr, (x - 16) | 0, (y - 16) | 0, 32, 32);
  } else {
    ctx.fillStyle = p.color || '#90caf9';
    ctx.fillRect((x - 2) | 0, (y - 2) | 0, 4, 4);
  }
}

function draw(){
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  if(window.GameModels && GameModels.arena3d){ GameModels.update(lastDrawDt); GameModels.sync(units, toScreen, towers); }
  drawArena();
  towers.forEach(drawTower);
  if(focusTarget && targetAlive(focusTarget) && focusTarget.kind !== 'unit'){
    const p = targetPos(focusTarget); const s = toScreen(p.x, p.y);
    ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 2;
    ctx.strokeRect((s.x - 20) | 0, (s.y - 40) | 0, 40, 40);
  }
  buildings.forEach(drawBuilding);
  units.slice().sort((a, b) => b.y - a.y).forEach(drawUnit);
  drawFloatMarks();
  for(const p of projectiles) drawPixelProjectile(p);
  particles.draw(ctx);
  for(const f of fx){
    if(f.type === 'explosion'){
      const fr = EXPLOSION_FRAMES[Math.min(EXPLOSION_FRAMES.length - 1, f.frame|0)];
      const sc = 48 * (f.power || 1);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(fr, (f.x - sc / 2) | 0, (f.y - sc / 2) | 0, sc, sc);
    } else if(f.type === 'shock'){
      /* Пиксельное кольцо — квадратные «вспышки» по окружности */
      const t = 1 - f.life / (f.maxLife || 0.35);
      const rad = 8 + t * 28 * (f.power || 1);
      const col = FIRE_PAL[Math.min(6, (t * 6) | 0)];
      ctx.fillStyle = col;
      for(let k = 0; k < 12; k++){
        const a = k / 12 * Math.PI * 2;
        ctx.fillRect((f.x + Math.cos(a) * rad) | 0, (f.y + Math.sin(a) * rad) | 0, 3, 3);
      }
    } else if(f.type === 'hit'){
      const fr = HIT_FRAMES[Math.min(HIT_FRAMES.length - 1, f.frame|0)];
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(fr, (f.x - 16) | 0, (f.y - 16) | 0, 32, 32);
    } else if(f.type === 'wave'){
      const s = toScreen(f.x, f.y);
      const ml = f.maxLife || 0.55;
      const t = 1 - f.life / ml;
      const rad = ((f.r + ((f.maxR || f.r) - f.r) * t) / ARENA.w) * field.w;
      ctx.fillStyle = f.color || ICE_PAL[2];
      for(let k = 0; k < 16; k++){
        const a = k / 16 * Math.PI * 2;
        ctx.fillRect((s.x + Math.cos(a) * rad) | 0, (s.y + Math.sin(a) * rad) | 0, 3, 3);
      }
    } else if(f.type === 'frost'){
      const s = toScreen(f.x, f.y);
      const rad = (f.r / ARENA.w) * field.w;
      ctx.fillStyle = ICE_PAL[Math.min(5, ((1-f.life)*5)|0)];
      for(let k = 0; k < 14; k++){
        const a = k / 14 * Math.PI * 2 + f.life;
        ctx.fillRect((s.x + Math.cos(a) * rad) | 0, (s.y + Math.sin(a) * rad) | 0, 2, 2);
      }
    } else if(f.type === 'lightning'){
      const a = toScreen(f.x0, f.y0), b = toScreen(f.x1, f.y1);
      /* Пиксельная молния — цепочка 2×2 блоков */
      const steps = 8;
      for(let i = 0; i <= steps; i++){
        const t = i / steps;
        const jx = (i>0 && i<steps) ? ((i*17+((f.life*40)|0))%7)-3 : 0;
        const jy = (i>0 && i<steps) ? ((i*13+((f.life*30)|0))%7)-3 : 0;
        const px = a.x + (b.x - a.x) * t + jx;
        const py = a.y + (b.y - a.y) * t + jy;
        ctx.fillStyle = i%2 ? '#ffffff' : '#fff59d';
        ctx.fillRect(px|0, py|0, 3, 3);
      }
    } else if(f.type === 'spell'){
      const s = toScreen(f.x, f.y);
      const rad = (f.r / ARENA.w) * field.w * (1.2 - Math.min(1, f.life));
      const fr = MAGIC_FRAMES[Math.min(MAGIC_FRAMES.length-1, ((1-Math.min(1,f.life))*MAGIC_FRAMES.length)|0)];
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(fr, (s.x - 20)|0, (s.y - 20)|0, 40, 40);
      ctx.fillStyle = f.color || MAGIC_PAL[2];
      for(let k = 0; k < 10; k++){
        const a = k / 10 * Math.PI * 2;
        ctx.fillRect((s.x + Math.cos(a) * rad)|0, (s.y + Math.sin(a) * rad)|0, 2, 2);
      }
    } else if(f.type === 'p'){
      ctx.fillStyle = f.color || FIRE_PAL[2];
      ctx.fillRect(f.x | 0, f.y | 0, 2, 2);
    }
  }
  if(dragGhost){
    const def = CARDS[dragGhost.id];
    const fx = field.x, fy = field.y, fw = field.w, fh = field.h;
    const isSpell = def.type === 'spell';
    const valid = !!dragGhost.valid;
    // зона размещения
    ctx.save();
    if(isSpell){
      ctx.fillStyle = valid ? 'rgba(76,175,80,0.14)' : 'rgba(244,67,54,0.16)';
      roundRect(fx, fy, fw, fh, 12); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(76,175,80,0.22)';
      roundRect(fx, fy + fh / 2, fw, fh / 2, 0); ctx.fill();
      ctx.fillStyle = 'rgba(244,67,54,0.18)';
      ctx.fillRect(fx, fy, fw, fh / 2);
      ctx.strokeStyle = 'rgba(76,175,80,0.7)'; ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(fx + 4, fy + fh / 2 + 4, fw - 8, fh / 2 - 8);
      ctx.setLineDash([]);
    }
    const s = toScreen(dragGhost.x, dragGhost.y);
    ctx.globalAlpha = 0.85;
    ctx.imageSmoothingEnabled = true;
    ctx.font = '28px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(def.emoji, Math.round(s.x), Math.round(s.y));
    if(!valid){
      ctx.strokeStyle = '#ef5350'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(s.x - 14, s.y - 14); ctx.lineTo(s.x + 14, s.y + 14);
      ctx.moveTo(s.x + 14, s.y - 14); ctx.lineTo(s.x - 14, s.y + 14);
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(129,199,132,0.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x, s.y, 22, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
  if(flashWhite > 0){
    ctx.fillStyle = `rgba(255,248,220,${Math.min(0.2, flashWhite * 1.05)})`;
    ctx.fillRect(0, 0, W, H);
    const bloom = ctx.createRadialGradient(W * 0.5, H * 0.42, 30, W * 0.5, H * 0.42, Math.max(W, H) * 0.5);
    bloom.addColorStop(0, `rgba(255,236,179,${Math.min(0.14, flashWhite * 0.55)})`);
    bloom.addColorStop(1, 'rgba(255,236,179,0)');
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, W, H);
  }
  if(vignette > 0){
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.18, W / 2, H / 2, H * 0.78);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(40,10,0,${Math.min(0.7, vignette)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}

function cardPixelArt(def){
  const c = document.createElement('canvas');
  c.width = 64; c.height = 56;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true;
  /* Квантованная заливка без градиента — 16-bit vibe */
  g.fillStyle = def.type === 'spell' ? '#4820a0' : (def.type === 'building' ? '#5a4030' : '#1a5a20');
  g.fillRect(0, 0, 64, 56);
  g.fillStyle = def.type === 'spell' ? '#201060' : (def.type === 'building' ? '#3a2818' : '#0a3010');
  g.fillRect(0, 28, 64, 28);
  g.font = '32px system-ui';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(def.emoji || '❓', 32, 30);
  return c;
}


/** Редкость из def.rarity (artKey — для будущей дорисовки) */
function cardRarity(def){
  if(def.rarity) return def.rarity;
  if(def.type === 'spell') return 'rare';
  if(def.type === 'building') return 'epic';
  return 'common';
}

/* ========== 3D-рука: Clash Royale оболочка + Hearthstone слои ========== */
const CARD3D_W = 120, CARD3D_H = 170;
const HAND3D_MAX = 10;

function frameColorFor(def){
  const r = cardRarity(def);
  if(def.type === 'spell') return {color:0x64b5f6, metal:0.85};
  if(r === 'mythic') return {color:0xff6e40, metal:0.92};
  if(r === 'legendary') return {color:0xffd54f, metal:0.9};
  if(r === 'epic') return {color:0xce93d8, metal:0.85};
  if(r === 'rare') return {color:0xffd54f, metal:0.8};
  return {color:0xcfd8dc, metal:0.75};
}

function roundRect2d(g, x, y, w, h, r){
  g.beginPath();
  g.moveTo(x+r,y); g.arcTo(x+w,y,x+w,y+h,r); g.arcTo(x+w,y+h,x,y+h,r);
  g.arcTo(x,y+h,x,y,r); g.arcTo(x,y,x+w,y,r); g.closePath();
}

/** Слоёная текстура: мягкий CR / Hearthstone стиль */
function paintCardLayers(g, W, H, def, playable, t){
  const rarity = cardRarity(def);
  const line = def.armyLine || def.faction || 'alliance';
  const lineCol = line === 'orc' ? '#66bb6a' : line === 'elf' ? '#26a69a' : line === 'dwarf' ? '#ff8a65' : line === 'dark' ? '#b39ddb' : '#42a5f5';
  const bg = g.createLinearGradient(0, 0, 0, H);
  if(line === 'orc'){ bg.addColorStop(0, '#a5d6a7'); bg.addColorStop(1, '#43a047'); }
  else if(line === 'elf'){ bg.addColorStop(0, '#80cbc4'); bg.addColorStop(1, '#00897b'); }
  else if(line === 'dwarf'){ bg.addColorStop(0, '#ffcc80'); bg.addColorStop(1, '#ef6c00'); }
  else if(line === 'dark'){ bg.addColorStop(0, '#ce93d8'); bg.addColorStop(1, '#7e57c2'); }
  else if(rarity === 'mythic'){ bg.addColorStop(0, '#ffab91'); bg.addColorStop(1, '#ff5722'); }
  else if(rarity === 'legendary'){ bg.addColorStop(0, '#ffe082'); bg.addColorStop(1, '#ffa000'); }
  else { bg.addColorStop(0, '#90caf9'); bg.addColorStop(1, '#1e88e5'); }
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,236,179,0.35)'; g.lineWidth = 4;
  roundRect2d(g, 6, 6, W - 12, H - 12, 16); g.stroke();
  if(rarity === 'epic' || rarity === 'legendary' || rarity === 'mythic'){
    const ox = Math.sin(t * 1.1) * 6;
    g.fillStyle = 'rgba(255,255,255,0.07)';
    g.beginPath(); g.arc(W * 0.3 + ox, H * 0.22, 36, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(W * 0.72 - ox, H * 0.38, 24, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = 'rgba(0,0,0,0.32)';
  roundRect2d(g, 12, 38, W - 24, H * 0.44, 12); g.fill();
  const bob = Math.sin(t * 2.2) * 3;
  const pxOff = (rarity === 'legendary' || rarity === 'mythic' || rarity === 'epic') ? Math.sin(t * 1.4) * 2 : 0;
  try{
    let fr = null;
    if(def.type !== 'spell'){
      const useSmooth = window.VisualTheme && VisualTheme.USE_SMOOTH_CHIBI && window.SmoothChibi;
      if(useSmooth) fr = SmoothChibi.getPortrait(def.id);
      if(!fr && typeof getSheets === 'function'){
        const meta = charKindFor(def.id);
        const sheets = getSheets(meta.kind, true, meta.weapon, def.id);
        fr = (sheets.attack && sheets.attack[3]) || (sheets.idle && sheets.idle[0]);
      }
    }
    if(fr){
      const panelTop = 38, panelH = H * 0.44;
      const sc = Math.min((W - 40) / fr.width, (panelH - 8) / fr.height) * 0.95;
      const dw = fr.width * sc, dh = fr.height * sc;
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.drawImage(fr, W / 2 - dw / 2 + pxOff, panelTop + (panelH - dh) / 2 + bob * 0.25, dw, dh);
    } else {
      g.font = '72px system-ui';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(def.emoji || '✦', W / 2 + pxOff, H * 0.34 + bob);
    }
  } catch(e){
    g.font = '72px system-ui';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(def.emoji || '❓', W / 2 + pxOff, H * 0.34 + bob);
  }
  if(rarity === 'legendary' || rarity === 'mythic'){
    g.globalAlpha = 0.4 + Math.sin(t * 3) * 0.15;
    g.fillStyle = rarity === 'mythic' ? '#ff6e40' : '#ffd54f';
    g.beginPath(); g.arc(W * 0.78, H * 0.18, 9 + Math.sin(t * 4) * 2, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
  }
  if(def.type === 'spell'){
    g.globalAlpha = 0.28 + Math.sin(t * 2.5) * 0.1;
    g.strokeStyle = '#81d4fa'; g.lineWidth = 3;
    g.beginPath(); g.arc(W / 2, H * 0.34, 44 + Math.sin(t * 2) * 3, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 1;
  }
  g.fillStyle = lineCol;
  g.fillRect(12, H * 0.545, W - 24, 5);
  const badgeInfo = (typeof cardBadgeInfo === 'function') ? cardBadgeInfo(def) : null;
  if(def.count && def.count >= 2){
    g.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect2d(g, W - 58, H * 0.38, 42, 26, 8); g.fill();
    g.fillStyle = '#ffee58';
    g.font = 'bold 18px Manrope,system-ui';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('×' + def.count, W - 37, H * 0.38 + 14);
  }
  g.fillStyle = '#fff8e1';
  g.font = 'bold 11px Manrope,system-ui';
  g.textAlign = 'left'; g.textBaseline = 'middle';
  const roleIcon = (typeof cardRoleIcon === 'function') ? cardRoleIcon(def) : null;
  const roleLab = roleIcon
    ? (roleIcon.icon + ' ' + roleIcon.label)
    : (badgeInfo && badgeInfo.summary
      ? badgeInfo.summary
      : (def.combatRole ? (COMBAT_ROLE_LABEL[def.combatRole]||'') : (ARMY_LINE_LABEL[line] || line)));
  g.fillText(roleLab.length > 28 ? roleLab.slice(0, 26) + '…' : roleLab, 16, H * 0.545 + 14);
  g.textAlign = 'center';
  g.fillStyle = '#ffe0b2';
  g.font = 'bold 20px Manrope,system-ui';
  g.fillText(def.name, W / 2, H * 0.66);
  g.beginPath(); g.arc(34, 34, 24, 0, Math.PI * 2);
  g.fillStyle = '#6a1b9a'; g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke();
  g.fillStyle = '#fff'; g.font = 'bold 24px Manrope,system-ui';
  g.textBaseline = 'middle';
  g.fillText(String(def.cost), 34, 35);
  g.font = 'bold 17px Manrope,system-ui';
  if(def.type === 'spell'){
    g.fillStyle = def.heal ? '#66bb6a' : '#80cbc4';
    const lab = def.heal ? ('✚'+def.heal) : (def.freeze ? ('❄'+def.freeze) : (def.shieldHp ? ('🛡'+def.shieldHp) : ('✦'+(def.dmg||0))));
    g.fillText(lab, W / 2, H * 0.82);
  } else {
    g.fillStyle = '#ffb74d'; g.fillText('⚔' + Math.round((def.dmg||0)*lvlMul(def.id)), W * 0.32, H * 0.82);
    g.fillStyle = '#ef9a9a'; g.fillText('♥' + Math.round((def.hp||0)*lvlMul(def.id)), W * 0.68, H * 0.82);
  }
  {
    /* Сочный ролевой чип в правом верхнем углу */
    const ri = roleIcon || {icon:'?',color:'#90a4ae'};
    const col = ri.color || '#90a4ae';
    const r = Math.max(28, Math.round(Math.min(W, H) * 0.11));
    const cx = W - r - 12, cy = r + 12;
    const grd = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, 2, cx, cy, r);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.22, col);
    grd.addColorStop(1, shade(col, -45));
    g.beginPath(); g.arc(cx, cy, r + 3, 0, Math.PI * 2);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fill();
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fillStyle = grd; g.fill();
    g.strokeStyle = '#fff8e1'; g.lineWidth = 4; g.stroke();
    g.strokeStyle = col; g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy, r - 5, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#fff';
    g.font = 'bold ' + Math.round(r * 1.05) + 'px system-ui';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(ri.icon || '?', cx, cy + 1);
  }
  {
    const gems = {common:'#90a4ae', rare:'#42a5f5', epic:'#ab47bc', legendary:'#ffca28', mythic:'#ff7043'};
    const rRole = Math.max(28, Math.round(Math.min(W, H) * 0.11));
    g.fillStyle = gems[rarity] || '#90a4ae';
    g.beginPath(); g.arc(W - rRole * 2 - 22, 22, 11, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#fff8e1'; g.lineWidth = 2; g.stroke();
  }
  if(!playable){
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(0, 0, W, H);
    g.font = '42px system-ui'; g.fillStyle = '#fff';
    g.fillText('🔒', W / 2, H / 2);
  }
}

class Card3D {
  constructor(scene, id, index){
    this.scene = scene;
    this.id = id;
    this.index = index;
    this.selected = false;
    this.hovered = false;
    this.playable = true;
    this.hidden = false;
    this.flying = false;
    this.spinT = 0;
    this.bobT = Math.random() * 10;
    this.animT = Math.random() * 10;
    this.basePos = new THREE.Vector3();
    this.baseRotY = 0;
    this.baseScale = 1;
    this.flyFrom = null; this.flyToPos = null; this.flyT = 0; this.flyDur = 0.45; this.onFlyDone = null;

    const def = CARDS[id];
    const fr = frameColorFor(def);
    this.group = new THREE.Group();
    this.group.userData.card3d = this;

    const frameGeo = new THREE.BoxGeometry(CARD3D_W + 10, CARD3D_H + 10, 10);
    this.frameMat = new THREE.MeshStandardMaterial({
      color: fr.color, metalness: 0.8, roughness: 0.2,
      emissive: 0x000000, emissiveIntensity: 0, transparent: true
    });
    this.frame = new THREE.Mesh(frameGeo, this.frameMat);
    this.frame.castShadow = true;
    this.frame.receiveShadow = true;
    this.group.add(this.frame);

    this.texCanvas = document.createElement('canvas');
    this.texCanvas.width = CARD3D_W * 2;
    this.texCanvas.height = CARD3D_H * 2;
    paintCardLayers(this.texCanvas.getContext('2d'), this.texCanvas.width, this.texCanvas.height, def, true, 0);
    this.texture = new THREE.CanvasTexture(this.texCanvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.faceMat = new THREE.MeshStandardMaterial({
      map: this.texture, roughness: 0.55, metalness: 0.05,
      emissive: 0x000000, emissiveIntensity: 0, transparent: true
    });
    this.face = new THREE.Mesh(new THREE.PlaneGeometry(CARD3D_W, CARD3D_H), this.faceMat);
    this.face.position.z = 6;
    this.face.castShadow = true;
    this.group.add(this.face);

    const backMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.7, metalness: 0.2 });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(CARD3D_W, CARD3D_H), backMat);
    back.rotation.y = Math.PI;
    back.position.z = -6;
    this.group.add(back);

    const pCount = 10;
    const positions = new Float32Array(pCount * 3);
    for(let i = 0; i < pCount; i++){
      positions[i*3] = (Math.random()-0.5) * CARD3D_W * 0.85;
      positions[i*3+1] = (Math.random()-0.5) * CARD3D_H * 0.85;
      positions[i*3+2] = 12 + Math.random() * 6;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.sparkMat = new THREE.PointsMaterial({ color: fr.color, size: 3, transparent: true, opacity: 0.2, depthWrite: false });
    this.sparks = new THREE.Points(pGeo, this.sparkMat);
    this.sparks.visible = false;
    this.group.add(this.sparks);

    scene.add(this.group);
  }
  refreshTexture(playable){
    this.playable = playable;
    const def = CARDS[this.id];
    const g = this.texCanvas.getContext('2d');
    g.clearRect(0, 0, this.texCanvas.width, this.texCanvas.height);
    paintCardLayers(g, this.texCanvas.width, this.texCanvas.height, def, playable, this.animT);
    this.texture.needsUpdate = true;
    this.group.visible = !this.hidden;
  }
  setBase(x, y, z, rotY){
    this.basePos.set(x, y, z);
    this.baseRotY = rotY;
  }
  show(){ this.hidden = false; this.group.visible = true; this.group.scale.setScalar(1); }
  hide(){ this.hidden = true; this.group.visible = false; }
  select(){
    this.selected = true;
    this.spinT = 1.0; // полный оборот один раз
    this.frameMat.emissive.setHex(0x554400);
    this.frameMat.emissiveIntensity = 0.35;
    this.faceMat.emissive.setHex(0x332200);
    this.faceMat.emissiveIntensity = 0.14;
    this.sparks.visible = true;
  }
  deselect(){
    this.selected = false;
    this.spinT = 0;
    this.frameMat.emissive.setHex(0x000000);
    this.frameMat.emissiveIntensity = 0;
    this.faceMat.emissive.setHex(0x000000);
    this.faceMat.emissiveIntensity = 0;
    if(!this.hovered) this.sparks.visible = false;
  }
  setHovered(v){
    this.hovered = v;
    if(v && this.playable) this.sparks.visible = true;
    else if(!this.selected) this.sparks.visible = false;
  }
  flyTo(target, onDone){
    this.flying = true;
    this.flyFrom = this.group.position.clone();
    this.flyToPos = target.clone();
    this.flyT = 0;
    this.flyDur = 0.5;
    this.onFlyDone = onDone;
  }
  update(dt){
    if(this.hidden && !this.flying) return;
    this.bobT += dt;
    this.animT += dt;
    if(this.curY == null) this.curY = 0;
    if(this.curSc == null) this.curSc = 1;
    if(this.curRotY == null) this.curRotY = this.baseRotY;

    const rarity = cardRarity(CARDS[this.id]);
    if((rarity === 'epic' || rarity === 'legendary' || rarity === 'mythic' || CARDS[this.id].type === 'spell') && (this._texAcc = (this._texAcc||0) + dt) > 0.12){
      this._texAcc = 0;
      this.refreshTexture(this.playable);
    }

    if(this.flying){
      this.flyT += dt / this.flyDur;
      const t = Math.min(1, this.flyT);
      const e = t * t * (3 - 2 * t);
      const mid = this.flyFrom.clone().lerp(this.flyToPos, 0.45);
      mid.y += 100;
      mid.z -= 40;
      const a = this.flyFrom.clone().lerp(mid, e);
      const b = mid.clone().lerp(this.flyToPos, e);
      this.group.position.lerpVectors(a, b, e);
      this.group.scale.setScalar(1 - e * 0.65);
      this.group.rotation.x = -0.1 - e * 0.4;
      this.group.rotation.z = Math.sin(e * Math.PI) * 0.15;
      this.group.rotation.y = this.baseRotY + e * Math.PI * 1.2;
      this.faceMat.opacity = 1 - e * 0.85;
      this.frameMat.opacity = 1 - e * 0.85;
      this.faceMat.transparent = true;
      this.frameMat.transparent = true;
      if(t >= 1){
        this.flying = false;
        this.faceMat.opacity = 1;
        this.frameMat.opacity = 1;
        this.hide();
        const cb = this.onFlyDone; this.onFlyDone = null;
        if(cb) cb();
      }
      return;
    }

    // цели hover / select — плавный lerp
    const bs = this.baseScale || 1;
    let wantY = 0, wantSc = bs;
    if(this.hovered && this.playable){ wantY = 22; wantSc = bs * 1.08; }
    if(this.selected){ wantY = 34; wantSc = bs * 1.12; }
    const k = Math.min(1, dt * 12);
    this.curY += (wantY - this.curY) * k;
    this.curSc += (wantSc - this.curSc) * k;

    // лёгкое покачивание ±2° (не ±5 и не сильный крен)
    const sway = Math.sin(this.bobT * 1.5) * (2 * Math.PI / 180);
    let rotY = this.baseRotY + sway;
    if(this.spinT > 0){
      this.spinT = Math.max(0, this.spinT - dt / 0.55);
      const p = 1 - this.spinT;
      const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      rotY = this.baseRotY + ease * Math.PI * 2;
    }
    this.curRotY += (rotY - this.curRotY) * (this.spinT > 0 ? 1 : k);

    this.group.position.x = this.basePos.x;
    this.group.position.y = this.basePos.y + this.curY;
    this.group.position.z = this.basePos.z + (this.selected || this.hovered ? 6 : 0);
    // карты лицом к игроку, лёгкий наклон «на себя»
    this.group.rotation.set(-0.1, this.curRotY, 0);
    this.group.scale.setScalar(this.curSc);

    if(this.sparks.visible){
      this.sparks.rotation.z += dt * 0.4;
      this.sparkMat.opacity = 0.2 + Math.sin(this.bobT * 2.8) * 0.1;
    }
  }
  dispose(){
    this.scene.remove(this.group);
    this.texture.dispose();
    this.faceMat.dispose();
    this.frameMat.dispose();
    this.sparkMat.dispose();
    this.face.geometry.dispose();
    this.frame.geometry.dispose();
  }
}

class Hand3D {
  constructor(canvasEl){
    this.canvas = canvasEl;
    this.cards = [];
    this.hoverIdx = -1;
    this.enabled = false;
    this.clock = 0;

    this.scene = new THREE.Scene();
    // Камера почти спереди, лёгкий угол как в CR (не «на бок»)
    this.camera = new THREE.PerspectiveCamera(34, 1, 1, 2000);
    this.camera.position.set(0, 55, 420);
    this.camera.lookAt(0, 8, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas: canvasEl, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    this.dir = new THREE.DirectionalLight(0xfff3e0, 0.85);
    this.dir.position.set(80, 220, 160);
    this.dir.castShadow = true;
    this.dir.shadow.mapSize.set(512, 512);
    this.dir.shadow.camera.near = 50; this.dir.shadow.camera.far = 600;
    this.dir.shadow.camera.left = -250; this.dir.shadow.camera.right = 250;
    this.dir.shadow.camera.top = 200; this.dir.shadow.camera.bottom = -100;
    this.scene.add(this.dir);
    this.point = new THREE.PointLight(0xffe082, 0.5, 600);
    this.point.position.set(0, 120, 100);
    this.scene.add(this.point);

    const desk = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 200),
      new THREE.ShadowMaterial({ opacity: 0.25 })
    );
    desk.rotation.x = -Math.PI / 2;
    desk.position.y = -95;
    desk.position.z = 20;
    desk.receiveShadow = true;
    this.scene.add(desk);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    canvasEl.addEventListener('pointermove', e => this.onPointerMove(e));
    canvasEl.addEventListener('pointerdown', e => this.onPointerDown(e));
    canvasEl.addEventListener('pointerleave', () => this.clearHover());
    this.resize();
  }
  setActive(on){
    this.enabled = on;
    this.canvas.classList.toggle('active', on);
    this.canvas.classList.toggle('hidden', !on);
    if(!on) this.clear();
  }
  resize(){
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || 220;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.fov = 34;
    /* На телефоне карты ×2.5 от прежнего 0.78 */
    const phone = w <= 520;
    const baseZ = 420 * Math.max(1, 420 / Math.max(280, w));
    this.camera.position.set(0, phone ? 48 : 55, phone ? baseZ * 1.12 : baseZ);
    this.camera.lookAt(0, 8, 0);
    this.camera.updateProjectionMatrix();
    this._cardScale = phone ? (0.78 * 2.5) : 1;
    this.layout();
  }
  clear(){
    this.cards.forEach(c => c.dispose());
    this.cards = [];
    this.hoverIdx = -1;
  }
  sync(ids, selectedIdx){
    if(typeof THREE === 'undefined') return;
    const list = ids.slice(0, HAND3D_MAX);
    const same = list.length === this.cards.length && list.every((id, i) => this.cards[i].id === id);
    if(!same){
      this.clear();
      list.forEach((id, i) => this.cards.push(new Card3D(this.scene, id, i)));
    }
    this.layout();
    this.cards.forEach((c, i) => {
      c.index = i;
      c.refreshTexture(canPlay('me', c.id));
      if(selectedIdx === i){ if(!c.selected) c.select(); }
      else if(c.selected) c.deselect();
    });
  }
  layout(){
    const n = this.cards.length;
    if(!n) return;
    const w = this.canvas.clientWidth || window.innerWidth;
    const phone = w <= 520;
    const gap = Math.min(phone ? 118 : 132, (phone ? 420 : 500) / Math.max(n, 1));
    const sc = this._cardScale || 1;
    for(let i = 0; i < n; i++){
      const t = n === 1 ? 0.5 : i / (n - 1);
      const x = (t - 0.5) * gap * n * (phone ? 0.78 : 0.95);
      const rotY = (0.5 - t) * (phone ? 0.06 : 0.1);
      const z = -Math.abs(t - 0.5) * (phone ? 5 : 8);
      this.cards[i].setBase(x, 0, z, rotY);
      this.cards[i].baseScale = sc;
    }
  }
  clearHover(){
    if(this.hoverIdx >= 0 && this.cards[this.hoverIdx]) this.cards[this.hoverIdx].setHovered(false);
    this.hoverIdx = -1;
    hideCardTip();
  }
  pickCard(clientX, clientY){
    const r = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - r.left) / r.width) * 2 - 1;
    this.pointer.y = -((clientY - r.top) / r.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes = [];
    this.cards.forEach(c => { if(c.group.visible){ meshes.push(c.face, c.frame); } });
    const hits = this.raycaster.intersectObjects(meshes, false);
    if(!hits.length) return null;
    let obj = hits[0].object;
    while(obj && !obj.userData.card3d) obj = obj.parent;
    return obj && obj.userData.card3d ? obj.userData.card3d : null;
  }
  onPointerMove(e){
    if(!this.enabled || state !== 'play' || cardPlaying){ hideCardTip(); return; }
    const card = this.pickCard(e.clientX, e.clientY);
    const idx = card ? card.index : -1;
    if(idx !== this.hoverIdx){
      this.clearHover();
      this.hoverIdx = idx;
      if(card){ card.setHovered(true); if(card.playable) sfxHover(); }
    }
    if(card) showCardTip(card.id, e.clientX, e.clientY);
    else hideCardTip();
  }
  onPointerDown(e){
    if(!this.enabled || state !== 'play' || matchOver || cardPlaying) return;
    e.preventDefault();
    audio();
    const card = this.pickCard(e.clientX, e.clientY);
    if(!card) return;
    if(!canPlay('me', card.id)){
      sfxDeny();
      toast(prepT>0 ? ('Подготовка: ' + Math.ceil(prepT) + 'с') : 'Мало эликсира');
      return;
    }
    sfxTap();
    selectedCard = card.index;
    this.cards.forEach((c, i) => { if(i === card.index) c.select(); else c.deselect(); });
    startDrag(e, card.id);
  }
  flySelectedToField(lx, ly, onDone){
    const card = this.cards[selectedCard];
    if(!card){ if(onDone) onDone(); return; }
    // вверх к центру поля, без сильного бокового сноса
    const target = new THREE.Vector3(0, 140, -120);
    card.flyTo(target, onDone);
  }
  update(dt){
    if(!this.enabled && !this.cards.length) return;
    this.clock += dt;
    this.point.intensity = 0.42 + Math.sin(this.clock * 1.4) * 0.06;
    this.cards.forEach(c => c.update(dt));
    this.renderer.render(this.scene, this.camera);
  }
}

const handEl = document.getElementById('hand');

function initHand3D(){
  const el = document.getElementById('hand3d');
  if(!el || typeof THREE === 'undefined'){
    console.warn('Three.js недоступен');
    el && el.classList.add('hidden');
    return;
  }
  hand3d = new Hand3D(el);
  hand3d.setActive(false);
}

function renderHand(){
  if(hand3d){
    hand3d.sync(handMe, selectedCard);
    return;
  }
  // fallback DOM, если Three.js не загрузился
  if(!handEl) return;
  handEl.style.display = 'flex';
  handEl.innerHTML = '';
  handMe.forEach((id, i) => {
    const def = CARDS[id];
    const ok = canPlay('me', id);
    const div = document.createElement('div');
    div.className = 'card rarity-' + cardRarity(def) + (selectedCard === i ? ' selected' : '') + (ok ? ' playable' : ' disabled');
    const atk = def.type==='spell' ? (def.heal?('✚'+def.heal):'✦') : ('⚔'+Math.round((def.dmg||0)*lvlMul(id)));
    const hp = def.type==='spell' ? '' : (' ♥'+Math.round((def.hp||0)*lvlMul(id)));
    const ri = (typeof cardRoleIcon==='function') ? cardRoleIcon(def) : {icon:'?',color:'#90a4ae'};
    const pack = (def.count&&def.count>=2) ? '<div class="pack">×'+def.count+'</div>' : '';
    div.innerHTML = '<div class="cost">'+def.cost+'</div>'+pack+
      '<div class="role-badge" style="--role:'+ri.color+'">'+ri.icon+'</div>'+
      '<div class="name">'+def.name+'</div><div class="stats">'+atk+hp+'</div>';
    div.onpointerenter = e => showCardTip(id, e.clientX, e.clientY);
    div.onpointerleave = () => hideCardTip();
    div.onpointerdown = e => {
      e.preventDefault(); audio();
      if(!ok){ sfxDeny(); toast('Мало эликсира'); return; }
      selectedCard = i; renderHand(); startDrag(e, id);
    };
    handEl.appendChild(div);
  });
}

function flyCardToField(handIdx, lx, ly, onDone){
  if(hand3d && hand3d.cards[handIdx]){
    selectedCard = handIdx;
    hand3d.flySelectedToField(lx, ly, () => {
      try{ onDone && onDone(); }
      finally{ cardPlaying = false; if(state === 'play') try{ renderHand(); }catch(_){} }
    });
    return;
  }
  try{ onDone && onDone(); }
  finally{ cardPlaying = false; if(state === 'play') try{ renderHand(); }catch(_){} }
}

function startDrag(e,id){
  const move=ev=>{
    const t=ev.touches?ev.touches[0]:ev;
    const r=canvas.getBoundingClientRect();
    const sx=(t.clientX-r.left)*(W/Math.max(1,r.width));
    const sy=(t.clientY-r.top)*(H/Math.max(1,r.height));
    const L=toLogic(sx,sy);
    const def=CARDS[id];
    const valid=isValidPlace(L.x,L.y,'me',id);
    if(def.type==='spell'){
      dragGhost={id,x:Math.max(1,Math.min(17,L.x)),y:Math.max(1,Math.min(31,L.y)),valid};
    } else {
      dragGhost={id,x:L.x,y:L.y,valid};
    }
  };
  const up=()=>{
    window.removeEventListener('pointermove',move);
    window.removeEventListener('pointerup',up);
    window.removeEventListener('touchmove',move);
    window.removeEventListener('touchend',up);
    if(dragGhost&&selectedCard!=null&&!cardPlaying){
      const idx=selectedCard;
      const gx=dragGhost.x, gy=dragGhost.y;
      const ok=dragGhost.valid;
      dragGhost=null;
      if(!ok){ sfxDeny(); toast('Нельзя поставить здесь'); selectedCard=null; renderHand(); return; }
      cardPlaying=true;
      flyCardToField(idx, gx, gy, ()=> playCard('me', idx, gx, gy));
    } else dragGhost=null;
  };
  window.addEventListener('pointermove',move);
  window.addEventListener('pointerup',up);
  window.addEventListener('touchmove',move,{passive:false});
  window.addEventListener('touchend',up);
  move(e);
}

initHand3D();

function updateHUD(){
  document.getElementById('crowns-me').textContent=`👑 ${crownsMe}`;
  document.getElementById('crowns-ai').textContent=`${crownsAi} 👑`;
  const defEl=document.getElementById('def-charges');
  defEl.textContent=`🗼 ${defCharges}`+(placeDefMode?' ✓':'');
  defEl.style.outline=placeDefMode?'2px solid #ffd54f':'none';
  defEl.style.opacity=defCharges>0||placeDefMode?'1':'0.55';
  const t=Math.max(0,Math.ceil(timeLeft));
  const timer=document.getElementById('timer');
  timer.textContent=timeLeft<0?`OT ${Math.ceil(-timeLeft)}`:`${Math.floor(t/60)}:${(t%60).toString().padStart(2,'0')}`;
  timer.className='timer'+(doubleElixir||(MATCH_TIME-timeLeft>=ELIXIR_DOUBLE_AT)?' x2':'');
  timer.title=doubleElixir||(MATCH_TIME-timeLeft>=ELIXIR_DOUBLE_AT)?'Двойной эликсир':'Обычный реген';
  const wrap=document.getElementById('elixir-wrap');
  const full=elixirMe>=elixirCap-1e-6;
  wrap.classList.toggle('full', full);
  document.getElementById('elixir-fill').style.width=`${(elixirMe/Math.max(1,elixirCap))*100}%`;
  document.getElementById('elixir-num').textContent=`${Math.floor(elixirMe)}/${elixirCap}`;
  const wv=document.getElementById('elixir-wave');
  if(wv){
    if(prepT>0) wv.textContent='Подготовка '+Math.ceil(prepT)+'с';
    else if(MATCH_TIME-timeLeft>=ELIXIR_DOUBLE_AT) wv.textContent='x2 эликсир';
    else wv.textContent='Волна '+wave;
  }
  if(hand3d && hand3d.enabled){
    hand3d.cards.forEach(c => {
      const ok = canPlay('me', c.id);
      if(ok !== c.playable) c.refreshTexture(ok);
    });
  } else if(handEl){
    [...handEl.children].forEach((el,i)=>{
      const id=handMe[i];
      const ok=canPlay('me',id);
      el.classList.toggle('disabled',!ok);
      el.classList.toggle('playable',ok && selectedCard!==i);
    });
  }
}

let toastT=0;
/** Боевые подсказки отключены (мало эликсира / реплики юнитов и т.п.). */
function toast(_m){ /* no-op */ }
function renderRecords(el){
  if(!el) return;
  el.innerHTML=records.length?records.map((r,i)=>`<li><span>#${i+1} ${r.win?'🏆':'💀'} ${r.crowns}👑 · ${r.score}</span><span>${r.date}</span></li>`).join(''):'<li>Пока нет боёв</li>';
}
function showOnly(id){
  ['menu','quests-panel','result','collection-panel','atelier-panel'].forEach(x=>{
    const el=document.getElementById(x);
    if(!el)return;
    if(x==='menu')el.style.display=id==='menu'?'':'none';
    else el.classList.toggle('hidden',x!==id);
  });
  const ov=document.getElementById('overlay');
  if(id==='menu'){
    ov.classList.remove('center-mode');
    document.getElementById('menu').style.display='';
    document.querySelector('.scene').style.display='';
  }else{
    ov.classList.add('center-mode');
  }
  if(id!=='atelier-panel') atelierOpen=false;
}
let atelierOpen=false;
function renderQuests(){
  ensureQuests();
  document.getElementById('quests').innerHTML=quests.items.map(q=>{
    const done=q.prog>=q.need;
    return `<li><span>${done?'✅':'⬜'} ${q.text} (${q.prog}/${q.need})</span><span>+${q.reward}🪙</span></li>`;
  }).join('');
}
let collectionLineFilter='all';
function paintCollectionPortrait(canvas, def){
  const S=64;
  canvas.width=S; canvas.height=S;
  const g=canvas.getContext('2d');
  g.clearRect(0,0,S,S);
  g.imageSmoothingEnabled=true;
  try{
    if(def.type==='spell'){
      g.font='36px system-ui';
      g.textAlign='center'; g.textBaseline='middle';
      g.fillText(def.emoji||'✦', S/2, S/2);
      return;
    }
    if(window.GameModels && GameModels.drawPreviewPortrait(g, def.id, 2, 2, S-4, S-4)) return;
    let fr=null;
    const useSmooth=window.VisualTheme&&VisualTheme.USE_SMOOTH_CHIBI&&window.SmoothChibi;
    if(useSmooth) fr=SmoothChibi.getPortrait(def.id);
    if(!fr&&typeof getSheets==='function'){
      const meta=charKindFor(def.id);
      const sheets=getSheets(meta.kind,true,meta.weapon,def.id);
      fr=(sheets.idle&&sheets.idle[0])||(sheets.attack&&sheets.attack[3]);
    }
    if(fr){
      const sc=Math.min((S-4)/fr.width,(S-4)/fr.height);
      const dw=fr.width*sc, dh=fr.height*sc;
      g.drawImage(fr,(S-dw)/2,(S-dh)/2,dw,dh);
    }else{
      g.font='32px system-ui';
      g.textAlign='center'; g.textBaseline='middle';
      g.fillText(def.emoji||'❓', S/2, S/2);
    }
  }catch(e){
    g.font='32px system-ui';
    g.textAlign='center'; g.textBaseline='middle';
    g.fillText(def.emoji||'❓', S/2, S/2);
  }
}
function renderCollection(){
  const grid=document.getElementById('collection-grid');
  const countEl=document.getElementById('collection-count');
  if(!grid) return;
  const cards=Object.values(CARDS).filter(c=>{
    if(c.summon) return false;
    if(c.type!=='troop'&&c.type!=='spell'&&c.type!=='building') return false;
    if(c.type==='troop'&&typeof isCardPlayable==='function'&&!isCardPlayable(c)) return false;
    if(collectionLineFilter==='all') return true;
    if(typeof isFactionEnabled==='function'&&!isFactionEnabled(collectionLineFilter)) return false;
    return (c.armyLine||c.faction||'light')===collectionLineFilter;
  }).sort((a,b)=>{
    const ta=a.type==='troop'?0:a.type==='building'?1:2;
    const tb=b.type==='troop'?0:b.type==='building'?1:2;
    if(ta!==tb) return ta-tb;
    const la=a.armyLine||a.faction||'light', lb=b.armyLine||b.faction||'light';
    if(la!==lb) return la.localeCompare(lb);
    return (RARITY_ORDER[a.rarity]||0)-(RARITY_ORDER[b.rarity]||0)||a.cost-b.cost||String(a.name).localeCompare(String(b.name));
  });
  if(countEl) countEl.textContent=`Показано: ${cards.length} · всего персонажей и карт`;
  grid.innerHTML=cards.map(c=>{
    const rar=c.rarity||'common';
    const line=c.armyLine||c.faction||(c.type==='spell'?'spell':'light');
    const role=c.combatRole?(COMBAT_ROLE_LABEL[c.combatRole]||c.combatRole):(c.type==='spell'?'Заклинание':(ARMY_LINE_LABEL[line]||line));
    const tip=[
      c.name,
      (typeof cardBadgeInfo==='function'?cardBadgeInfo(c).summary:null),
      `${c.cost} эликсира`,
      RARITY_LABEL[rar]||rar,
      ARMY_LINE_LABEL[line]||line,
      c.hp!=null?`HP ${c.hp}`:null,
      c.dmg!=null?`ATK ${c.dmg}`:null,
      c.count?`пачка ×${c.count}`:null
    ].filter(Boolean).join(' · ');
    const info=(typeof cardBadgeInfo==='function')?cardBadgeInfo(c):null;
    const roleTxt=(typeof rolePairSummary==='function'&&rolePairSummary(c))||(info&&info.summary)||role;
    const pack=(c.count&&c.count>=2)?`<div class="uc-pack">×${c.count}</div>`:'';
    const heal=(c.auraHeal||c.battlecry==='healPulse'||c.heal)?'<span class="uc-heal">✚</span>':'';
    return `<article class="unit-card rarity-${rar}" title="${tip.replace(/"/g,'&quot;')}" data-id="${c.id}">
      <div class="uc-cost">${c.cost}</div>${pack}
      <canvas width="64" height="64" aria-hidden="true"></canvas>
      <div class="uc-name">${c.name}${heal}</div>
      <div class="uc-meta">${roleTxt}</div>
    </article>`;
  }).join('');
  grid.querySelectorAll('.unit-card').forEach(card=>{
    const def=CARDS[card.dataset.id];
    const cv=card.querySelector('canvas');
    if(def&&cv) paintCollectionPortrait(cv, def);
  });
}

/* Мастерская образов — детальный procedural-превью (не сетка карт) */
let atelierIdx=0;
let atelierPose='idle';
let atelierFrame=0;
let atelierAcc=0;
let atelierIds=[];

function atelierCatalog(){
  const withId=Object.values(CARDS).filter(c=>c&&c.type==='troop'&&!c.summon&&c.uniqueFeature&&isCardPlayable(c));
  if(withId.length) return withId.sort((a,b)=>String(a.name).localeCompare(String(b.name),'ru'));
  return Object.values(CARDS).filter(c=>c&&c.type==='troop'&&!c.summon&&isCardPlayable(c))
    .sort((a,b)=>String(a.name).localeCompare(String(b.name),'ru'));
}
function atelierSheetsFor(def){
  if(!def||typeof getSheets!=='function'||typeof charKindFor!=='function') return null;
  const meta=charKindFor(def.id);
  return getSheets(meta.kind,true,meta.weapon,def.id);
}
function atelierCurrentDef(){
  if(!atelierIds.length) atelierIds=atelierCatalog();
  return atelierIds[atelierIdx]||null;
}
function paintAtelierFrameStrip(sheets){
  const wrap=document.getElementById('atelier-frames');
  if(!wrap) return;
  const frames=(sheets&&sheets[atelierPose])||[];
  wrap.innerHTML='';
  frames.forEach((fr,i)=>{
    const cv=document.createElement('canvas');
    cv.width=48; cv.height=48;
    if(i===atelierFrame) cv.classList.add('on');
    const g=cv.getContext('2d');
    g.imageSmoothingEnabled=false;
    g.clearRect(0,0,48,48);
    if(fr){
      const sc=Math.min(44/fr.width,44/fr.height);
      const dw=fr.width*sc, dh=fr.height*sc;
      g.drawImage(fr,(48-dw)/2,(48-dh)/2,dw,dh);
    }
    cv.onclick=()=>{ atelierFrame=i; atelierAcc=0; paintAtelierPreview(false); };
    wrap.appendChild(cv);
  });
}
function paintAtelierPreview(rebuildStrip){
  const def=atelierCurrentDef();
  const canvas=document.getElementById('atelier-canvas');
  if(!canvas||!def) return;
  const meta=(typeof charKindFor==='function')?charKindFor(def.id):{kind:'?',weapon:'?'};
  const nameEl=document.getElementById('atelier-name');
  if(nameEl) nameEl.textContent=`${def.emoji||''} ${def.name}`;
  const set=(id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=v; };
  set('atelier-sil', def.silhouetteType||'—');
  set('atelier-color', def.dominantColor||'—');
  set('atelier-feat', def.uniqueFeature||'—');
  set('atelier-kind', meta.kind||'—');
  set('atelier-weapon', meta.weapon||'—');
  const modelPath=window.GameModels&&GameModels.modelFor(def.id);
  const kw=document.getElementById('atelier-kw');
  if(kw){
    if(modelPath) kw.textContent=`Браузер 3D: assets/models/${modelPath} (Ultimate Monsters = Unity)`;
    else if(def.modelSearchKeywords) kw.textContent=`Ключевые слова: ${def.modelSearchKeywords}`;
    else kw.textContent='Procedural canvas-sheet (js/main.js).';
  }
  document.querySelectorAll('#atelier-poses button').forEach(b=>{
    b.classList.toggle('on', b.dataset.pose===atelierPose);
  });
  const sheets=atelierSheetsFor(def);
  const frames=(sheets&&sheets[atelierPose])||[];
  if(!frames.length) atelierFrame=0;
  else atelierFrame=((atelierFrame%frames.length)+frames.length)%frames.length;
  if(rebuildStrip) paintAtelierFrameStrip(sheets);
  const g=canvas.getContext('2d');
  const S=canvas.width;
  g.imageSmoothingEnabled=true;
  g.clearRect(0,0,S,S);
  if(modelPath && window.GameModels && GameModels.drawPreviewPortrait(g, def.id, 16, 16, S-32, S-32)){
    /* Preview.jpg crop */
  }else{
    const fr=frames[atelierFrame];
    if(fr){
      g.imageSmoothingEnabled=false;
      const sc=Math.min((S-16)/fr.width,(S-16)/fr.height);
      const dw=fr.width*sc, dh=fr.height*sc;
      g.drawImage(fr,(S-dw)/2,(S-dh)/2,dw,dh);
    }else{
      g.font='64px system-ui';
      g.textAlign='center'; g.textBaseline='middle';
      g.fillText(def.emoji||'❓', S/2, S/2);
    }
  }
  document.querySelectorAll('#atelier-frames canvas').forEach((cv,i)=>{
    cv.classList.toggle('on', i===atelierFrame);
  });
}
function openAtelier(startId){
  atelierIds=atelierCatalog();
  if(startId){
    const i=atelierIds.findIndex(c=>c.id===startId);
    if(i>=0) atelierIdx=i;
  }
  if(atelierIdx>=atelierIds.length) atelierIdx=0;
  atelierPose='idle';
  atelierFrame=0;
  atelierAcc=0;
  atelierOpen=true;
  paintAtelierPreview(true);
  showOnly('atelier-panel');
}
function updateAtelier(dt){
  if(!atelierOpen) return;
  const def=atelierCurrentDef();
  if(!def) return;
  const sheets=atelierSheetsFor(def);
  const frames=(sheets&&sheets[atelierPose])||[];
  if(frames.length<2) return;
  const spd=atelierPose==='attack'?11:atelierPose==='walk'?9:6;
  atelierAcc+=dt*spd;
  if(atelierAcc>=1){
    atelierAcc=0;
    atelierFrame=(atelierFrame+1)%frames.length;
    paintAtelierPreview(false);
  }
}

document.querySelectorAll('#diff button[data-d]').forEach(b=>{
  b.onclick=()=>{difficulty=b.dataset.d;document.querySelectorAll('#diff button[data-d]').forEach(x=>x.classList.toggle('on',x===b));};
});
document.querySelectorAll('#collection-filters button').forEach(b=>{
  b.onclick=()=>{
    collectionLineFilter=b.dataset.line||'all';
    document.querySelectorAll('#collection-filters button').forEach(x=>x.classList.toggle('on',x===b));
    renderCollection();
    sfxTap();
  };
});
document.getElementById('btn-play').onclick=()=>{tournament=null;startMatch();};
document.getElementById('btn-settings').onclick=()=>{
  document.getElementById('diff').classList.toggle('open');
};
const btnCollection=document.getElementById('btn-collection');
if(btnCollection) btnCollection.onclick=()=>{
  renderCollection();
  document.getElementById('overlay').classList.add('center-mode');
  showOnly('collection-panel');
};
const btnCollectionBack=document.getElementById('btn-collection-back');
if(btnCollectionBack) btnCollectionBack.onclick=()=>{
  document.getElementById('overlay').classList.remove('center-mode');
  showOnly('menu');
  renderRecords(document.getElementById('records'));
};
const btnAtelier=document.getElementById('btn-atelier');
if(btnAtelier) btnAtelier.onclick=()=>{
  sfxTap();
  openAtelier();
};
const btnAtelierBack=document.getElementById('btn-atelier-back');
if(btnAtelierBack) btnAtelierBack.onclick=()=>{
  sfxTap();
  atelierOpen=false;
  showOnly('menu');
  renderRecords(document.getElementById('records'));
};
document.getElementById('atelier-prev').onclick=()=>{
  if(!atelierIds.length) atelierIds=atelierCatalog();
  atelierIdx=(atelierIdx-1+atelierIds.length)%atelierIds.length;
  atelierFrame=0; atelierAcc=0;
  paintAtelierPreview(true);
  sfxTap();
};
document.getElementById('atelier-next').onclick=()=>{
  if(!atelierIds.length) atelierIds=atelierCatalog();
  atelierIdx=(atelierIdx+1)%atelierIds.length;
  atelierFrame=0; atelierAcc=0;
  paintAtelierPreview(true);
  sfxTap();
};
document.querySelectorAll('#atelier-poses button').forEach(b=>{
  b.onclick=()=>{
    atelierPose=b.dataset.pose||'idle';
    atelierFrame=0; atelierAcc=0;
    paintAtelierPreview(true);
    sfxTap();
  };
});
const btnTourney=document.getElementById('btn-tourney');
if(btnTourney) btnTourney.onclick=()=>{
  tournament={fights:0,crowns:0};startMatch();toast('Турнир: бой 1/5');
};
document.getElementById('btn-quests-back').onclick=()=>{
  document.getElementById('overlay').classList.remove('center-mode');
  showOnly('menu');
  renderRecords(document.getElementById('records'));
};
document.getElementById('btn-again').onclick=()=>{
  if(tournament&&tournament.fights<5){startMatch();toast(`Турнир: бой ${tournament.fights+1}/5`);}
  else{tournament=null;startMatch();}
};
document.getElementById('btn-menu').onclick=()=>{
  if(tournament&&tournament.fights>=5){
    toast(`Турнир завершён! Корон: ${tournament.crowns}`);
    tournament=null;
  }
  state='menu';
  document.getElementById('hand-tray').classList.add('hidden');
  document.getElementById('elixir-wrap').style.display='none';
  if(hand3d) hand3d.setActive(false);
  document.getElementById('overlay').classList.remove('hidden','center-mode');
  showOnly('menu');
  renderRecords(document.getElementById('records'));
};

canvas.addEventListener('click',e=>{
  if(state!=='play')return;
  const r=canvas.getBoundingClientRect();
  const sx=(e.clientX-r.left)*(W/Math.max(1,r.width));
  const sy=(e.clientY-r.top)*(H/Math.max(1,r.height));
  const L=toLogic(sx,sy);
  if(placeDefMode){
    if(defCharges<=0||countDef('me')>=MAX_DEF_TOWERS){placeDefMode=false;updateHUD();return;}
    if(L.y>ARENA.h/2-0.3){toast('Только на своей половине');return;}
    if(placeDefense('me',L.x,L.y)){
      defCharges--;
      placeDefMode=defCharges>0;
      toast(defCharges?'Вышка поставлена! Ещё заряд — тапни поле':'Вышка поставлена!');
      updateHUD();
    }
    return;
  }
  if(selectedCard!=null&&!dragGhost&&!cardPlaying){
    const idx=selectedCard;
    const id=handMe[idx];
    if(!isValidPlace(L.x,L.y,'me',id)){sfxDeny();toast('Нельзя поставить здесь');return;}
    cardPlaying=true;
    flyCardToField(idx, L.x, L.y, ()=> playCard('me', idx, L.x, L.y));
    return;
  }
  if(dragGhost)return;
  const hit=pickFocusAt(L.x,L.y);
  if(hit){
    focusTarget=hit;
    toast('Фокус');
  }else if(focusTarget){
    focusTarget=null;
  }
});

document.getElementById('def-charges').addEventListener('click',e=>{
  e.stopPropagation();audio();
  if(state!=='play')return;
  if(defCharges<=0){toast('Убивай врагов — каждые 8 убийств даётся вышка');return;}
  if(countDef('me')>=MAX_DEF_TOWERS){toast('Максимум 2 вышки');return;}
  placeDefMode=!placeDefMode;
  selectedCard=null;renderHand();
  toast(placeDefMode?'Тапни свою половину арены':'Отмена');
  updateHUD();
});

function hideTip(){
  const tip=document.getElementById('unit-tip');
  if(tip) tip.style.display='none';
  hoverTipUnit=null;
}
function hideCardTip(){
  const tip=document.getElementById('card-tip');
  if(tip) tip.style.display='none';
}
function showCardTip(id, clientX, clientY){
  /* Тултип при наведении на карту отключён — затемняет экран и мешает */
  hideCardTip();
}
function showUnitTip(_u, _clientX, _clientY){
  hideTip();
}
canvas.addEventListener('pointermove',e=>{
  /* Подсказки на юнитах отключены — не перекрывают пиксельный визуал */
  hideTip();
});
canvas.addEventListener('pointerleave',hideTip);

function loop(ts){
  if(!lastTs)lastTs=ts;
  const dt=Math.min(0.05,(ts-lastTs)/1000); lastDrawDt=dt;lastTs=ts;
  update(dt);draw();
  if(hand3d) hand3d.update(dt);
  updateAtelier(dt);
  requestAnimationFrame(loop);
}
renderRecords(document.getElementById('records'));
document.getElementById('hand-tray').classList.add('hidden');
document.getElementById('elixir-wrap').style.display='none';
const h3boot=document.getElementById('hand3d');
if(h3boot) h3boot.classList.add('hidden');
showOnly('menu');
if(window.GameModels){
  GameModels.arena3d = false;
  GameModels.ensurePreview();
  window.onUltimatePreviewReady=()=>{
    const col=document.getElementById('collection-panel');
    if(col && !col.classList.contains('hidden')) renderCollection();
    if(atelierOpen) paintAtelierPreview(false);
  };
}
window.__rrVfx = {
  get fx(){ return fx; },
  get particles(){ return particles; },
  toScreen,
  get vignette(){ return vignette; },
  set vignette(v){ vignette = v; },
  get flashWhite(){ return flashWhite; },
  set flashWhite(v){ flashWhite = v; }
};
requestAnimationFrame(loop);
/* Mute в настройках + клавиша M (GameAudio) */
(function wireMute(){
  if(!window.GameAudio) return;
  let muted = false;
  const muteBtn = document.getElementById('btn-mute');
  function applyMute(next){
    muted = !!next;
    GameAudio.setMuted(muted);
    if(muteBtn){
      muteBtn.textContent = muted ? '🔇 Выкл' : '🔊 Звук';
      muteBtn.classList.toggle('on', !muted);
    }
    if(typeof toast === 'function') toast(muted ? 'Звук выкл' : 'Звук вкл');
  }
  if(muteBtn){
    muteBtn.classList.add('on');
    muteBtn.onclick = (e)=>{ e.stopPropagation(); applyMute(!muted); sfxTap(); };
  }
  window.addEventListener('keydown', (e) => {
    if(e.key === 'm' || e.key === 'M') applyMute(!muted);
  });
})();

})();
