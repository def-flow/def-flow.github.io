// DefFlow interactive rollout viewer. three.js comes from a CDN (see the importmap in index.html); no build step.
// Data (written by export_data.py): static/data/rollout.json (layout), rollout.bin, rope.jpg.
// The rope is the Isaac replay's textured rope mesh, rebuilt per frame from the exported spline frames with the
// renderer's own formula: v = centre[ring] + local_x * normal[ring] + local_y * binormal[ring].
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const DATA = "./static/data/";
const N_ROPE_LINES = 48, N_GRIP_LINES = 24;
// cyan -> pink ramps, as in the paper figures (rope / gripper)
const ROPE0 = [0.0, 0.55, 0.9], ROPE1 = [1.0, 0.2, 0.65];
const GRIP0 = [0.0, 0.7, 0.75], GRIP1 = [0.9, 0.05, 1.0];
// "predicted particles": the prediction this many flow steps ahead of the current frame, one cloud per lead.
// 2 flow steps = 1 exported node = 1 recorded frame. Colour runs along the same ramp, further ahead = more solid.
const LEADS = [8, 16, 24, 32], STEPS_PER_NODE = 2;
const LEAD_OPACITY = [0.3, 0.45, 0.65, 1.0];

const root = document.getElementById("flow-viewer");
const canvasBox = root.querySelector(".fv-canvas");
const slider = root.querySelector(".fv-time");
const playBtn = root.querySelector(".fv-play");
const label = root.querySelector(".fv-label");
const modeInputs = root.querySelectorAll('input[name="fv-mode"]');
const params = new URLSearchParams(location.search);

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

async function load() {
  const [meta, buf] = await Promise.all([
    fetch(DATA + "rollout.json").then((r) => r.json()),
    fetch(DATA + "rollout.bin").then((r) => r.arrayBuffer()),
  ]);
  return { meta, buf };
}

