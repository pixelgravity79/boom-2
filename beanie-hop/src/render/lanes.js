// One LaneView per visible row: a single merged mesh for ground + scenery, plus meshes for whatever moves.
import * as THREE from 'three';
import * as C from '../sim/config.js';
import { moverX, trainState } from '../sim/world.js';
import { VoxelBuilder, NO_BOTTOM, vary } from './voxel.js';
import { springStep } from './spring.js';
import { PAL, addProp, vehicleGeo, logGeo, cornGeo, signalGeo, lampGeo, locoGeo, carriageGeo } from './models.js';

export const GROUND_HALF = 36;   // ground strips extend this far to the sides
export const TOP = { grass: 0, road: -0.06, rail: -0.04, river: -0.3 };
export const LOG_TOP = -0.1, PAD_TOP = -0.25;

/** Height the chicken stands at on this lane. */
export function standY(lane, onLog, onPad) {
  if (lane.type === 'river') return onLog ? LOG_TOP : onPad ? PAD_TOP : TOP.river;
  return TOP[lane.type];
}

function buildStatic(lane, prev, next) {
  const ground = new VoxelBuilder(), props = new VoxelBuilder();
  const W = GROUND_HALF * 2, odd = lane.row & 1;
  const base = -0.9;
  if (lane.type === 'grass') {
    ground.box(W, 0.78, 1, 0, base, 0, PAL.dirt, NO_BOTTOM);
    ground.box(W, 0.12, 1, 0, -0.12, 0, odd ? PAL.grassA : PAL.grassB, NO_BOTTOM);
    for (const o of lane.decor) addProp(props, o.kind, o.x, o.v, 0, Math.abs(o.x) > C.COL_MAX + 1);
    if (lane.row < C.BACK_LIMIT) ground.box(W, 0.02, 1, 0, 0, 0, PAL.grassEdge, NO_BOTTOM);
  } else if (lane.type === 'road') {
    ground.box(W, 0.84, 1, 0, base, 0, PAL.road, NO_BOTTOM);
    if (next && next.type === 'road') {
      for (let x = -GROUND_HALF + 0.5; x < GROUND_HALF; x += 1.7) ground.box(0.75, 0.012, 0.07, x, TOP.road, 0.5, PAL.line, NO_BOTTOM);
    }
    if (!prev || prev.type !== 'road') ground.box(W, 0.012, 0.05, 0, TOP.road, -0.47, PAL.roadEdge, NO_BOTTOM);
    if (!next || next.type !== 'road') ground.box(W, 0.012, 0.05, 0, TOP.road, 0.47, PAL.roadEdge, NO_BOTTOM);
  } else if (lane.type === 'rail') {
    ground.box(W, 0.86, 1, 0, base, 0, PAL.gravel, NO_BOTTOM);
    for (let x = -GROUND_HALF + 0.3; x < GROUND_HALF; x += 0.6) props.box(0.2, 0.04, 0.84, x, TOP.rail, 0, PAL.sleeper, NO_BOTTOM);
    for (const z of [-0.24, 0.24]) props.box(W, 0.07, 0.07, 0, TOP.rail + 0.02, z, PAL.rail, NO_BOTTOM);
  } else { // river: bed below, water surface is its own animated mesh
    ground.box(W, 0.3, 1, 0, base, 0, PAL.waterDeep, NO_BOTTOM);
    if (lane.pads) {
      for (const x of [...lane.pads, ...(lane.decorPads || [])]) {   // playable + scenery pads
        const v = ((x * 7919 + lane.row * 104729) % 1000) / 1000;
        props.box(0.8, 0.05, 0.8, x, PAD_TOP - 0.05, 0, vary(PAL.pad, v, 0.08), NO_BOTTOM);
        props.box(0.22, 0.052, 0.12, x + 0.22, PAD_TOP - 0.05, 0.25, PAL.padDark, NO_BOTTOM);
        if (v > 0.7) props.box(0.12, 0.08, 0.12, x - 0.2, PAD_TOP, -0.15, 0xff8fb1, NO_BOTTOM);
      }
    }
  }
  return { ground: ground.build(), props: props.empty ? null : props.build() };
}

