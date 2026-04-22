import {
  AnimatePresence,
  motion,
  useDragControls,
  useMotionValue,
  useMotionValueEvent,
} from 'framer-motion';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useLoupeRegistry } from '../runtime/registry';
import { phaseAtTime, rangeOf } from '../runtime/phases';
import { useAnnotations } from '../annotations/AnnotationsProvider';
import { annotationsToMarkdown } from '../annotations/export';

/**
 * Loupe panel — the floating UI at app root, driven by the LoupeRegistry.
 *
 * Reads the active scene's TimelineState from the registry. The user picks
 * the scene to control via the dropdown; switching scenes triggers a brief
 * highlight overlay on the picked scene's root element so it's never
 * ambiguous which animation you're working on.
 */

const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4] as const;
const LOUPE_POSITION_KEY = 'loupe:panelPosition';
/** Stores the user's explicit scene pick — including `null` when
 *  they collapsed the panel. Loaded on mount so refresh doesn't
 *  un-collapse the panel by auto-selecting whatever scene registers
 *  first. */
const LOUPE_ACTIVE_SCENE_KEY = 'loupe:activeScene';

const FONT = 'var(--loupe-font, system-ui, -apple-system, sans-serif)';
const ACCENT = 'var(--loupe-accent, #3A97F9)';
const ACCENT_SOFT = 'var(--loupe-accent-soft, rgba(58, 151, 249, 0.28))';
const ACCENT_GLOW = 'var(--loupe-accent-glow, rgba(58, 151, 249, 0.6))';
const ACCENT_RING = 'var(--loupe-accent-ring, rgba(58, 151, 249, 0.18))';
const ACCENT_HALO = 'var(--loupe-accent-halo, rgba(58, 151, 249, 0.35))';
const ACCENT_TINT = 'var(--loupe-accent-tint, rgba(58, 151, 249, 0.7))';
const PANEL_BG = 'var(--loupe-panel-bg, rgba(18, 20, 25, 0.92))';
const PANEL_FG = 'var(--loupe-panel-fg, #E8EAEE)';
const PANEL_MUTED = 'var(--loupe-panel-muted, #9BA3AF)';
const PANEL_BORDER = 'var(--loupe-panel-border, rgba(255, 255, 255, 0.08))';
const PANEL_HIGHLIGHT = 'var(--loupe-panel-highlight, #EAF3FF)';

