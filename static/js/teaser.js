const root = document.getElementById("teaser");
const stage = root.querySelector(".tz-stage");
const hint = root.querySelector(".tz-drag");
const predBtn = root.querySelector(".tz-predbtn");
const azSlider = root.querySelector(".tz-az");
const playBtn = root.querySelector(".tz-play");
const timeSlider = root.querySelector(".tz-time");
const taskBtns = [...root.querySelectorAll(".tasks button")];

let showPreds = true, V = null, DIR = "", vids = {}, ai = 0, ei = 0, cur = null, playing = true, want = null, loadId = 0;

const video = (a, e, p = showPreds) => {
  const k = a + "," + e + "," + p;
  if (!vids[k]) {
    const v = document.createElement("video");
    v.src = `${DIR}az${V.az[a]}_el${V.el[e]}${p ? "" : "_np"}.mp4`;
    v.muted = true; v.loop = true; v.playsInline = true; v.preload = "auto";
    v.setAttribute("aria-hidden", "true");
    stage.prepend(v);
    vids[k] = v;
  }
  return vids[k];
};
const setPlay = (p) => {
  playing = p;
  playBtn.querySelector(".i-pause").toggleAttribute("hidden", !p);
  playBtn.querySelector(".i-play").toggleAttribute("hidden", p);
  playBtn.setAttribute("aria-label", p ? "Pause" : "Play");
};

function go(a, e, force = false) {
  if (!V) return;
  a = Math.max(0, Math.min(V.az.length - 1, a)); e = Math.max(0, Math.min(V.el.length - 1, e));
  if (a === ai && e === ei && !force) return;
  ai = a; ei = e; azSlider.value = ai;
  hint.classList.add("gone");
  const next = video(a, e), t = cur.currentTime;
  want = next;
  const swap = () => {
    if (want !== next) return;
    next.classList.add("on");
    if (cur !== next) { cur.classList.remove("on"); cur.pause(); }
    cur = next;
    if (playing) cur.play().catch(() => {});
  };
  if (Math.abs(next.currentTime - t) < 0.02 && next.readyState >= 2) swap();
  else { next.addEventListener("seeked", swap, { once: true }); next.currentTime = t; }
}

function loadTask(btn) {
  const id = ++loadId;
  taskBtns.forEach((b) => b.setAttribute("aria-pressed", b === btn));
  document.querySelectorAll(".tz-noun").forEach((s) => (s.textContent = btn.dataset.noun));
  document.querySelectorAll(".tz-pts").forEach((s) => (s.textContent = btn.dataset.pts));
  fetch(btn.dataset.dir + "views.json").then((r) => r.json()).then((nv) => {
    if (id !== loadId) return;
    const prevAz = V ? V.az[ai] : null;
    Object.values(vids).forEach((v) => { v.pause(); v.removeAttribute("src"); v.load(); v.remove(); });
    V = nv; DIR = btn.dataset.dir; vids = {}; want = null;
    predBtn.disabled = !V.nopred;
    if (!V.nopred) showPreds = true;
    ai = V.az.indexOf(prevAz) >= 0 ? V.az.indexOf(prevAz) : V.az.indexOf(V.default[0]);
    ei = V.el.indexOf(V.default[1]);
    azSlider.max = V.az.length - 1; azSlider.value = ai;
    mark();
    cur = video(ai, ei); cur.classList.add("on");
    if (playing) cur.play().catch(() => setPlay(false));
    cur.addEventListener("canplaythrough", () => { if (id === loadId) V.az.forEach((_, a) => video(a, ei)); }, { once: true });
  });
}
taskBtns.forEach((b) => b.addEventListener("click", () => { if (b.getAttribute("aria-pressed") !== "true") loadTask(b); }));

const mark = () => {
  stage.classList.toggle("pred", showPreds);
  predBtn.setAttribute("aria-pressed", showPreds);
  predBtn.textContent = showPreds ? "DefFlow predictions \u2713" : "show DefFlow predictions";
};
predBtn.addEventListener("click", () => { if (predBtn.disabled) return; showPreds = !showPreds; mark(); go(ai, ei, true); });
azSlider.addEventListener("input", () => go(+azSlider.value, ei));

let scrubbing = false, wasPlaying = false;
const tick = () => {
  if (!scrubbing && cur && cur.duration) timeSlider.value = Math.round((cur.currentTime / cur.duration) * 1000);
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);
timeSlider.addEventListener("pointerdown", () => { scrubbing = true; wasPlaying = playing; if (playing && cur) { setPlay(false); cur.pause(); } });
timeSlider.addEventListener("input", () => { if (cur && cur.duration) cur.currentTime = (timeSlider.value / 1000) * cur.duration; });
const endScrub = () => { if (!scrubbing) return; scrubbing = false; if (wasPlaying) { setPlay(true); cur.play().catch(() => {}); } };
timeSlider.addEventListener("pointerup", endScrub);
timeSlider.addEventListener("change", endScrub);

playBtn.addEventListener("click", () => {
  setPlay(!playing);
  if (!cur) return;
  if (playing) cur.play().catch(() => {}); else cur.pause();
});

let drag = null;
stage.addEventListener("pointerdown", (ev) => {
  if (ev.target.closest("button")) return;
  drag = { x: ev.clientX, a: ai }; stage.setPointerCapture(ev.pointerId);
});
stage.addEventListener("pointermove", (ev) => {
  if (!drag) return;
  go(drag.a - Math.round((ev.clientX - drag.x) / (stage.clientWidth / 14)), ei);
});
const end = () => { drag = null; };
stage.addEventListener("pointerup", end);
stage.addEventListener("pointercancel", end);

loadTask(taskBtns.find((b) => b.getAttribute("aria-pressed") === "true") || taskBtns[0]);
