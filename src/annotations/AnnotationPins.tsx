import { useEffect, useState } from 'react';
import { useAnnotations } from './AnnotationsProvider';
import type { Annotation } from './types';

const FONT = 'var(--loupe-font, system-ui, -apple-system, sans-serif)';
const ACCENT = 'var(--loupe-accent, #3A97F9)';
const PANEL_BG = 'var(--loupe-panel-bg, #121419)';
const PANEL_FG = 'var(--loupe-panel-fg, #E8EAEE)';
const PANEL_MUTED = 'var(--loupe-panel-muted, #9BA3AF)';
const PANEL_BORDER = 'var(--loupe-panel-border, rgba(255,255,255,0.12))';

/**
 * AnnotationPins — numbered pin at each saved annotation. Element pins
 * follow their selector via rAF tracking; region pins anchor to the region's
 * top-right corner. Click → focus + edit. Right-click → delete.
 */
export function AnnotationPins() {
  const { annotations, visible, focusAnnotation, deleteAnnotation, updateAnnotation } =
    useAnnotations();
  if (!visible || annotations.length === 0) return null;
  return (
    <>
      {annotations.map((a, i) => (
        <Pin
          key={a.id}
          annotation={a}
          index={i + 1}
          onFocus={() => focusAnnotation(a.id)}
          onDelete={() => deleteAnnotation(a.id)}
          onUpdate={(patch) => updateAnnotation(a.id, patch)}
        />
      ))}
    </>
  );
}

function Pin({
  annotation,
  index,
  onFocus,
  onDelete,
  onUpdate,
}: {
  annotation: Annotation;
  index: number;
  onFocus: () => void;
  onDelete: () => void;
  onUpdate: (patch: Partial<Annotation>) => void;
}) {
  const [rect, setRect] = useState<{ x: number; y: number } | null>(null);
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [noteDraft, setNoteDraft] = useState(annotation.note);

  useEffect(() => {
    let raf = 0;
    const compute = () => {
      if (annotation.region) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const rx = (annotation.region.x / 100) * vw + (annotation.region.w / 100) * vw;
        const ry = (annotation.region.y / 100) * vh;
        setRect({ x: rx - 14, y: ry - 14 });
      } else if (annotation.selector) {
        const el = lookupElement(annotation.selector);
        if (el) {
          const r = el.getBoundingClientRect();
          setRect({ x: r.right - 14, y: r.top - 14 });
        } else {
          setRect(null);
        }
      }
      raf = requestAnimationFrame(compute);
    };
    compute();
    return () => cancelAnimationFrame(raf);
  }, [annotation.region, annotation.selector]);

  if (!rect) return null;

  const regionRect = annotation.region
    ? {
        left: (annotation.region.x / 100) * window.innerWidth,
        top: (annotation.region.y / 100) * window.innerHeight,
        width: (annotation.region.w / 100) * window.innerWidth,
        height: (annotation.region.h / 100) * window.innerHeight,
      }
    : null;

  return (
    <>
      {regionRect && (
        <div
          data-loupe-ui
          aria-hidden
          style={{
            position: 'fixed',
            left: regionRect.left,
            top: regionRect.top,
            width: regionRect.width,
            height: regionRect.height,
            border: `2px solid ${annotation.color}`,
            background: 'rgba(168, 85, 247, 0.08)',
            borderRadius: 4,
            boxSizing: 'border-box',
            pointerEvents: 'none',
            zIndex: 10040,
          }}
        />
      )}

      <button
        data-loupe-ui
        type="button"
        title={`#${index} · ${annotation.phase} · ${Math.round(
          annotation.phaseElapsedMs,
        )}ms / ${Math.round(annotation.phaseDurationMs)}ms`}
        onClick={(e) => {
          e.stopPropagation();
          onFocus();
          setEditing(true);
          setNoteDraft(annotation.note);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (confirm(`Delete annotation #${index}?`)) onDelete();
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'fixed',
          left: rect.x,
          top: rect.y,
          width: 28,
          height: 28,
          borderRadius: 999,
          border: '2px solid #fff',
          background: annotation.color,
          color: '#fff',
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: 12,
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
          zIndex: 10041,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
        }}
      >
        {index}
      </button>

      {hovered && !editing && (
        <div
          data-loupe-ui
          style={{
            position: 'fixed',
            left: rect.x + 36,
            top: rect.y - 4,
            zIndex: 10042,
            maxWidth: 280,
            padding: 8,
            borderRadius: 10,
            background: PANEL_BG,
            color: PANEL_FG,
            border: `1px solid ${PANEL_BORDER}`,
            fontFamily: FONT,
            fontSize: 12,
            lineHeight: 1.4,
            boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontWeight: 700, color: '#EAF3FF', marginBottom: 4 }}>
            {annotation.componentName || annotation.tagName || 'Region'}
            <span style={{ fontWeight: 500, color: PANEL_MUTED, marginLeft: 6 }}>
              {annotation.phase}
            </span>
          </div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{annotation.note}</div>
        </div>
      )}

      {editing && (
        <div
          data-loupe-ui
          style={{
            position: 'fixed',
            left: Math.max(8, Math.min(window.innerWidth - 336, rect.x)),
            top: Math.min(window.innerHeight - 180, rect.y + 36),
            zIndex: 10060,
            width: 320,
            background: PANEL_BG,
            color: PANEL_FG,
            borderRadius: 12,
            border: `1px solid ${PANEL_BORDER}`,
            boxShadow: '0 20px 50px rgba(0,0,0,0.45)',
            padding: 10,
            fontFamily: FONT,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
            #{index} · {annotation.componentName || annotation.tagName || 'Region'}
            <span style={{ fontWeight: 500, color: PANEL_MUTED, marginLeft: 8 }}>
              {annotation.phase}
            </span>
          </div>
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
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
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setEditing(false);
                setNoteDraft(annotation.note);
              }
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                onUpdate({ note: noteDraft.trim() });
                setEditing(false);
              }
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: 8, gap: 6 }}>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setNoteDraft(annotation.note);
              }}
              style={{
                padding: '5px 10px',
                borderRadius: 8,
                border: 'none',
                background: 'transparent',
                color: PANEL_MUTED,
                fontFamily: 'inherit',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm(`Delete annotation #${index}?`)) {
                  onDelete();
                  setEditing(false);
                }
              }}
              style={{
                padding: '5px 10px',
                borderRadius: 8,
                border: 'none',
                background: 'rgba(220, 38, 38, 0.18)',
                color: '#FCA5A5',
                fontFamily: 'inherit',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => {
                onUpdate({ note: noteDraft.trim() });
                setEditing(false);
              }}
              style={{
                padding: '5px 10px',
                borderRadius: 8,
                border: 'none',
                background: ACCENT,
                color: '#fff',
                fontFamily: 'inherit',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function lookupElement(selector: string): HTMLElement | null {
  try {
    const el = document.querySelector(selector);
    if (el instanceof HTMLElement) return el;
  } catch {
    /* invalid selector */
  }
  return null;
}
