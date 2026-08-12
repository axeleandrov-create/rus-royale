/* balance.js — эликсир CR, карты, башни (ElixirManager / cards) */
'use strict';
const MATCH_TIME=180;
/* Эликсир как в Clash Royale: 5 старт / 10 макс / 1 за 2.8с / x2 после 2 мин */
const ELIXIR_HARD_MAX=10;
const ELIXIR_START_MAX=6;      /* чуть больше старта — проще разыгрывать пачки */
const ELIXIR_TICK=2.0;         /* быстрее реген (было ~2.5–2.8) */
const ELIXIR_DOUBLE_AT=120;    /* через 2 минуты матча — двойной реген */
/** Глобальный множитель скорости юнитов (меньше = медленнее бегут) */
const UNIT_SPEED_MUL=0.68;
const WAVE_DURATION=30;        /* волны — темп боя (кап эликсира не растёт) */
const PREP_TIME=1;             /* короткая пауза перед стартом боя */

/* ========== Баланс в стиле Hearthstone ==========
 * Базовые очки силы = cost × 2.
 * Полезные способности снимают 1–2 очка (налог).
 * Сумма atkPts + hpPts ≤ бюджета; в бою: dmg/hp = очки × SCALE.
 */
const BALANCE={
  POINTS_PER_COST:2,
  ATK_SCALE:42,   /* 1 очко атаки → урон */
  HP_SCALE:145,   /* 1 очко HP → здоровье */
  HEAL_SCALE:95,
  SPELL_DMG_SCALE:70,
  SHIELD_SCALE:70
};
/** Налог за способности (провокация / splash / ульты / WC-флаги) */
function abilityTax(def){
  let t=0;
  if(def.taunt||def.role==='tank'||(def.aggro&&def.aggro>=1.5)) t+=1;
  if(def.splash||def.role==='splash') t+=1;
  if(def.stun||def.stunOnHit||def.stunEvery||def.spawnStun) t+=1;
  if(def.heal||def.shieldHp||def.auraHeal||def.lifesteal) t+=1;
  if(def.immortal||def.armorAtHalf||def.dmgBlock||def.dmgReduce) t+=2;
  if(def.deathExplode||def.deathrattle||def.spawnOnKill) t+=1;
  if(def.ult||def.battlecry||def.bloodRoar) t+=2;
  if(def.charge||def.critEvery||def.firstHitCrit||def.diveMul||def.berserk||def.atkSpeedStack) t+=1;
  if(def.hypnosis||def.markOnHit||def.auraSlow||def.rangeAura||def.auraDot||def.auraAtk||def.poison||def.iceBreath||def.acidBreath) t+=1;
  if(def.stealth||def.stealthSpawn||def.shadowSpawn||def.smokeDeath) t+=1;
  if(def.siege||def.combatRole==='siege'||def.hook||def.elixirOnKill||def.armorIgnore||def.chain) t+=1;
  if(def.volley) t+=0.5;
  if(def.air) t+=0.5;
  if(def.curse||def.freeze||def.freezeOnHit) t+=2;
  if(def.spawnId||def.role==='turret') t+=1;
  if((def.count||1)>1) t+=0.5;
  return Math.min(t, Math.max(0, (def.cost||0)*2-1));
}
function powerBudget(def){
  return Math.max(1, (def.cost||0)*BALANCE.POINTS_PER_COST - abilityTax(def));
}
/** Собрать troop/building: atkPts+hpPts не выше бюджета; count делит бюджет на юнита */
function mkStats(def, atkPts, hpPts){
  const n=def.count||1;
  const budget=powerBudget(def);
  let a=atkPts, hp=hpPts;
  /* бюджет на ОДНОГО юнита для свормов */
  const per=budget/n;
  if(a+hp>per+0.01){
    const s=per/Math.max(0.01,a+hp);
    a=Math.round(a*s*10)/10;
    hp=Math.round(hp*s*10)/10;
  }
  def.atkPts=a; def.hpPts=hp; def.powerBudget=budget;
  def.dmg=Math.max(1, Math.round(a*BALANCE.ATK_SCALE));
  def.hp=Math.max(1, Math.round(hp*BALANCE.HP_SCALE));
  return def;
}
/** Абсолютные статы из брифа: hp/dmg как есть; speedBrief×8×UNIT_SPEED_MUL → speed движка */
function mkTroop(def){
  def.type='troop';
  if(def.speedBrief!=null) def.speed=Math.round(def.speedBrief*8*UNIT_SPEED_MUL);
  if(def.atkCd==null) def.atkCd=1.2;
  if(def.target==null) def.target=def.air?'airground':'ground';
  def.atkPts=Math.round(((def.dmg||0)/BALANCE.ATK_SCALE)*10)/10;
  def.hpPts=Math.round(((def.hp||0)/BALANCE.HP_SCALE)*10)/10;
  def.powerBudget=powerBudget(def);
  return def;
}
function mkSpell(def, powerPts){
  const budget=powerBudget(def);
  const p=Math.min(powerPts, budget);
  def.powerBudget=budget; def.powerPts=p;
  if(def.heal!=null) def.heal=Math.round(p*BALANCE.HEAL_SCALE);
  if(def.dmg!=null && def.type==='spell' && !def.curse) def.dmg=Math.round(p*BALANCE.SPELL_DMG_SCALE);
  if(def.curse) def.dmg=Math.round(Math.max(1,p*0.35)*BALANCE.SPELL_DMG_SCALE/10); /* DoT тик */
  if(def.shieldHp!=null) def.shieldHp=Math.round(p*BALANCE.SHIELD_SCALE);
  if(def.freeze!=null && def.dmg!=null) def.dmg=Math.round(p*BALANCE.SPELL_DMG_SCALE*0.55);
  return def;
}

