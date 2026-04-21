import { useEffect, useRef, useState } from 'react';
import { useAnnotations } from './AnnotationsProvider';
import { elementToSelector } from './selector';
import { fiberInfo } from './fiber';

/**
 * AnnotationOverlay — full-viewport interaction layer used while picker mode
 * or a draft is active. Two jobs:
 *   1. Element picker — DevTools-style highlight on hover, click to pick.
 *   2. Region drawer — drag a rectangle, mouseup commits.
 *
 * When a draft exists, renders the inline editor at the picked element /
 * region's position.
 */

const FONT = 'var(--loupe-font, system-ui, -apple-system, sans-serif)';
const ACCENT = 'var(--loupe-accent, #3A97F9)';
const ACCENT_BG = 'var(--loupe-accent-bg, rgba(58, 151, 249, 0.12))';
const REGION_ACCENT = 'var(--loupe-region-accent, #A855F7)';
const REGION_BG = 'var(--loupe-region-bg, rgba(168, 85, 247, 0.12))';
const PANEL_BG = 'var(--loupe-panel-bg, #121419)';
const PANEL_FG = 'var(--loupe-panel-fg, #E8EAEE)';
const PANEL_MUTED = 'var(--loupe-panel-muted, #9BA3AF)';
const PANEL_BORDER = 'var(--loupe-panel-border, rgba(255,255,255,0.12))';

export function AnnotationOverlay() {
  const { pickerMode, draft, pickElement, pickRegion, cancelDraft } = useAnnotations();

  const active = pickerMode !== 'off' || draft !== null;
  if (!active) return null;
  return (
    <>
      {pickerMode === 'element' && !draft && <ElementPicker onPick={pickElement} onCancel={cancelDraft} />}
      {pickerMode === 'region' && !draft && <RegionPicker onPick={pickRegion} onCancel={cancelDraft} />}
      {draft && <DraftEditor />}
    </>
  );
}

function ElementPicker({
  onPick,
  onCancel,
}: {
  onPick: (el: HTMLElement) => void;
  onCancel: () => void;
}) {
  const [hovered, setHovered] = useState<HTMLElement | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const resolveTarget = (clientX: number, clientY: number): HTMLElement | null => {
    const overlay = overlayRef.current;
    if (overlay) overlay.style.pointerEvents = 'none';
    const el = document.elementFromPoint(clientX, clientY);
    if (overlay) overlay.style.pointerEvents = 'auto';
    if (!el || !(el instanceof HTMLElement)) return null;
    if (el.closest('[data-loupe-ui]')) return null;
    return el;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      ref={overlayRef}
      data-loupe-ui
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        cursor: 'crosshair',
        userSelect: 'none',
        touchAction: 'none',
      }}
      onPointerMove={(e) => {
        const el = resolveTarget(e.clientX, e.clientY);
        setHovered(el);
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        const el = resolveTarget(e.clientX, e.clientY);
        if (el) onPick(el);
      }}
    >
      {hovered && <HighlightBox el={hovered} />}
    </div>
  );
}

function HighlightBox({ el }: { el: HTMLElement }) {
  const [rect, setRect] = useState<DOMRect | null>(() => el.getBoundingClientRect());
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setRect(el.getBoundingClientRect());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [el]);
  if (!rect) return null;
  const info = fiberInfo(el);
  const label = info.componentName || el.tagName.toLowerCase();
  return (
    <>
      <div
        data-loupe-ui
        aria-hidden
        style={{
          position: 'fixed',
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          pointerEvents: 'none',
          border: `2px solid ${ACCENT}`,
          background: ACCENT_BG,
          borderRadius: 4,
          transition: 'none',
          zIndex: 9999,
          boxSizing: 'border-box',
        }}
      />
      <div
        data-loupe-ui
        aria-hidden
        style={{
          position: 'fixed',
          left: Math.max(4, rect.left),
          top: rect.top > 28 ? rect.top - 26 : rect.bottom + 6,
          zIndex: 10000,
          padding: '3px 8px',
          borderRadius: 6,
          background: ACCENT,
          color: '#fff',
          fontFamily: FONT,
          fontSize: 11,
          fontWeight: 700,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          letterSpacing: 0.2,
        }}
      >
        {label}
        <span style={{ fontWeight: 500, opacity: 0.85, marginLeft: 6 }}>
          {elementToSelector(el)}
        </span>
      </div>
    </>
  );
}

function RegionPicker({
  onPick,
  onCancel,
}: {
  onPick: (region: { x: number; y: number; w: number; h: number }) => void;
  onCancel: () => void;
}) {
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  return (
    <div
      data-loupe-ui
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        cursor: 'crosshair',
        userSelect: 'none',
        touchAction: 'none',
        background: start ? 'rgba(0,0,0,0.08)' : 'transparent',
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        setStart({ x: e.clientX, y: e.clientY });
        setCurrent({ x: e.clientX, y: e.clientY });
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!start) return;
        setCurrent({ x: e.clientX, y: e.clientY });
      }}
      onPointerUp={(e) => {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        if (!start || !current) {
          setStart(null);
          setCurrent(null);
          return;
        }
        const x = Math.min(start.x, current.x);
        const y = Math.min(start.y, current.y);
        const w = Math.abs(current.x - start.x);
        const h = Math.abs(current.y - start.y);
        if (w < 10 || h < 10) {
          setStart(null);
          setCurrent(null);
          return;
        }
        onPick({
          x: (x / viewportW) * 100,
          y: (y / viewportH) * 100,
          w: (w / viewportW) * 100,
          h: (h / viewportH) * 100,
        });
        setStart(null);
        setCurrent(null);
      }}
    >
      {start && current && (
        <div
          data-loupe-ui
          style={{
            position: 'fixed',
            left: Math.min(start.x, current.x),
            top: Math.min(start.y, current.y),
            width: Math.abs(current.x - start.x),
            height: Math.abs(current.y - start.y),
            border: `2px solid ${REGION_ACCENT}`,
            background: REGION_BG,
            pointerEvents: 'none',
            borderRadius: 4,
            boxSizing: 'border-box',
          }}
        />
      )}
    </div>
  );
}

