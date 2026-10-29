(() => {
"use strict";
const arch = document.getElementById("arch");
if (!arch) return;
const STEPS = ["in", "enc", "emb", "ptv3", "mlp", "out", "ik"];
const INFO = {
  in: ["Input", "scene points (robot included) and the goal point cloud, in one shared 3D frame"],
  enc: ["Serialize & encode", "points are serialized and encoded into per-point tokens"],
  emb: ["Type embeddings", "learned embeddings mark scene, goal and time step"],
  ptv3: ["PTv3 backbone", "a point transformer U-Net gives a feature for every point"],
  mlp: ["Per-point MLP", "maps the feature of each current robot and scene point to its future displacements"],
  out: ["Scene flow  N × T × 3", "where every point of the robot and the object will move over the next T steps"],
  ik: ["Robot actions", "the predicted robot points are turned into joint commands with inverse kinematics"],
};
const DUR = { in: 1900, out: 2900, ik: 2200 };
const title = arch.querySelector(".fi-t"), desc = arch.querySelector(".fi-d");
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

let i = 0, timer = null;
function show(k, auto) {
  arch.classList.add("stepping");
  arch.querySelectorAll(".on").forEach((e) => e.classList.remove("on"));
  arch.querySelectorAll(`[data-k="${k}"]`).forEach((e) => e.classList.add("on"));
  if (auto) arch.querySelectorAll(`.pulse[data-step="${k}"]`).forEach((p) => { p.classList.remove("go"); void p.getBoundingClientRect(); p.classList.add("go"); });
  title.textContent = INFO[k][0]; desc.textContent = INFO[k][1];
}
function tick() { show(STEPS[i], true); timer = setTimeout(() => { i = (i + 1) % STEPS.length; tick(); }, DUR[STEPS[i]] || 1300); }
const stop = () => { clearTimeout(timer); timer = null; };

let visible = false;
new IntersectionObserver(([e]) => {
  visible = e.isIntersecting; if (still) return;
  if (visible && !timer && !arch.matches(":hover")) tick(); else if (!visible) stop();
}, { threshold: 0.3 }).observe(arch);

arch.querySelectorAll("[data-k]").forEach((n) => {
  const pick = () => { stop(); i = STEPS.indexOf(n.dataset.k); show(n.dataset.k, false); };
  n.addEventListener("mouseenter", pick); n.addEventListener("focus", pick);
});
let resume = null;
arch.addEventListener("mouseleave", () => { if (still) return; clearTimeout(resume); resume = setTimeout(() => { if (visible && !timer) tick(); }, 1500); });
arch.addEventListener("mouseenter", () => clearTimeout(resume));
if (still) { const svg = arch.querySelector("svg.arch"); if (svg && svg.pauseAnimations) svg.pauseAnimations(); }
show(still ? "out" : "in", false);
})();