const CARDS={
  /* —— Альянс (люди) —— Clash Royale vibe: синие / золото —— */
  opolchenets:mkStats({id:'opolchenets',name:'Ополченец',type:'troop',cost:1,emoji:'🗡️',speed:40,range:1.1,atkCd:1.0,target:'ground',count:2,role:'fast',combatRole:'dps',faction:'alliance',charge:3.5,chargeMul:1.35,rarity:'common',artKey:'opolchenets',costume:'peasant'}, 0.6, 0.6),
  druzhinnik:mkStats({id:'druzhinnik',name:'Дружинник',type:'troop',cost:2,emoji:'⚔️',speed:38,range:1.15,atkCd:1.15,target:'ground',role:'fast',combatRole:'dps',faction:'alliance',dmgBlock:0.3,rarity:'common',artKey:'druzhinnik',costume:'knight'}, 1.5, 2.5),
  vityaz:mkTroop({id:'vityaz',name:'Витязь',cost:3,emoji:'🛡️',hp:1600,dmg:160,speedBrief:4.5,range:1.2,atkCd:1.2,target:'ground',role:'tank',combatRole:'tank',faction:'alliance',taunt:true,aggro:1.8,stun:0.5,rarity:'rare',artKey:'vityaz',costume:'knight'}),
  kazak:mkStats({id:'kazak',name:'Казак',type:'troop',cost:3,emoji:'🐴',speed:52,range:1.1,atkCd:0.9,target:'ground',role:'fast',combatRole:'dps',faction:'alliance',charge:4,chargeMul:1.8,critEvery:3,critMul:1.5,rarity:'rare',artKey:'kazak',costume:'rider'}, 2, 2),
  sadko:mkStats({id:'sadko',name:'Садко',type:'troop',cost:5,emoji:'🌊',speed:32,range:2.4,atkCd:1.4,target:'ground',role:'splash',combatRole:'ranged',faction:'alliance',splash:1.8,battlecry:'wave',ult:'wave',ultDmg:0,ultSlow:2,ultStun:1,allyAtkBuff:0.2,allyBuffDur:3,rarity:'epic',artKey:'sadko',costume:'rider'}, 2.5, 3.5),
  ilya:mkStats({id:'ilya',name:'Илья Муромец',type:'troop',cost:5,emoji:'🗡️',speed:26,range:1.25,atkCd:1.6,target:'ground',role:'tank',combatRole:'tank',faction:'alliance',taunt:true,aggro:2.4,armorAtHalf:true,rarity:'legendary',artKey:'ilya',costume:'knight'}, 2, 4),
  dobrynya:mkStats({id:'dobrynya',name:'Добрыня',type:'troop',cost:6,emoji:'🛡️',speed:28,range:1.3,atkCd:1.4,target:'ground',role:'tank',combatRole:'tank',faction:'alliance',taunt:true,aggro:2.0,ult:'smash',ultHp:0.4,ultDmg:0,ultStun:1.0,stunEvery:3,rarity:'legendary',artKey:'dobrynya',costume:'knight'}, 3, 5),

  /* —— Орки —— красно-зелёные силуэты —— */
  skomorokh:mkStats({id:'skomorokh',name:'Скоморохи',type:'troop',cost:3,emoji:'🎭',speed:44,range:1.5,atkCd:1.0,target:'ground',count:4,role:'splash',combatRole:'dps',faction:'orc',splash:1.5,smokeDeath:true,deathrattle:true,rarity:'common',artKey:'skomorokh',costume:'peasant'}, 0.5, 0.5),
  razboyniki:mkStats({id:'razboyniki',name:'Разбойники',type:'troop',cost:3,emoji:'🗡️',speed:48,range:1.0,atkCd:0.8,target:'ground',count:3,role:'fast',combatRole:'dps',faction:'orc',shadowSpawn:true,stealth:true,firstHitCrit:true,firstCritMul:1.8,rarity:'common',artKey:'razboyniki',costume:'robber'}, 0.8, 0.5),
  gorynych:mkTroop({id:'gorynych',name:'Змей Горыныч',cost:6,emoji:'🐉',hp:1800,dmg:95,speedBrief:2.8,range:3.2,atkCd:1.9,target:'airground',air:true,role:'splash',combatRole:'air',faction:'orc',aggro:1.4,splash:2.2,deathExplode:0,deathrattle:true,rarity:'epic',artKey:'gorynych',costume:'dragon',uiRole:'mage'}),
  kostey:mkStats({id:'kostey',name:'Кощей',type:'troop',cost:4,emoji:'💀',speed:34,range:1.2,atkCd:1.3,target:'ground',role:'tank',combatRole:'tank',faction:'orc',taunt:true,aggro:1.5,immortal:true,deathrattle:true,rarity:'legendary',artKey:'kostey',costume:'skeleton'}, 2, 2),
  zmeika:mkStats({id:'zmeika',name:'Змеёк',type:'troop',cost:1,emoji:'🐍',speed:42,range:1.2,atkCd:1.0,target:'ground',role:'fast',combatRole:'dps',faction:'orc',rarity:'common',artKey:'zmeika',costume:'dragon',summon:true}, 1, 1),

  /* —— Эльфы —— лес / лук / магия —— */
  streltsy:mkTroop({id:'streltsy',name:'Стрельцы',cost:3,emoji:'🏹',hp:250,dmg:90,speedBrief:5.0,range:5.5,atkCd:0.9,target:'airground',count:3,role:'ranged',combatRole:'ranged',faction:'elf',airBonus:1.5,volley:3,rarity:'common',artKey:'streltsy',costume:'archer'}),
  solovey:mkStats({id:'solovey',name:'Соловей',type:'troop',cost:2,emoji:'🐦',speed:32,range:5.0,atkCd:2.0,target:'airground',air:true,role:'ranged',combatRole:'air',faction:'elf',hypnosis:2.2,rarity:'rare',artKey:'solovey',costume:'archer'}, 1.5, 1),
  vasilisa:mkStats({id:'vasilisa',name:'Василиса',type:'troop',cost:3,emoji:'👸',speed:34,range:2.8,atkCd:1.6,target:'ground',role:'support',combatRole:'ranged',faction:'elf',battlecry:'healPulse',auraHeal:28,auraAtk:0.1,auraR:3.0,rarity:'rare',artKey:'vasilisa',costume:'maiden'}, 1, 3),
  leshy:mkStats({id:'leshy',name:'Леший',type:'troop',cost:4,emoji:'🌳',speed:24,range:1.4,atkCd:1.5,target:'ground',role:'tank',combatRole:'tank',faction:'elf',taunt:true,aggro:1.7,auraSlow:0.4,auraDot:18,auraR:3.0,rarity:'rare',artKey:'leshy',costume:'peasant'}, 1.5, 4.5),
  sokol:mkStats({id:'sokol',name:'Ночной Сокол',type:'troop',cost:4,emoji:'🦅',speed:40,range:4.8,atkCd:1.4,target:'airground',air:true,role:'ranged',combatRole:'air',faction:'elf',stealth:true,stealthSpawn:2.5,airBonus:1.5,diveMul:2,rarity:'epic',artKey:'sokol',costume:'archer'}, 2.5, 3),
  mag:mkStats({id:'mag',name:'Огненный маг',type:'troop',cost:4,emoji:'🔮',speed:34,range:5.5,atkCd:1.5,target:'airground',role:'splash',combatRole:'ranged',faction:'elf',splash:2.0,rarity:'epic',artKey:'mag',costume:'mage'}, 2.5, 3.5),
  volhv:mkStats({id:'volhv',name:'Волхв',type:'troop',cost:4,emoji:'✨',speed:32,range:5.8,atkCd:1.35,target:'airground',role:'splash',combatRole:'ranged',faction:'elf',splash:1.6,hypnosis:1.2,rarity:'epic',artKey:'volhv',costume:'mage'}, 2.2, 3.2),
  zharptica:mkStats({id:'zharptica',name:'Жар-птица',type:'troop',cost:4,emoji:'🕊️',speed:36,range:5.0,atkCd:1.8,target:'airground',air:true,role:'ranged',combatRole:'air',faction:'elf',deathExplode:0,deathrattle:true,rarity:'legendary',artKey:'zharptica',costume:'archer'}, 2.5, 2.5),
  perun:mkStats({id:'perun',name:'Перун',type:'troop',cost:8,emoji:'⚡',speed:30,range:3.5,atkCd:1.6,target:'airground',air:true,role:'splash',combatRole:'air',faction:'elf',splash:2.2,battlecry:'thunder',ult:'lightning',ultDmg:0,ultTargets:3,spawnDelay:2,rarity:'mythic',artKey:'perun',costume:'mage'}, 4, 6),

  /* —— Дворфы —— низкие, крепкие, осада (ходят по карте) —— */
  dvorf:mkStats({id:'dvorf',name:'Дворф-щит',type:'troop',cost:3,emoji:'🪓',speed:28,range:1.2,atkCd:1.25,target:'ground',role:'tank',combatRole:'tank',faction:'dwarf',taunt:true,aggro:2.0,dmgBlock:0.2,rarity:'rare',artKey:'dvorf',costume:'knight'}, 1.2, 3.5),
  samokhod:mkStats({id:'samokhod',name:'Самоход',type:'troop',cost:4,emoji:'🔫',speed:22,range:6.5,atkCd:1.8,target:'ground',role:'ranged',combatRole:'siege',faction:'dwarf',siege:true,splash:1.4,rarity:'epic',artKey:'samokhod',costume:'cannon'}, 2.2, 3.5),
  grom:mkStats({id:'grom',name:'Громила',type:'troop',cost:5,emoji:'🔨',speed:24,range:1.35,atkCd:1.5,target:'ground',role:'tank',combatRole:'tank',faction:'dwarf',taunt:true,aggro:2.2,stunEvery:3,ultStun:0.8,siege:true,rarity:'legendary',artKey:'grom',costume:'knight'}, 2.5, 4.5),

  /* —— Орда WC (14–18) —— */
  byk:mkTroop({id:'byk',name:'Бык-топорец',cost:5,emoji:'🐂',hp:2500,dmg:140,speedBrief:4.0,range:1.5,atkCd:1.5,target:'ground',role:'tank',combatRole:'tank',faction:'orc',taunt:true,aggro:2.0,spawnStun:{r:4,t:1.5},rarity:'epic',artKey:'byk',costume:'bull'}),
  ratay:mkTroop({id:'ratay',name:'Ратай',cost:2,emoji:'🪓',hp:900,dmg:80,speedBrief:4.5,range:1.5,atkCd:1.2,target:'ground',role:'tank',combatRole:'tank',faction:'orc',taunt:true,aggro:1.6,berserk:0.2,rarity:'common',artKey:'ratay',costume:'orc'}),
  troll:mkTroop({id:'troll',name:'Охотник-тролль',cost:3,emoji:'🏹',hp:400,dmg:100,speedBrief:4.8,range:6.0,atkCd:1.3,target:'airground',role:'ranged',combatRole:'ranged',faction:'orc',elixirOnKill:1,rarity:'rare',artKey:'troll',costume:'archer'}),
  zmejlet:mkTroop({id:'zmejlet',name:'Змей-летун',cost:4,emoji:'🐉',hp:600,dmg:130,speedBrief:5.5,range:4.5,atkCd:1.4,target:'airground',air:true,role:'ranged',combatRole:'air',faction:'orc',poison:{dps:10,t:3},rarity:'epic',artKey:'zmejlet',costume:'dragon'}),
  koldun:mkTroop({id:'koldun',name:'Колдун',cost:3,emoji:'🪄',hp:400,dmg:50,speedBrief:4.0,range:4.5,atkCd:1.5,target:'airground',role:'support',combatRole:'ranged',faction:'orc',bloodRoar:{atk:0.15,t:5},battlecry:'bloodRoar',rarity:'rare',artKey:'koldun',costume:'mage'}),

  /* —— Тьма WC (19–24) —— */
  chernyvityaz:mkTroop({id:'chernyvityaz',name:'Чёрный Витязь',cost:5,emoji:'🐴',hp:2200,dmg:120,speedBrief:4.0,range:1.5,atkCd:1.3,target:'ground',role:'tank',combatRole:'tank',faction:'dark',taunt:true,aggro:2.0,lifesteal:0.2,rarity:'epic',artKey:'chernyvityaz',costume:'rider'}),
  ledkoldun:mkTroop({id:'ledkoldun',name:'Ледяной Колдун',cost:5,emoji:'❄️',hp:500,dmg:130,speedBrief:3.8,range:6.5,atkCd:1.6,target:'airground',role:'ranged',combatRole:'ranged',faction:'dark',freezeOnHit:2,rarity:'legendary',artKey:'ledkoldun',costume:'mage'}),
  upyr:mkTroop({id:'upyr',name:'Упырь',cost:2,emoji:'🦇',hp:500,dmg:80,speedBrief:6.0,range:1.5,atkCd:0.9,target:'ground',role:'fast',combatRole:'dps',faction:'dark',atkSpeedStack:{step:0.05,cap:0.3},rarity:'common',artKey:'upyr',costume:'robber'}),
  chernmag:mkTroop({id:'chernmag',name:'Чёрный маг',cost:4,emoji:'💀',hp:400,dmg:60,speedBrief:4.0,range:5.0,atkCd:1.5,target:'airground',role:'ranged',combatRole:'ranged',faction:'dark',spawnOnKill:'skelet',rarity:'epic',artKey:'chernmag',costume:'mage'}),
  myasnik:mkTroop({id:'myasnik',name:'Мясничий',cost:5,emoji:'🔪',hp:2800,dmg:100,speedBrief:3.5,range:1.5,atkCd:1.5,target:'ground',role:'tank',combatRole:'tank',faction:'dark',taunt:true,aggro:2.2,splash:1.8,hook:true,rarity:'epic',artKey:'myasnik',costume:'butcher'}),
  zmejstud:mkTroop({id:'zmejstud',name:'Змей Студёный',cost:7,emoji:'🐲',hp:1800,dmg:140,speedBrief:3.0,range:4.5,atkCd:1.8,target:'airground',air:true,role:'tank',combatRole:'air',faction:'dark',aggro:1.6,iceBreath:{r:3,slow:0.5,t:2},rarity:'legendary',artKey:'zmejstud',costume:'dragon'}),

  /* —— Духи леса WC (25–28) —— */
  lesvityaz:mkTroop({id:'lesvityaz',name:'Лесной Витязь',cost:4,emoji:'🗡️',hp:900,dmg:160,speedBrief:5.5,range:1.5,atkCd:1.0,target:'ground',role:'fast',combatRole:'dps',faction:'forest',critEvery:4,critMul:2,armorIgnore:true,rarity:'epic',artKey:'lesvityaz',costume:'robber'}),
  lesovik:mkTroop({id:'lesovik',name:'Лесовик',cost:3,emoji:'🏹',hp:300,dmg:90,speedBrief:5.0,range:6.0,atkCd:1.2,target:'airground',role:'ranged',combatRole:'ranged',faction:'forest',stealth:true,stealthSpawn:2.5,firstHitCrit:true,firstCritMul:1.5,rarity:'rare',artKey:'lesovik',costume:'archer'}),
  velikan:mkTroop({id:'velikan',name:'Великан-камень',cost:5,emoji:'🪨',hp:3200,dmg:180,speedBrief:3.2,range:1.2,atkCd:1.5,target:'ground',role:'tank',combatRole:'tank',faction:'forest',taunt:true,aggro:2.4,dmgReduce:0.3,rarity:'legendary',artKey:'velikan',costume:'golem'}),
  zverogon:mkTroop({id:'zverogon',name:'Зверь Огнедышащий',cost:6,emoji:'🔥',hp:1000,dmg:200,speedBrief:3.5,range:4.5,atkCd:1.7,target:'airground',air:true,role:'splash',combatRole:'air',faction:'forest',splash:2.0,acidBreath:{armor:0.2,t:3},rarity:'legendary',artKey:'zverogon',costume:'dragon'}),

  /* —— Нейтралы WC (29–30) —— */
  moredeva:mkTroop({id:'moredeva',name:'Морская Дева',cost:5,emoji:'🧜',hp:700,dmg:120,speedBrief:4.5,range:6.0,atkCd:1.5,target:'airground',role:'splash',combatRole:'ranged',faction:'neutral',chain:3,rarity:'epic',artKey:'moredeva',costume:'maiden'}),
  brazhnik:mkTroop({id:'brazhnik',name:'Бражник',cost:5,emoji:'🍺',hp:2000,dmg:100,speedBrief:4.0,range:1.5,atkCd:1.4,target:'ground',role:'tank',combatRole:'tank',faction:'neutral',taunt:true,aggro:1.8,stunOnHit:1,hitMul:1.3,rarity:'epic',artKey:'brazhnik',costume:'peasant'}),

  /* Суммон некроманта — не в колоде */
  skelet:mkTroop({id:'skelet',name:'Скелет',cost:0,emoji:'💀',hp:200,dmg:30,speedBrief:4.5,range:1.2,atkCd:1.0,target:'ground',role:'fast',combatRole:'dps',faction:'dark',summon:true,rarity:'common',artKey:'skelet',costume:'skeleton'})
};
/* Добить производные ультов/взрывов, роли и фракции */
(function finalizeCardDerived(){
  Object.values(CARDS).forEach(c=>{
    /* mkStats задаёт speed напрямую — применяем тот же множитель */
    if(c.type==='troop' && c.speed!=null && c.speedBrief==null){
      c.speed=Math.max(8, Math.round(c.speed*UNIT_SPEED_MUL));
    }
    if(c.deathExplode!=null) c.deathExplode=Math.round((c.hpPts||1)*BALANCE.ATK_SCALE*1.8);
    if(c.ult==='wave') c.ultDmg=Math.round((c.atkPts||2)*BALANCE.ATK_SCALE*1.4);
    if(c.ult==='smash') c.ultDmg=Math.round((c.atkPts||3)*BALANCE.ATK_SCALE*2.2);
    if(c.ult==='lightning') c.ultDmg=Math.round((c.atkPts||4)*BALANCE.ATK_SCALE*1.6);
    /* Линии по фракциям Clash Royale vibe */
    if(c.faction==='alliance') c.armyLine='alliance';
    else if(c.faction==='orc') c.armyLine='orc';
    else if(c.faction==='elf') c.armyLine='elf';
    else if(c.faction==='dwarf') c.armyLine='dwarf';
    else if(c.faction==='dark') c.armyLine='dark';
    else if(c.faction==='forest') c.armyLine='forest';
    else if(c.faction==='neutral') c.armyLine='neutral';
    else if(c.role==='tank'||(c.aggro&&c.aggro>=1.5)||c.cost>=5) c.armyLine='heavy';
    else c.armyLine='light';
    if(!c.combatRole){
      if(c.air) c.combatRole='air';
      else if(c.role==='tank') c.combatRole='tank';
      else if(c.siege) c.combatRole='siege';
      else if(c.role==='ranged'||c.role==='splash'||c.role==='support') c.combatRole='ranged';
      else c.combatRole='dps';
    }
    if(c.taunt && !(c.aggro>=1.5)) c.aggro=Math.max(c.aggro||1, 1.8);
    /* uiRole для кружка роли на карте */
    if(!c.uiRole){
      if(c.heal||c.auraHeal||c.battlecry==='healPulse') c.uiRole='healer';
      else if(c.combatRole==='tank'||c.taunt||c.role==='tank') c.uiRole='tank';
      else if(c.splash||c.costume==='mage'||c.role==='splash'||c.ult==='lightning') c.uiRole='mage';
      else if(c.combatRole==='ranged'||c.combatRole==='air'||c.combatRole==='siege'||(c.range!=null&&c.range>1.6)) c.uiRole='ranged';
      else if(c.type==='troop') c.uiRole='melee';
    }
  });
  /* Визуальная идентичность (силуэт / цвет / фишка) — чтобы юниты не сливались */
  const VIS_ID={
    volhv:{uniqueFeature:'борода+посох',dominantColor:'синий',silhouetteType:'высокий',keywords:'wizard staff blue robe long white beard'},
    mag:{uniqueFeature:'огненный посох',dominantColor:'красный',silhouetteType:'высокий',keywords:'fire mage staff red robe stylized'},
    vityaz:{uniqueFeature:'шлем+щит',dominantColor:'стальной+красный',silhouetteType:'широкий',keywords:'knight shield helmet red cape stylized'},
    druzhinnik:{uniqueFeature:'щит с гербом',dominantColor:'синий',silhouetteType:'широкий',keywords:'soldier shield blue armor chibi'},
    streltsy:{uniqueFeature:'капюшон+лук',dominantColor:'зелёный',silhouetteType:'стройный',keywords:'archer hooded bow quiver leather'},
    skomorokh:{uniqueFeature:'тройка+лоскуты',dominantColor:'пёстрый',silhouetteType:'маленький',keywords:'goblin trio ragged colorful hats'},
    opolchenets:{uniqueFeature:'ушанка+топор',dominantColor:'коричневый',silhouetteType:'маленький',keywords:'peasant fur hat axe duo'},
    razboyniki:{uniqueFeature:'маски',dominantColor:'серый',silhouetteType:'стройный',keywords:'bandit mask dagger stealth'},
    vasilisa:{uniqueFeature:'сарафан+амулет',dominantColor:'розовый+зелёный',silhouetteType:'средний',keywords:'maiden dress heal aura stylized'},
    ilya:{uniqueFeature:'золотой шлем',dominantColor:'золото',silhouetteType:'широкий',keywords:'bogatyr gold helmet huge sword'},
    gorynych:{uniqueFeature:'три головы',dominantColor:'зелёный',silhouetteType:'крупный',keywords:'three head dragon stylized'},
    kostey:{uniqueFeature:'корона+коса',dominantColor:'бирюза+кость',silhouetteType:'высокий',keywords:'lich crown scythe bone stylized'},
    upyr:{uniqueFeature:'плащ+клыки',dominantColor:'сирень',silhouetteType:'стройный',keywords:'vampire cloak purple stylized'},
    kazak:{uniqueFeature:'папаха+конь',dominantColor:'коричневый',silhouetteType:'широкий',keywords:'cossack papakha horse rider'},
    perun:{uniqueFeature:'молния',dominantColor:'индиго+золото',silhouetteType:'высокий',keywords:'thunder mage lightning staff'},
    dvorf:{uniqueFeature:'щит-дверь',dominantColor:'оранжевый',silhouetteType:'широкий',keywords:'dwarf tower shield stout'},
    samokhod:{uniqueFeature:'пушка',dominantColor:'коричневый+золото',silhouetteType:'низкий',keywords:'cannon cart siege stylized'},
    grom:{uniqueFeature:'молот',dominantColor:'медный',silhouetteType:'широкий',keywords:'brute hammer giant dwarf'},
    chernyvityaz:{uniqueFeature:'чёрный плащ',dominantColor:'фиолетовый',silhouetteType:'широкий',keywords:'dark knight purple cape horse'},
    koldun:{uniqueFeature:'оранжевый колпак',dominantColor:'оранжевый',silhouetteType:'высокий',keywords:'warlock orange hat staff'},
    zharptica:{uniqueFeature:'огненные крылья',dominantColor:'оранжевый+жёлтый',silhouetteType:'летящий',keywords:'firebird phoenix stylized'}
  };
  Object.keys(VIS_ID).forEach(id=>{
    const c=CARDS[id]; if(!c) return;
    const v=VIS_ID[id];
    c.uniqueFeature=v.uniqueFeature;
    c.dominantColor=v.dominantColor;
    c.silhouetteType=v.silhouetteType;
    c.modelSearchKeywords=v.keywords;
  });
  /* Основная / доп. роль + сила / слабость (гибриды OK, «умеет всё» — нет) */
  const ROLE_ASSIGN={
    opolchenets:{primary:'swarm',secondary:null,strength:'Дешёвый рой для отвлечения',weakness:'Горит от splash-магов'},
    druzhinnik:{primary:'tank',secondary:null,strength:'Держит фронт, блок урона',weakness:'Слабый DPS — режут убийцы танков'},
    vityaz:{primary:'dps',secondary:'tankkiller',strength:'Сильный ближний удар по жирным',weakness:'Нужен танк впереди, слаб против роя'},
    kazak:{primary:'dps',secondary:'wincon',strength:'Рывок и давление на фланг',weakness:'Хрупкий, легко фокусится'},
    ilya:{primary:'wincon',secondary:'tankkiller',strength:'Огромный урон по одной цели / башне',weakness:'Медленный и дорогой, тонет в рое'},
    skomorokh:{primary:'swarm',secondary:null,strength:'Пачка отвлекает и давит',weakness:'Мгновенно тает от AOE'},
    razboyniki:{primary:'tankkiller',secondary:null,strength:'Быстрый крит по одиночным',weakness:'Мало HP, бьются splash и роем'},
    gorynych:{primary:'support',secondary:'tank',strength:'Летает, жжёт рои splash, живучий',weakness:'Дорогой и медленный — бьют дальники'},
    kostey:{primary:'support',secondary:null,strength:'Контроль / призыв, держит внимание',weakness:'Слаб против фокуса дальников'},
    koldun:{primary:'support',secondary:null,strength:'Бафф и поддержка линии',weakness:'Мало HP и урона'},
    streltsy:{primary:'dps',secondary:null,strength:'Дальний урон по воздуху и земле',weakness:'Хрупкие, нужна защита'},
    vasilisa:{primary:'support',secondary:null,strength:'Хил и аура союзникам',weakness:'Сама почти не танкует'},
    mag:{primary:'support',secondary:null,strength:'Сильный splash по толпам',weakness:'Хрупкий, режется ближним фокусом'},
    zharptica:{primary:'dps',secondary:null,strength:'Воздушный дамагер',weakness:'Мало HP против сфокусированного огня'},
    perun:{primary:'support',secondary:null,strength:'Мощный магический AOE',weakness:'Очень дорогой, долго выходит'},
    dvorf:{primary:'tank',secondary:null,strength:'Щит и провокация',weakness:'Низкий урон'},
    samokhod:{primary:'wincon',secondary:null,strength:'Осада башен с дистанции',weakness:'Медленный, уязвим в ближнем'},
    grom:{primary:'wincon',secondary:'tank',strength:'Таранит и держит удар',weakness:'Дорогой, медленный'},
    chernyvityaz:{primary:'tank',secondary:'wincon',strength:'Жирный кавалерийский танк',weakness:'Контрится убийцами танков и роем'},
    upyr:{primary:'tankkiller',secondary:null,strength:'Быстрый добивающий DPS',weakness:'Слаб против роя и splash'}
  };
  Object.keys(ROLE_ASSIGN).forEach(id=>{
    const c=CARDS[id]; if(!c) return;
    const r=ROLE_ASSIGN[id];
    c.primaryRole=r.primary;
    c.secondaryRole=r.secondary;
    c.strength=r.strength;
    c.weakness=r.weakness;
  });
  Object.values(CARDS).forEach(c=>{
    if(c.primaryRole) return;
    if(c.summon){ c.primaryRole='swarm'; c.secondaryRole=null; return; }
    if((c.count||1)>=2){ c.primaryRole='swarm'; }
    else if(c.siege){ c.primaryRole='wincon'; }
    else if(c.splash||c.role==='splash'||c.costume==='mage'||c.auraHeal){ c.primaryRole='support'; }
    else if(c.taunt||c.role==='tank'||c.combatRole==='tank'){ c.primaryRole='tank'; }
    else if(c.armorIgnore||c.firstHitCrit||(c.combatRole==='dps'&&c.cost<=3&&c.range<=1.6)){ c.primaryRole='tankkiller'; }
    else if(c.cost>=5&&(c.role==='tank'||c.aggro>=2)){ c.primaryRole='wincon'; c.secondaryRole='tank'; }
    else { c.primaryRole='dps'; }
    if(c.secondaryRole===undefined) c.secondaryRole=null;
    if(!c.strength) c.strength='Специализация по роли '+c.primaryRole;
    if(!c.weakness) c.weakness='Есть контр-роль в камень-ножницы-бумага';
  });
})();
const ARMY_LINE_LABEL={alliance:'Альянс',orc:'Орда',elf:'Эльфы',dwarf:'Дворфы',dark:'Тьма',forest:'Духи леса',neutral:'Нейтралы',light:'Лёгкие',heavy:'Тяжёлые'};
const FACTION_LABEL={alliance:'Альянс',orc:'Орда',elf:'Эльфы',dwarf:'Дворфы',dark:'Тьма',forest:'Духи леса',neutral:'Нейтралы'};
const COMBAT_ROLE_LABEL={tank:'Танк',dps:'Дамагер',ranged:'Дальний бой',air:'Воздух',siege:'Осада',mage:'Маг',swarm:'Рой',heal:'Хил'};
const PRIMARY_ROLE_LABEL={
  tank:'Танк',dps:'Дамагер',support:'Поддержка',swarm:'Рой',wincon:'Условие победы',tankkiller:'Убийца танков'
};
/** UI-роль для кружка на карте (по primaryRole) */
const UI_ROLE={
  tank:{icon:'🛡',label:'Танк',color:'#4caf50'},
  healer:{icon:'➕',label:'Хил',color:'#66bb6a'},
  melee:{icon:'⚔',label:'Ближний',color:'#e53935'},
  ranged:{icon:'🏹',label:'Дальний',color:'#fb8c00'},
  mage:{icon:'✨',label:'Поддержка',color:'#42a5f5'}
};
function primaryToUiRole(primary, def){
  if(def&&(def.heal||def.auraHeal||def.battlecry==='healPulse')) return 'healer';
  if(primary==='tank'||primary==='wincon') return 'tank';
  if(primary==='support') return 'mage';
  if(primary==='swarm') return 'melee';
  if(primary==='tankkiller'||primary==='dps'){
    if(def&&def.range>1.6) return 'ranged';
    return 'melee';
  }
  return null;
}
function resolveUiRole(def){
  if(!def) return null;
  if(def.uiRole&&UI_ROLE[def.uiRole]) return def.uiRole;
  const fromPrimary=primaryToUiRole(def.primaryRole, def);
  if(fromPrimary) return fromPrimary;
  if(def.heal||def.auraHeal||def.battlecry==='healPulse') return 'healer';
  if(def.combatRole==='tank'||def.taunt||def.role==='tank'||(def.aggro&&def.aggro>=1.8)) return 'tank';
  if(def.splash||def.costume==='mage'||def.role==='splash'||def.ult==='lightning'||def.ult==='thunder') return 'mage';
  if(def.combatRole==='ranged'||def.combatRole==='air'||def.combatRole==='siege'||(def.range!=null&&def.range>1.6)) return 'ranged';
  if(def.combatRole==='dps'||def.role==='fast'||(def.range!=null&&def.range<=1.6)) return 'melee';
  return null;
}
function cardRoleIcon(def){
  const key=resolveUiRole(def);
  if(!key) return {icon:'?',label:'?',color:'#90a4ae',key:null};
  return Object.assign({key}, UI_ROLE[key]);
}
function rolePairSummary(def){
  if(!def||!def.primaryRole) return '';
  const a=PRIMARY_ROLE_LABEL[def.primaryRole]||def.primaryRole;
  if(!def.secondaryRole) return a;
  const b=PRIMARY_ROLE_LABEL[def.secondaryRole]||def.secondaryRole;
  return a+' · '+b;
}
/**
 * Значки для руки/подсказки: роль, ближний/дальний, хил, пачка.
 */
