/* combat.js — детальный melee / ranged VFX (Clash Royale vibe) */
'use strict';

const GameCombat = (function () {
  function classify(u, CARDS, charKindFor) {
    const id = u.id;
    const kind = (u.char && u.char.kind) || (CARDS[id] && charKindFor(id).kind) || '';
    const weapon = (u.char && u.char.weapon) || '';
    const isDragon = kind === 'dragon' || /zmej|gorynych|zhar/.test(id);
    const isCat = kind === 'cannon';
    const isArcher = kind === 'archer' || kind === 'bird' || weapon === 'bow';
    const isMage = kind === 'mage' || weapon === 'staff' || id === 'mag' || id === 'perun' || id === 'moredeva';
    const isWave = id === 'sadko';
    const ranged = isDragon || isCat || isArcher || isMage || isWave || (u.range || 0) > 2.2 || !u.char;
    return { kind, weapon, isDragon, isCat, isArcher, isMage, isWave, ranged };
  }

  function spawnAttackVfx(u, tx, ty, deps) {
    const { toScreen, projectiles, particles, fx, spawnHitSpark, CARDS, charKindFor } = deps;
    const a = toScreen(u.x, u.y);
    const b = toScreen(tx, ty);
    const id = u.id;
    const c = classify(u, CARDS, charKindFor);

    if (window.GameAudio) {
      GameAudio.play(c.ranged ? 'attack_ranged' : 'attack_melee');
    }

    if (c.isDragon || c.isCat) {
      projectiles.push({
        type: 'fireball',
        x: a.x, y: a.y - 10, tx: b.x, ty: b.y,
        life: c.isCat ? 0.45 : 0.32, maxLife: c.isCat ? 0.45 : 0.32,
        frame: 0, frameAcc: 0, fire: c.isDragon, rock: c.isCat, big: true, smooth: true
      });
      particles.burst(a.x, a.y, { count: 14, colors: ['#fff8e1', '#ffcc80', '#ff7043', '#e53935'], speed: 100, life: 0.45, size: 3, up: -18 });
    } else if (c.isArcher) {
      projectiles.push({
        type: 'bolt', x: a.x, y: a.y - 12, tx: b.x, ty: b.y,
        life: 0.32, maxLife: 0.32, color: '#ffe082', arrow: true, smooth: true, trail: true
      });
      particles.burst(a.x, a.y - 8, { count: 8, colors: ['#fffde7', '#ffe082', '#ffb300'], speed: 55, life: 0.28, size: 2, up: -10 });
    } else if (c.isMage) {
      projectiles.push({
        type: 'bolt', x: a.x, y: a.y - 8, tx: b.x, ty: b.y,
        life: 0.28, maxLife: 0.28, color: id === 'perun' ? '#fff59d' : '#ce93d8',
        mage: true, frame: 0, frameAcc: 0, smooth: true, trail: true
      });
      particles.burst(a.x, a.y, { count: 12, colors: ['#e1bee7', '#7e57c2', '#fff59d'], speed: 75, life: 0.4, size: 2.5, up: -14 });
    } else if (c.isWave) {
      projectiles.push({ type: 'bolt', x: a.x, y: a.y, tx: b.x, ty: b.y, life: 0.22, maxLife: 0.22, color: '#4fc3f7', smooth: true });
      fx.push({ type: 'wave', x: u.x, y: u.y, r: 0.3, maxR: 1.6, life: 0.3, maxLife: 0.3, color: '#4fc3f7' });
    } else {
      // ближний бой — широкая дуга + вспышка у цели
      projectiles.push({
        type: 'slash', x: a.x, y: a.y - 6, tx: b.x, ty: b.y,
        life: 0.22, maxLife: 0.22,
        color: u.side === 'me' ? '#90caf9' : '#ef9a9a',
        smooth: true, melee: true, width: 18
      });
      fx.push({ type: 'shock', x: b.x, y: b.y, life: 0.2, maxLife: 0.2, r: 14, color: '#fffde7' });
      particles.burst(b.x, b.y, { count: 12, colors: ['#fff', '#ffe082', '#ffcc80', '#90caf9'], speed: 90, life: 0.32, size: 2.5, up: -12, gravity: 50 });
    }
    spawnHitSpark(b.x, b.y, id);
  }

  function drawProjectile(ctx, p, easeInOutCubic) {
    const ml = p.maxLife || 0.2;
    if (p.delay > 0) return;
    let t = 1 - p.life / ml;
    t = Math.max(0, Math.min(1, t));
    const et = easeInOutCubic ? easeInOutCubic(t) : t;
    const x = p.x + (p.tx - p.x) * et;
    const y = p.y + (p.ty - p.y) * et - (p.type === 'fireball' ? Math.sin(et * Math.PI) * 28 : Math.sin(et * Math.PI) * (p.arrow ? 12 : 0));
    const ang = Math.atan2(p.ty - p.y, p.tx - p.x);
    ctx.save();
    ctx.imageSmoothingEnabled = true;

    if (p.type === 'slash' || p.melee) {
      const w = p.width || 16;
      ctx.translate(x, y);
      ctx.rotate(ang);
      const g = ctx.createLinearGradient(-w, 0, w, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.45, p.color || '#fff');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.85 * (1 - t);
      ctx.beginPath();
      ctx.arc(0, 0, 10 + t * 8, -0.9, 0.9);
      ctx.stroke();
      ctx.globalAlpha = 0.5 * (1 - t);
      ctx.lineWidth = 10;
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (p.arrow) {
      if (p.trail) {
        ctx.strokeStyle = 'rgba(255,236,179,0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      ctx.translate(x, y);
      ctx.rotate(ang);
      // древко
      const wood = ctx.createLinearGradient(-14, 0, 10, 0);
      wood.addColorStop(0, '#5d4037');
      wood.addColorStop(1, '#a1887f');
      ctx.fillStyle = wood;
      ctx.fillRect(-14, -1.5, 22, 3);
      // наконечник
      ctx.fillStyle = '#eceff1';
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(4, -4);
      ctx.lineTo(4, 4);
      ctx.closePath();
      ctx.fill();
      // оперение
      ctx.fillStyle = '#e53935';
      ctx.beginPath();
      ctx.moveTo(-14, 0);
      ctx.lineTo(-18, -4);
      ctx.lineTo(-10, 0);
      ctx.lineTo(-18, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }

    if (p.mage || p.type === 'fireball' || p.fire) {
      if (p.trail) {
        const tg = ctx.createLinearGradient(p.x, p.y, x, y);
        tg.addColorStop(0, 'rgba(255,255,255,0)');
        tg.addColorStop(1, p.color || 'rgba(255,152,0,0.5)');
        ctx.strokeStyle = tg;
        ctx.lineWidth = p.big ? 8 : 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      const r = p.big ? 16 : (p.mage ? 12 : 10);
      const rg = ctx.createRadialGradient(x - 3, y - 3, 2, x, y, r);
      if (p.mage) {
        rg.addColorStop(0, '#ffffff');
        rg.addColorStop(0.4, p.color || '#ce93d8');
        rg.addColorStop(1, 'rgba(80,40,120,0)');
      } else {
        rg.addColorStop(0, '#ffffff');
        rg.addColorStop(0.25, '#fff59d');
        rg.addColorStop(0.55, '#ff9800');
        rg.addColorStop(1, 'rgba(183,28,28,0)');
      }
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    if (p.rock) {
      const g = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, 8);
      g.addColorStop(0, '#cfd8dc');
      g.addColorStop(1, '#546e7a');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.fillStyle = p.color || '#90caf9';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  return { spawnAttackVfx, drawProjectile, classify };
})();

window.GameCombat = GameCombat;
