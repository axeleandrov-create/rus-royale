/* arena2d.js — Cube World–style arena: brick rim, dirt lanes, river, keeps */
'use strict';

const GameArena = (function () {
  const TILE_URL = 'assets/models/cubeworld/Blocks_PixelArt.png';
  let tileImg = null;
  let tileReady = false;

  function ensureTiles() {
    if (tileImg) return;
    tileImg = new Image();
    tileImg.decoding = 'async';
    tileImg.onload = () => {
      tileReady = true;
    };
    tileImg.onerror = () => {
      tileReady = false;
    };
    tileImg.src = TILE_URL;
  }

  function rr(ctx, x, y, w, h, r) {
    const rad = Math.max(0, Math.min(r || 0, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  function fillRound(ctx, roundRect, x, y, w, h, r) {
    if (roundRect) {
      roundRect(x, y, w, h, r);
      ctx.fill();
    } else {
      rr(ctx, x, y, w, h, r);
      ctx.fill();
    }
  }

  function drawHill(ctx, cx, cy, rx, ry, c0, c1) {
    const g = ctx.createRadialGradient(cx, cy - ry * 0.3, 4, cx, cy, rx);
    g.addColorStop(0, c0);
    g.addColorStop(1, c1);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Cube-style brick post (corner décor) */
  function drawBrickPost(ctx, x, y, scale, teamWarm) {
    const s = scale || 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 14, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    const wall = ctx.createLinearGradient(-12, -34, 12, 0);
    wall.addColorStop(0, '#bdbdbd');
    wall.addColorStop(0.55, '#757575');
    wall.addColorStop(1, '#424242');
    ctx.fillStyle = wall;
    rr(ctx, -12, -32, 24, 32, 3);
    ctx.fill();
    paintBrickLines(ctx, -12, -32, 24, 32, 4);
    ctx.fillStyle = teamWarm ? '#ef5350' : '#42a5f5';
    for (let i = 0; i < 3; i++) {
      rr(ctx, -11 + i * 8, -40, 6, 10, 1);
      ctx.fill();
    }
    ctx.fillStyle = '#fff8e1';
    ctx.fillRect(-4, -22, 8, 9);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-2, -20, 4, 5);
    // banner
    ctx.fillStyle = teamWarm ? '#c62828' : '#1565c0';
    ctx.fillRect(10, -36, 3, 18);
    ctx.beginPath();
    ctx.moveTo(13, -36);
    ctx.lineTo(22, -32);
    ctx.lineTo(13, -28);
    ctx.fill();
    ctx.restore();
  }

  /** Cube Tree silhouette */
  function drawCubeTree(ctx, x, y, scale) {
    const s = scale || 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6d4c41';
    ctx.fillRect(-3, -18, 6, 18);
    ctx.fillStyle = '#43a047';
    rr(ctx, -14, -42, 28, 26, 4);
    ctx.fill();
    ctx.fillStyle = '#66bb6a';
    rr(ctx, -10, -48, 20, 16, 3);
    ctx.fill();
    ctx.restore();
  }

  function drawCubeBush(ctx, x, y, scale) {
    const s = scale || 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#558b2f';
    rr(ctx, -10, -12, 20, 12, 4);
    ctx.fill();
    ctx.fillStyle = '#7cb342';
    rr(ctx, -7, -16, 14, 10, 3);
    ctx.fill();
    ctx.restore();
  }

  function paintBrickLines(ctx, x, y, w, h, rows) {
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 1;
    const n = rows || 5;
    for (let row = 0; row < n; row++) {
      const yy = y + 4 + (row * h) / (n + 0.5);
      ctx.beginPath();
      ctx.moveTo(x + 2, yy);
      ctx.lineTo(x + w - 2, yy);
      ctx.stroke();
      const offset = row % 2 ? w * 0.22 : w * 0.08;
      for (let c = 0; c < 3; c++) {
        const xx = x + offset + c * (w * 0.32);
        if (xx > x + 2 && xx < x + w - 2) {
          ctx.beginPath();
          ctx.moveTo(xx, yy);
          ctx.lineTo(xx, Math.min(y + h - 2, yy + h / (n + 0.5)));
          ctx.stroke();
        }
      }
    }
  }

  function drawBrickBorder(ctx, x, y, w, h, ambientT) {
    /* Тонкая рамка по краю доски — без толстого «коробка» снаружи (вид как раньше). */
    const t = 4;
    ctx.strokeStyle = '#757575';
    ctx.lineWidth = t;
    rr(ctx, x + 2, y + 2, w - 4, h - 4, 12);
    ctx.stroke();
    ctx.strokeStyle = '#a1887f';
    ctx.lineWidth = 2;
    rr(ctx, x + 5, y + 5, w - 10, h - 10, 10);
    ctx.stroke();

    if (tileReady && tileImg) {
      const tw = 8;
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = 0.55;
      for (let i = 0; i < Math.floor(w / tw); i++) {
        const ox = (i * 17 + Math.floor(ambientT * 2)) % 4;
        try {
          ctx.drawImage(tileImg, ox * 20, 0, 20, 20, x + i * tw, y + 1, tw, tw);
          ctx.drawImage(tileImg, ox * 20, 20, 20, 20, x + i * tw, y + h - tw - 1, tw, tw);
        } catch (_) {}
      }
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = true;
    }
  }

  function drawDirtLane(ctx, lx, y, lw, h) {
    const g = ctx.createLinearGradient(lx, y, lx + lw, y);
    g.addColorStop(0, 'rgba(121,85,72,0)');
    g.addColorStop(0.15, 'rgba(161,136,127,0.55)');
    g.addColorStop(0.5, 'rgba(188,170,164,0.7)');
    g.addColorStop(0.85, 'rgba(161,136,127,0.55)');
    g.addColorStop(1, 'rgba(121,85,72,0)');
    ctx.fillStyle = g;
    ctx.fillRect(lx, y + 6, lw, h - 12);
    // worn patches
    ctx.fillStyle = 'rgba(93,64,55,0.18)';
    for (let i = 0; i < 10; i++) {
      const py = y + 20 + ((i * 97) % (h - 40));
      ctx.beginPath();
      ctx.ellipse(lx + lw * 0.35 + (i % 3) * 8, py, 10, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawArena(ctx, env) {
    ensureTiles();
    const { W, H, field, ARENA, ambientT, roundRect } = env;
    const x = field.x,
      y = field.y,
      w = field.w,
      h = field.h;

    // sky — ближе к прежнему светлому виду
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#4fc3f7');
    sky.addColorStop(0.32, '#81d4fa');
    sky.addColorStop(0.55, '#a5d6a7');
    sky.addColorStop(1, '#2e7d32');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    const sunX = W * 0.78,
      sunY = H * 0.11;
    const sun = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 150);
    sun.addColorStop(0, 'rgba(255,248,225,0.75)');
    sun.addColorStop(0.4, 'rgba(255,224,130,0.28)');
    sun.addColorStop(1, 'rgba(255,224,130,0)');
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 150, 0, Math.PI * 2);
    ctx.fill();

    drawHill(ctx, W * 0.2, y + 16, 110, 36, '#81c784', '#2e7d32');
    drawHill(ctx, W * 0.55, y + 8, 140, 42, '#aed581', '#558b2f');
    drawHill(ctx, W * 0.85, y + 20, 100, 32, '#9ccc65', '#33691e');

    for (let i = 0; i < 5; i++) {
      const cx = ((ambientT * 14 * (0.3 + i * 0.1) + i * 170) % (W + 200)) - 100;
      const cy = 22 + i * 12;
      const cg = ctx.createRadialGradient(cx, cy, 2, cx, cy, 48);
      cg.addColorStop(0, 'rgba(255,255,255,0.7)');
      cg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 48 + i * 4, 13 + (i % 3), 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // поле — тот же прямоугольник field (ракурс как раньше)
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;
    const fieldG = ctx.createLinearGradient(x, y, x, y + h);
    fieldG.addColorStop(0, '#9ccc65');
    fieldG.addColorStop(0.48, '#7cb342');
    fieldG.addColorStop(0.52, '#689f38');
    fieldG.addColorStop(1, '#558b2f');
    ctx.fillStyle = fieldG;
    fillRound(ctx, roundRect, x, y, w, h, 12);
    ctx.restore();

    // тонкий brick rim поверх края доски
    drawBrickBorder(ctx, x, y, w, h, ambientT || 0);

    // CR-like dirt lanes
    drawDirtLane(ctx, x + w * 0.1, y, w * 0.16, h);
    drawDirtLane(ctx, x + w * 0.74, y, w * 0.16, h);

    // soft team zones
    const redZ = ctx.createLinearGradient(x, y, x, y + h * 0.42);
    redZ.addColorStop(0, 'rgba(198,40,40,0.14)');
    redZ.addColorStop(1, 'rgba(198,40,40,0)');
    ctx.fillStyle = redZ;
    ctx.fillRect(x, y, w, h * 0.42);
    const blueZ = ctx.createLinearGradient(x, y + h * 0.58, x, y + h);
    blueZ.addColorStop(0, 'rgba(25,118,210,0)');
    blueZ.addColorStop(1, 'rgba(25,118,210,0.14)');
    ctx.fillStyle = blueZ;
    ctx.fillRect(x, y + h * 0.58, w, h * 0.42);

    // soft grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 1; i < ARENA.w; i++) {
      const sx = x + (i / ARENA.w) * w;
      ctx.beginPath();
      ctx.moveTo(sx, y + 4);
      ctx.lineTo(sx, y + h - 4);
      ctx.stroke();
    }
    for (let j = 1; j < ARENA.h; j++) {
      const sy = y + h - (j / ARENA.h) * h;
      ctx.beginPath();
      ctx.moveTo(x + 4, sy);
      ctx.lineTo(x + w - 4, sy);
      ctx.stroke();
    }

    // grass tufts
    ctx.lineCap = 'round';
    for (let i = 0; i < 56; i++) {
      const gx = x + ((i * 53) % (w - 10)) + 5;
      const gy = y + h * 0.08 + ((i * 37) % (h * 0.84));
      if (Math.abs(gy - (y + h / 2)) < h * 0.07) continue;
      // skip lane centers a bit
      const nx = (gx - x) / w;
      if ((nx > 0.12 && nx < 0.24) || (nx > 0.76 && nx < 0.88)) {
        if (i % 3 === 0) continue;
      }
      const sway = Math.sin(ambientT * 2.4 + i) * 3;
      ctx.strokeStyle = i % 2 ? 'rgba(46,125,50,0.5)' : 'rgba(104,159,56,0.45)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.quadraticCurveTo(gx + sway * 0.4, gy - 5, gx + sway, gy - 10);
      ctx.stroke();
    }

    const mid = y + h / 2;

    // river banks — stone cubes
    ctx.fillStyle = '#795548';
    ctx.fillRect(x, mid - h * 0.07, w, 6);
    ctx.fillRect(x, mid + h * 0.055, w, 6);
    ctx.fillStyle = '#9e9e9e';
    for (let i = 0; i < 14; i++) {
      const sx = x + 6 + i * ((w - 12) / 13);
      const bob = Math.sin(i * 1.7) * 1.5;
      ctx.fillRect(sx, mid - h * 0.072 + bob, 7, 5);
      ctx.fillRect(sx + 3, mid + h * 0.055 - bob, 7, 5);
    }

    // river
    const river = ctx.createLinearGradient(x, mid - h * 0.06, x, mid + h * 0.06);
    river.addColorStop(0, '#01579b');
    river.addColorStop(0.35, '#29b6f6');
    river.addColorStop(0.65, '#4fc3f7');
    river.addColorStop(1, '#0277bd');
    ctx.fillStyle = river;
    ctx.fillRect(x, mid - h * 0.055, w, h * 0.11);
    for (let i = 0; i < 12; i++) {
      const ox = Math.sin(ambientT * 1.8 + i * 0.9) * 12;
      const a = 0.15 + 0.22 * ((Math.sin(ambientT * 3 + i) + 1) * 0.5);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath();
      ctx.ellipse(x + (i * w) / 12 + 14 + ox, mid + (i % 3) - 1, w / 20, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // bridges
    const bw = w * 0.17;
    [0.18, 0.82].forEach((px, bi) => {
      const bx = x + w * px - bw / 2;
      const by = mid - h * 0.075;
      const bh = h * 0.15;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 14;
      const wood = ctx.createLinearGradient(bx, by, bx, by + bh);
      wood.addColorStop(0, '#bcaaa4');
      wood.addColorStop(0.45, '#8d6e63');
      wood.addColorStop(1, '#4e342e');
      ctx.fillStyle = wood;
      rr(ctx, bx, by, bw, bh, 5);
      ctx.fill();
      ctx.shadowBlur = 0;
      // posts
      ctx.fillStyle = '#3e2723';
      ctx.fillRect(bx + 3, by - 4, 5, bh + 8);
      ctx.fillRect(bx + bw - 8, by - 4, 5, bh + 8);
      // rail
      ctx.strokeStyle = '#3e2723';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bx + 5, by + 6);
      ctx.lineTo(bx + 5, by + bh - 6);
      ctx.moveTo(bx + bw - 5, by + 6);
      ctx.lineTo(bx + bw - 5, by + bh - 6);
      ctx.stroke();
      // planks
      ctx.strokeStyle = 'rgba(62,39,35,0.6)';
      ctx.lineWidth = 2;
      for (let i = 1; i < 7; i++) {
        const lx = bx + (bw * i) / 7;
        ctx.beginPath();
        ctx.moveTo(lx, by + 4);
        ctx.lineTo(lx, by + bh - 4);
        ctx.stroke();
      }
      // flag
      ctx.fillStyle = '#5d4037';
      ctx.fillRect(bx + bw / 2 - 1, by - 16, 3, 16);
      ctx.fillStyle = bi === 0 ? '#ef5350' : '#42a5f5';
      ctx.beginPath();
      ctx.moveTo(bx + bw / 2 + 2, by - 16);
      ctx.lineTo(bx + bw / 2 + 14, by - 10);
      ctx.lineTo(bx + bw / 2 + 2, by - 4);
      ctx.fill();
      ctx.restore();
    });

    // угол: мелкие посты внутри доски + лёгкий декор снаружи (не ломает ракурс)
    drawBrickPost(ctx, x + 22, y + 34, 0.55, true);
    drawBrickPost(ctx, x + w - 22, y + 34, 0.55, true);
    drawBrickPost(ctx, x + 22, y + h - 6, 0.55, false);
    drawBrickPost(ctx, x + w - 22, y + h - 6, 0.55, false);

    drawCubeTree(ctx, x - 20, y + h * 0.7, 0.7);
    drawCubeTree(ctx, x + w + 20, y + h * 0.7, 0.7);
    drawCubeBush(ctx, x - 16, y + h * 0.45, 0.75);
    drawCubeBush(ctx, x + w + 16, y + h * 0.48, 0.75);
  }

  function drawBanner(ctx, x, y, me, tall) {
    const col = me ? '#1565c0' : '#c62828';
    const light = me ? '#64b5f6' : '#ef9a9a';
    ctx.fillStyle = '#5d4037';
    ctx.fillRect(x - 1.5, y, 3, tall || 22);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x + 1.5, y);
    ctx.lineTo(x + 14, y + 5);
    ctx.lineTo(x + 1.5, y + 10);
    ctx.fill();
    ctx.fillStyle = light;
    ctx.fillRect(x + 2, y + 2, 4, 3);
  }

  /** Cube brick keep — grey stone body, team color on banners/roof only */
  function drawTower(ctx, t, toScreen, roundRectFn) {
    const s = toScreen(t.lx, t.ly);
    const dead = !t.alive;
    const isKing = t.kind === 'king';
    const isStrelets = t.kind === 'strelets';
    const isDef = t.kind === 'defense';
    const me = t.side === 'me';
    const team = me ? '#1e88e5' : '#e53935';
    const teamDark = me ? '#0d47a1' : '#b71c1c';
    const accent = '#ffd54f';
    const ds = s.scale || 1;
    const bw = (isKing ? 48 : isStrelets ? 34 : 26) * ds;
    const bh = (isKing ? 64 : isStrelets ? 48 : 34) * ds;
    const left = s.x - bw / 2;
    const top = s.y - bh;

    ctx.save();
    ctx.globalAlpha = dead ? 0.4 : isKing && !t.active ? 0.55 : 1;

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(s.x, s.y + 10, bw * 0.72, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 14;
    // grey Cube stone wall
    const wall = ctx.createLinearGradient(left, top, left + bw, s.y);
    if (dead) {
      wall.addColorStop(0, '#8d6e63');
      wall.addColorStop(1, '#4e342e');
    } else {
      wall.addColorStop(0, '#e0e0e0');
      wall.addColorStop(0.4, '#9e9e9e');
      wall.addColorStop(0.75, '#757575');
      wall.addColorStop(1, '#424242');
    }
    ctx.fillStyle = wall;
    rr(ctx, left, top, bw, bh, 5);
    ctx.fill();
    ctx.shadowBlur = 0;

    paintBrickLines(ctx, left, top, bw, bh, isKing ? 6 : 5);

    // mortar highlight edge
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1.5;
    rr(ctx, left + 2, top + 3, bw - 4, bh * 0.2, 3);
    ctx.stroke();

    // crenellations — stone with team accent tops
    const teeth = isKing ? 5 : isStrelets ? 4 : 3;
    for (let i = 0; i < teeth; i++) {
      const tw = bw / (teeth + 0.35);
      const tx = left + 2 + i * tw;
      ctx.fillStyle = '#bdbdbd';
      rr(ctx, tx, top - 11, tw * 0.68, 12, 2);
      ctx.fill();
      ctx.fillStyle = dead ? '#795548' : accent;
      ctx.fillRect(tx + 1, top - 11, tw * 0.68 - 2, 3);
    }

    // king dome + flag
    if (isKing) {
      const dome = ctx.createRadialGradient(s.x - 4, top - 20, 2, s.x, top - 8, 18);
      dome.addColorStop(0, '#fff59d');
      dome.addColorStop(1, accent);
      ctx.fillStyle = dome;
      ctx.beginPath();
      ctx.arc(s.x, top - 4, 15, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(s.x, top - 22, 3.5, 0, Math.PI * 2);
      ctx.fill();
      drawBanner(ctx, s.x + bw * 0.42, top - 28, me, 26);
      drawBanner(ctx, s.x - bw * 0.48, top - 18, me, 20);
    } else if (isStrelets) {
      // team roof caps
      ctx.fillStyle = dead ? '#795548' : team;
      for (let i = 0; i < 3; i++) {
        rr(ctx, left + 4 + i * (bw / 3.2), top - 8, bw / 4.2, 8, 2);
        ctx.fill();
      }
      drawBanner(ctx, s.x + bw * 0.45, top - 20, me, 20);
    } else {
      // defense outpost — small team roof
      ctx.fillStyle = dead ? '#795548' : teamDark;
      ctx.beginPath();
      ctx.arc(s.x, top, 10, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.fillRect(s.x - 6, top - 2, 12, 3);
    }

    // arrow slit / window
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    if (isStrelets) {
      rr(ctx, s.x - 4, top + bh * 0.28, 8, 18, 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,236,179,0.35)';
      rr(ctx, s.x - 2, top + bh * 0.32, 4, 10, 1);
      ctx.fill();
    } else if (isKing) {
      rr(ctx, s.x - 7, top + bh * 0.32, 14, 16, 2);
      ctx.fill();
      rr(ctx, s.x - 16, top + bh * 0.5, 8, 10, 2);
      ctx.fill();
      rr(ctx, s.x + 8, top + bh * 0.5, 8, 10, 2);
      ctx.fill();
    } else {
      rr(ctx, s.x - 5, top + bh * 0.35, 10, 12, 2);
      ctx.fill();
    }

    // door
    ctx.fillStyle = '#5d4037';
    rr(ctx, s.x - (isKing ? 8 : 6), s.y - 16, isKing ? 16 : 12, 16, 2);
    ctx.fill();

    if (isKing && t.alive && !t.active) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      rr(ctx, left, top, bw, bh, 5);
      ctx.fill();
    }
    ctx.restore();

    if (t.hurtT > 0) {
      ctx.globalAlpha = Math.min(0.45, t.hurtT * 2);
      ctx.fillStyle = '#ff1744';
      rr(ctx, left, top, bw, bh, 5);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // HP: боковые (strelets) и defense; king — только после пробуждения (active)
    const showHp = t.alive && (isStrelets || isDef || (isKing && t.active));
    if (showHp) {
      const pct = t.hp / t.max;
      const barY = top - (isKing ? 28 : 20);
      const barH = 10;
      ctx.fillStyle = '#111';
      ctx.fillRect(s.x - 24, barY, 48, barH);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.strokeRect(s.x - 24, barY, 48, barH);
      const hg = ctx.createLinearGradient(s.x - 24, 0, s.x + 24, 0);
      hg.addColorStop(0, pct > 0.55 ? '#66bb6a' : pct > 0.3 ? '#ffca28' : '#ef5350');
      hg.addColorStop(1, pct > 0.55 ? '#2e7d32' : pct > 0.3 ? '#f57f17' : '#c62828');
      ctx.fillStyle = hg;
      ctx.fillRect(s.x - 24, barY, 48 * pct, barH);
    }
  }

  return { drawArena, drawTower, ensureTiles };
})();

window.GameArena = GameArena;
