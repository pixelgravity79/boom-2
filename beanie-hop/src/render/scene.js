// Renderer: owns the WebGL context, camera, lights, lane views, the chicken, the eagle and effects.
// It only reads the Game; all rules live in src/sim.
import * as THREE from 'three';
import * as C from '../sim/config.js';
import { LaneView, GROUND_HALF, standY, TOP } from './lanes.js';
import { Chicken } from './chicken.js';
import { Particles } from './particles.js';
import { eagleParts, PAL } from './models.js';
import { edgeShade } from './voxel.js';

const PITCH = THREE.MathUtils.degToRad(46);   // lower = the face is seen more head-on (ChatGPT F14)
const YAW = THREE.MathUtils.degToRad(-13);
const VIEW_DIR = new THREE.Vector3(Math.sin(YAW) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(YAW) * Math.cos(PITCH));
const LIGHT_OFFSET = new THREE.Vector3(-6, 14, 7);
const HIT_STOP = 0.12;

function waterTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#56c3ee'; g.fillRect(0, 0, 128, 32);
  g.fillStyle = 'rgba(255,255,255,0.28)';
  for (let i = 0; i < 9; i++) {
    const x = (i * 37) % 128, y = 3 + ((i * 11) % 26);
    g.fillRect(x, y, 10 + (i % 3) * 6, 2);
  }
  g.fillStyle = 'rgba(30,120,190,0.18)';
  for (let i = 0; i < 6; i++) g.fillRect((i * 53) % 128, 5 + ((i * 17) % 22), 14, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.repeat.set(GROUND_HALF * 2 / 4, 1);
  return t;
}

