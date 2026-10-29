const clips = [...document.querySelectorAll("video.clip")];
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const v = e.target;
      if (e.isIntersecting) { v.preload = "auto"; v.play().catch(() => {}); }
      else v.pause();
    }
  }, { rootMargin: "600px 0px", threshold: 0.01 });
  clips.forEach((v) => io.observe(v));
} else {
  clips.forEach((v) => { v.preload = "auto"; v.autoplay = true; v.play().catch(() => {}); });
}
