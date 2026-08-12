/* pixel16.js — SNES / 16-bit palette + snap helpers for Русь Рояль */
'use strict';

const Pixel16 = (function () {
  /** DawnBringer-inspired 32-color set (bright SNES RPG feel) */
  const PALETTE = [
    '#000000', '#222034', '#45283c', '#663931', '#8f563b', '#df7126',
    '#d9a066', '#eec39a', '#fbf236', '#99e550', '#6abe30', '#37946e',
    '#4b692f', '#524b24', '#323c39', '#3f3f74', '#306082', '#5b6ee1',
    '#639bff', '#5fcde4', '#cbdbfc', '#ffffff', '#9badb7', '#847e87',
    '#696a6a', '#595652', '#76428a', '#ac3232', '#d95763', '#d77bba',
    '#8f974a', '#8a6f30'
  ];

  const SPRITE_SZ = 64;

  const _rgb = PALETTE.map(function (hex) {
    const n = parseInt(hex.slice(1), 16);
    return { hex: hex, r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  });

  function parseHex(col) {
    if (!col || typeof col !== 'string') return null;
    if (col.indexOf('rgba') === 0 || col.indexOf('rgb') === 0) return null;
    let h = col.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length !== 6) return null;
    const n = parseInt(h, 16);
    if (Number.isNaN(n)) return null;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function snap(col) {
    const rgb = parseHex(col);
    if (!rgb) return col;
    let best = _rgb[0], bestD = 1e9;
    for (let i = 0; i < _rgb.length; i++) {
      const p = _rgb[i];
      const dr = rgb.r - p.r, dg = rgb.g - p.g, db = rgb.b - p.b;
      const d = dr * dr + dg * dg + db * db;
      if (d < bestD) { bestD = d; best = p; }
    }
    return best.hex;
  }

  function snapPal(pal) {
    if (!pal) return pal;
    const out = {};
    Object.keys(pal).forEach(function (k) {
      out[k] = typeof pal[k] === 'string' ? snap(pal[k]) : pal[k];
    });
    return out;
  }

  /** Flat UI / arena colors from palette indices */
  const UI = {
    skyTop: snap('#5b6ee1'),
    skyMid: snap('#639bff'),
    grass: snap('#6abe30'),
    grassDark: snap('#4b692f'),
    dirt: snap('#8f563b'),
    wood: snap('#663931'),
    gold: snap('#fbf236'),
    elixir: snap('#76428a'),
    elixirHi: snap('#d77bba'),
    hp: snap('#ac3232'),
    ink: snap('#222034'),
    paper: snap('#cbdbfc'),
    frame: snap('#fbf236'),
    water: snap('#306082')
  };

  return {
    PALETTE, SPRITE_SZ, UI,
    snap, snapPal, parseHex
  };
})();

window.Pixel16 = Pixel16;