export class Renderer {
  constructor(canvas, assets) {
    this.canvas = canvas;
    const dpr = window.devicePixelRatio || 1;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: dpr < 2, powerPreference: 'high-performance', stencil: false });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gl.setClearColor(0x6fae4c);
    this.quality = { dpr: Math.min(dpr, 2), shadows: true, shadowSize: 2048 };

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 200);
    this.target = new THREE.Vector3();
    this.zoom = 1.8;
    this.shake = 0;

    const hemi = new THREE.HemisphereLight(0xfdfcf5, 0x8a7d5c, 1.25);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xfff4e0, 2.1);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);
    this.setShadowSize(this.quality.shadowSize);

    const world = edgeShade(new THREE.MeshLambertMaterial({ vertexColors: true }));
    const wt = waterTexture();
    const water = {};
    for (const d of [-1, 0, 1]) {
      const t = wt.clone(); t.needsUpdate = true;
      water[d] = edgeShade(new THREE.MeshLambertMaterial({ map: t }));
    }
    const waterGeo = new THREE.PlaneGeometry(GROUND_HALF * 2, 1);
    waterGeo.rotateX(-Math.PI / 2);
    this.mats = {
      world, water, waterGeo,
      lampOff: new THREE.MeshLambertMaterial({ color: 0x5a1414 }),
      lampOn: new THREE.MeshBasicMaterial({ color: 0xff3b30 }),
    };

    this.lanes = new Map();
    this.lanesGroup = new THREE.Group();
    this.scene.add(this.lanesGroup);
    this.particles = new Particles();
    this.scene.add(this.particles.mesh);

    this.chicken = new Chicken(assets.textures, assets.meta);
    this.scene.add(this.chicken.root);

    const ep = eagleParts();
    this.eagle = new THREE.Group();
    const em = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.eagle.add(new THREE.Mesh(ep.body, em));
    this.eagleWings = [-1, 1].map((s) => {
      const piv = new THREE.Group();
      piv.position.set(s * 0.26, 0.3, 0);
      const w = new THREE.Mesh(ep.wing, em);
      w.scale.x = s;
      piv.add(w);
      this.eagle.add(piv);
      return { piv, s };
    });
    this.eagle.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.eagle.visible = false;
    this.scene.add(this.eagle);

    this.view = { w: 10, h: 20 };
    this.resize();
  }

  setShadowSize(size) {
    this.quality.shadowSize = size;
    this.sun.shadow.mapSize.set(size, size);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
  }

  setQuality({ dpr, shadows, shadowSize, particles }) {
    if (dpr !== undefined) { this.quality.dpr = dpr; this.resize(); }
    if (shadows !== undefined) { this.quality.shadows = shadows; this.gl.shadowMap.enabled = shadows; this.sun.castShadow = shadows; this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); }
    if (shadowSize !== undefined && shadowSize !== this.quality.shadowSize) this.setShadowSize(shadowSize);
    if (particles !== undefined) this.particles.scale = particles;
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.gl.setPixelRatio(this.quality.dpr);
    this.gl.setSize(w, h, false);
    const a = w / h;
    const vw = Math.max(9.2, Math.min(13.2 * a, 26));
    this.view = { w: vw, h: vw / a, aspect: a };
    this.applyFrustum();
    const S = this.sun.shadow.camera, span = Math.max(vw, vw / a) * 0.75 + 6;
    S.left = -span; S.right = span; S.top = span; S.bottom = -span; S.near = 1; S.far = 60;
    S.updateProjectionMatrix();
  }

  applyFrustum() {
    const { w, h } = this.view, z = this.zoom;
    const cam = this.camera;
    cam.left = -w / 2 / z; cam.right = w / 2 / z; cam.top = h / 2 / z; cam.bottom = -h / 2 / z;
    cam.updateProjectionMatrix();
  }

  /** Throw away the world and start over for a new game. */
  reset(game) {
    for (const v of this.lanes.values()) { this.lanesGroup.remove(v.group); v.dispose(); }
    this.lanes.clear();
    this.particles.clear();
    this.chicken.reset();
    this.eagle.visible = false;
    this.shake = 0;
    this.game = game;
    this.camZ = game.cam;
    this.camX = 0;
  }

  syncLanes(game, zMin, zMax) {
    const lo = Math.floor(zMin), hi = Math.ceil(zMax);
    for (const [row, v] of this.lanes) {
      if (row < lo - 1 || row > hi + 1) { this.lanesGroup.remove(v.group); v.dispose(); this.lanes.delete(row); }
    }
    let built = 0;
    for (let row = lo; row <= hi; row++) {
      if (this.lanes.has(row)) continue;
      const lane = game.lane(row);
      const v = new LaneView(lane, game.lane(row - 1), game.lane(row + 1), this.mats);
      this.lanesGroup.add(v.group);
      this.lanes.set(row, v);
      built++;
    }
    return built;
  }

  /** Feed sim events into effects. */
  effects(game, events) {
    for (const e of events) {
      if (e.type === 'land') {
        const lane = game.lane(e.r);
        const y = standY(lane, e.onLog, lane.pads && !e.onLog);
        if (lane.type === 'river') this.particles.spawn(e.x, y + 0.02, e.r, { n: 6, speed: 1.4, up: 2.2, life: 0.4, size: 0.07, colors: [0xffffff, 0xbfe9ff], gravity: 12 });
        else this.particles.spawn(e.x, y + 0.03, e.r, { n: 4, speed: 1.2, up: 0.8, life: 0.35, size: 0.09, colors: lane.type === 'grass' ? [0xe8f5d0, 0xd8eec0] : [0xd6d6d6, 0xbdbdbd], gravity: 2, drag: 4 });
        this.chicken.kick(-3.2);
      } else if (e.type === 'hop') {
        this.chicken.kick(2.0);
      } else if (e.type === 'coin') {
        const lane = game.lane(e.r);
        this.particles.spawn(e.x, standY(lane) + 0.4, e.r, { n: 14, speed: 2.2, up: 3, life: 0.6, size: 0.08, colors: [PAL.corn, 0xffffff, 0xfff1a8], gravity: 6, spin: 10 });
      } else if (e.type === 'death') {
        const d = game.death, lane = game.lane(Math.round(d.r));
        const y = standY(lane, false, false);
        if (d.kind === 'car' || d.kind === 'train') {
          this.particles.spawn(d.x, y + 0.5, d.r, { n: 26, speed: d.kind === 'train' ? 5 : 3, up: 4, life: 1.6, size: 0.12, colors: [0xffffff, 0xf3efe6, PAL.red], gravity: 3, drag: 2, spin: 8, flutter: 0.8, floor: y + 0.03, vx: d.kind === 'train' ? d.dir * 4 : 0 });
          this.shake = d.kind === 'train' ? 0.5 : 0.28;
        } else if (d.kind === 'splash' || d.kind === 'swept') {
          this.particles.spawn(d.x, TOP.river + 0.05, d.r, { n: 26, speed: 1.8, up: 5, life: 0.9, size: 0.1, colors: [0xffffff, 0xbfe9ff, 0x8fd3ff], gravity: 14 });
          this.shake = 0.12;
        } else if (d.kind === 'eagle') {
          this.eagleT0 = null;
        }
      }
    }
  }

  /**
   * Draw a frame. mode: 'title' | 'play' | 'over'. t = continuous game time for this frame.
   */
  render(game, t, dt, mode, now) {
    const p = game.p, death = game.death;
    if (death) t = t - death.t < HIT_STOP ? death.t : t - HIT_STOP;   // a beat of stillness on impact (ChatGPT F16)
    // ---- chicken
    const pos = game.pos(t);
    let baseY;
    if (p.hop && !death) {
      const h = p.hop, from = game.lane(h.fr), to = game.lane(h.tr);
      const y0 = standY(from, h.fromLog, h.fromPad), y1 = standY(to, h.spot && h.spot.log, h.spot && h.spot.pad !== undefined);
      baseY = y0 + (y1 - y0) * pos.k;
    } else {
      const lane = game.lane(Math.round(death ? death.r : p.r));
      baseY = standY(lane, !!p.log, !!(lane.pads && !p.log));
    }
    if (!death) {
      this.chicken.update({
        x: pos.x, y: baseY + pos.y, z: pos.r, hopK: pos.k, hopping: !!p.hop, face: mode === 'title' ? 'f' : p.face,
        idleFor: p.hop ? 0 : t - p.lastMoveT, bumpK: t - p.bumpT < C.BUMP_TIME ? (t - p.bumpT) / C.BUMP_TIME : 0,
        now, dt, title: mode === 'title',
      });
    } else {
      const k = t - death.t;
      if (death.kind === 'eagle') this.animateEagle(death, k, dt, baseY);
      else {
        if (k < dt * 1.5 || this.chicken.deathT !== death.t) { this.chicken.deathT = death.t; this.chicken.root.position.set(death.x, baseY + (death.y || 0), death.r); }
        this.chicken.updateDeath(death, k, dt, baseY);
      }
    }

    // ---- camera
    const playing = mode !== 'title';
    const targetZoom = mode === 'title' ? 1.9 : death ? 1.22 : 1;
    this.zoom += (targetZoom - this.zoom) * Math.min(1, dt * (mode === 'title' ? 3 : 2.4));
    this.applyFrustum();
    const { w, h } = this.view;
    const chickenScreenUp = 0.17 * h / this.zoom;   // keep the chicken a little above centre: more road ahead is visible
    let focusZ = (playing ? game.cam : pos.r) + chickenScreenUp / Math.sin(PITCH);
    let focusX = w < 12 ? THREE.MathUtils.clamp(pos.x * 0.45, -1.1, 1.1) : pos.x * 0.15;
    if (mode === 'title') { focusZ = pos.r + 0.25; focusX = pos.x; }
    if (death) { focusZ = death.r + 0.27 * h / this.zoom / Math.sin(PITCH); focusX = death.x * 0.6 + focusX * 0.4; } // chicken in the top third, clear of the game-over card
    const follow = 1 - Math.exp(-dt * (mode === 'title' ? 6 : 7));
    this.camZ += (focusZ - this.camZ) * follow;
    this.camX += (focusX - this.camX) * follow;
    this.target.set(this.camX, 0.45, this.camZ);
    this.shake = Math.max(0, this.shake - dt * 1.4);
    const sx = (Math.random() - 0.5) * this.shake * 0.6, sy = (Math.random() - 0.5) * this.shake * 0.6;
    this.camera.position.copy(this.target).addScaledVector(VIEW_DIR, 60);
    this.camera.position.x += sx; this.camera.position.y += sy;
    this.camera.lookAt(this.target.x + sx, this.target.y + sy, this.target.z);

    // ---- light follows the view, snapped to shadow texels to stop shimmering
    const texel = (this.sun.shadow.camera.right * 2) / this.quality.shadowSize;
    const lx = Math.round(this.target.x / texel) * texel, lz = Math.round(this.target.z / texel) * texel;
    this.sun.target.position.set(lx, 0, lz);
    this.sun.position.set(lx + LIGHT_OFFSET.x, LIGHT_OFFSET.y, lz + LIGHT_OFFSET.z);

    // ---- lanes in view
    const halfRows = (h / 2 / this.zoom) / Math.sin(PITCH);
    this.syncLanes(game, this.camZ - halfRows - 3, this.camZ + halfRows + 3);
    const viewHalf = w / 2 / this.zoom / Math.cos(YAW) + 3;
    for (const v of this.lanes.values()) v.update(t, game, viewHalf, dt);
    for (const d of [-1, 1]) this.mats.water[d].map.offset.x = (t * 0.06 * d) % 1;
    this.mats.water[0].map.offset.x = (t * 0.01) % 1;

    this.particles.update(dt);
    this.gl.render(this.scene, this.camera);
  }

  animateEagle(death, k, dt, baseY) {
    const E = this.eagle, ch = this.chicken.root;
    const grab = 0.55;
    const start = new THREE.Vector3(death.x - 1.5, 6.5, death.r - 11);
    const at = new THREE.Vector3(death.x, baseY + 1.15, death.r);
    const away = new THREE.Vector3(death.x + 3, 9, death.r - 16);
    E.visible = true;
    if (k < grab) {
      const e = k / grab, s = e * e * (3 - 2 * e);
      E.position.lerpVectors(start, at, s);
      E.lookAt(at.x, E.position.y - 0.4, at.z + 1);
      ch.position.set(death.x, baseY, death.r);
      this.chicken.update({ x: death.x, y: baseY, z: death.r, hopK: 1, hopping: false, face: 'f', idleFor: 1, bumpK: 0, now: k, dt, title: false });
    } else {
      const e = Math.min(1, (k - grab) / 1.3);
      E.position.lerpVectors(at, away, e * e);
      E.lookAt(away);
      ch.position.set(E.position.x, E.position.y - 1.1, E.position.z);
      this.chicken.updateDeath(death, k, dt, baseY);
      if (k - grab < dt * 1.5) this.particles.spawn(death.x, baseY + 0.6, death.r, { n: 10, speed: 2, up: 2, life: 1.2, size: 0.1, colors: [0xffffff], gravity: 2, flutter: 0.6, spin: 6 });
    }
    for (const w of this.eagleWings) w.piv.rotation.z = w.s * Math.sin(k * 16) * 0.7;
  }

  hideEagle() { this.eagle.visible = false; }
}