function cardBadgeInfo(def){
  if(!def) return {badges:[], summary:'', hint:''};
  const badges=[];
  const n=def.count||1;
  const isHeal=!!(def.heal||def.auraHeal||def.battlecry==='healPulse');
  const isMelee=def.type!=='spell' && (def.range==null||def.range<=1.6);
  const isRanged=def.type!=='spell' && def.range>1.6;
  const isSwarm=n>=2||def.primaryRole==='swarm';
  const isMage=!!(def.primaryRole==='support'||def.splash||def.costume==='mage'||def.role==='splash');
  const isTank=!!(def.primaryRole==='tank'||def.combatRole==='tank'||def.taunt||def.role==='tank');
  const isSiege=!!(def.siege||def.combatRole==='siege'||def.primaryRole==='wincon');

  let primary;
  if(def.type==='spell'&&isHeal) primary={key:'heal',icon:'✚',label:'Хил',color:'#66bb6a'};
  else if(def.primaryRole==='support'||(isMage&&!isTank)) primary={key:'mage',icon:'✨',label:'Поддержка',color:'#42a5f5'};
  else if(isSwarm&&def.primaryRole!=='tank') primary={key:'swarm',icon:'×'+Math.max(n,2),label:'Рой',color:'#ffee58'};
  else if(def.primaryRole==='tankkiller') primary={key:'dps',icon:'⚔',label:'Убийца танков',color:'#e53935'};
  else if(def.primaryRole==='wincon') primary={key:'siege',icon:'🏰',label:'Win condition',color:'#ff9800'};
  else if(isTank) primary={key:'tank',icon:'🛡',label:'Танк',color:'#4caf50'};
  else if(isSiege) primary={key:'siege',icon:'🏰',label:'Осада',color:'#bcaaa4'};
  else if(isRanged||def.combatRole==='ranged'||def.combatRole==='air') primary={key:'ranged',icon:'🏹',label:'Дальний',color:'#aed581'};
  else primary={key:'dps',icon:'⚔',label:'Дамагер',color:'#81d4fa'};
  badges.push(primary);

  if(def.secondaryRole){
    const lab=PRIMARY_ROLE_LABEL[def.secondaryRole]||def.secondaryRole;
    badges.push({key:'sec',icon:'+',label:lab,color:'#b0bec5'});
  }
  if(isHeal&&primary.key!=='heal') badges.push({key:'heal',icon:'✚',label:'Хил',color:'#66bb6a'});
  if(def.air) badges.push({key:'air',icon:'☁',label:'Воздух',color:'#80deea'});
  if(isSwarm&&primary.key!=='swarm'&&n>=2) badges.push({key:'pack',icon:'×'+n,label:'Пачка ×'+n,color:'#ffd54f'});

  let hint=rolePairSummary(def);
  if(def.strength) hint+=(hint?' — ':'')+def.strength;
  if(def.weakness) hint+=' | Слабость: '+def.weakness;

  return {badges, summary:rolePairSummary(def)||badges.map(b=>b.icon+' '+b.label).join(' · '), hint, primary};
}
/* RPS + старые combatRole-ключи (мягкие множители) */
const ROLE_MUL={
  dps:{tank:1.2, ranged:1.1, air:0.9, support:1.05},
  tankkiller:{tank:1.4, wincon:1.25, dps:0.95, swarm:0.7, support:0.85, air:1.1},
  air:{tank:1.15, dps:0.95, ranged:0.85, swarm:1.25},
  ranged:{air:1.35, dps:0.9, tank:0.95, swarm:1.15, support:1.05},
  tank:{dps:0.9, air:0.8, ranged:1.0, tankkiller:0.75, swarm:1.05},
  support:{swarm:1.45, dps:1.05, tank:0.85, tankkiller:0.9, air:1.0},
  swarm:{tankkiller:1.35, dps:1.2, support:0.65, tank:0.85, ranged:0.8},
  wincon:{tank:0.95, dps:1.0, swarm:0.9},
  siege:{tank:0.9, dps:0.95}
};
function roleDamageMul(atkRole, defRole){
  if(!atkRole||!defRole) return 1;
  const row=ROLE_MUL[atkRole];
  return (row&&row[defRole])||1;
}
const ABILITY_KW={
  taunt:'Провокация',charge:'Рывок',battlecry:'Боевой клич',
  deathrattle:'Смертельный хрип',stealth:'Невидимость',siege:'Осада'
};
/** Подписи способностей карты для UI */
function cardAbilityLines(def){
  if(!def) return [];
  const a=[];
  if(def.faction) a.push(FACTION_LABEL[def.faction]||def.faction);
  if(def.taunt) a.push(ABILITY_KW.taunt);
  if(def.charge) a.push(ABILITY_KW.charge);
  if(def.battlecry||def.ult==='wave') a.push(ABILITY_KW.battlecry+(def.battlecry?': '+def.battlecry:''));
  if(def.deathrattle||def.deathExplode||def.smokeDeath||def.immortal) a.push(ABILITY_KW.deathrattle);
  if(def.stealth||def.stealthSpawn||def.shadowSpawn) a.push(ABILITY_KW.stealth);
  if(def.siege||def.combatRole==='siege') a.push(ABILITY_KW.siege+' (+к башням)');
  if(def.dmgBlock) a.push('Блок '+(def.dmgBlock*100|0)+'%');
  if(def.dmgReduce) a.push('Стойкость −'+(def.dmgReduce*100|0)+'%');
  if(def.lifesteal) a.push('Вампиризм '+(def.lifesteal*100|0)+'%');
  if(def.berserk) a.push('Берсерк +'+(def.berserk*100|0)+'%');
  if(def.elixirOnKill) a.push('Трофей +'+def.elixirOnKill+'💎');
  if(def.poison) a.push('Яд');
  if(def.spawnOnKill) a.push('Призыв: '+def.spawnOnKill);
  if(def.spawnStun) a.push('Топот-стан');
  if(def.bloodRoar) a.push('Кровавый рёв');
  if(def.hook) a.push('Крюк');
  if(def.armorIgnore) a.push('Игнор брони');
  if(def.atkSpeedStack) a.push('Бешенство');
  if(def.freezeOnHit) a.push('Заморозка '+def.freezeOnHit+'с');
  if(def.iceBreath) a.push('Ледяное дыхание');
  if(def.acidBreath) a.push('Кислота');
  if(def.chain) a.push('Цепь ×'+def.chain);
  if(def.hitMul) a.push('Удар ×'+def.hitMul);
  if(def.firstHitCrit) a.push('Крит 1-го удара');
  if(def.volley) a.push('Очередь ×'+def.volley);
  if(def.auraHeal) a.push('Аура лечения');
  if(def.diveMul) a.push('Пике ×'+def.diveMul);
  if(def.air) a.push('Воздушный');
  return a;
}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]];}return a;}