export function LoupePanel() {
  const registry = useLoupeRegistry();
  const activeScene = registry.activeSceneId
    ? registry.scenes.find((s) => s.id === registry.activeSceneId)
    : undefined;

  // Hydrate the persisted scene selection once — BEFORE any auto-
  // select from scene registration has time to override it. Writing
  // `null` explicitly means "user picked None, stay collapsed".
  const sceneHydratedRef = useRef(false);
  useEffect(() => {
    if (sceneHydratedRef.current) return;
    sceneHydratedRef.current = true;
    try {
      const raw = localStorage.getItem(LOUPE_ACTIVE_SCENE_KEY);
      if (raw === null) return;
      const parsed = JSON.parse(raw) as { id: string | null };
      // null = deliberate collapsed state; a real id = restore it
      // if the scene is (or becomes) registered.
      if (parsed.id === null) {
        registry.setActiveSceneId(null);
      } else if (registry.scenes.some((s) => s.id === parsed.id)) {
        registry.setActiveSceneId(parsed.id);
      }
    } catch {
      /* corrupt storage — ignore */
    }
  }, [registry]);

  // Persist every explicit change so refreshes preserve it.
  useEffect(() => {
    try {
      localStorage.setItem(
        LOUPE_ACTIVE_SCENE_KEY,
        JSON.stringify({ id: registry.activeSceneId }),
      );
    } catch {
      /* ignore */
    }
  }, [registry.activeSceneId]);

  // Escape toggles the panel between collapsed (no scene) and the
  // last-selected real scene. Fast way to get the panel out of the
  // way mid-edit without reaching for the dropdown.
  const lastRealSceneIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (registry.activeSceneId) {
      lastRealSceneIdRef.current = registry.activeSceneId;
    }
  }, [registry.activeSceneId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Only react when Loupe-relevant — skip when the user is
      // typing in an input, contenteditable, etc.
      const target = e.target as HTMLElement | null;
      if (target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      )) return;
      if (registry.activeSceneId) {
        registry.setActiveSceneId(null);
      } else if (lastRealSceneIdRef.current &&
                 registry.scenes.some((s) => s.id === lastRealSceneIdRef.current)) {
        registry.setActiveSceneId(lastRealSceneIdRef.current);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [registry]);

  const {
    pickerMode,
    setPickerMode,
    visible: annotationsVisible,
    setVisible: setAnnotationsVisible,
    annotations,
  } = useAnnotations();

  const [expanded, setExpanded] = useState(true);

  const dragControls = useDragControls();
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState(() => ({
    w: typeof window === 'undefined' ? 1440 : window.innerWidth,
    h: typeof window === 'undefined' ? 900 : window.innerHeight,
  }));
  const [panelSize, setPanelSize] = useState(() => {
    const w =
      typeof window === 'undefined' ? 1024 : Math.min(1024, window.innerWidth - 32);
    return { w, h: 80 };
  });

  const SAFE_PADDING = 16;

  const constraints = useMemo(() => {
    if (panelSize.w === 0 || panelSize.h === 0) {
      return { left: 0, right: 0, top: 0, bottom: 0 };
    }
    const halfW = panelSize.w / 2;
    const naturalLeft = viewport.w / 2 - halfW;
    const naturalRight = viewport.w / 2 + halfW;
    const naturalTop = viewport.h - 16 - panelSize.h;
    const naturalBottom = viewport.h - 16;

    return {
      left: SAFE_PADDING - naturalLeft,
      right: viewport.w - SAFE_PADDING - naturalRight,
      top: SAFE_PADDING - naturalTop,
      bottom: viewport.h - SAFE_PADDING - naturalBottom,
    };
  }, [viewport.w, viewport.h, panelSize.w, panelSize.h]);

  const clampToViewport = useCallback(
    (cx: number, cy: number) => ({
      x: Math.min(
        Math.max(constraints.left, cx),
        Math.max(constraints.left, constraints.right),
      ),
      y: Math.min(
        Math.max(constraints.top, cy),
        Math.max(constraints.top, constraints.bottom),
      ),
    }),
    [constraints],
  );

  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    if (panelSize.w === 0) return;
    hydratedRef.current = true;
    try {
      const raw = localStorage.getItem(LOUPE_POSITION_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        const clamped = clampToViewport(
          typeof saved?.x === 'number' ? saved.x : 0,
          typeof saved?.y === 'number' ? saved.y : 0,
        );
        x.set(clamped.x);
        y.set(clamped.y);
      }
    } catch {
      /* ignore */
    }
  }, [panelSize.w, clampToViewport, x, y]);

  useEffect(() => {
    const onResize = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setPanelSize((prev) =>
        prev.w === rect.width && prev.h === rect.height
          ? prev
          : { w: rect.width, h: rect.height },
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [expanded]);

  useEffect(() => {
    if (panelSize.w === 0) return;
    const clamped = clampToViewport(x.get(), y.get());
    if (clamped.x !== x.get()) x.set(clamped.x);
    if (clamped.y !== y.get()) y.set(clamped.y);
  }, [clampToViewport, panelSize.w, panelSize.h, x, y]);

  const persistPosition = () => {
    try {
      localStorage.setItem(LOUPE_POSITION_KEY, JSON.stringify({ x: x.get(), y: y.get() }));
    } catch {
      /* ignore */
    }
  };

  if (!activeScene) {
    // Two sub-states:
    //  - No scenes registered at all → static centered "no scene" pill
    //    (Loupe hasn't found anything to drive yet).
    //  - Scenes registered but user picked "None" → collapsed
    //    draggable pill with JUST the scene picker, so they can
    //    re-select any time. Shares the drag position with the
    //    full panel so collapsing/expanding doesn't jump around.
    if (registry.scenes.length === 0) {
      return (
        <motion.div
          data-loupe-ui
          className="pointer-events-none fixed left-1/2 -translate-x-1/2"
          style={{ bottom: 16, zIndex: 10050, position: 'fixed', left: '50%', transform: 'translateX(-50%)' }}
        >
          <div
            style={{
              pointerEvents: 'auto',
              padding: '8px 14px',
              background: PANEL_BG,
              borderRadius: 999,
              color: PANEL_MUTED,
              fontFamily: FONT,
              fontSize: 11,
              fontWeight: 600,
              border: `1px solid ${PANEL_BORDER}`,
            }}
          >
            Loupe — no scene registered
          </div>
        </motion.div>
      );
    }
    return (
      <CollapsedPanel
        registry={registry}
        dragControls={dragControls}
        x={x}
        y={y}
        panelRef={panelRef}
        setPanelSize={setPanelSize}
        persistPosition={persistPosition}
        dragConstraints={constraints}
      />
    );
  }

  return (
    <ActiveScenePanel
      registry={registry}
      activeScene={activeScene}
      pickerMode={pickerMode}
      setPickerMode={setPickerMode}
      annotationsVisible={annotationsVisible}
      setAnnotationsVisible={setAnnotationsVisible}
      annotations={annotations}
      expanded={expanded}
      setExpanded={setExpanded}
      dragControls={dragControls}
      x={x}
      y={y}
      persistPosition={persistPosition}
      dragConstraints={constraints}
      panelRef={panelRef}
      viewportW={viewport.w}
    />
  );
}

type Registry = ReturnType<typeof useLoupeRegistry>;
type ActiveScene = NonNullable<ReturnType<Registry['scenes']['find']>>;

/**
 * Compact, draggable pill shown when the user picks "None" from the
 * scene dropdown. Contains only the scene picker so they can re-
 * select a scene whenever they want. Shares the drag position
 * (x/y MotionValues) with the full panel so collapsing/expanding
 * doesn't jump the panel across the screen.
 */
function CollapsedPanel({
  registry,
  dragControls,
  x,
  y,
  panelRef,
  setPanelSize,
  persistPosition,
  dragConstraints,
}: {
  registry: Registry;
  dragControls: ReturnType<typeof useDragControls>;
  x: ReturnType<typeof useMotionValue<number>>;
  y: ReturnType<typeof useMotionValue<number>>;
  panelRef: React.MutableRefObject<HTMLDivElement | null>;
  setPanelSize: (size: { w: number; h: number }) => void;
  persistPosition: () => void;
  dragConstraints: { left: number; right: number; top: number; bottom: number };
}) {
  // Track the collapsed pill's size so constraints stay honest if
  // user drags to viewport edges.
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const update = () => {
      setPanelSize({ w: el.offsetWidth, h: el.offsetHeight });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [panelRef, setPanelSize]);

  return (
    <motion.div
      data-loupe-ui
      className="pointer-events-none fixed"
      style={{
        bottom: 16,
        left: '50%',
        zIndex: 10050,
        translateX: '-50%',
      }}
    >
      <motion.div
        ref={panelRef}
        drag
        dragListener={false}
        dragControls={dragControls}
        dragMomentum={false}
        dragElastic={0}
        dragConstraints={dragConstraints}
        onDragEnd={persistPosition}
        transition={{ duration: 0.35, ease: [0.59, 0.01, 0.4, 0.98] }}
        style={{
          pointerEvents: 'auto',
          x,
          y,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 8px 6px 10px',
          background: PANEL_BG,
          border: `1px solid ${PANEL_BORDER}`,
          borderRadius: 999,
          color: PANEL_FG,
          fontFamily: FONT,
          boxShadow:
            '0 12px 28px rgba(0, 0, 0, 0.30), 0 3px 10px rgba(0, 0, 0, 0.20)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
        }}
      >
        {/* Drag handle — grabs the whole pill */}
        <button
          type="button"
          aria-label="Drag Loupe"
          onPointerDown={(e) => dragControls.start(e)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            border: 'none',
            borderRadius: 999,
            background: 'transparent',
            color: PANEL_MUTED,
            cursor: 'grab',
            padding: 0,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
            <circle cx="3" cy="3" r="1.1" />
            <circle cx="3" cy="6" r="1.1" />
            <circle cx="3" cy="9" r="1.1" />
            <circle cx="9" cy="3" r="1.1" />
            <circle cx="9" cy="6" r="1.1" />
            <circle cx="9" cy="9" r="1.1" />
          </svg>
        </button>
        <ScenePicker registry={registry} />
      </motion.div>
    </motion.div>
  );
}

function ActiveScenePanel({
  registry,
  activeScene,
  pickerMode,
  setPickerMode,
  annotationsVisible,
  setAnnotationsVisible,
  annotations,
  expanded,
  setExpanded,
  dragControls,
  x,
  y,
  persistPosition,
  dragConstraints,
  panelRef,
  viewportW,
}: {
  registry: Registry;
  activeScene: ActiveScene;
  pickerMode: ReturnType<typeof useAnnotations>['pickerMode'];
  setPickerMode: ReturnType<typeof useAnnotations>['setPickerMode'];
  annotationsVisible: boolean;
  setAnnotationsVisible: (v: boolean) => void;
  annotations: ReturnType<typeof useAnnotations>['annotations'];
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  dragControls: ReturnType<typeof useDragControls>;
  x: ReturnType<typeof useMotionValue<number>>;
  y: ReturnType<typeof useMotionValue<number>>;
  persistPosition: () => void;
  dragConstraints: { left: number; right: number; top: number; bottom: number };
  panelRef: React.MutableRefObject<HTMLDivElement | null>;
  viewportW: number;
}) {
  const isMobile = viewportW < 640;
  const tl = activeScene.timeline;
  const {
    time,
    ranges,
    totalDuration,
    phaseOrder,
    phaseLabels,
    speed,
    setSpeed,
    paused,
    setPaused,
    seek,
    restart,
  } = tl;

  const [displayMs, setDisplayMs] = useState(() => time.get());
  useEffect(() => {
    setDisplayMs(time.get());
  }, [time]);
  useMotionValueEvent(time, 'change', (v) => setDisplayMs(v));

  const phase = phaseAtTime(ranges, totalDuration, displayMs);
  const phaseRange = phase
    ? rangeOf(ranges, phase)
    : { start: 0, end: 0, duration: 0, phase: '' };
  const phaseElapsed = Math.max(0, displayMs - phaseRange.start);
  const totalProgress = totalDuration > 0 ? displayMs / totalDuration : 0;
  const phaseProgress = phaseRange.duration > 0 ? phaseElapsed / phaseRange.duration : 0;

  const stripRef = useRef<HTMLDivElement>(null);
  const setTimeFromPointer = (clientX: number) => {
    const el = stripRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    seek(ratio * totalDuration);
  };
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    if (!paused) setPaused(true);
    setTimeFromPointer(e.clientX);
    const el = stripRef.current;
    if (el) el.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.buttons === 0) return;
    setTimeFromPointer(e.clientX);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const el = stripRef.current;
    if (el && el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  };

  const labelFor = (p: string) => phaseLabels?.[p] ?? p;

  return (
    <>
      <SceneFlashOverlay registry={registry} />

      <motion.div
        data-loupe-ui
        style={{
          position: 'fixed',
          left: '50%',
          transform: 'translateX(-50%)',
          bottom: 16,
          width: 'min(1024px, calc(100vw - 32px))',
          zIndex: 10050,
          display: 'flex',
          pointerEvents: 'none',
        }}
      >
        <motion.div
          ref={panelRef}
          layout
          drag
          dragListener={false}
          dragControls={dragControls}
          dragMomentum={false}
          dragElastic={0}
          onDragEnd={persistPosition}
          dragConstraints={dragConstraints}
          transition={{ duration: 0.35, ease: [0.59, 0.01, 0.4, 0.98] }}
          style={{
            pointerEvents: 'auto',
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            x,
            y,
            background: PANEL_BG,
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            borderRadius: 16,
            border: `1px solid ${PANEL_BORDER}`,
            boxShadow:
              '0 20px 40px rgba(0, 0, 0, 0.35), 0 4px 12px rgba(0, 0, 0, 0.25)',
            color: PANEL_FG,
            fontFamily: FONT,
            overflow: 'hidden',
          }}
        >
          <AnimatePresence initial={false} mode="wait">
            {expanded ? (
              <motion.div
                key="expanded"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ padding: isMobile ? '10px 10px 10px' : '12px 14px 14px' }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: isMobile ? 'column' : 'row',
                    alignItems: isMobile ? 'stretch' : 'center',
                    justifyContent: isMobile ? undefined : 'space-between',
                    marginBottom: 10,
                    gap: isMobile ? 8 : 0,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: isMobile ? 8 : 10,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      onPointerDown={(e) => dragControls.start(e)}
                      title="Drag to move"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '4px 2px',
                        cursor: 'grab',
                        color: '#6B7280',
                        touchAction: 'none',
                      }}
                    >
                      <GripIcon />
                    </span>
                    <ScenePicker registry={registry} />
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: isMobile ? 12 : 13,
                        letterSpacing: 0.2,
                      }}
                    >
                      {phase}
                    </span>
                    <span
                      style={{
                        fontWeight: 500,
                        fontSize: isMobile ? 10 : 11,
                        color: PANEL_MUTED,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {isMobile ? (
                        <>
                          {formatMs(phaseElapsed)} / {formatMs(phaseRange.duration)}
                          {' · '}
                          {Math.round(totalProgress * 100)}%
                        </>
                      ) : (
                        <>
                          {formatMs(phaseElapsed)} / {formatMs(phaseRange.duration)}
                          {' · '}
                          {formatMs(displayMs)} / {formatMs(totalDuration)}
                          {' · '}
                          {Math.round(totalProgress * 100)}%
                        </>
                      )}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: isMobile ? 6 : 8,
                      flexWrap: isMobile ? 'wrap' : 'nowrap',
                      justifyContent: isMobile ? 'flex-start' : undefined,
                    }}
                  >
                    <IconButton
                      onClick={() =>
                        setPickerMode(pickerMode === 'element' ? 'off' : 'element')
                      }
                      title={pickerMode === 'element' ? 'Cancel picker' : 'Add feedback on element'}
                      active={pickerMode === 'element'}
                    >
                      <PointerIcon />
                    </IconButton>
                    <IconButton
                      onClick={() =>
                        setPickerMode(pickerMode === 'region' ? 'off' : 'region')
                      }
                      disabled={!paused && pickerMode !== 'region'}
                      title={paused ? 'Draw region (paused mode)' : 'Pause first to draw a region'}
                      active={pickerMode === 'region'}
                    >
                      <RegionIcon />
                    </IconButton>
                    <IconButton
                      onClick={() => setAnnotationsVisible(!annotationsVisible)}
                      title={annotationsVisible ? 'Hide annotations' : 'Show annotations'}
                      active={!annotationsVisible}
                    >
                      {annotationsVisible ? <EyeIcon /> : <EyeOffIcon />}
                    </IconButton>
                    {annotations.length > 0 && (
                      <span
                        title={`${annotations.length} annotation${annotations.length === 1 ? '' : 's'}`}
                        style={{
                          padding: '0 6px',
                          height: 18,
                          borderRadius: 999,
                          background: ACCENT,
                          color: '#121419',
                          fontSize: 10,
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                        }}
                      >
                        {annotations.length}
                      </span>
                    )}
                    <span
                      style={{
                        width: 1,
                        height: 16,
                        background: 'rgba(255,255,255,0.12)',
                        margin: '0 2px',
                      }}
                    />
                    {isMobile ? (
                      <CompactSpeedChip speed={speed} onChange={setSpeed} />
                    ) : (
                      <SpeedSelector speed={speed} onChange={setSpeed} />
                    )}
                    <IconButton
                      onClick={() => setPaused(!paused)}
                      title={paused ? 'Play' : 'Pause'}
                    >
                      {paused ? <PlayIcon /> : <PauseIcon />}
                    </IconButton>
                    <IconButton onClick={restart} title="Restart">
                      <RestartIcon />
                    </IconButton>
                    <IconButton onClick={() => setExpanded(false)} title="Collapse">
                      <CollapseIcon />
                    </IconButton>
                  </div>
                </div>

                <div
                  ref={stripRef}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    height: 26,
                    borderRadius: 8,
                    background: 'rgba(255, 255, 255, 0.04)',
                    overflow: 'hidden',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    cursor: 'ew-resize',
                    touchAction: 'none',
                    userSelect: 'none',
                  }}
                >
                  {phaseOrder.map((p) => {
                    const dur = ranges.find((r) => r.phase === p)?.duration ?? 0;
                    const widthPct = totalDuration > 0 ? (dur / totalDuration) * 100 : 0;
                    const isActive = p === phase;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          seek(rangeOf(ranges, p).start);
                        }}
                        title={`${p} · ${formatMs(dur)}`}
                        style={{
                          flex: `0 0 ${widthPct}%`,
                          minWidth: 0,
                          height: '100%',
                          padding: '0 6px',
                          margin: 0,
                          border: 'none',
                          borderRight: '1px solid rgba(0, 0, 0, 0.35)',
                          background: isActive ? ACCENT_SOFT : 'transparent',
                          color: isActive ? PANEL_HIGHLIGHT : PANEL_MUTED,
                          fontFamily: 'inherit',
                          fontWeight: isActive ? 700 : 500,
                          fontSize: 10,
                          lineHeight: 1,
                          textAlign: 'left',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          transition: 'background 150ms ease, color 150ms ease',
                        }}
                      >
                        {labelFor(p)}
                      </button>
                    );
                  })}

                  <div
                    aria-hidden
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: `${totalProgress * 100}%`,
                      width: 2,
                      background: ACCENT,
                      boxShadow: `0 0 8px ${ACCENT_GLOW}`,
                      pointerEvents: 'none',
                    }}
                  />
                </div>

                <div
                  style={{
                    marginTop: 8,
                    height: 2,
                    borderRadius: 999,
                    background: 'rgba(255, 255, 255, 0.06)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(phaseProgress, 1) * 100}%`,
                      background: ACCENT_TINT,
                    }}
                  />
                </div>

                {annotations.length > 0 && <AnnotationList />}
              </motion.div>
            ) : (
              <motion.div
                key="collapsed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: isMobile ? '8px 10px' : '8px 14px',
                  gap: isMobile ? 8 : 10,
                  width: '100%',
                  color: 'inherit',
                  fontFamily: 'inherit',
                }}
              >
                <span
                  onPointerDown={(e) => dragControls.start(e)}
                  title="Drag to move"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    color: '#6B7280',
                    cursor: 'grab',
                    touchAction: 'none',
                  }}
                >
                  <GripIcon />
                </span>
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    flex: 1,
                    padding: 0,
                    gap: isMobile ? 8 : 10,
                    background: 'transparent',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 12,
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {activeScene.label}
                  </span>
                  <span
                    style={{
                      fontWeight: 500,
                      fontSize: 11,
                      color: PANEL_MUTED,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      minWidth: 0,
                      flexShrink: 1,
                    }}
                  >
                    {isMobile ? labelFor(phase) : phase}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 20,
                      height: 3,
                      borderRadius: 999,
                      background: 'rgba(255, 255, 255, 0.08)',
                      overflow: 'hidden',
                    }}
                  >
                    <span
                      style={{
                        display: 'block',
                        height: '100%',
                        width: `${Math.min(totalProgress, 1) * 100}%`,
                        background: ACCENT,
                      }}
                    />
                  </span>
                  <span style={{ fontSize: 10, color: PANEL_MUTED, flexShrink: 0 }}>
                    {Math.round(totalProgress * 100)}%
                  </span>
                  <ExpandIcon />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </>
  );
}

