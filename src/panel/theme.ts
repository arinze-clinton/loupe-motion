/**
 * Loupe panel theme tokens.
 *
 * Every value is a CSS custom property with a baked-in fallback, so a host
 * can retheme the panel by setting `--loupe-*` on any ancestor, and the panel
 * still looks right with nothing set. Extracted from LoupePanel so the panel's
 * sub-components (icons, overlays, controls) can share them without importing
 * the whole panel module.
 */
export const FONT = 'var(--loupe-font, system-ui, -apple-system, sans-serif)';
export const ACCENT = 'var(--loupe-accent, #3A97F9)';
export const ACCENT_SOFT = 'var(--loupe-accent-soft, rgba(58, 151, 249, 0.28))';
export const ACCENT_GLOW = 'var(--loupe-accent-glow, rgba(58, 151, 249, 0.6))';
export const ACCENT_RING = 'var(--loupe-accent-ring, rgba(58, 151, 249, 0.18))';
export const ACCENT_HALO = 'var(--loupe-accent-halo, rgba(58, 151, 249, 0.35))';
export const ACCENT_TINT = 'var(--loupe-accent-tint, rgba(58, 151, 249, 0.7))';
export const PANEL_BG = 'var(--loupe-panel-bg, rgba(18, 20, 25, 0.92))';
export const PANEL_FG = 'var(--loupe-panel-fg, #E8EAEE)';
export const PANEL_MUTED = 'var(--loupe-panel-muted, #9BA3AF)';
export const PANEL_BORDER = 'var(--loupe-panel-border, rgba(255, 255, 255, 0.08))';
export const PANEL_HIGHLIGHT = 'var(--loupe-panel-highlight, #EAF3FF)';