/** Временно скрыты фракции (коллекция / колода / пулы). Вернуть: очистить массив. */
const DISABLED_FACTIONS=['dark','elf','neutral'];
/** Временно скрытые карты по id (пусто — полный пул включённых фракций) */
const DISABLED_CARDS=['lesovik'];
const DECK_SIZE=20;
function isFactionEnabled(factionOrCard){
  const f=typeof factionOrCard==='string'
    ? factionOrCard
    : (factionOrCard&&(factionOrCard.faction||factionOrCard.armyLine));
  if(!f) return true;
  return DISABLED_FACTIONS.indexOf(f)<0;
}
function isCardPlayable(idOrDef){
  const id=typeof idOrDef==='string'?idOrDef:(idOrDef&&idOrDef.id);
  const c=typeof idOrDef==='string'?(typeof CARDS!=='undefined'?CARDS[idOrDef]:null):idOrDef;
  if(id&&DISABLED_CARDS.indexOf(id)>=0) return false;
  if(!c||c.type!=='troop') return !!c;
  if(c.summon) return true; /* саммоны вроде скелета оставляем для способностей */
  return isFactionEnabled(c);
}

/** Корзина роли для CR-цикла колоды (равномерная рука) */
function deckRoleBucket(id){
  const c=typeof CARDS!=='undefined'?CARDS[id]:null;
  if(!c) return 'dps';
  const ui=(typeof resolveUiRole==='function')?resolveUiRole(c):c.uiRole;
  const p=c.primaryRole;
  if(ui==='healer'||p==='support'||ui==='mage') return 'support';
  if(p==='tank'||p==='wincon'||ui==='tank'||c.taunt||c.combatRole==='tank') return 'tank';
  if(p==='swarm'||(c.count||1)>=3) return 'swarm';
  if(ui==='ranged'||c.combatRole==='ranged'||c.combatRole==='air'||c.combatRole==='siege'||(c.range!=null&&c.range>1.6)) return 'ranged';
  return 'dps';
}

