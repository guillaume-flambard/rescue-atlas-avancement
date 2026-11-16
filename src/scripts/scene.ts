// La carte du projet en 3D, en Three.js (méthode : skills threejs-fundamentals, threejs-geometry,
// threejs-interaction). Au centre, l'anneau de l'objectif du moment ; autour, un groupe par chantier,
// avec ses tâches en boules et un anneau qui se remplit à mesure qu'elles sont faites.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { STATUS, cleanEpic, done, pct, statusOf, type Issue, type Project } from "../lib/model";

interface Options {
  project: Project;
  milestone: number | null;
  inFocus: (i: Issue) => boolean;
  reduceMotion: boolean;
  onOpen: (i: Issue | null) => void;
}

const INK = 0x1b2747, TRACK = 0xd9d7e3, ACCENT = 0xe83e1b;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** n points sur une sphère, régulièrement espacés (spirale de Fibonacci). */
function fibonacci(n: number, radius: number): THREE.Vector3[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: n }, (_, k) => {
    const y = n === 1 ? 0 : 1 - (2 * k) / (n - 1);
    const r = Math.sqrt(1 - y * y);
    return new THREE.Vector3(Math.cos(k * golden) * r, y, Math.sin(k * golden) * r).multiplyScalar(radius);
  });
}

/** Un anneau de progression : la piste entière en clair, la part faite en marine par-dessus. */
function progressRing(radius: number, tube: number, ratio: number, color: number): THREE.Group {
  const g = new THREE.Group();
  const track = new THREE.Mesh(new THREE.TorusGeometry(radius, tube * 0.6, 12, 96), new THREE.MeshStandardMaterial({ color: TRACK, roughness: 0.9 }));
  g.add(track);
  if (ratio > 0) {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 16, 96, Math.PI * 2 * Math.min(ratio, 1)), new THREE.MeshStandardMaterial({ color, roughness: 0.4 }));
    arc.rotation.z = Math.PI / 2; // la part faite part de midi
    g.add(arc);
  }
  g.rotation.x = -Math.PI / 2; // à plat, sous le groupe
  return g;
}

