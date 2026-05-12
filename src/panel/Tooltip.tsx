import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Small custom tooltip for the Loupe panel.
 *
 * Native browser tooltips (`title=`) are slow (~700ms delay) and
 * visually unrelated to the panel's styling. This component:
 *   - Shows on hover after ~180ms, hides instantly
 *   - Inherits the panel's CSS variables for colour and font
 *   - Positions above the trigger with a small downward arrow
 *   - Portals to body so it can escape any container's overflow
 *   - Suppresses itself when no `label` is provided (callers can
 *     pass an empty string to opt out, useful inside loops)
 *
 * Usage:
 *   <Tooltip label="Pause">
 *     <button>...</button>
 *   </Tooltip>
 */

const FONT = 'var(--loupe-font, system-ui, -apple-system, sans-serif)';
const PANEL_BG = 'var(--loupe-panel-bg, rgba(18, 20, 25, 0.96))';
const PANEL_FG = 'var(--loupe-panel-fg, #E8EAEE)';
const PANEL_BORDER = 'var(--loupe-panel-border, rgba(255, 255, 255, 0.08))';

const SHOW_DELAY_MS = 180;
const ARROW_SIZE = 5;

type TooltipPlacement = 'top' | 'bottom';

export function Tooltip({
  label,
  children,
  placement = 'top',
  shortcut,
}: {
  label: string;
  children: React.ReactNode;
  placement?: TooltipPlacement;
  /** Optional keyboard shortcut, rendered to the right of the label
   *  in a subtler colour (e.g. "Space"). */
  shortcut?: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const cancelTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const computeCoords = () => {
    const el = triggerRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: r.left + r.width / 2,
      y: placement === 'top' ? r.top : r.bottom,
    };
  };

  const scheduleOpen = () => {
    cancelTimer();
    timerRef.current = window.setTimeout(() => {
      const c = computeCoords();
      if (!c) return;
      setCoords(c);
      setOpen(true);
    }, SHOW_DELAY_MS);
  };

  const close = () => {
    cancelTimer();
    setOpen(false);
  };

  useEffect(() => () => cancelTimer(), []);

  // Reposition on scroll / resize while open so the tooltip
  // follows its trigger if the layout shifts.
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const c = computeCoords();
      if (c) setCoords(c);
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, placement]);

  // No label → behave as a transparent pass-through (still
  // wrap so the parent layout is identical with/without).
  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={label ? scheduleOpen : undefined}
        onMouseLeave={label ? close : undefined}
        onFocus={label ? scheduleOpen : undefined}
        onBlur={label ? close : undefined}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
        }}
      >
        {children}
      </span>
      {open && label && coords && typeof document !== 'undefined'
        ? createPortal(
            <TooltipBubble
              label={label}
              shortcut={shortcut}
              x={coords.x}
              y={coords.y}
              placement={placement}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function TooltipBubble({
  label,
  shortcut,
  x,
  y,
  placement,
}: {
  label: string;
  shortcut?: string;
  x: number;
  y: number;
  placement: TooltipPlacement;
}) {
  const offset = 8;
  const bubbleStyle: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: placement === 'top' ? y - offset : y + offset,
    transform:
      placement === 'top'
        ? 'translate(-50%, -100%)'
        : 'translate(-50%, 0%)',
    zIndex: 2147483647,
    pointerEvents: 'none',
    background: PANEL_BG,
    color: PANEL_FG,
    fontFamily: FONT,
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: 0.2,
    padding: '5px 9px',
    borderRadius: 6,
    border: `1px solid ${PANEL_BORDER}`,
    boxShadow: '0 6px 18px rgba(0, 0, 0, 0.45)',
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    animation: 'loupe-tooltip-fade-in 120ms ease-out',
  };

  const arrowStyle: React.CSSProperties = {
    position: 'absolute',
    left: '50%',
    [placement === 'top' ? 'top' : 'bottom']: '100%',
    transform: `translate(-50%, ${placement === 'top' ? '-1px' : '1px'}) rotate(45deg)`,
    width: ARROW_SIZE * 2,
    height: ARROW_SIZE * 2,
    background: PANEL_BG,
    border: `1px solid ${PANEL_BORDER}`,
    borderTopWidth: placement === 'top' ? 0 : '1px',
    borderLeftWidth: placement === 'top' ? 0 : '1px',
    borderBottomWidth: placement === 'top' ? '1px' : 0,
    borderRightWidth: placement === 'top' ? '1px' : 0,
    marginTop: placement === 'top' ? -ARROW_SIZE : 0,
    marginBottom: placement === 'bottom' ? -ARROW_SIZE : 0,
  };

  return (
    <>
      <style>{`
        @keyframes loupe-tooltip-fade-in {
          from { opacity: 0; transform: translate(-50%, ${
            placement === 'top' ? '-95%' : '5%'
          }); }
          to   { opacity: 1; transform: translate(-50%, ${
            placement === 'top' ? '-100%' : '0%'
          }); }
        }
      `}</style>
      <div role="tooltip" style={bubbleStyle}>
        <span>{label}</span>
        {shortcut ? (
          <span
            style={{
              fontSize: 10,
              color: 'rgba(255,255,255,0.5)',
              padding: '1px 5px',
              borderRadius: 3,
              border: `1px solid ${PANEL_BORDER}`,
              fontFamily:
                'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
            }}
          >
            {shortcut}
          </span>
        ) : null}
        <span style={arrowStyle} />
      </div>
    </>
  );
}
