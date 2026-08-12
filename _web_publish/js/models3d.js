/* models3d.js — Cube World (основа) + Pirate / Ultimate + Platformer towers via Three.js
 * assets/models/ultimate/...  assets/models/towers/Tower.gltf
 */
'use strict';

const GameModels = (function () {
  const MODEL_MAP = {
    vityaz: 'ultimate/Big/Tribal.gltf',
    streltsy: 'ultimate/Big/Ninja.gltf',
    velikan: 'ultimate/Big/Yeti.gltf',
    skelet: 'ultimate/Flying/Ghost_Skull.gltf',
    gorynych: 'ultimate/Flying/Dragon_Evolved.gltf',
    volhv: 'ultimate/Blob/Wizard.gltf',
    myasnik: 'ultimate/Big/Demon.gltf',
    druzhinnik: 'ultimate/Big/Orc.gltf',
    opolchenets: 'ultimate/Blob/Ninja.gltf',
    kazak: 'ultimate/Big/Bunny.gltf',
    sadko: 'ultimate/Blob/Fish.gltf',
    ilya: 'ultimate/Big/Yeti.gltf',
    dobrynya: 'ultimate/Big/Tribal.gltf',
    skomorokh: 'ultimate/Blob/PinkBlob.gltf',
    razboyniki: 'ultimate/Big/Ninja.gltf',
    kostey: 'ultimate/Flying/Ghost_Skull.gltf',
    zmeika: 'ultimate/Flying/Dragon.gltf',
    solovey: 'ultimate/Blob/Chicken.gltf',
    vasilisa: 'ultimate/Blob/Cat.gltf',
    leshy: 'ultimate/Big/Cactoro.gltf',
    sokol: 'ultimate/Flying/Pigeon.gltf',
    mag: 'ultimate/Blob/Wizard.gltf',
    zharptica: 'ultimate/Flying/Alpaking_Evolved.gltf',
    perun: 'ultimate/Flying/Demon.gltf',
    dvorf: 'ultimate/Big/Orc_Skull.gltf',
    samokhod: 'ultimate/Blob/Mushnub_Evolved.gltf',
    grom: 'ultimate/Big/Yeti.gltf',
    byk: 'ultimate/Big/Dino.gltf',
    ratay: 'ultimate/Big/Orc.gltf',
    troll: 'ultimate/Big/Ninja.gltf',
    zmejlet: 'ultimate/Flying/Dragon.gltf',
    koldun: 'ultimate/Blob/Wizard.gltf',
    chernyvityaz: 'ultimate/Big/BlueDemon.gltf',
    ledkoldun: 'ultimate/Blob/Yeti.gltf',
    upyr: 'ultimate/Flying/Ghost.gltf',
    chernmag: 'ultimate/Flying/Ghost.gltf',
    zmejstud: 'ultimate/Flying/Dragon_Evolved.gltf',
    lesvityaz: 'ultimate/Big/Tribal.gltf',
    lesovik: 'ultimate/Big/Ninja.gltf',
    zverogon: 'ultimate/Flying/Dragon_Evolved.gltf',
    moredeva: 'ultimate/Flying/Squidle.gltf',
    brazhnik: 'ultimate/Big/Monkroose.gltf'
  };

  const TOWER_MODEL = 'towers/Tower.gltf';
  const FLAG_MODEL = 'towers/Goal_Flag.gltf';
  const PREVIEW_URL = 'assets/models/cubeworld/Preview.jpg';
  const PREVIEW_FALLBACK = 'assets/models/ultimate/Preview.jpg';

  /** Pirate Kit — скины / осада / море (взаимозамена) */
  const PIRATE_MAP = {
    vityaz: 'pirate/Characters_Captain_Barbarossa.gltf',
    ilya: 'pirate/Characters_Captain_Barbarossa.gltf',
    chernyvityaz: 'pirate/Characters_Captain_Barbarossa.gltf',
    druzhinnik: 'pirate/Characters_Henry.gltf',
    kazak: 'pirate/Characters_Henry.gltf',
    vasilisa: 'pirate/Characters_Anne.gltf',
    moredeva: 'pirate/Characters_Anne.gltf',
    skelet: 'pirate/Characters_Skeleton.gltf',
    kostey: 'pirate/Characters_Skeleton_Headless.gltf',
    sadko: 'pirate/Characters_Tentacle.gltf',
    zmejlet: 'pirate/Characters_Shark.gltf',
    sokol: 'pirate/Characters_Sharky.gltf',
    samokhod: 'pirate/Prop_Cannon.gltf'
  };

  /** Cube World — ОСНОВА силуэтов CR (юниты / враги); Pirate/Ultimate — допы */
  const CUBE_MAP = {
    vityaz: 'cubeworld/Characters/Character_Male_1.gltf',
    druzhinnik: 'cubeworld/Characters/Character_Male_2.gltf',
    streltsy: 'cubeworld/Characters/Character_Female_1.gltf',
    vasilisa: 'cubeworld/Characters/Character_Female_2.gltf',
    velikan: 'cubeworld/Enemies/Giant.gltf',
    skelet: 'cubeworld/Enemies/Skeleton.gltf',
    kostey: 'cubeworld/Enemies/Skeleton_Armor.gltf',
    volhv: 'cubeworld/Enemies/Wizard.gltf',
    mag: 'cubeworld/Enemies/Wizard.gltf',
    myasnik: 'cubeworld/Enemies/Demon.gltf',
    ratay: 'cubeworld/Enemies/Yeti.gltf',
    skomorokh: 'cubeworld/Enemies/Goblin.gltf',
    upyr: 'cubeworld/Enemies/Zombie.gltf',
    kazak: 'cubeworld/Animals/Horse.gltf'
  };

  const CLIP = {
    idle: ['idle', 'flying_idle', 'stand', 'wait'],
    walk: ['walk', 'run', 'fast_flying', 'move', 'flying'],
    attack: ['punch', 'weapon', 'headbutt', 'bite', 'attack', 'slash', 'shoot', 'combat'],
    hit: ['hitreact', 'hitrecieve', 'hit'],
    death: ['death', 'die']
  };

  let enabled = true;
  /** false = на арене только 2D sheets; glTF/Preview остаются для коллекции и «Образы» */
  let arena3d = false;
  let renderer = null;
  let scene = null;
  let camera = null;
  let overlay = null;
  let loader = null;
  let ready = false;
  const cache = Object.create(null);
  const unitViews = new Map();
  const towerViews = new Map();
  const missing = Object.create(null);
  let previewImg = null;
  let previewReady = false;

  function ensureOverlay() {
    if (!enabled) return false;
    if (overlay) return ready;
    if (typeof THREE === 'undefined') return false;
    overlay = document.createElement('canvas');
    overlay.id = 'arena3d';
    // Above #c (arena 2D), below #ui (z-index typically higher)
    overlay.style.cssText =
      'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:5;';
    document.body.appendChild(overlay);
    renderer = new THREE.WebGLRenderer({ canvas: overlay, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.setClearColor(0x000000, 0);
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
    camera.position.set(0, 0, 500);
    scene.add(new THREE.HemisphereLight(0xfff5e6, 0x3e2723, 1.2));
    const dir = new THREE.DirectionalLight(0xffffff, 0.95);
    dir.position.set(80, 120, 60);
    scene.add(dir);
    const fill = new THREE.DirectionalLight(0x90caf9, 0.4);
    fill.position.set(-60, 40, -40);
    scene.add(fill);
    if (THREE.GLTFLoader) loader = new THREE.GLTFLoader();
    ready = !!loader;
    window.addEventListener('resize', () => {
      if (!renderer) return;
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    });
    return ready;
  }

  function ensurePreview() {
    if (previewImg) return previewImg;
    previewImg = new Image();
    previewImg.decoding = 'async';
    previewImg.onload = () => {
      previewReady = true;
      if (typeof window.onUltimatePreviewReady === 'function') {
        try {
          window.onUltimatePreviewReady();
        } catch (_) {}
      }
    };
    previewImg.onerror = () => {
      if (previewImg.src.indexOf('cubeworld') >= 0) {
        previewImg.src = PREVIEW_FALLBACK;
        return;
      }
      previewReady = false;
    };
    previewImg.src = PREVIEW_URL;
    return previewImg;
  }

  function loadModel(relPath) {
    const url = 'assets/models/' + relPath;
    if (cache[url]) return cache[url];
    cache[url] = new Promise((resolve) => {
      if (!loader) {
        resolve(null);
        return;
      }
      loader.load(
        url,
        (gltf) => {
          resolve({
            scene: gltf.scene,
            clips: gltf.animations || []
          });
        },
        undefined,
        () => {
          if (!missing[url]) {
            console.warn('[GameModels] модель не найдена:', url);
            missing[url] = true;
          }
          resolve(null);
        }
      );
    });
    return cache[url];
  }

  /** No fallback to clips[0] (was Death). */
  function pickClip(clips, names) {
    if (!clips || !clips.length) return null;
    const lower = clips.map((c) => ({ c, n: (c.name || '').toLowerCase() }));
    for (const want of names) {
      const w = want.toLowerCase();
      const hit = lower.find((x) => x.n === w || x.n.includes(w));
      if (hit) return hit.c;
    }
    return null;
  }

  function cloneScene(src) {
    if (THREE.SkeletonUtils && typeof THREE.SkeletonUtils.clone === 'function') {
      return THREE.SkeletonUtils.clone(src);
    }
    return src.clone(true);
  }

  function targetSize(u) {
    if (!u) return 44;
    if (u.role === 'tank' || u.primaryRole === 'tank' || u.primaryRole === 'wincon') return 58;
    if (u.air || (u.char && u.char.kind === 'dragon')) return 50;
    if ((u.count || 1) > 1 || (typeof CARDS !== 'undefined' && CARDS[u.id] && (CARDS[u.id].count || 1) > 1))
      return 34;
    return 44;
  }

  function bindActions(mixer, clips) {
    const actions = {};
    const idle = pickClip(clips, CLIP.idle);
    const walk = pickClip(clips, CLIP.walk);
    const attack = pickClip(clips, CLIP.attack);
    const hit = pickClip(clips, CLIP.hit);
    const death = pickClip(clips, CLIP.death);
    if (idle) actions.idle = mixer.clipAction(idle);
    if (walk) actions.walk = mixer.clipAction(walk);
    if (attack) actions.attack = mixer.clipAction(attack);
    if (hit) actions.hit = mixer.clipAction(hit);
    if (death) actions.death = mixer.clipAction(death);
    if (actions.idle) {
      actions.idle.play();
    } else if (actions.walk) {
      actions.walk.play();
    }
    return actions;
  }

  function attachUnit(u) {
    if (!arena3d || !enabled || !u || u.view3d) return;
    const file = MODEL_MAP[u.id];
    if (!file) return;
    if (!ensureOverlay()) return;
    u.view3d = { pending: true };
    u.hideSprite2d = true; // hide 2D immediately while loading
    loadModel(file).then((data) => {
      if (!data || u.dying || u.gone) {
        u.view3d = null;
        u.hideSprite2d = false;
        return;
      }
      const mesh = cloneScene(data.scene);
      mesh.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = false;
          o.receiveShadow = false;
          if (o.material) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach((m) => {
              if (!m) return;
              m.side = THREE.DoubleSide;
              if (u.side === 'ai' && m.color && m.color.offsetHSL) {
                m.color.offsetHSL(0, 0.06, -0.05);
              }
            });
          }
        }
      });
      const box0 = new THREE.Box3().setFromObject(mesh);
      const size = new THREE.Vector3();
      box0.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      mesh.scale.setScalar(targetSize(u) / maxDim);
      const box = new THREE.Box3().setFromObject(mesh);
      const center = new THREE.Vector3();
      box.getCenter(center);
      mesh.position.set(-center.x, -box.min.y, -center.z);
      const pivot = new THREE.Group();
      pivot.add(mesh);
      scene.add(pivot);

      const mixer = new THREE.AnimationMixer(mesh);
      const actions = bindActions(mixer, data.clips);
      const view = { root: pivot, mesh, mixer, actions, state: actions.idle ? 'idle' : 'walk', kind: 'unit' };
      unitViews.set(u, view);
      u.view3d = view;
      u.hideSprite2d = true;
    });
  }

  function attachTower(t) {
    if (!arena3d || !enabled || !t || t.view3d) return;
    if (!ensureOverlay()) return;
    t.view3d = { pending: true };
    t.hideSprite2d = true;
    const isKing = t.kind === 'king';
    Promise.all([loadModel(TOWER_MODEL), isKing ? loadModel(FLAG_MODEL) : Promise.resolve(null)]).then(
      ([towerData, flagData]) => {
        if (!towerData || !t.alive) {
          t.view3d = null;
          t.hideSprite2d = false;
          return;
        }
        const mesh = cloneScene(towerData.scene);
        mesh.traverse((o) => {
          if (o.isMesh && o.material) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach((m) => {
              if (!m) return;
              m.side = THREE.DoubleSide;
              if (t.side === 'ai' && m.color && m.color.offsetHSL) m.color.offsetHSL(0.02, 0.1, -0.08);
              else if (t.side === 'me' && m.color && m.color.offsetHSL) m.color.offsetHSL(-0.02, 0.05, 0.02);
            });
          }
        });
        const box0 = new THREE.Box3().setFromObject(mesh);
        const size = new THREE.Vector3();
        box0.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const target = isKing ? 70 : t.kind === 'strelets' ? 52 : 40;
        mesh.scale.setScalar(target / maxDim);
        const box = new THREE.Box3().setFromObject(mesh);
        const center = new THREE.Vector3();
        box.getCenter(center);
        mesh.position.set(-center.x, -box.min.y, -center.z);
        const pivot = new THREE.Group();
        pivot.add(mesh);
        if (flagData && isKing) {
          const flag = cloneScene(flagData.scene);
          const fb = new THREE.Box3().setFromObject(flag);
          const fs = new THREE.Vector3();
          fb.getSize(fs);
          const fMax = Math.max(fs.x, fs.y, fs.z) || 1;
          flag.scale.setScalar(22 / fMax);
          flag.position.set(8, target * 0.85, 0);
          pivot.add(flag);
        }
        scene.add(pivot);
        const view = { root: pivot, mesh, mixer: null, actions: {}, state: 'idle', kind: 'tower' };
        towerViews.set(t, view);
        t.view3d = view;
        t.hideSprite2d = true;
      }
    );
  }

  function attachAllTowers(towers) {
    if (!towers) return;
    towers.forEach((t) => {
      if (t && t.alive) attachTower(t);
    });
  }

  function setAnim(view, name) {
    if (!view || view.state === name) return;
    const next = view.actions[name];
    if (!next) {
      view.state = name;
      return;
    }
    Object.keys(view.actions).forEach((k) => {
      const a = view.actions[k];
      if (a && k !== name) a.fadeOut(0.1);
    });
    next.reset().fadeIn(0.1).play();
    view.state = name;
  }

  function screenPos(toScreen, lx, ly, w, h) {
    const s = toScreen(lx, ly);
    return { x: s.x - w / 2, y: h / 2 - s.y };
  }

  function sync(units, toScreen, towers) {
    if (!arena3d || !ready || !renderer) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.left = -w / 2;
    camera.right = w / 2;
    camera.top = h / 2;
    camera.bottom = -h / 2;
    camera.updateProjectionMatrix();

    const liveU = new Set(units || []);
    unitViews.forEach((view, u) => {
      if (!liveU.has(u) || u.gone) {
        scene.remove(view.root);
        unitViews.delete(u);
        return;
      }
      const s = toScreen(u.x, u.y);
      const bob = u.moving ? Math.sin(performance.now() / 140 + (u.x || 0)) * 2.5 : Math.sin(performance.now() / 500) * 1;
      view.root.position.set(s.x - w / 2, h / 2 - s.y + 6 + bob, 0);
      const faceLeft = u.char && u.char.face < 0;
      view.root.rotation.y = faceLeft ? Math.PI * 0.55 : -Math.PI * 0.55;
      if (u.dying && view.actions.death) setAnim(view, 'death');
      else if (u.char && u.char.anim && u.char.anim.state === 'attack') setAnim(view, 'attack');
      else if (u.moving) setAnim(view, 'walk');
      else setAnim(view, 'idle');
    });

    const liveT = new Set((towers || []).filter((t) => t && t.alive));
    towerViews.forEach((view, t) => {
      if (!liveT.has(t)) {
        scene.remove(view.root);
        towerViews.delete(t);
        if (t) t.view3d = null;
        return;
      }
      const p = screenPos(toScreen, t.lx, t.ly, w, h);
      view.root.position.set(p.x, p.y + 4, -10);
      view.root.rotation.y = t.side === 'ai' ? Math.PI * 0.15 : -Math.PI * 0.15;
      view.root.visible = !!t.alive;
      if (t.kind === 'king' && !t.active) view.root.scale.setScalar(0.92);
      else view.root.scale.setScalar(1);
    });

    renderer.render(scene, camera);
  }

  function update(dt) {
    unitViews.forEach((view) => {
      if (view.mixer) view.mixer.update(dt);
    });
  }

  function drawPreviewPortrait(ctx, cardId, dx, dy, dw, dh) {
    ensurePreview();
    if (!previewReady || !previewImg.complete) return false;
    const cols = 9;
    const rows = 5;
    const keys = Object.keys(MODEL_MAP);
    const idx = Math.max(0, keys.indexOf(cardId));
    const col = idx % cols;
    const row = Math.floor(idx / cols) % rows;
    const sw = previewImg.naturalWidth / cols;
    const sh = previewImg.naturalHeight / rows;
    ctx.drawImage(previewImg, col * sw, row * sh, sw, sh, dx, dy, dw, dh);
    return true;
  }

  function modelFor(cardId) {
    return CUBE_MAP[cardId] || PIRATE_MAP[cardId] || MODEL_MAP[cardId] || null;
  }

  function clearAll() {
    unitViews.forEach((v) => scene && scene.remove(v.root));
    towerViews.forEach((v) => scene && scene.remove(v.root));
    unitViews.clear();
    towerViews.clear();
  }

  return {
    MODEL_MAP,
    CUBE_MAP,
    PIRATE_MAP,
    PREVIEW_URL,
    attachUnit,
    attachTower,
    attachAllTowers,
    sync,
    update,
    clearAll,
    ensureOverlay,
    ensurePreview,
    drawPreviewPortrait,
    modelFor,
    get enabled() {
      return enabled;
    },
    set enabled(v) {
      enabled = !!v;
    },
    get arena3d() {
      return arena3d;
    },
    set arena3d(v) {
      arena3d = !!v;
      if (!arena3d) clearAll();
    }
  };
})();

window.GameModels = GameModels;