function ScenePicker({ registry }: { registry: Registry }) {
  const [open, setOpen] = useState(false);
  // `buttonRef` is the trigger; `menuRef` is the portalled popover.
  // Keeping both refs so the outside-click handler knows to ignore
  // clicks that land inside either (otherwise the popover closes
  // the instant the user clicks an item).
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);
  const active = registry.scenes.find((s) => s.id === registry.activeSceneId);

  // Recompute the popover anchor each time it opens (or the viewport
  // resizes). The panel has `overflow: hidden` on its outer wrapper
  // — any absolute child gets clipped — so the menu lives in a
  // React portal outside that container and is anchored via fixed
  // coords pulled from the trigger button's bounding rect.
  useEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    const update = () => {
      const btn = buttonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      setMenuPos({ left: rect.left, top: rect.top });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: 'rgba(255,255,255,0.06)',
          color: PANEL_HIGHLIGHT,
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 999,
          padding: '4px 10px',
          fontFamily: 'inherit',
          fontWeight: 700,
          fontSize: 11,
          cursor: 'pointer',
          letterSpacing: 0.2,
        }}
        title="Pick which animation Loupe is controlling"
      >
        <span>{active?.label ?? '— Pick a scene'}</span>
        <svg width="9" height="9" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 5l4 4 4-4" />
        </svg>
      </button>
      {open && menuPos &&
        typeof document !== 'undefined' &&
        createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            // Float above the trigger — translateY pulls the menu
            // back by its own height + 6px so its bottom edge sits
            // 6px above the button's top edge.
            left: menuPos.left,
            top: menuPos.top,
            transform: 'translateY(calc(-100% - 6px))',
            minWidth: 180,
            background: '#121419',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10,
            padding: 4,
            boxShadow: '0 12px 30px rgba(0,0,0,0.4)',
            zIndex: 2147483647,
            color: PANEL_FG,
            fontFamily: FONT,
          }}
        >
          {registry.scenes.length === 0 && (
            <div style={{ padding: '8px 10px', color: '#6B7280', fontSize: 11 }}>
              No scenes registered
            </div>
          )}
          {registry.scenes.length > 0 && (
            <>
              {/* "None" option — collapses Loupe to a draggable
                  pill so it's out of the way without being fully
                  dismissed. */}
              <button
                type="button"
                onClick={() => {
                  registry.setActiveSceneId(null);
                  setOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: 6,
                  border: 'none',
                  background:
                    registry.activeSceneId === null
                      ? 'rgba(58,151,249,0.18)'
                      : 'transparent',
                  color:
                    registry.activeSceneId === null ? PANEL_HIGHLIGHT : PANEL_MUTED,
                  fontFamily: 'inherit',
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: 'pointer',
                  textAlign: 'left',
                  gap: 8,
                  fontStyle: 'italic',
                }}
                onMouseEnter={(e) => {
                  if (registry.activeSceneId !== null)
                    (e.currentTarget as HTMLElement).style.background =
                      'rgba(255,255,255,0.06)';
                }}
                onMouseLeave={(e) => {
                  if (registry.activeSceneId !== null)
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: 'rgba(255,255,255,0.12)',
                    border: '1px dashed rgba(255,255,255,0.3)',
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1 }}>— None (collapse panel)</span>
              </button>
              <div
                aria-hidden
                style={{
                  height: 1,
                  background: 'rgba(255,255,255,0.08)',
                  margin: '4px 6px',
                }}
              />
            </>
          )}
          {registry.scenes.map((s) => {
            const isActive = s.id === registry.activeSceneId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  registry.setActiveSceneId(s.id);
                  setOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: 6,
                  border: 'none',
                  background: isActive ? 'rgba(58,151,249,0.18)' : 'transparent',
                  color: isActive ? PANEL_HIGHLIGHT : PANEL_FG,
                  fontFamily: 'inherit',
                  fontWeight: isActive ? 700 : 600,
                  fontSize: 12,
                  cursor: 'pointer',
                  textAlign: 'left',
                  gap: 8,
                }}
                onMouseEnter={(e) => {
                  if (!isActive)
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive)
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: isActive ? ACCENT : 'rgba(255,255,255,0.18)',
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {s.label}
                  {s.id === 'loupe-demo' && (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: 0.5,
                        padding: '1px 5px',
                        borderRadius: 4,
                        background: 'rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.55)',
                        textTransform: 'uppercase',
                      }}
                    >
                      Demo
                    </span>
                  )}
                </span>
                <span style={{ color: '#6B7280', fontWeight: 500, fontSize: 10 }}>{s.id}</span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}

