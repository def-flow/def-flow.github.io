// Light / dark toggle. Without a choice the page follows the system setting (CSS prefers-color-scheme).
const html = document.documentElement;
const isDark = () => html.dataset.theme ? html.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
document.querySelector(".theme").addEventListener("click", () => {
  const t = isDark() ? "light" : "dark";
  html.dataset.theme = t;
  try { localStorage.setItem("theme", t); } catch (e) {}
});
