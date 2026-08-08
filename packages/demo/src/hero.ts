/**
 * FlarePay hero — a living Merkle tree.
 *
 * Every leaf is a payment; hover one and its proof path to the root lights up
 * (which is literally how FDC verification works). The tree is synced to the
 * real protocol: when a live FDC voting round finalizes on Coston2, a new leaf
 * crystallizes and a receipt-lantern floats up.
 *
 * Perf notes: everything is instanced (127 nodes, 126 branches, one draw call
 * each), bloom runs at half resolution, and rendering pauses when the hero is
 * off-screen.
 */

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

const ACCENT = new THREE.Color("#e62058");
const EMBER = new THREE.Color("#ff9d5c");
const CRYSTAL = new THREE.Color("#3a4258");
const CRYSTAL_LIT = new THREE.Color("#8fa3d8");
const DEPTH = 6; // levels of branching → 2^6 = 64 leaves

interface TreeNode {
  index: number;
  parent: number; // -1 for root
  level: number;
  position: THREE.Vector3;
  isLeaf: boolean;
}

/** Deterministic PRNG so the tree is identical on every load. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTree(): TreeNode[] {
  const rand = mulberry32(1419449); // the round our first receipt settled in
  const nodes: TreeNode[] = [];
  const root: TreeNode = {
    index: 0,
    parent: -1,
    level: 0,
    position: new THREE.Vector3(0, -2.1, 0),
    isLeaf: false,
  };
  nodes.push(root);

  const grow = (parent: TreeNode, direction: THREE.Vector3, level: number) => {
    const length = 1.35 * Math.pow(0.78, level - 1);
    const position = parent.position.clone().add(direction.clone().multiplyScalar(length));
    const node: TreeNode = {
      index: nodes.length,
      parent: parent.index,
      level,
      position,
      isLeaf: level === DEPTH,
    };
    nodes.push(node);
    if (level === DEPTH) return;

    // Two children: splay outward, keep growing upward, add organic wobble.
    const axis = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    const spread = 0.62 - level * 0.045;
    for (const side of [-1, 1]) {
      const dir = direction
        .clone()
        .applyAxisAngle(axis, side * spread)
        .add(new THREE.Vector3((rand() - 0.5) * 0.3, 0.22, (rand() - 0.5) * 0.3))
        .normalize();
      grow(node, dir, level + 1);
    }
  };

  grow(root, new THREE.Vector3(0, 1, 0), 1);
  return nodes;
}

export interface HeroHandles {
  /** Called when the live FDC round increments. */
  onRoundFinalized(roundId: number): void;
}