function SceneFlashOverlay({ registry }: { registry: Registry }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const lastTickRef = useRef<number>(registry.flashTick);

  useEffect(() => {
    if (registry.flashTick === lastTickRef.current) return;
    lastTickRef.current = registry.flashTick;
    const scene = registry.scenes.find((s) => s.id === registry.activeSceneId);
    const el = scene?.rootRef.current;
    if (!el) {
      setRect(null);
      return;
    }
    // Scroll the scene into view first so the flash and the
    // animation itself are actually visible. `block: 'center'`
    // frames the scene rather than jamming its top against the
    // viewport. Then wait a beat for the scroll to settle before
    // measuring its final rect for the flash overlay — otherwise
    // the flash is drawn at the pre-scroll position.
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch {
      el.scrollIntoView();
    }
    // Give the smooth scroll ~400ms to land, then capture the rect.
    // The flash itself runs ~700ms after that.
    const measure = window.setTimeout(() => {
      setRect(el.getBoundingClientRect());
    }, 400);
    const clear = window.setTimeout(() => setRect(null), 400 + 750);
    return () => {
      window.clearTimeout(measure);
      window.clearTimeout(clear);
    };
  }, [registry.flashTick, registry.activeSceneId, registry.scenes]);

  if (!rect) return null;
  return (
    <motion.div
      data-loupe-ui
      aria-hidden
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: [0, 1, 1, 0], scale: [0.985, 1, 1, 1] }}
      transition={{ duration: 0.7, times: [0, 0.18, 0.6, 1], ease: [0.59, 0.01, 0.4, 0.98] }}
      style={{
        position: 'fixed',
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        pointerEvents: 'none',
        border: `3px solid ${ACCENT}`,
        borderRadius: 8,
        boxShadow: `0 0 0 4px ${ACCENT_RING}, 0 0 32px 8px ${ACCENT_HALO}`,
        boxSizing: 'border-box',
        zIndex: 10049,
      }}
    />
  );
}

