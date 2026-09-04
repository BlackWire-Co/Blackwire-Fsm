const STYLE_ID = "custom-css-override";

// Writes (or replaces) a single <style> tag holding the admin's pasted
// override CSS. Called both on app load (loadCustomCss) and immediately
// after Settings saves a change, so the effect is visible without needing
// a full page reload.
export function applyCustomCss(css: string) {
  let tag = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!tag) {
    tag = document.createElement("style");
    tag.id = STYLE_ID;
    document.head.appendChild(tag);
  }
  tag.textContent = css || "";
}

// Fetches the current override from the backend and applies it. Safe to
// call before we know whether the user is authenticated - a failed
// request (e.g. not logged in yet) just leaves things as they are instead
// of throwing.
export async function loadCustomCss(api: (path: string) => Promise<any>) {
  try {
    const { customCss } = await api("/theme");
    applyCustomCss(customCss);
  } catch {
    // Not logged in, offline, etc. - nothing to apply yet.
  }
}