function start({ meta, buf }) {
  const F = meta.frames;
  const span = meta.hi.map((v, i) => v - meta.lo[i]);
  // uint16 -> metres
  const dequant = (offset, count) => {
    const q = new Uint16Array(buf, offset, count * 3), out = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) out[i] = meta.lo[i % 3] + (q[i] / 65535) * span[i % 3];
    return out;
  };

  // ---------- scene ----------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd9d9d9);
  const camera = new THREE.PerspectiveCamera(33, 1, 0.01, 20);
  camera.up.set(0, 0, 1); // data is z-up
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  canvasBox.appendChild(renderer.domElement);

  const mid = meta.lo.map((v, i) => (v + meta.hi[i]) / 2);
  const target = new THREE.Vector3(mid[0], mid[1], 0.1);
  const az = (10 * Math.PI) / 180, el = (18 * Math.PI) / 180, dist = 1.35; // the paper figures' view (az 10)
  camera.position.set(
    target.x + dist * Math.cos(el) * Math.cos(az),
    target.y + dist * Math.cos(el) * Math.sin(az),
    target.z + dist * Math.sin(el));
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.02; // stay above the table
  controls.update();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 2.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(1.5, -1.0, 2.5);
  scene.add(sun);

  // table top (dark, as in the renders)
  const table = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), // large enough that no edge shows in the view
    new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.55, metalness: 0.0 }));
  table.position.set(0.45, 0.2, -0.001);
  scene.add(table);

  // ---------- rope: textured mesh, vertices rebuilt per frame ----------
  const R = meta.rope;
  const rc = dequant(R.centers, F * R.rings);
  const rn = new Int16Array(buf, R.normals, F * R.rings * 3);
  const rb = new Int16Array(buf, R.binormals, F * R.rings * 3);
  const ring = new Uint16Array(buf, R.ring, R.nv);
  const local = new Float32Array(buf, R.local, R.nv * 2);
  const ropeGeo = new THREE.BufferGeometry();
  const ropePos = new Float32Array(R.nv * 3);
  ropeGeo.setAttribute("position", new THREE.BufferAttribute(ropePos, 3));
  ropeGeo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(buf, R.uv, R.nv * 2), 2));
  ropeGeo.setIndex(new THREE.BufferAttribute(new Uint16Array(buf, R.faces, R.nf * 3), 1));
  const tex = new THREE.TextureLoader().load(DATA + R.texture);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  const rope = new THREE.Mesh(ropeGeo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.0 }));
  rope.frustumCulled = false;
  scene.add(rope);
  function setRope(f) {
    const o = f * R.rings * 3, s = 1 / 32767;
    for (let i = 0; i < R.nv; i++) {
      const j = o + ring[i] * 3, lx = local[2 * i], ly = local[2 * i + 1];
      ropePos[3 * i] = rc[j] + (lx * rn[j] + ly * rb[j]) * s;
      ropePos[3 * i + 1] = rc[j + 1] + (lx * rn[j + 1] + ly * rb[j + 1]) * s;
      ropePos[3 * i + 2] = rc[j + 2] + (lx * rn[j + 2] + ly * rb[j + 2]) * s;
    }
    ropeGeo.attributes.position.needsUpdate = true;
    ropeGeo.computeVertexNormals();
  }

  // ---------- goal shape ----------
  const goalGeo = new THREE.BufferGeometry();
  goalGeo.setAttribute("position", new THREE.BufferAttribute(dequant(meta.goal, meta.goal_n), 3));
  const goal = new THREE.Points(goalGeo, new THREE.PointsMaterial({ color: 0x6ee05f, size: 0.006, transparent: true, opacity: 0.8 }));
  scene.add(goal);

  // ---------- robot: visual submeshes, posed per frame ----------
  const poses = new Float32Array(buf, meta.poses, F * meta.n_links * 12);
  const links = meta.links.map((l) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(buf, l.verts, l.nv * 3), 3));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(buf, l.faces, l.nf * 3), 1));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: new THREE.Color(...l.rgb), roughness: 0.6, metalness: 0.0 }));
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { mesh, link: l.link };
  });
  function setRobot(f) {
    for (const l of links) {
      const p = poses.subarray((f * meta.n_links + l.link) * 12, (f * meta.n_links + l.link) * 12 + 12);
      l.mesh.matrix.set(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9], p[10], p[11], 0, 0, 0, 1); // row-major
      l.mesh.matrixWorldNeedsUpdate = true;
    }
  }

  // ---------- predictions: flow lines + predicted particles ----------
  const preds = meta.preds.map((p) => {
    const path = dequant(p.path, p.nodes * p.n); // nodes x n x 3
    const robot = new Uint8Array(buf, p.robot, p.n);
    const idxR = [], idxG = [];
    for (let i = 0; i < p.n; i++) (robot[i] ? idxG : idxR).push(i);
    const pick = (arr, k) => Array.from({ length: Math.min(k, arr.length) },
      (_, j) => arr[Math.round((j * (arr.length - 1)) / Math.max(k - 1, 1))]);
    const sel = [...pick(idxR, N_ROPE_LINES), ...pick(idxG, N_GRIP_LINES)];
    // line segments node k -> k+1 for every selected point, coloured along the horizon
    const segs = sel.length * (p.nodes - 1);
    const pos = new Float32Array(segs * 6), col = new Float32Array(segs * 6);
    let o = 0;
    for (const i of sel) {
      const [c0, c1] = robot[i] ? [GRIP0, GRIP1] : [ROPE0, ROPE1];
      for (let k = 0; k < p.nodes - 1; k++)
        for (let e = 0; e < 2; e++) {
          const src = 3 * ((k + e) * p.n + i);
          pos.set(path.subarray(src, src + 3), o);
          col.set(mix(c0, c1, (k + e) / (p.nodes - 1)), o);
          o += 3;
        }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    lg.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true }));
    lines.visible = false;
    lines.frustumCulled = false;
    scene.add(lines);
    // predicted particles: one cloud per lead (all points at one future node), coloured rope / gripper along the ramp
    const clouds = LEADS.map((lead, li) => {
      const t = (li + 1) / LEADS.length;
      const cr = mix(ROPE0, ROPE1, t), cg = mix(GRIP0, GRIP1, t);
      const pg = new THREE.BufferGeometry();
      pg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(p.n * 3), 3));
      const pc = new Float32Array(p.n * 3);
      for (let i = 0; i < p.n; i++) pc.set(robot[i] ? cg : cr, 3 * i);
      pg.setAttribute("color", new THREE.BufferAttribute(pc, 3));
      const solid = LEAD_OPACITY[li] >= 1;
      const cloud = new THREE.Points(pg, new THREE.PointsMaterial({
        size: 0.008, vertexColors: true, transparent: !solid, opacity: LEAD_OPACITY[li], depthWrite: solid }));
      cloud.visible = false;
      cloud.frustumCulled = false;
      cloud.renderOrder = li; // faint near-future clouds first, the solid +32 cloud last
      scene.add(cloud);
      return { cloud, nodesAhead: lead / STEPS_PER_NODE };
    });
    return { frame: p.frame, nodes: p.nodes, n: p.n, path, lines, clouds };
  });

  // ---------- state ----------
  let frame = 0, playing = false, mode = "lines", last = 0;
  slider.max = F - 1;

  function show(f) {
    frame = f;
    setRope(f);
    setRobot(f);
    // active prediction: the latest one made at or before this frame
    let active = -1;
    preds.forEach((p, i) => { if (p.frame <= f) active = i; });
    preds.forEach((p, i) => {
      const on = i === active;
      p.lines.visible = on && mode === "lines";
      for (const c of p.clouds) {
        const k = f - p.frame + c.nodesAhead;          // one flow node per recorded frame
        c.cloud.visible = on && mode === "particles" && k <= p.nodes - 1; // hidden once past the prediction's horizon
        if (c.cloud.visible) {
          c.cloud.geometry.attributes.position.array.set(p.path.subarray(k * p.n * 3, (k + 1) * p.n * 3));
          c.cloud.geometry.attributes.position.needsUpdate = true;
        }
      }
    });
    slider.value = f;
    label.textContent = active < 0
      ? `frame ${f} / ${F - 1} · before the first prediction`
      : `frame ${f} / ${F - 1} · prediction ${active + 1} of ${preds.length}`;
  }

  slider.addEventListener("input", () => { playing = false; playBtn.textContent = "play"; show(+slider.value); });
  playBtn.addEventListener("click", () => {
    playing = !playing;
    if (playing && frame >= F - 1) show(0);
    playBtn.textContent = playing ? "pause" : "play";
  });
  modeInputs.forEach((r) => r.addEventListener("change", () => { if (r.checked) { mode = r.value; show(frame); } }));

  function resize() {
    const w = canvasBox.clientWidth, h = Math.round(w * 0.6);
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  // optional: index.html?frame=120&mode=particles opens at that frame / mode
  const m0 = params.get("mode");
  if (["lines", "particles", "none"].includes(m0)) { mode = m0; modeInputs.forEach((r) => (r.checked = r.value === m0)); }
  show(Math.min(Math.max(+(params.get("frame") ?? 0) || 0, 0), F - 1));

  renderer.setAnimationLoop((t) => {
    if (playing && t - last > 50) { // ~20 frames per second
      last = t;
      if (frame >= F - 1) { playing = false; playBtn.textContent = "play"; } else show(frame + 1);
    }
    controls.update();
    renderer.render(scene, camera);
  });
  renderer.render(scene, camera); // first frame right away
  root.classList.add("fv-ready");
}

// top-level await: the page's load event waits until the viewer has its data and first frame
try {
  start(await load());
} catch (e) {
  canvasBox.textContent = "Could not load the 3D viewer data.";
  console.error(e);
}
