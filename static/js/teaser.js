// Teaser: one rollout rendered from several viewpoints, one video per viewpoint.
// Plain HTML5 video only (no 3D in the browser). The view slider, or dragging sideways over the video, switches to
// another viewpoint at the same moment of the rollout (one camera height). The "Predictions" switch changes to the
// same view without the predicted points and flow lines (same timeline).
// Views: static/videos/teaser/views.json, videos az<a>_el<e>.mp4 and az<a>_el<e>_np.mp4 (without predictions).
const DIR = "./static/videos/teaser/";
const root = document.getElementById("teaser");
const stage = root.querySelector(".tz-stage");
const hint = root.querySelector(".tz-drag");
const chip = root.querySelector(".chip");
const azSlider = root.querySelector(".tz-az");
const playBtn = root.querySelector(".tz-play");
const timeSlider = root.querySelector(".tz-time");
const predToggle = document.querySelector(".tz-preds");

fetch(DIR + "views.json").then((r) => r.json()).then((V) => {
  const vids = {}; // "ai,ei,p" -> <video>
  if (!V.nopred) document.querySelector(".tz-preds-wrap").style.display = "none";
  const video = (ai, ei, p = predToggle.checked) => {
    const k = ai + "," + ei + "," + p;
    if (!vids[k]) {
      const v = document.createElement("video");
      v.src = `${DIR}az${V.az[ai]}_el${V.el[ei]}${p ? "" : "_np"}.mp4`;
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = "auto";
      v.setAttribute("aria-hidden", "true");
      stage.prepend(v);   // under the chip and the hint
      vids[k] = v;
    }
    return vids[k];
  };

  let ai = V.az.indexOf(V.default[0]), ei = V.el.indexOf(V.default[1]);
  let cur = video(ai, ei), playing = true, want = null;
  cur.classList.add("on");
  azSlider.max = V.az.length - 1;
  const sync = () => { azSlider.value = ai; };
  sync();
  const setPlay = (p) => {
    playing = p;
    playBtn.querySelector(".i-pause").toggleAttribute("hidden", !p);
    playBtn.querySelector(".i-play").toggleAttribute("hidden", p);
    playBtn.setAttribute("aria-label", p ? "Pause" : "Play");
  };
  cur.play().catch(() => setPlay(false));
  // then load every view of this set, so switching is quick (the other set loads when first switched to)
  cur.addEventListener("canplaythrough", () => V.az.forEach((_, a) => video(a, ei)), { once: true });

  function go(a, e, force = false) {
    a = Math.max(0, Math.min(V.az.length - 1, a)); e = Math.max(0, Math.min(V.el.length - 1, e));
    if (a === ai && e === ei && !force) return;
    ai = a; ei = e; sync();
    hint.classList.add("gone");
    const next = video(a, e), t = cur.currentTime;
    want = next;
    const swap = () => {
      if (want !== next) return; // a later move overrides this one
      next.classList.add("on");
      if (cur !== next) { cur.classList.remove("on"); cur.pause(); }
      cur = next;
      if (playing) cur.play().catch(() => {});
    };
    if (Math.abs(next.currentTime - t) < 0.02 && next.readyState >= 2) swap();
    else { next.addEventListener("seeked", swap, { once: true }); next.currentTime = t; }
  }

  // the tile follows the figure style: amber border + pale amber chip when it shows predictions
  const mark = () => { stage.classList.toggle("pred", predToggle.checked); chip.textContent = predToggle.checked ? "DefFlow predictions" : "rollout"; };
  predToggle.addEventListener("change", () => { mark(); go(ai, ei, true); });
  azSlider.addEventListener("input", () => go(+azSlider.value, ei));
  // time slider: follows the video; dragging it scrubs (the video pauses while held, then resumes if it was playing)
  let scrubbing = false, wasPlaying = false;
  const tick = () => {
    if (!scrubbing && cur.duration) timeSlider.value = Math.round((cur.currentTime / cur.duration) * 1000);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  timeSlider.addEventListener("pointerdown", () => { scrubbing = true; wasPlaying = playing; if (playing) { setPlay(false); cur.pause(); } });
  timeSlider.addEventListener("input", () => { if (cur.duration) cur.currentTime = (timeSlider.value / 1000) * cur.duration; });
  const endScrub = () => { if (!scrubbing) return; scrubbing = false; if (wasPlaying) { setPlay(true); cur.play().catch(() => {}); } };
  timeSlider.addEventListener("pointerup", endScrub);
  timeSlider.addEventListener("change", endScrub);

  playBtn.addEventListener("click", () => {
    setPlay(!playing);
    if (playing) cur.play().catch(() => {}); else cur.pause();
  });

  // drag sideways over the video to turn the view
  let drag = null;
  stage.addEventListener("pointerdown", (ev) => { drag = { x: ev.clientX, a: ai }; stage.setPointerCapture(ev.pointerId); });
  stage.addEventListener("pointermove", (ev) => {
    if (!drag) return;
    go(drag.a - Math.round((ev.clientX - drag.x) / (stage.clientWidth / 14)), ei);
  });
  const end = () => { drag = null; };
  stage.addEventListener("pointerup", end);
  stage.addEventListener("pointercancel", end);
});