function DraftEditor() {
  const { draft, commitDraft, cancelDraft } = useAnnotations();
  const [note, setNote] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    taRef.current?.focus();
  }, []);

  if (!draft) return null;

  let anchorRect: DOMRect | { left: number; top: number; right: number; bottom: number };
  if (draft.kind === 'element') {
    anchorRect = draft.element.getBoundingClientRect();
  } else {
    const r = draft.region;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    anchorRect = {
      left: (r.x / 100) * vw,
      top: (r.y / 100) * vh,
      right: ((r.x + r.w) / 100) * vw,
      bottom: ((r.y + r.h) / 100) * vh,
    };
  }

  const editorWidth = 320;
  const editorHeight = 140;
  const preferredLeft = (anchorRect as DOMRect).left;
  const preferredTop = (anchorRect as DOMRect).bottom + 8;
  const left = Math.max(8, Math.min(window.innerWidth - editorWidth - 8, preferredLeft));
  const top =
    preferredTop + editorHeight + 20 > window.innerHeight
      ? Math.max(8, (anchorRect as DOMRect).top - editorHeight - 12)
      : preferredTop;

  return (
    <>
      {draft.kind === 'element' ? (
        <DraftOutline el={draft.element} />
      ) : (
        <DraftRegionOutline region={draft.region} />
      )}

      <div
        data-loupe-ui
        style={{
          position: 'fixed',
          left,
          top,
          width: editorWidth,
          zIndex: 10001,
          background: PANEL_BG,
          color: PANEL_FG,
          borderRadius: 12,
          border: `1px solid ${PANEL_BORDER}`,
          boxShadow: '0 20px 50px rgba(0,0,0,0.45)',
          padding: 10,
          fontFamily: FONT,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#EAF3FF',
            marginBottom: 6,
          }}
        >
          {draft.kind === 'element' && (draft.snapshot.componentName || draft.snapshot.tagName)}
          {draft.kind === 'region' && 'Region'}
          <span style={{ fontWeight: 500, color: PANEL_MUTED, marginLeft: 8 }}>
            {draft.snapshot.phase} · {formatMs(draft.snapshot.phaseElapsedMs)} /{' '}
            {formatMs(draft.snapshot.phaseDurationMs)}
          </span>
        </div>
        <textarea
          ref={taRef}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What's the feedback here?"
          rows={4}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: 'rgba(255,255,255,0.04)',
            color: PANEL_FG,
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            padding: 8,
            fontFamily: 'inherit',
            fontSize: 13,
            resize: 'vertical',
            outline: 'none',
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              cancelDraft();
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              if (note.trim()) commitDraft(note.trim());
            }
          }}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 8,
            gap: 8,
          }}
        >
          <span style={{ fontSize: 10, color: '#6B7280' }}>⌘ Enter to save · Esc to cancel</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button type="button" onClick={cancelDraft} style={chipBtn('transparent', PANEL_MUTED)}>
              Cancel
            </button>
            <button
              type="button"
              disabled={!note.trim()}
              onClick={() => note.trim() && commitDraft(note.trim())}
              style={{
                ...chipBtn(ACCENT, '#fff'),
                opacity: note.trim() ? 1 : 0.5,
                cursor: note.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function DraftOutline({ el }: { el: HTMLElement }) {
  const [rect, setRect] = useState<DOMRect>(() => el.getBoundingClientRect());
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setRect(el.getBoundingClientRect());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [el]);
  return (
    <div
      data-loupe-ui
      aria-hidden
      style={{
        position: 'fixed',
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        pointerEvents: 'none',
        border: `2px solid ${ACCENT}`,
        background: ACCENT_BG,
        borderRadius: 4,
        zIndex: 9999,
        boxSizing: 'border-box',
      }}
    />
  );
}

function DraftRegionOutline({
  region,
}: {
  region: { x: number; y: number; w: number; h: number };
}) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return (
    <div
      data-loupe-ui
      aria-hidden
      style={{
        position: 'fixed',
        left: (region.x / 100) * vw,
        top: (region.y / 100) * vh,
        width: (region.w / 100) * vw,
        height: (region.h / 100) * vh,
        pointerEvents: 'none',
        border: `2px solid ${REGION_ACCENT}`,
        background: REGION_BG,
        borderRadius: 4,
        zIndex: 9999,
        boxSizing: 'border-box',
      }}
    />
  );
}

function chipBtn(bg: string, fg: string): React.CSSProperties {
  return {
    padding: '5px 10px',
    borderRadius: 8,
    border: 'none',
    background: bg,
    color: fg,
    fontFamily: 'inherit',
    fontWeight: 700,
    fontSize: 12,
    cursor: 'pointer',
  };
}

function formatMs(ms: number) {
  if (!Number.isFinite(ms)) return '∞';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