/**
 * CR-like: стартовая рука с разными ролями, остаток колоды — round-robin ролей.
 * Возвращает { deck, hand, next }.
 */
function dealRoleBalanced(deckIds, handSize){
  const n=handSize||4;
  const rest=shuffle((deckIds||[]).slice());
  const hand=[];
  const roles=new Set();
  for(let pass=0;pass<3&&hand.length<n;pass++){
    for(let i=0;i<rest.length&&hand.length<n;i++){
      const id=rest[i];
      const r=deckRoleBucket(id);
      if(pass===0&&roles.has(r)) continue;
      if(pass===1&&roles.has(r)&&roles.size>=Math.min(3,n)) continue;
      hand.push(id);
      roles.add(r);
      rest.splice(i,1);
      i--;
    }
  }
  while(hand.length<n&&rest.length) hand.push(rest.shift());
  const buckets={tank:[],ranged:[],support:[],swarm:[],dps:[]};
  rest.forEach(id=>{
    const b=deckRoleBucket(id);
    (buckets[b]||buckets.dps).push(id);
  });
  const keys=['tank','ranged','dps','support','swarm'];
  const tail=[];
  let guard=0;
  while(tail.length<rest.length&&guard++<64){
    let added=false;
    for(const k of keys){
      if(buckets[k]&&buckets[k].length){
        tail.push(buckets[k].shift());
        added=true;
      }
    }
    if(!added) break;
  }
  keys.forEach(k=>{ while(buckets[k]&&buckets[k].length) tail.push(buckets[k].shift()); });
  const deck=hand.concat(tail);
  return {deck, hand:hand.slice(), next:hand.length};
}
/** Общий пул персонажей (без спеллов/зданий/суммонов) */
function troopPool(){
  return Object.keys(CARDS).filter(id=>{
    const c=CARDS[id];
    return c && c.type==='troop' && !c.summon && isCardPlayable(c);
  });
}
/**
 * Ядро 20: роли tank / dps / support / swarm / wincon / tankkiller.
 */
