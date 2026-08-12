/* smoothChibi.js — Clash Royale Q-chibi (большие головы, яркий силуэт, мягкий контур) */
'use strict';

const SmoothChibi = (function () {
  const SZ = 72;

  function shade(hex, amt) {
    const n = parseInt(String(hex).replace('#', ''), 16);
    if (Number.isNaN(n)) return hex;
    let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }

  function canvas() {
    const c = document.createElement('canvas');
    c.width = SZ;
    c.height = SZ;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    return { c, g };
  }

  function ellipse(g, x, y, rx, ry, fill, stroke, lw) {
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) {
      g.strokeStyle = stroke;
      g.lineWidth = lw || 2;
      g.lineJoin = 'round';
      g.lineCap = 'round';
      g.stroke();
    }
  }

  function roundBody(g, x, y, w, h, r, fill, stroke) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    if (stroke) {
      g.strokeStyle = stroke;
      g.lineWidth = 2;
      g.stroke();
    }
  }

  function softShadow(g, cx, cy, rx, ry) {
    g.fillStyle = 'rgba(0,0,0,0.32)';
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
  }

  function face(g, cx, hy, skin, line, angry) {
    const headGrad = g.createRadialGradient(cx - 3, hy - 4, 2, cx, hy, 15);
    headGrad.addColorStop(0, shade(skin, 28));
    headGrad.addColorStop(1, skin);
    ellipse(g, cx, hy, 14.5, 13.5, headGrad, line, 2.2);
    /* щёки */
    g.fillStyle = 'rgba(255,140,120,0.28)';
    ellipse(g, cx - 8, hy + 3, 3.2, 2.2, 'rgba(255,140,120,0.35)');
    ellipse(g, cx + 8, hy + 3, 3.2, 2.2, 'rgba(255,140,120,0.35)');
    /* глаза CR — крупные */
    ellipse(g, cx - 5, hy - 1, 3.2, 3.8, '#fff', line, 1.2);
    ellipse(g, cx + 5, hy - 1, 3.2, 3.8, '#fff', line, 1.2);
    ellipse(g, cx - 4.5, hy - 0.5, 1.7, 2.2, '#1a1208');
    ellipse(g, cx + 5.5, hy - 0.5, 1.7, 2.2, '#1a1208');
    ellipse(g, cx - 5.2, hy - 1.4, 0.8, 0.8, '#fff');
    ellipse(g, cx + 4.8, hy - 1.4, 0.8, 0.8, '#fff');
    /* рот */
    g.strokeStyle = line;
    g.lineWidth = 1.6;
    g.beginPath();
    if (angry) {
      g.moveTo(cx - 3, hy + 6);
      g.lineTo(cx + 3, hy + 6);
    } else {
      g.arc(cx, hy + 4, 3.5, 0.15, Math.PI - 0.15);
    }
    g.stroke();
  }

  function teamTint(pal, ally) {
    const t = window.VisualTheme;
    const accent = ally ? (t && t.TEAM.me.armor) : (t && t.TEAM.ai.armor);
    return {
      skin: pal.skin || '#ffe0b2',
      armor: shade(pal.armor || '#64b5f6', ally ? 8 : -6),
      accent: pal.accent || accent || '#ffd54f',
      hair: pal.hair || '#5d4037',
      weapon: pal.weapon || '#eceff1',
      line: pal.line || '#3e2723',
      boot: pal.boot || shade(pal.armor || '#555', -35),
      glow: pal.weapon || pal.accent || '#ffee58'
    };
  }

  function basePal(kind, ally, faction, cardId) {
    if (typeof palForCard === 'function') return palForCard(kind, ally, faction, cardId);
    return {
      skin: '#ffe0b2', armor: ally ? '#42a5f5' : '#ef5350', accent: '#ffd54f',
      hair: '#5d4037', weapon: '#eceff1', line: '#3e2723', boot: '#4e342e'
    };
  }

  function paintHumanoid(g, pal, pose, weapon, kind, cardId) {
    const by = (pose.bodyY || 0) * 1.2;
    const dead = !!pose.dead;
    const armR = pose.armR || 0;
    const armL = pose.armL || 0;
    const legL = pose.legL || 0;
    const legR = pose.legR || 0;
    const cx = 36;
    const cid = cardId || '';
    const isTank = kind === 'knight' || weapon === 'shield' || cid === 'vityaz' || cid === 'ilya' || cid === 'druzhinnik';
    const isMage = kind === 'mage' || weapon === 'staff' || cid === 'volhv' || cid === 'mag' || cid === 'perun' || cid === 'vasilisa';
    const isArcher = kind === 'archer' || weapon === 'bow' || cid === 'streltsy';
    const isSwarm = cid === 'skomorokh' || cid === 'opolchenets' || cid === 'razboyniki';
    const line = pal.line;

    softShadow(g, cx, 66, isTank ? 16 : 13, 4.2);

    if (dead) {
      ellipse(g, cx, 52, 20, 9, pal.armor, line, 2);
      face(g, cx + 12, 46, pal.skin, line, false);
      return;
    }

    /* ноги — короткие (CR) */
    const legY = 48 + by * 0.25;
    const lw = isTank ? 8 : (isSwarm ? 5.5 : 7);
    roundBody(g, cx - 11 + legL * 0.35, legY, lw, isSwarm ? 12 : 14, 3.5, pal.boot, line);
    roundBody(g, cx + 3 + legR * 0.35, legY, lw, isSwarm ? 12 : 14, 3.5, pal.boot, line);

    /* плащ / мантия сзади */
    if (isMage || kind === 'rider' || cid === 'vityaz') {
      const cloak = cid === 'vityaz' ? '#e53935' : shade(pal.accent, isMage ? 15 : -10);
      g.fillStyle = cloak;
      g.strokeStyle = line;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx - 14, 30 + by);
      g.quadraticCurveTo(cx - 22, 48 + by, cx - 10, 58 + by);
      g.lineTo(cx + 10, 58 + by);
      g.quadraticCurveTo(cx + 22, 48 + by, cx + 14, 30 + by);
      g.closePath();
      g.fill(); g.stroke();
    }

    /* торс — короткий, широкий у танка */
    let tw = isTank ? 26 : (isArcher || isSwarm ? 16 : (isMage ? 17 : 20));
    let th = isTank ? 20 : (isSwarm ? 14 : 17);
    const torsoY = 30 + by;
    const grad = g.createLinearGradient(cx - tw / 2, torsoY, cx + tw / 2, torsoY + th);
    grad.addColorStop(0, shade(pal.armor, 30));
    grad.addColorStop(0.45, pal.armor);
    grad.addColorStop(1, shade(pal.armor, -28));
    roundBody(g, cx - tw / 2, torsoY, tw, th, isTank ? 8 : 7, grad, line);

    /* акцент-полоса / герб */
    g.fillStyle = pal.accent;
    roundBody(g, cx - 4, torsoY + 4, 8, isTank ? 10 : 8, 3, pal.accent, null);
    if (isTank) {
      ellipse(g, cx, torsoY + 9, 4, 4, '#fff8e1', line, 1);
    }

    /* плечи */
    ellipse(g, cx - tw / 2 - 1, torsoY + 4, isTank ? 6 : 4.5, isTank ? 6 : 5, shade(pal.armor, 10), line, 1.6);
    ellipse(g, cx + tw / 2 + 1, torsoY + 4, isTank ? 6 : 4.5, isTank ? 6 : 5, shade(pal.armor, 10), line, 1.6);

    /* руки */
    ellipse(g, cx - tw / 2 - 4, torsoY + 8 + armL * 0.55, 5, 8, pal.skin, line, 1.5);
    ellipse(g, cx + tw / 2 + 4, torsoY + 8 + armR * 0.55, 5, 8, pal.skin, line, 1.5);

    /* оружие */
    g.lineCap = 'round';
    g.lineJoin = 'round';
    if (weapon === 'bow' || isArcher) {
      g.strokeStyle = '#6d4c41';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(cx + 18, 34 + by + armR * 0.3, 12, -1.1, 1.1);
      g.stroke();
      if (pose.draw) {
        g.strokeStyle = '#ffe0b2';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(cx + 8, 34 + by);
        g.lineTo(cx + 18, 34 + by);
        g.stroke();
      }
      /* колчан */
      roundBody(g, cx - tw / 2 - 8, torsoY + 2, 6, 14, 2, '#5d4037', line);
      ellipse(g, cx - tw / 2 - 5, torsoY + 4, 1.5, 2, '#ffcc80');
    } else if (weapon === 'staff' || isMage) {
      g.strokeStyle = '#8d6e63';
      g.lineWidth = 3.2;
      g.beginPath();
      g.moveTo(cx + 16, 8 + by + armR * 0.2);
      g.lineTo(cx + 20, 52 + by);
      g.stroke();
      const gem = pose.flash || pose.healPulse
        ? (pose.healPulse ? '#69f0ae' : '#fff59d')
        : (pal.glow || '#40c4ff');
      ellipse(g, cx + 16, 10 + by + armR * 0.2, pose.flash ? 7 : 5.5, pose.flash ? 7 : 5.5, gem, line, 1.5);
      if (pose.flash) ellipse(g, cx + 16, 10 + by, 3, 3, '#fff');
      if (cid === 'vasilisa' || pose.healPulse) {
        g.strokeStyle = '#fff';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(cx + 16, 4 + by);
        g.lineTo(cx + 16, 16 + by);
        g.moveTo(cx + 10, 10 + by);
        g.lineTo(cx + 22, 10 + by);
        g.stroke();
      }
    } else if (weapon === 'shield' || isTank) {
      const sx = cx - 18 + (pose.shieldFwd ? -4 : 0);
      const sy = 34 + by + armL * 0.3;
      ellipse(g, sx, sy, 9, 12, '#eceff1', line, 2);
      ellipse(g, sx, sy, 6, 8, '#90a4ae', null);
      ellipse(g, sx, sy, 3.5, 4.5, cid === 'vityaz' ? '#e53935' : pal.accent, line, 1);
      g.strokeStyle = pal.weapon;
      g.lineWidth = 3.5;
      g.beginPath();
      g.moveTo(cx + 14, 18 + by + armR * 0.5);
      g.lineTo(cx + 22, 46 + by);
      g.stroke();
      g.fillStyle = pal.accent;
      g.fillRect(cx + 12, 30 + by, 6, 3.5);
    } else if (weapon === 'axe') {
      g.strokeStyle = '#5d4037';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(cx + 14, 24 + by + armR);
      g.lineTo(cx + 24, 44 + by);
      g.stroke();
      ellipse(g, cx + 24, 28 + by + armR * 0.3, 7, 5, shade(pal.weapon, -10), line, 1.5);
    } else if (weapon === 'spear') {
      g.strokeStyle = '#6d4c41';
      g.lineWidth = 2.6;
      g.beginPath();
      g.moveTo(cx + 16, 10 + by + armR * 0.4);
      g.lineTo(cx + 22, 54 + by);
      g.stroke();
      ellipse(g, cx + 16, 12 + by, 4, 3, pal.weapon, line, 1);
    } else {
      g.strokeStyle = pal.weapon;
      g.lineWidth = 3.4;
      g.beginPath();
      g.moveTo(cx + 14, 16 + by + armR * 0.5);
      g.lineTo(cx + 24, 44 + by);
      g.stroke();
      g.fillStyle = pal.accent;
      g.fillRect(cx + 12, 28 + by, 5, 3);
    }

    /* голова — ~45% фигуры (Clash Royale) */
    const hy = (isMage ? 16 : 18) + by - (isSwarm ? 1 : 0);
    face(g, cx, hy, pal.skin, line, pose.slash);

    /* головной убор по карте / роли */
    if (cid === 'vityaz' || (kind === 'knight' && cid !== 'druzhinnik')) {
      ellipse(g, cx, hy - 8, 15, 8, '#b0bec5', line, 2);
      ellipse(g, cx, hy - 2, 7, 5, '#37474f', line, 1.2);
      g.fillStyle = '#e53935';
      g.beginPath();
      g.moveTo(cx, hy - 20);
      g.lineTo(cx + 5, hy - 10);
      g.lineTo(cx - 5, hy - 10);
      g.closePath();
      g.fill();
    } else if (cid === 'ilya') {
      ellipse(g, cx, hy - 8, 15, 8, '#ffd54f', line, 2);
      ellipse(g, cx, hy - 2, 6, 4, '#ffecb3', null);
    } else if (cid === 'streltsy' || isArcher) {
      ellipse(g, cx, hy - 7, 16, 7, '#2e7d32', line, 2);
      g.fillStyle = '#1b5e20';
      g.beginPath();
      g.moveTo(cx - 14, hy - 6);
      g.lineTo(cx - 20, hy + 4);
      g.lineTo(cx - 8, hy - 2);
      g.closePath();
      g.fill();
    } else if (cid === 'volhv' || cid === 'mag' || cid === 'perun' || kind === 'mage') {
      const hat = cid === 'mag' ? '#ef5350' : (cid === 'perun' ? '#5c6bc0' : pal.armor);
      g.fillStyle = hat;
      g.strokeStyle = line;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx, hy - 24);
      g.lineTo(cx + 14, hy - 2);
      g.lineTo(cx - 14, hy - 2);
      g.closePath();
      g.fill(); g.stroke();
      ellipse(g, cx, hy - 2, 12, 3, shade(hat, -20), line, 1);
      if (cid === 'volhv') {
        /* борода */
        g.fillStyle = '#fffde7';
        g.beginPath();
        g.moveTo(cx - 8, hy + 6);
        g.quadraticCurveTo(cx, hy + 18, cx + 8, hy + 6);
        g.closePath();
        g.fill();
      }
    } else if (cid === 'vasilisa') {
      ellipse(g, cx, hy - 8, 15, 6, '#ec407a', line, 2);
      ellipse(g, cx, hy - 10, 6, 3, '#81c784', null);
      /* нимб */
      g.strokeStyle = 'rgba(105,240,174,0.7)';
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(cx, hy - 14, 12, 4, 0, 0, Math.PI * 2);
      g.stroke();
    } else if (cid === 'skomorokh') {
      g.fillStyle = '#e53935';
      g.beginPath();
      g.moveTo(cx - 10, hy - 4);
      g.lineTo(cx - 4, hy - 16);
      g.lineTo(cx + 2, hy - 4);
      g.closePath();
      g.fill();
      g.fillStyle = '#1e88e5';
      g.beginPath();
      g.moveTo(cx - 2, hy - 4);
      g.lineTo(cx + 4, hy - 16);
      g.lineTo(cx + 10, hy - 4);
      g.closePath();
      g.fill();
    } else if (cid === 'kazak' || kind === 'rider') {
      ellipse(g, cx, hy - 6, 14, 7, '#3e2723', line, 2);
      ellipse(g, cx, hy - 10, 8, 4, '#5d4037', line, 1);
    } else if (kind === 'robber') {
      ellipse(g, cx, hy - 5, 14, 5, '#546e7a', line, 1.5);
      g.fillStyle = '#212121';
      g.fillRect(cx - 10, hy - 2, 20, 4);
    } else {
      ellipse(g, cx, hy - 8, 13, 5, pal.hair, line, 1.5);
    }

    if (pose.slash) {
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(cx + 10, 32 + by, 16, -0.5, 0.9);
      g.stroke();
      g.strokeStyle = 'rgba(255,213,79,0.65)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(cx + 10, 32 + by, 12, -0.3, 0.7);
      g.stroke();
    }
    if (pose.healPulse) {
      g.strokeStyle = 'rgba(105,240,174,0.75)';
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(cx, hy + 8, 22, 0, Math.PI * 2);
      g.stroke();
    }
  }

  function paintSkeleton(g, pal, pose, cardId) {
    const p = Object.assign({}, pal, { skin: '#fffde7', armor: '#90a4ae', accent: '#80deea', hair: '#cfd8dc' });
    paintHumanoid(g, p, pose, 'scythe', 'skeleton', cardId || 'kostey');
    const by = (pose.bodyY || 0) * 1.2;
    if (!pose.dead) {
      ellipse(g, 31, 18 + by, 3, 3.5, '#111');
      ellipse(g, 41, 18 + by, 3, 3.5, '#111');
      g.strokeStyle = '#eceff1';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(50, 14 + by);
      g.quadraticCurveTo(64, 10 + by, 60, 30 + by);
      g.stroke();
    }
  }

  function paintDragon(g, pal, pose, cardId) {
    const by = (pose.bodyY || 0) * 1.2;
    const flap = (pose.flap || 0) * (cardId === 'gorynych' ? 4 : 2.5);
    const fire = pose.fire || 0;
    const line = pal.line || '#1b5e20';
    const skin = cardId === 'gorynych' ? '#66bb6a' : pal.skin;
    const armor = cardId === 'gorynych' ? '#43a047' : pal.armor;
    const accent = cardId === 'gorynych' ? '#ffeb3b' : pal.accent;
    softShadow(g, 36, 66, 18, 5);

    /* крылья */
    g.fillStyle = shade(armor, 15);
    g.strokeStyle = line;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(36, 32 + by);
    g.quadraticCurveTo(8, 4 + by - flap, 2, 34 + by);
    g.quadraticCurveTo(18, 30 + by, 36, 38 + by);
    g.fill(); g.stroke();
    g.beginPath();
    g.moveTo(36, 32 + by);
    g.quadraticCurveTo(64, 4 + by - flap, 70, 34 + by);
    g.quadraticCurveTo(54, 30 + by, 36, 38 + by);
    g.fill(); g.stroke();
    g.fillStyle = accent;
    g.globalAlpha = 0.45;
    g.beginPath();
    g.moveTo(36, 34 + by);
    g.quadraticCurveTo(14, 14 + by - flap * 0.5, 8, 32 + by);
    g.fill();
    g.beginPath();
    g.moveTo(36, 34 + by);
    g.quadraticCurveTo(58, 14 + by - flap * 0.5, 64, 32 + by);
    g.fill();
    g.globalAlpha = 1;

    /* тело */
    const bodyGrad = g.createRadialGradient(32, 36 + by, 4, 36, 40 + by, 18);
    bodyGrad.addColorStop(0, shade(skin, 25));
    bodyGrad.addColorStop(1, skin);
    ellipse(g, 36, 40 + by, 17, 14, bodyGrad, line, 2.2);
    ellipse(g, 36, 44 + by, 10, 6, cardId === 'gorynych' ? '#ff8a65' : shade(skin, 20), null);

    /* три головы */
    const heads = [[20, 22 + by, 8], [36, 16 + by, 9.5], [52, 22 + by, 8]];
    heads.forEach((h, i) => {
      const [hx, hy, hr] = h;
      ellipse(g, hx, hy, hr, hr * 0.92, shade(skin, 12), line, 2);
      ellipse(g, hx - 2, hy - 2, 2.2, 2.6, '#fff', line, 1);
      ellipse(g, hx - 1.6, hy - 1.6, 1.1, 1.4, '#111');
      g.fillStyle = '#e53935';
      g.beginPath();
      g.moveTo(hx - 3, hy - hr + 2);
      g.lineTo(hx - 1, hy - hr - 5);
      g.lineTo(hx + 2, hy - hr + 2);
      g.closePath();
      g.fill();
      if (fire > i) {
        const f = fire;
        ellipse(g, hx + hr - 1, hy + 2, 4 + f, 6 + f, '#ff9800', '#e65100', 1);
        ellipse(g, hx + hr + 2, hy - 2, 3 + f * 0.5, 4 + f * 0.5, '#fff59d');
        if (f >= 3) ellipse(g, hx + hr + 6, hy - 4, 3, 4, '#fff');
      }
    });

    /* хвост */
    g.strokeStyle = armor;
    g.lineWidth = 5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(22, 48 + by);
    g.quadraticCurveTo(8, 52 + by + (pose.tail || 0), 4, 44 + by);
    g.stroke();
    ellipse(g, 4, 44 + by, 4, 3, '#e53935', line, 1);
  }

  function paintBird(g, pal, pose, cardId) {
    const by = (pose.bodyY || 0) * 1.2;
    const flap = (pose.flap || 0) * (cardId === 'zharptica' || cardId === 'sokol' ? 3.5 : 2);
    const body = cardId === 'sokol' ? '#7e57c2' : (cardId === 'zharptica' ? '#ff6f00' : pal.skin);
    const wing = cardId === 'sokol' ? '#b39ddb' : (cardId === 'zharptica' ? '#ffab00' : pal.accent);
    softShadow(g, 36, 64, 12, 3.5);
    ellipse(g, 36, 42 + by, 12, 10, body, pal.line, 2);
    g.fillStyle = wing;
    g.strokeStyle = pal.line;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(28, 38 + by);
    g.lineTo(8, 28 + by - flap);
    g.lineTo(30, 44 + by);
    g.closePath();
    g.fill(); g.stroke();
    g.beginPath();
    g.moveTo(44, 38 + by);
    g.lineTo(64, 28 + by - flap);
    g.lineTo(42, 44 + by);
    g.closePath();
    g.fill(); g.stroke();
    face(g, 36, 28 + by, shade(body, 40), pal.line, false);
    if (cardId === 'zharptica') {
      ellipse(g, 36, 22 + by, 8, 3, '#fff59d', null);
      g.fillStyle = '#ffeb3b';
      g.beginPath();
      g.moveTo(36, 12 + by);
      g.lineTo(42, 22 + by);
      g.lineTo(30, 22 + by);
      g.closePath();
      g.fill();
    }
  }

  function paintCannon(g, pal, pose) {
    const recoil = pose.recoil || 0;
    softShadow(g, 36, 64, 16, 4);
    ellipse(g, 24, 56 + recoil * 0.3, 7, 5, '#3e2723', pal.line, 1.5);
    ellipse(g, 48, 56 + recoil * 0.3, 7, 5, '#3e2723', pal.line, 1.5);
    g.save();
    g.translate(36 - recoil, 40 + recoil * 0.5);
    g.rotate((pose.ang || 0) * 0.1);
    roundBody(g, -16, -10, 32, 18, 6, pal.armor, pal.line);
    ellipse(g, 16, 0, 9, 8, shade(pal.armor, -25), pal.line, 1.5);
    ellipse(g, 0, -2, 6, 5, pal.accent, null);
    if (pose.blast) {
      ellipse(g, 28, -4, 8, 7, '#ffb74d', '#e65100', 1);
      ellipse(g, 34, -6, 4, 4, '#fff59d');
    }
    g.restore();
  }

  function paintLeshy(g, pal, pose, cardId) {
    paintHumanoid(g, pal, pose, 'none', 'peasant', cardId || 'leshy');
    const by = (pose.bodyY || 0) * 1.2;
    g.strokeStyle = '#7cb342';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(22, 20 + by);
    g.quadraticCurveTo(12, 6 + by, 18, 2 + by);
    g.moveTo(50, 20 + by);
    g.quadraticCurveTo(60, 6 + by, 54, 2 + by);
    g.stroke();
    ellipse(g, 18, 2 + by, 4, 4, '#aed581', pal.line, 1);
    ellipse(g, 54, 2 + by, 4, 4, '#aed581', pal.line, 1);
  }

  function paintOrc(g, pal, pose, weapon, kind, cardId) {
    const p = Object.assign({}, pal, { skin: pal.skin || '#9ccc65' });
    paintHumanoid(g, p, pose, weapon || 'axe', kind || 'orc', cardId);
    const by = (pose.bodyY || 0) * 1.2;
    if (!pose.dead) {
      g.fillStyle = '#fff8e1';
      g.beginPath();
      g.moveTo(28, 24 + by);
      g.lineTo(26, 30 + by);
      g.lineTo(30, 28 + by);
      g.fill();
      g.beginPath();
      g.moveTo(44, 24 + by);
      g.lineTo(46, 30 + by);
      g.lineTo(42, 28 + by);
      g.fill();
    }
  }

  function drawPose(kind, ally, weapon, cardId, pose) {
    const faction = (typeof CARDS !== 'undefined' && CARDS[cardId] && CARDS[cardId].faction) || 'alliance';
    let paintKind = kind;
    const ORCISH = { knight: 1, peasant: 1, archer: 1, robber: 1, rider: 1, mage: 1 };
    if (!ally && ORCISH[kind] && faction !== 'elf' && faction !== 'forest' && faction !== 'dwarf' && faction !== 'neutral')
      paintKind = 'orc';
    if (ally && (faction === 'orc' || faction === 'dark') && ORCISH[kind]) paintKind = 'orc';

    const raw = basePal(kind, ally, faction, cardId);
    const pal = teamTint(raw, ally);
    const { c, g } = canvas();
    pose = pose || {};
    pose.cardId = cardId;

    if (paintKind === 'orc') paintOrc(g, pal, pose, weapon, kind, cardId);
    else if (kind === 'skeleton') paintSkeleton(g, pal, pose, cardId);
    else if (kind === 'dragon') paintDragon(g, pal, pose, cardId);
    else if (kind === 'bird') paintBird(g, pal, pose, cardId);
    else if (kind === 'cannon') paintCannon(g, pal, pose);
    else if (kind === 'leshy') paintLeshy(g, pal, pose, cardId);
    else paintHumanoid(g, pal, pose, weapon, kind, cardId);

    return c;
  }

  function framesFor(kind, ally, weapon, cardId) {
    const sheets = { idle: [], walk: [], attack: [], hit: [], death: [] };
    const draw = (pose) => drawPose(kind, ally, weapon, cardId, pose);
    const tank = cardId === 'vityaz' || cardId === 'ilya' || cardId === 'druzhinnik' || weapon === 'shield';
    const swarm = cardId === 'skomorokh' || cardId === 'opolchenets' || cardId === 'razboyniki';
    const mage = weapon === 'staff' || cardId === 'volhv' || cardId === 'mag' || cardId === 'perun' || cardId === 'vasilisa';
    const healer = cardId === 'vasilisa';

    for (let i = 0; i < 6; i++) {
      const bob = i % 2;
      const bob2 = (i >> 1) & 1;
      if (kind === 'dragon') {
        sheets.idle.push(draw({ flap: bob * 2 + bob2 + 1, tail: bob * 2, bodyY: bob }));
      } else if (kind === 'bird') {
        sheets.idle.push(draw({ flap: bob * 3 + bob2, bodyY: -bob }));
      } else if (kind === 'cannon') {
        sheets.idle.push(draw({ ang: bob ? 1 : 0 }));
      } else if (healer) {
        sheets.idle.push(draw({ bodyY: bob ? 0 : 1, armL: bob, armR: bob ? 0 : 1, healPulse: bob2 }));
      } else {
        sheets.idle.push(draw({ bodyY: bob, armL: bob ? 0 : 1, armR: bob ? 1 : 0 }));
      }
    }

    for (let i = 0; i < 8; i++) {
      const phase = i % 4;
      const s = phase === 0 || phase === 3 ? -3 : 3;
      const s2 = phase < 2 ? 2 : -2;
      if (kind === 'dragon') {
        sheets.walk.push(draw({ flap: (i % 4) + 2, tail: s, bodyY: i % 2 }));
      } else if (kind === 'bird') {
        sheets.walk.push(draw({ flap: (i % 4) + 2, bodyY: (i % 2) ? -1 : 0 }));
      } else if (kind === 'cannon') {
        sheets.walk.push(draw({ ang: s2 }));
      } else if (tank) {
        sheets.walk.push(draw({ legL: s, legR: -s, bodyY: (i % 2) ? 2 : 0, armL: -s2, armR: s2 }));
      } else if (swarm) {
        const jag = (i % 3) - 1;
        sheets.walk.push(draw({ legL: s + jag, legR: -s - jag, bodyY: i % 3, armL: -s2 * 2, armR: s2 * 2 }));
      } else {
        sheets.walk.push(draw({ legL: s, legR: -s, bodyY: i % 2, armL: -s2, armR: s2 }));
      }
    }

    if (kind === 'dragon') {
      [0, 1, 2, 3, 3, 2, 1, 0].forEach((fire, i) =>
        sheets.attack.push(draw({
          flap: 1 + Math.min(3, fire), fire, slash: fire > 1 ? 1 : 0,
          bodyY: fire > 1 ? 1 : 0, tail: fire
        }))
      );
    } else if (kind === 'bird') {
      for (let i = 0; i < 7; i++)
        sheets.attack.push(draw({ flap: 2 + (i % 4), bodyY: i < 3 ? -2 : 1, slash: i >= 3 && i <= 4 ? 1 : 0, chirp: i >= 3 }));
    } else if (kind === 'cannon') {
      [-1, -2, -2, 2, 3, 1, 0].forEach((ang, i) =>
        sheets.attack.push(draw({ ang, blast: i >= 3 && i <= 4, slash: i >= 3 && i <= 4 ? 1 : 0, recoil: i >= 3 ? 3 : 0 }))
      );
    } else if (weapon === 'bow') {
      [
        { armR: -1, armL: 1 }, { armR: -2, armL: 2, draw: true },
        { armR: -3, armL: 3, draw: true }, { armR: -4, armL: 3, draw: true, bodyY: 1, slash: 1 },
        { armR: 3, armL: 0, slash: 1 }, { armR: 1 }, { armR: 0 }
      ].forEach((p) => sheets.attack.push(draw(p)));
    } else if (mage) {
      [
        { armR: -2, armL: 1 }, { armR: -3, armL: 2 },
        { armR: -3, armL: 2, bodyY: 1, flash: true },
        { armR: 2, armL: -1, bodyY: 1, slash: 1, flash: true, healPulse: healer },
        { armR: 2, slash: 1, flash: true, healPulse: healer },
        { armR: 1, flash: true, healPulse: healer }, { armR: 0 }
      ].forEach((p) => sheets.attack.push(draw(p)));
    } else if (tank) {
      [
        { armL: -2, armR: -1, shieldFwd: 1 }, { armL: -3, armR: -2, shieldFwd: 1 },
        { armL: -4, armR: -2, bodyY: 1, shieldFwd: 1 },
        { armL: 3, armR: 5, bodyY: 1, slash: 1, shieldFwd: 1 },
        { armL: 2, armR: 4, slash: 1, shieldFwd: 1 },
        { armL: 1, armR: 2 }, { armL: 0, armR: 0 }
      ].forEach((p) => sheets.attack.push(draw(p)));
    } else {
      [
        { armR: -2, armL: 1 }, { armR: -4, armL: 2 },
        { armR: -5, armL: 2, bodyY: 1 },
        { armR: 6, armL: -2, bodyY: 1, slash: 1 },
        { armR: 4, armL: -1, slash: 1 },
        { armR: 2 }, { armR: 0 }
      ].forEach((p) => sheets.attack.push(draw(p)));
    }

    sheets.hitFrame = 3;
    for (let i = 0; i < 4; i++) sheets.hit.push(draw({ bodyY: Math.min(2, i), armL: 2, armR: 2, flap: -1 }));
    for (let i = 0; i < 6; i++)
      sheets.death.push(draw({ dead: i > 3, bodyY: Math.min(3, i), armR: 3, flap: -2, legL: i, legR: -i }));
    return sheets;
  }

  const portraitCache = Object.create(null);

  function getPortrait(cardId) {
    if (portraitCache[cardId]) return portraitCache[cardId];
    const def = typeof CARDS !== 'undefined' ? CARDS[cardId] : null;
    if (!def || def.type === 'spell') return null;
    const meta = typeof charKindFor === 'function' ? charKindFor(cardId) : { kind: 'peasant', weapon: 'spear' };
    const fr = drawPose(meta.kind, true, meta.weapon, cardId, { armR: 3, bodyY: 0, slash: 1, flap: 2, fire: 2 });
    portraitCache[cardId] = fr;
    return fr;
  }

  function clearCaches() {
    Object.keys(portraitCache).forEach((k) => delete portraitCache[k]);
  }

  return { framesFor, getPortrait, clearCaches, SZ };
})();

window.SmoothChibi = SmoothChibi;
