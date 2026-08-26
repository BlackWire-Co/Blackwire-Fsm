export type Theme = "dark" | "light";
const KEY = "fsm_theme";

export function getStoredTheme(): Theme {
  const stored = localStorage.getItem(KEY);
  return stored === "light" ? "light" : "dark";
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(KEY, theme);
}

// Called once before the app renders, so there's no flash of the wrong theme.
export function initTheme() {
  applyTheme(getStoredTheme());
}
