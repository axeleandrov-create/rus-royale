/* vfx.js — playVfx словарь школ (аддитивно поверх fx/particles) */
'use strict';

const GameVfx = (function () {
  function ctx() {
    return window.__rrVfx || null;
  }

  function burst(sx, sy, colors, count, opts) {
    const c = ctx();
    if (!c || !c.particles) return;
    const n = Math.min(count, (opts && opts.cap) || 24);
    c.particles.burst(sx, sy, Object.assign({
      count: n,
      colors: colors,
      speed: 70,
      life: 0.4,
      size: 2.2,
      up: -18
    }, opts || {}));
  }

  function playVfx(kind, x, y, opts) {
    opts = opts || {};
    const c = ctx();
    const theme = window.VisualTheme;
    const school = (theme && theme.MAGIC[kind]) ? kind : (theme && theme.schoolFor(opts.def, kind)) || 'gold';
    const pack = (theme && theme.MAGIC[school]) || { colors: ['#ffe082', '#fff'], ring: '#ffd54f' };
    const rarity = (opts.def && opts.def.rarity) || 'common';
    const cap = (theme && theme.PARTICLE_CAP[rarity]) || 18;

    let sx = x, sy = y;
    if (c && c.toScreen && typeof x === 'number' && x < 40 && y < 40) {
      const s = c.toScreen(x, y);
      sx = s.x;
      sy = s.y;
    }

    if (c && c.fx) {
      if (kind === 'lightning') {
        c.fx.push({
          type: 'lightning',
          x0: opts.x0 != null ? opts.x0 : x,
          y0: opts.y0 != null ? opts.y0 : y - 0.3,
          x1: opts.x1 != null ? opts.x1 : x + 1,
          y1: opts.y1 != null ? opts.y1 : y,
          life: 0.35
        });
      } else if (kind === 'frost') {
        c.fx.push({ type: 'frost', x: opts.lx != null ? opts.lx : x, y: opts.ly != null ? opts.ly : y, r: opts.r || 2, life: 0.85 });
        c.fx.push({ type: 'spell', x: opts.lx != null ? opts.lx : x, y: opts.ly != null ? opts.ly : y, r: opts.r || 2, life: 0.55, color: pack.ring });
      } else if (kind === 'wave') {
        c.fx.push({
          type: 'wave',
          x: opts.lx != null ? opts.lx : x,
          y: opts.ly != null ? opts.ly : y,
          r: 0.4,
          maxR: opts.r || 3,
          life: 0.55,
          maxLife: 0.55,
          color: pack.ring
        });
      } else {
        c.fx.push({
          type: 'spell',
          x: opts.lx != null ? opts.lx : x,
          y: opts.ly != null ? opts.ly : y,
          r: opts.r || 2.2,
          life: opts.life || 0.5,
          color: pack.ring
        });
      }
      if (opts.shock) {
        c.fx.push({ type: 'shock', x: sx, y: sy, life: 0.4, maxLife: 0.4, power: rarity === 'mythic' ? 1.15 : 0.95 });
      }
    }

    burst(sx, sy, pack.colors, Math.min(cap, opts.count || 12), {
      speed: opts.speed || 80,
      life: 0.45,
      up: -22,
      cap
    });

    if (c && opts.flash) c.flashWhite = Math.max(c.flashWhite || 0, opts.flash);
    if (c && opts.vignette) c.vignette = Math.max(c.vignette || 0, opts.vignette);
  }

  return { playVfx };
})();

window.GameVfx = GameVfx;
window.playVfx = GameVfx.playVfx;
