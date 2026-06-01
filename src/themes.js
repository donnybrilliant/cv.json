// Color themes for the CV. Each theme is a set of color tokens applied as CSS
// custom properties on the CV root, so components reference them via
// `var(--cv-*)` (e.g. text-[var(--cv-icon)]). Stored per-CV in doc.theme.
export const THEMES = {
  blue: { label: "Blue", bg: "#eff6ff", text: "#1e3a8a", border: "#bfdbfe", icon: "#2563eb", accent: "#2563eb", ring: "#60a5fa", ringSoft: "#bfdbfe" },
  slate: { label: "Slate", bg: "#f8fafc", text: "#0f172a", border: "#e2e8f0", icon: "#475569", accent: "#334155", ring: "#94a3b8", ringSoft: "#cbd5e1" },
  emerald: { label: "Emerald", bg: "#ecfdf5", text: "#064e3b", border: "#a7f3d0", icon: "#059669", accent: "#059669", ring: "#34d399", ringSoft: "#a7f3d0" },
  cyan: { label: "Cyan", bg: "#ecfeff", text: "#164e63", border: "#a5f3fc", icon: "#0891b2", accent: "#0891b2", ring: "#22d3ee", ringSoft: "#a5f3fc" },
  rose: { label: "Rose", bg: "#fff1f2", text: "#881337", border: "#fecdd3", icon: "#e11d48", accent: "#e11d48", ring: "#fb7185", ringSoft: "#fecdd3" },
  violet: { label: "Violet", bg: "#f5f3ff", text: "#4c1d95", border: "#ddd6fe", icon: "#7c3aed", accent: "#7c3aed", ring: "#a78bfa", ringSoft: "#ddd6fe" },
  amber: { label: "Amber", bg: "#fffbeb", text: "#78350f", border: "#fde68a", icon: "#d97706", accent: "#b45309", ring: "#fbbf24", ringSoft: "#fde68a" },
};

export const THEME_KEYS = Object.keys(THEMES);
export const DEFAULT_THEME = "blue";
export const CUSTOM_THEME = "custom";

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
  return (
    "#" +
    [r, g, b]
      .map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, "0"))
      .join("")
  );
}

function mix(a, b, weight) {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * weight, ag + (bg - ag) * weight, ab + (bb - ab) * weight);
}

// Build a full token set from a single accent hex (for the custom color picker).
export function buildCustomTheme(accent) {
  const icon = accent.startsWith("#") ? accent : `#${accent}`;
  return {
    label: "Custom",
    bg: mix(icon, "#ffffff", 0.92),
    text: mix(icon, "#000000", 0.72),
    border: mix(icon, "#ffffff", 0.65),
    icon,
    accent: icon,
    ring: mix(icon, "#ffffff", 0.35),
    ringSoft: mix(icon, "#ffffff", 0.65),
  };
}

export function resolveTheme(theme) {
  if (!theme) return THEMES[DEFAULT_THEME];
  if (theme.color === CUSTOM_THEME && theme.custom) return theme.custom;
  if (theme.color === "teal") return THEMES.cyan; // legacy saved docs
  return THEMES[theme.color] || THEMES[DEFAULT_THEME];
}

export function themeIconColor(theme) {
  return resolveTheme(typeof theme === "string" ? { color: theme } : theme).icon;
}

// Map doc.theme (or a preset key) to CSS variables consumed across the CV.
export function themeVars(theme) {
  const t =
    typeof theme === "string"
      ? THEMES[theme === "teal" ? "cyan" : theme] || THEMES[DEFAULT_THEME]
      : resolveTheme(theme);
  return {
    "--cv-bg": t.bg,
    "--cv-text": t.text,
    "--cv-border": t.border,
    "--cv-icon": t.icon,
    "--cv-accent": t.accent,
    "--cv-ring": t.ring,
    "--cv-ring-soft": t.ringSoft,
  };
}
