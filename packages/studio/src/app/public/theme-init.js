(() => {
  let stored = null;
  try {
    stored = window.localStorage.getItem("verbatra-studio-theme");
  } catch {}
  const theme =
    stored === "light" || stored === "dark"
      ? stored
      : window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";
  document.documentElement.dataset.theme = theme;
})();
