const html = document.documentElement;
const isDark = () => html.dataset.theme === "dark";
document.querySelector(".theme").addEventListener("click", () => {
  const t = isDark() ? "light" : "dark";
  html.dataset.theme = t;
  try { localStorage.setItem("theme", t); } catch (e) {}
});