export function mount(el: HTMLElement, { project, milestone, inFocus, reduceMotion, onOpen }: Options) {
  const w = () => el.clientWidth, h = () => el.clientHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(w(), h());
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  el.appendChild(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.setSize(w(), h());
  Object.assign(labels.domElement.style, { position: "absolute", inset: "0", pointerEvents: "none" });
  el.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, w() / h(), 1, 3000);
  camera.position.set(0, 170, 300);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xdcd9e6, 2.1));
  const sun = new THREE.DirectionalLight(0xfff4ec, 2.3);
  sun.position.set(80, 200, 100);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -140, right: 140, top: 140, bottom: -140, near: 10, far: 600 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(150, 96), new THREE.ShadowMaterial({ color: 0x1b2747, opacity: 0.08 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -22;
  ground.receiveShadow = true;
  scene.add(ground);

  const tag = (html: string, cls = "tree-label") => {
    const div = document.createElement("div");
    div.className = cls;
    div.innerHTML = html;
    return new CSS2DObject(div);
  };

  // Au centre : l'objectif du moment
  const ms = project.data.milestones.find((m) => m.number === milestone);
  if (ms) {
    const list = project.inMilestone(ms.number);
    const ring = progressRing(16, 1.6, done(list) / (list.length || 1), ACCENT);
    scene.add(ring);
    const l = tag(`<b>${esc(ms.title)}</b><span>${done(list)} sur ${list.length} faites · ${pct(done(list), list.length)} %</span>`, "tree-label tree-root");
    l.position.set(0, 0, 0);
    scene.add(l);
  }

  const sphere = new THREE.SphereGeometry(1, 24, 16);
  const pickables: THREE.Mesh[] = [];
  const leaves: { mesh: THREE.Mesh; issue: Issue; base: number }[] = [];
  const pos = new Map<number, THREE.Vector3>();
  const spokes: number[] = [];

  const groups = project.groups();
  const ringRadius = 78;
  groups.forEach((g, gi) => {
    const angle = (gi / groups.length) * Math.PI * 2;
    const center = new THREE.Vector3(Math.cos(angle) * ringRadius, 0, Math.sin(angle) * ringRadius);
    const radius = 7 + Math.sqrt(g.items.length) * 2.6;

    // le moyeu du chantier
    if (g.epic) {
      const hub = new THREE.Mesh(sphere, new THREE.MeshStandardMaterial({ color: INK, roughness: 0.5 }));
      hub.scale.setScalar(3);
      hub.position.copy(center);
      hub.castShadow = true;
      hub.userData.issue = g.epic;
      scene.add(hub);
      pickables.push(hub);
    }
    const ring = progressRing(radius + 4, 0.9, done(g.items) / (g.items.length || 1), INK);
    ring.position.copy(center).setY(-radius - 2);
    scene.add(ring);
    const l = tag(`<b>${esc(g.name)}</b><span>${g.items.length ? `${done(g.items)} sur ${g.items.length} faites` : "pas encore découpé"}</span>`);
    l.position.copy(center).setY(-radius - 7);
    scene.add(l);

    fibonacci(g.items.length, radius).forEach((p, k) => pos.set(g.items[k].number, p.add(center)));
    for (const issue of g.items) {
      const p = pos.get(issue.number)!;
      const from = (issue.parent && pos.get(issue.parent)) || center;
      spokes.push(from.x, from.y, from.z, p.x, p.y, p.z);
      const leaf = new THREE.Mesh(sphere, new THREE.MeshStandardMaterial({ color: STATUS[statusOf(issue)].hex, roughness: 0.45, transparent: true }));
      const base = ({ XS: 1.1, S: 1.3, M: 1.6, L: 2, XL: 2.4 } as Record<string, number>)[issue.size ?? ""] ?? 1.35;
      leaf.scale.setScalar(base);
      leaf.position.copy(p);
      leaf.castShadow = true;
      leaf.userData.issue = issue;
      scene.add(leaf);
      pickables.push(leaf);
      leaves.push({ mesh: leaf, issue, base });
    }
  });

  if (spokes.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(spokes, 3));
    scene.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x8a90a8, transparent: true, opacity: 0.35 })));
  }

  // « débloque » : pointillé orange de la tâche qui bloque vers celle qu'elle libère
  const dash: number[] = [];
  for (const g of groups) for (const issue of g.items) for (const b of issue.blockedBy) {
    const a = pos.get(b), c = pos.get(issue.number);
    if (a && c) dash.push(a.x, a.y, a.z, c.x, c.y, c.z);
  }
  if (dash.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(dash, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineDashedMaterial({ color: ACCENT, dashSize: 1.4, gapSize: 1 }));
    lines.computeLineDistances();
    scene.add(lines);
  }

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);
  controls.minDistance = 60;
  controls.maxDistance = 520;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.autoRotate = !reduceMotion;
  controls.autoRotateSpeed = 0.5;
  controls.addEventListener("start", () => { controls.autoRotate = false; });

  // survol et clic (un clic, pas la fin d'un glisser)
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const tip = document.createElement("div");
  tip.className = "tree-tip";
  tip.hidden = true;
  el.appendChild(tip);
  const pick = (event: PointerEvent): THREE.Mesh | null => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return (raycaster.intersectObjects(pickables, false)[0]?.object as THREE.Mesh) ?? null;
  };
  const canvas = renderer.domElement;
  canvas.addEventListener("pointermove", (event) => {
    const obj = pick(event);
    canvas.style.cursor = obj ? "pointer" : "grab";
    if (!obj) { tip.hidden = true; return; }
    const i = obj.userData.issue as Issue;
    const s = STATUS[statusOf(i)];
    tip.innerHTML = `#${i.number} ${esc(cleanEpic(i.title))}<br><span style="color:${i.type === "Epic" ? "#1B2747" : s.text}">${i.type === "Epic" ? "Chantier" : s.label}</span>`;
    const r = el.getBoundingClientRect();
    tip.style.left = `${Math.min(event.clientX - r.left + 14, r.width - 270)}px`;
    tip.style.top = `${event.clientY - r.top + 14}px`;
    tip.hidden = false;
  });
  canvas.addEventListener("pointerleave", () => { tip.hidden = true; });
  let downAt: [number, number] | null = null;
  canvas.addEventListener("pointerdown", (event) => { downAt = [event.clientX, event.clientY]; });
  canvas.addEventListener("pointerup", (event) => {
    if (!downAt || Math.hypot(event.clientX - downAt[0], event.clientY - downAt[1]) > 5) return;
    const obj = pick(event);
    onOpen(obj ? (obj.userData.issue as Issue) : null);
    if (obj) controls.autoRotate = false;
  });

  function setFocus() {
    for (const { mesh, issue } of leaves) {
      const on = inFocus(issue);
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.opacity = on ? 1 : 0.12;
      mat.depthWrite = on;
      mesh.castShadow = on;
    }
  }
  setFocus();

  const timer = new THREE.Timer();
  timer.connect(document);
  renderer.setAnimationLoop(() => {
    timer.update();
    const t = timer.getElapsed();
    // les tâches en cours respirent : on voit où ça travaille
    if (!reduceMotion) for (const { mesh, issue, base } of leaves) {
      const st = statusOf(issue);
      if (st === "In progress" || st === "In review") mesh.scale.setScalar(base * (1 + 0.18 * Math.sin(t * 2.4 + issue.number)));
    }
    controls.update(timer.getDelta());
    renderer.render(scene, camera);
    labels.render(scene, camera);
  });

  const ro = new ResizeObserver(() => {
    if (!w() || !h()) return;
    camera.aspect = w() / h();
    camera.updateProjectionMatrix();
    renderer.setSize(w(), h());
    labels.setSize(w(), h());
  });
  ro.observe(el);

  return {
    setFocus,
    destroy() {
      ro.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      timer.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry && m.geometry !== sphere) m.geometry.dispose();
        if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
      });
      sphere.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      el.innerHTML = "";
    },
  };
}