function SpeedSelector({
  speed,
  onChange,
}: {
  speed: number;
  onChange: (s: number) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        background: 'rgba(255, 255, 255, 0.06)',
        borderRadius: 999,
        padding: 2,
        gap: 2,
      }}
    >
      {SPEED_OPTIONS.map((s) => {
        const active = s === speed;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            style={{
              padding: '3px 8px',
              borderRadius: 999,
              border: 'none',
              fontFamily: 'inherit',
              fontWeight: active ? 700 : 500,
              fontSize: 10,
              lineHeight: 1,
              color: active ? '#121419' : PANEL_MUTED,
              background: active ? PANEL_HIGHLIGHT : 'transparent',
              cursor: 'pointer',
              transition: 'background 150ms ease, color 150ms ease',
            }}
          >
            {s === 1 ? '1×' : `${s}×`}
          </button>
        );
      })}
    </div>
  );
}

function CompactSpeedChip({
  speed,
  onChange,
}: {
  speed: number;
  onChange: (s: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        const idx = SPEED_OPTIONS.indexOf(speed as (typeof SPEED_OPTIONS)[number]);
        const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
        onChange(next);
      }}
      title={`Speed: ${speed}× — tap to cycle`}
      style={{
        minWidth: 32,
        height: 22,
        padding: '0 8px',
        borderRadius: 999,
        border: 'none',
        fontFamily: 'inherit',
        fontWeight: 700,
        fontSize: 11,
        lineHeight: 1,
        color: PANEL_HIGHLIGHT,
        background: 'rgba(255, 255, 255, 0.08)',
        cursor: 'pointer',
        transition: 'background 150ms ease, color 150ms ease',
      }}
    >
      {speed === 1 ? '1×' : `${speed}×`}
    </button>
  );
}

