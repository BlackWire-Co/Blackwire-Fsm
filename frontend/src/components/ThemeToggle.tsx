import { useState } from "react";
import { getStoredTheme, applyTheme, Theme } from "../theme";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme());

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  return (
    <button className="btn ghost theme-toggle" onClick={toggle}>
      {theme === "dark" ? "☀ Light Mode" : "☾ Dark Mode"}
    </button>
  );
}