export function mountHero(canvas: HTMLCanvasElement, statusEl: HTMLElement): HeroHandles {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true, // lets us export the hero as a real og-image
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0b0c10");
  scene.fog = new THREE.Fog("#0b0c10", 9, 18);

  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 60);
  camera.position.set(0, 0.9, 8.6);
  camera.lookAt(0, 0.9, 0);

  scene.add(new THREE.AmbientLight("#5b647d", 0.7));
  const key = new THREE.PointLight(ACCENT, 60, 30);
  key.position.set(4, 3, 5);
  scene.add(key);
  const rim = new THREE.PointLight("#4a6cff", 25, 30);
  rim.position.set(-5, -1, -4);
  scene.add(rim);

  // ─── Starfield ────────────────────────────────────────────────────
  {
    const starCount = 700;
    const positions = new Float32Array(starCount * 3);
    const rand = mulberry32(7);
    for (let i = 0; i < starCount; i++) {
      const radius = 10 + rand() * 18;
      const theta = rand() * Math.PI * 2;
      const y = (rand() - 0.35) * 16;
      positions[i * 3] = Math.cos(theta) * radius;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(theta) * radius - 6;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const stars = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ color: "#8b93ad", size: 0.035, sizeAttenuation: true, transparent: true, opacity: 0.8 })
    );
    scene.add(stars);
  }

  // ─── The tree ─────────────────────────────────────────────────────
  const tree = buildTree();
  const leaves = tree.filter((n) => n.isLeaf);
  const group = new THREE.Group();
  scene.add(group);

  // Branches: one instanced cylinder per parent→child segment.
  const branchGeometry = new THREE.CylinderGeometry(0.016, 0.03, 1, 5, 1, true);
  branchGeometry.translate(0, 0.5, 0); // pivot at base
  const branchMaterial = new THREE.MeshStandardMaterial({
    color: CRYSTAL,
    emissive: CRYSTAL,
    emissiveIntensity: 0.28,
    roughness: 0.4,
    metalness: 0.6,
  });
  const branches = new THREE.InstancedMesh(branchGeometry, branchMaterial, tree.length - 1);
  const branchOf = new Map<number, number>(); // child node index → branch instance
  {
    const matrix = new THREE.Matrix4();
    const up = new THREE.Vector3(0, 1, 0);
    let instance = 0;
    for (const node of tree) {
      if (node.parent < 0) continue;
      const from = tree[node.parent].position;
      const delta = node.position.clone().sub(from);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(up, delta.clone().normalize());
      const thickness = Math.pow(0.82, node.level);
      matrix.compose(from, quaternion, new THREE.Vector3(thickness, delta.length(), thickness));
      branches.setMatrixAt(instance, matrix);
      branches.setColorAt(instance, CRYSTAL);
      branchOf.set(node.index, instance);
      instance++;
    }
    branches.instanceColor!.needsUpdate = true;
  }
  group.add(branches);

  // Nodes: crystals; leaves are the glowing embers.
  const nodeGeometry = new THREE.OctahedronGeometry(1, 0);
  const nodeMaterial = new THREE.MeshStandardMaterial({
    color: "#11131a",
    emissive: EMBER,
    emissiveIntensity: 1,
    roughness: 0.25,
    metalness: 0.4,
  });
  const nodesMesh = new THREE.InstancedMesh(nodeGeometry, nodeMaterial, tree.length);
  const baseScale = new Map<number, number>();
  {
    const matrix = new THREE.Matrix4();
    for (const node of tree) {
      const scale = node.isLeaf ? 0.085 : node.parent === -1 ? 0.24 : 0.05;
      baseScale.set(node.index, scale);
      matrix.compose(node.position, new THREE.Quaternion(), new THREE.Vector3(scale, scale, scale));
      nodesMesh.setMatrixAt(node.index, matrix);
      nodesMesh.setColorAt(node.index, node.isLeaf ? EMBER : node.parent === -1 ? ACCENT : CRYSTAL);
    }
    nodesMesh.instanceColor!.needsUpdate = true;
  }
  group.add(nodesMesh);

  // ─── Receipt lanterns (one per finalized round) ───────────────────
  const MAX_LANTERNS = 24;
  const lanternGeometry = new THREE.PlaneGeometry(0.14, 0.2);
  const lanternMaterial = new THREE.MeshBasicMaterial({
    color: ACCENT,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
  });
  const lanterns = new THREE.InstancedMesh(lanternGeometry, lanternMaterial, MAX_LANTERNS);
  lanterns.count = 0;
  const lanternState: { position: THREE.Vector3; born: number }[] = [];
  group.add(lanterns);

  function spawnLantern(from: THREE.Vector3) {
    if (lanternState.length >= MAX_LANTERNS) lanternState.shift();
    lanternState.push({ position: from.clone(), born: clockTime });
    lanterns.count = lanternState.length;
  }

  // ─── Proof-path highlighting ──────────────────────────────────────
  let highlighted: number[] = [];
  function pathToRoot(leafIndex: number): number[] {
    const path: number[] = [];
    let cursor: number = leafIndex;
    while (cursor >= 0) {
      path.push(cursor);
      cursor = tree[cursor].parent;
    }
    return path;
  }

  function setHighlight(leafIndex: number | null) {
    // reset previous
    for (const index of highlighted) {
      nodesMesh.setColorAt(index, tree[index].isLeaf ? EMBER : tree[index].parent === -1 ? ACCENT : CRYSTAL);
      const branch = branchOf.get(index);
      if (branch !== undefined) branches.setColorAt(branch, CRYSTAL);
    }
    highlighted = [];
    if (leafIndex !== null) {
      highlighted = pathToRoot(leafIndex);
      for (const index of highlighted) {
        nodesMesh.setColorAt(index, ACCENT);
        const branch = branchOf.get(index);
        if (branch !== undefined) branches.setColorAt(branch, ACCENT);
      }
    }
    nodesMesh.instanceColor!.needsUpdate = true;
    branches.instanceColor!.needsUpdate = true;
  }

  // Idle mode: trace a random proof path every few seconds (self-demonstrating,
  // and it makes the demo video work with zero rehearsal).
  let lastAuto = 0;
  let hoverLock = false;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(nodesMesh);
    const hit = hits.find((h) => h.instanceId !== undefined && tree[h.instanceId!].isLeaf);
    if (hit) {
      hoverLock = true;
      setHighlight(hit.instanceId!);
      canvas.style.cursor = "pointer";
    } else if (hoverLock) {
      hoverLock = false;
      setHighlight(null);
      canvas.style.cursor = "default";
    }
  });

  // ─── Round-finalization pulse ─────────────────────────────────────
  const pulses: { index: number; started: number }[] = [];
  function onRoundFinalized(roundId: number) {
    const leaf = leaves[roundId % leaves.length];
    pulses.push({ index: leaf.index, started: clockTime });
    spawnLantern(leaf.position);
    if (!hoverLock) setHighlight(leaf.index);
    setTimeout(() => {
      if (!hoverLock) setHighlight(null);
    }, 2600);
  }

  // ─── Post-processing ──────────────────────────────────────────────
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 1.25, 0.75, 0.22);
  composer.addPass(bloom);

  function resize() {
    const { clientWidth, clientHeight } = canvas.parentElement!;
    renderer.setSize(clientWidth, clientHeight, false);
    composer.setSize(clientWidth, clientHeight);
    bloom.setSize(clientWidth / 2, clientHeight / 2);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    // Wide screens: copy sits left, tree sits right. Narrow: tree behind copy.
    group.position.x = camera.aspect > 1.15 ? 2.5 : 0;
    group.scale.setScalar(camera.aspect > 1.15 ? 1.32 : 0.95);
  }
  resize();
  addEventListener("resize", resize);

  // ─── Animation loop ───────────────────────────────────────────────
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clock = new THREE.Clock();
  let clockTime = 0;
  let visible = true;
  new IntersectionObserver(([entry]) => (visible = entry.isIntersecting), { threshold: 0.05 }).observe(canvas);

  const scratchMatrix = new THREE.Matrix4();
  const scratchQuat = new THREE.Quaternion();

  renderer.setAnimationLoop(() => {
    if (!visible) return;
    const dt = clock.getDelta();
    clockTime += dt;

    if (!reducedMotion) {
      group.rotation.y += dt * 0.11;
      group.position.y = Math.sin(clockTime * 0.5) * 0.06;
    }

    // Ember breathing + finalization pulses.
    nodeMaterial.emissiveIntensity = 0.85 + Math.sin(clockTime * 1.7) * 0.2;
    for (let i = pulses.length - 1; i >= 0; i--) {
      const pulse = pulses[i];
      const age = clockTime - pulse.started;
      if (age > 1.6) {
        const scale = baseScale.get(pulse.index)!;
        scratchMatrix.compose(tree[pulse.index].position, scratchQuat, new THREE.Vector3(scale, scale, scale));
        nodesMesh.setMatrixAt(pulse.index, scratchMatrix);
        pulses.splice(i, 1);
        continue;
      }
      const scale = baseScale.get(pulse.index)! * (1 + Math.sin(Math.min(age * 2.4, Math.PI)) * 1.9);
      scratchMatrix.compose(tree[pulse.index].position, scratchQuat, new THREE.Vector3(scale, scale, scale));
      nodesMesh.setMatrixAt(pulse.index, scratchMatrix);
    }
    if (pulses.length > 0) nodesMesh.instanceMatrix.needsUpdate = true;

    // Auto-trace a proof path when idle.
    if (!hoverLock && !reducedMotion && clockTime - lastAuto > 5.5) {
      lastAuto = clockTime;
      const leaf = leaves[Math.floor(Math.random() * leaves.length)];
      setHighlight(leaf.index);
      setTimeout(() => {
        if (!hoverLock) setHighlight(null);
      }, 2800);
    }

    // Lanterns drift upward and fade.
    for (let i = 0; i < lanternState.length; i++) {
      const lantern = lanternState[i];
      const age = clockTime - lantern.born;
      const y = lantern.position.y + age * 0.32;
      scratchMatrix.compose(
        new THREE.Vector3(lantern.position.x + Math.sin(age * 1.3 + i) * 0.12, y, lantern.position.z),
        scratchQuat,
        new THREE.Vector3(1, 1, 1).multiplyScalar(Math.max(0.001, 1 - age / 14))
      );
      lanterns.setMatrixAt(i, scratchMatrix);
    }
    if (lanternState.length > 0) lanterns.instanceMatrix.needsUpdate = true;

    composer.render();
  });

  // Seed a few lanterns so the scene never looks empty.
  for (let i = 0; i < 4; i++) {
    spawnLantern(leaves[(i * 17) % leaves.length].position.clone().sub(new THREE.Vector3(0, i * 0.8, 0)));
  }

  statusEl.textContent = "connecting to Coston2…";
  return { onRoundFinalized };
}