const CORE_TROOPS=[
  'opolchenets','druzhinnik','vityaz','kazak','ilya',
  'skomorokh','razboyniki','gorynych','kostey','koldun',
  'streltsy','vasilisa','mag','zharptica','perun',
  'dvorf','samokhod','grom',
  'chernyvityaz','upyr'
];
/**
 * Колода до DECK_SIZE (20): орда · лес · дворфы · альянс.
 * Тьма / эльфы / нейтралы по-прежнему выключены.
 */
const DEFAULT_DECK=[
  /* орда */
  'razboyniki','skomorokh','ratay','troll','koldun','zmejlet','byk','kostey','gorynych',
  /* лес */
  'lesvityaz','velikan','zverogon',
  /* дворфы */
  'dvorf','samokhod','grom',
  /* альянс (добивка до 20) */
  'druzhinnik','vityaz','kazak','ilya','opolchenets'
];
function coreTroopPool(){
  return CORE_TROOPS.filter(id=>{
    const c=CARDS[id];
    return c && c.type==='troop' && !c.summon && isCardPlayable(c);
  });
}
/** Случайная колода до DECK_SIZE */
function randomDeck(n){
  const take=n||DECK_SIZE;
  let pool=coreTroopPool().slice();
  if(pool.length<take){
    const extra=troopPool().filter(id=>pool.indexOf(id)<0);
    pool=pool.concat(extra);
  }
  return shuffle(pool).slice(0, Math.min(take, pool.length));
}
/** Колода матча: до DECK_SIZE из DEFAULT_DECK + добивка playable-пула */
function currentDeck(){
  const out=[];
  const seen=Object.create(null);
  function push(id){
    if(!id||seen[id]||!isCardPlayable(id)) return;
    seen[id]=1;
    out.push(id);
  }
  DEFAULT_DECK.forEach(push);
  if(out.length<DECK_SIZE){
    troopPool().forEach(id=>{ if(out.length<DECK_SIZE) push(id); });
  }
  return out.slice(0, DECK_SIZE);
}
const RARITY_ORDER={common:0,rare:1,epic:2,legendary:3,mythic:4};
const RARITY_LABEL={common:'Обычная',rare:'Редкая',epic:'Эпическая',legendary:'Легендарная',mythic:'Мифическая'};
/* Короткие реплики — характер юнитов (Clash Royale vibe) */
const UNIT_QUIPS={
  ilya:'Сила богатырская!',kostey:'Смерти нет...',gorynych:'Три головы — одна ярость!',
  dobrynya:'За Русь!',perun:'Гром грянет!',sadko:'Море поёт со мной!',
  zharptica:'Жар небесный!',vasilisa:'Метка судьбы!',leshy:'Чаща не отпускает...',
  sokol:'Из тени — удар!',kazak:'Атака с наскока!',vityaz:'Стойкость витязя!',
  mag:'Огонь!',volhv:'Руны горят!',dvorf:'За кузню!',samokhod:'Залп!',grom:'Молотом!',
  byk:'Земля дрожит!',ratay:'В бой!',troll:'Трофей мой!',zmejlet:'Жало!',koldun:'Рёв крови!',
  chernyvityaz:'Тьма кормит!',ledkoldun:'Стынь!',upyr:'Ещё... ещё!',chernmag:'Встань, кости!',
  myasnik:'Крюком!',zmejstud:'Ледяной рёв!',lesvityaz:'Четвёртый удар!',lesovik:'Из листвы!',
  velikan:'Камень не гнётся!',zverogon:'Кислота!',moredeva:'Цепь волн!',brazhnik:'За здоровье!'
};

const TOWER={
  /* Князь: масштаб под абсолютные статы танков (~4500) */
  king:{hp:5000,dmg:100,range:7.0,atkCd:1.6},
  /* Стрелецкая башня */
  strelets:{hp:1800,dmg:95,range:7.5,atkCd:0.8},
  defense:{hp:1600,dmg:80,range:5.0,atkCd:1.2}
};