export class LaneView {
  constructor(lane, prev, next, mats) {
    this.lane = lane;
    this.mats = mats;
    this.group = new THREE.Group();
    this.group.position.z = lane.row;
    const { ground, props } = buildStatic(lane, prev, next);
    this.geos = [ground];
    const g = new THREE.Mesh(ground, mats.world);
    g.receiveShadow = true;
    this.group.add(g);
    if (props) {
      this.geos.push(props);
      const pm = new THREE.Mesh(props, mats.world);
      pm.castShadow = true; pm.receiveShadow = true;
      this.group.add(pm);
    }
    if (lane.type === 'river') {
      const water = new THREE.Mesh(mats.waterGeo, mats.water[lane.speed ? lane.dir : 0]);
      water.position.y = TOP.river;
      water.receiveShadow = true;
      this.group.add(water);
    }
    // movers
    this.movers = lane.movers.map((m) => {
      const mesh = new THREE.Mesh(m.kind === 'log' ? logGeo(m.len) : vehicleGeo(m), mats.world);
      mesh.castShadow = true;
      mesh.receiveShadow = m.kind === 'log';
      mesh.position.y = m.kind === 'log' ? LOG_TOP - 0.3 : TOP.road;
      if (lane.dir < 0) mesh.rotation.y = Math.PI;
      this.group.add(mesh);
      return { m, mesh, sink: 0, sinkV: 0 };
    });
    // trains + crossing signals
    if (lane.type === 'rail') {
      this.train = new THREE.Group();
      const loco = new THREE.Mesh(locoGeo(), mats.world);
      loco.position.x = -1.65;
      loco.castShadow = true;
      this.train.add(loco);
      for (let i = 0; i < lane.train.cars; i++) {
        const c = new THREE.Mesh(carriageGeo(i + lane.row), mats.world);
        c.position.x = -(3.4 + 1.6 + i * 3.3);
        c.castShadow = true;
        this.train.add(c);
      }
      if (lane.dir < 0) this.train.rotation.y = Math.PI;
      this.train.position.y = TOP.rail;
      this.train.visible = false;
      this.group.add(this.train);
      this.lamps = [];
      for (const sx of [C.COL_MAX + 0.62, C.COL_MIN - 0.62]) {   // inside a phone-width view (Gemini F6)
        const s = new THREE.Mesh(signalGeo(), mats.world);
        s.position.set(sx, TOP.rail, -0.42);
        s.castShadow = true;
        this.group.add(s);
        for (const lx of [-0.1, 0.1]) {
          const lamp = new THREE.Mesh(lampGeo(), mats.lampOff);
          lamp.position.set(sx + lx, TOP.rail + 0.95, -0.36);
          this.group.add(lamp);
          this.lamps.push(lamp);
        }
      }
      this.warn = false;
    }
    // corn
    this.coins = lane.coins.map((x) => {
      const mesh = new THREE.Mesh(cornGeo(), mats.world);
      mesh.castShadow = true;
      mesh.position.set(x, standY(lane, false, false) + 0.12, 0);
      this.group.add(mesh);
      return { x, mesh, key: lane.row + ':' + x };
    });
  }

  update(t, game, viewHalf, dt) {
    const lane = this.lane;
    for (let i = 0; i < this.movers.length; i++) {
      const mv = this.movers[i];
      const x = moverX(lane, mv.m, t);
      mv.mesh.position.x = x;
      mv.mesh.visible = Math.abs(x) < viewHalf + mv.m.len;
      if (mv.m.kind === 'log') {
        const ridden = game.p.log && game.p.r === lane.row && game.p.log.i === i && game.state === 'playing';
        if (ridden && !mv.rider) mv.sinkV -= 0.9;        // dips when you land on it
        mv.rider = ridden;
        const sp = { v: mv.sink, vel: mv.sinkV };
        springStep(sp, 0, 140, 9, dt, -1.5, 1.5);
        mv.sink = sp.v; mv.sinkV = sp.vel;
        mv.mesh.position.y = LOG_TOP - 0.3 + mv.sink * 0.06 + Math.sin(t * 2 + i * 1.7 + lane.row) * 0.012;
      }
    }
    if (this.train) {
      const s = trainState(lane, t);
      this.train.visible = s.active;
      if (s.active) this.train.position.x = s.head;
      this.warn = s.warn;
      const blink = s.warn && Math.floor(t * 6) % 2 === 0;
      for (let i = 0; i < this.lamps.length; i++) {
        this.lamps[i].material = s.warn && (i % 2 === 0) === blink ? this.mats.lampOn : this.mats.lampOff;
      }
    }
    for (const c of this.coins) {
      const got = game.collected.has(c.key);
      if (got && c.mesh.visible) c.mesh.visible = false;
      if (!got) {
        c.mesh.rotation.y = t * 2.4 + c.x;
        c.mesh.position.y = standY(lane, false, false) + 0.14 + Math.sin(t * 3 + c.x) * 0.05;
      }
    }
  }

  dispose() {
    for (const g of this.geos) g.dispose();
  }
}