function IconButton({
  children,
  onClick,
  title,
  active = false,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
  disabled?: boolean;
}) {
  const baseBg = active ? ACCENT : 'rgba(255, 255, 255, 0.06)';
  const hoverBg = active ? ACCENT : 'rgba(255, 255, 255, 0.12)';
  const fg = active ? '#fff' : disabled ? '#4B5563' : PANEL_FG;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 26,
        height: 26,
        borderRadius: 999,
        border: 'none',
        background: baseBg,
        color: fg,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 150ms ease, color 150ms ease',
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled) (e.currentTarget as HTMLElement).style.background = hoverBg;
      }}
      onMouseLeave={(e) => {
        if (!disabled) (e.currentTarget as HTMLElement).style.background = baseBg;
      }}
    >
      {children}
    </button>
  );
}

function PlayIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
      <path d="M3 1.5L12 7L3 12.5V1.5Z" fill="currentColor" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
      <rect x="2" y="1" width="3.5" height="12" rx="1" fill="currentColor" />
      <rect x="8.5" y="1" width="3.5" height="12" rx="1" fill="currentColor" />
    </svg>
  );
}
function RestartIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
      <path d="M2 2V6H6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.5 6A5 5 0 1 1 3.5 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function CollapseIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5l4 4 4-4" />
    </svg>
  );
}
function ExpandIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l4-4 4 4" />
    </svg>
  );
}
function PointerIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 2l3.8 9.5 1.7-3.6 3.5-1.7L3 2z" />
    </svg>
  );
}
function RegionIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 2h3M9 2h3M2 12h3M9 12h3M2 5v4M12 5v4" strokeDasharray="1.5 1.5" />
    </svg>
  );
}
function EyeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 7s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4z" />
      <circle cx="7" cy="7" r="1.8" />
    </svg>
  );
}
function EyeOffIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 2l10 10" />
      <path d="M4.2 4.3C2.5 5.3 1 7 1 7s2 4 6 4c1.1 0 2-.2 2.8-.6M11 10.2C12.3 9.3 13 7 13 7s-2-4-6-4c-.6 0-1.1.1-1.7.2" />
    </svg>
  );
}
function GripIcon() {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden>
      <circle cx="2" cy="3" r="1" />
      <circle cx="2" cy="7" r="1" />
      <circle cx="2" cy="11" r="1" />
      <circle cx="8" cy="3" r="1" />
      <circle cx="8" cy="7" r="1" />
      <circle cx="8" cy="11" r="1" />
    </svg>
  );
}

