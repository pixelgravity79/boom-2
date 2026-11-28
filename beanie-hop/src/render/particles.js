// Pooled voxel particles in a single InstancedMesh: dust puffs, feathers, splashes, sparkles.
import * as THREE from 'three';

const MAX = 320;
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
const zero = new THREE.Matrix4().makeScale(0, 0, 0);

export class Particles {
  constructor() {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    for (let i = 0; i < MAX; i++) { this.mesh.setMatrixAt(i, zero); this.mesh.setColorAt(i, new THREE.Color(1, 1, 1)); }
    this.list = [];
    this.free = [];
    for (let i = MAX - 1; i >= 0; i--) this.free.push(i);
    this.color = new THREE.Color();
    this.scale = 1;   // lowered on weak devices
  }

  spawn(x, y, z, o) {
    const n = Math.max(1, Math.round((o.n || 1) * this.scale));
    for (let k = 0; k < n; k++) {
      if (!this.free.length) return;
      const i = this.free.pop();
      const a = Math.random() * Math.PI * 2;
      const sp = (o.speed || 1) * (0.5 + Math.random() * 0.7);
      const up = (o.up || 0) * (0.6 + Math.random() * 0.6);
      const part = {
        i, x: x + (Math.random() - 0.5) * (o.spread || 0), y, z: z + (Math.random() - 0.5) * (o.spread || 0),
        vx: Math.cos(a) * sp + (o.vx || 0), vy: up, vz: Math.sin(a) * sp * (o.flatZ ? 0.4 : 1) + (o.vz || 0),
        g: o.gravity ?? 9, drag: o.drag ?? 1.5, life: 0, max: (o.life || 0.6) * (0.7 + Math.random() * 0.6),
        size: (o.size || 0.08) * (0.7 + Math.random() * 0.6), rx: Math.random() * 6, ry: Math.random() * 6,
        spin: (o.spin || 0) * (Math.random() - 0.5), floor: o.floor ?? -10, flutter: o.flutter || 0,
      };
      const cs = o.colors || [0xffffff];
      this.mesh.setColorAt(i, this.color.set(cs[Math.floor(Math.random() * cs.length)]));
      this.list.push(part);
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    for (let k = this.list.length - 1; k >= 0; k--) {
      const P = this.list[k];
      P.life += dt;
      if (P.life >= P.max) {
        this.mesh.setMatrixAt(P.i, zero);
        this.free.push(P.i);
        this.list.splice(k, 1);
        continue;
      }
      const d = Math.exp(-P.drag * dt);
      P.vx *= d; P.vz *= d;
      P.vy -= P.g * dt;
      if (P.flutter) { P.vy = Math.max(P.vy, -P.flutter); P.vx += Math.sin(P.life * 9 + P.rx) * 2 * dt; }
      P.x += P.vx * dt; P.y += P.vy * dt; P.z += P.vz * dt;
      if (P.y < P.floor) { P.y = P.floor; P.vy *= -0.3; P.vx *= 0.6; P.vz *= 0.6; }
      P.rx += P.spin * dt; P.ry += P.spin * 0.7 * dt;
      const k01 = P.life / P.max;
      const sc = P.size * (k01 < 0.15 ? k01 / 0.15 : 1 - Math.pow((k01 - 0.15) / 0.85, 2));
      m4.compose(p.set(P.x, P.y, P.z), q.setFromEuler(e.set(P.rx, P.ry, 0)), s.set(sc, sc, sc));
      this.mesh.setMatrixAt(P.i, m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    for (const P of this.list) { this.mesh.setMatrixAt(P.i, zero); this.free.push(P.i); }
    this.list.length = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