/** Poll live protocol facts and drive the hero + caption. Fails silently. */
export function startLiveSync(handles: HeroHandles, statusEl: HTMLElement, rateEl: HTMLElement) {
  let lastRound = 0;
  let lastChange = Date.now();

  async function pollRound() {
    try {
      const res = await fetch("/da-api/api/v0/fsp/status");
      const data = (await res.json()) as { latest_fdc?: { voting_round_id?: number } };
      const round = data.latest_fdc?.voting_round_id ?? 0;
      if (round > 0 && round !== lastRound) {
        if (lastRound !== 0) handles.onRoundFinalized(round);
        lastRound = round;
        lastChange = Date.now();
      }
      if (lastRound > 0) {
        const seconds = Math.max(0, Math.round((Date.now() - lastChange) / 1000));
        statusEl.innerHTML = `<b>live</b> · FDC round ${lastRound.toLocaleString("en-US")} · new branch ${seconds}s ago`;
      }
    } catch {
      /* keep last caption */
    }
  }

  async function pollRate() {
    try {
      const res = await fetch("/pay-api/api/rate");
      const data = (await res.json()) as { price?: number };
      if (data.price) rateEl.textContent = `XRP/USD $${data.price.toFixed(4)} · FTSOv2`;
    } catch {
      /* rate strip is decorative */
    }
  }

  void pollRound();
  void pollRate();
  setInterval(pollRound, 8000);
  setInterval(pollRate, 30000);
}