function formatMs(ms: number) {
  if (!Number.isFinite(ms)) return '∞';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function AnnotationList() {
  const { annotations, focusAnnotation, deleteAnnotation, clearAll } = useAnnotations();
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    const md = annotationsToMarkdown(annotations);
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = md;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      } catch {
        /* ignore */
      } finally {
        document.body.removeChild(ta);
      }
    }
  };
  return (
    <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: 0,
          background: 'transparent',
          border: 'none',
          color: PANEL_FG,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.2 }}>
          Annotations
          <span style={{ fontWeight: 500, color: PANEL_MUTED, marginLeft: 6 }}>
            {annotations.length}
          </span>
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {annotations.length > 0 && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onCopy();
              }}
              title="Copy all as markdown"
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: copied ? '#86EFAC' : PANEL_HIGHLIGHT,
                cursor: 'pointer',
                background: copied ? 'rgba(34, 197, 94, 0.15)' : ACCENT,
                padding: '2px 8px',
                borderRadius: 999,
              }}
            >
              {copied ? 'copied ✓' : 'copy feedback'}
            </span>
          )}
          {annotations.length > 0 && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                if (confirm('Clear all annotations for this scene?')) clearAll();
              }}
              style={{ fontSize: 10, fontWeight: 600, color: PANEL_MUTED, cursor: 'pointer' }}
            >
              clear all
            </span>
          )}
          <span
            style={{
              color: PANEL_MUTED,
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform 150ms',
            }}
          >
            <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 5l4 4 4-4" />
            </svg>
          </span>
        </div>
      </button>
      {open && (
        <div
          style={{
            marginTop: 8,
            maxHeight: 180,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {annotations.map((a, i) => (
            <div
              key={a.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: '6px 8px',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: 20,
                  height: 20,
                  borderRadius: 999,
                  background: a.color,
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {i + 1}
              </span>
              <button
                type="button"
                onClick={() => focusAnnotation(a.id)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  color: PANEL_FG,
                  fontFamily: 'inherit',
                  padding: 0,
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700 }}>
                  {a.componentName || a.tagName || 'Region'}
                  <span style={{ fontWeight: 500, color: PANEL_MUTED, marginLeft: 6 }}>
                    {a.phase} · {Math.round(a.phaseElapsedMs)}ms
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: PANEL_MUTED,
                    marginTop: 2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {a.note}
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete annotation #${i + 1}?`)) deleteAnnotation(a.id);
                }}
                title="Delete"
                style={{
                  flexShrink: 0,
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  background: 'transparent',
                  border: 'none',
                  color: '#6B7280',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 12,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
