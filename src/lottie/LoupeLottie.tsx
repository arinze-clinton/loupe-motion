import { useRef, type CSSProperties } from 'react';
import {
  useLoupeLottie,
  type UseLoupeLottieOptions,
} from './useLoupeLottie';

export type LoupeLottieProps = Omit<UseLoupeLottieOptions, 'container'> & {
  /** Width of the lottie host element. Defaults to `'100%'`. */
  width?: number | string;
  /** Height of the lottie host element. Defaults to `'100%'`. */
  height?: number | string;
  /** Extra styles on the host element. */
  style?: CSSProperties;
  /** Class name for the host element. */
  className?: string;
};

/**
 * Drop-in Lottie renderer whose frame pointer is driven by the
 * nearest `TimelineProvider`'s `time`. Scrubbing Loupe scrubs the
 * clip frame-by-frame, no further wiring required.
 *
 * Prefer `useLoupeLottie()` directly if you need to composite the
 * lottie canvas yourself (masks, blend modes, capture streams).
 *
 * @example
 * ```tsx
 * <LoupeLottie
 *   src="/brand/blend.json"
 *   fps={24}
 *   totalFrames={121}
 *   width={220}
 *   height={220}
 * />
 * ```
 */
export function LoupeLottie(props: LoupeLottieProps) {
  const { width = '100%', height = '100%', style, className, ...rest } = props;
  const hostRef = useRef<HTMLDivElement | null>(null);

  useLoupeLottie({
    ...rest,
    container: hostRef.current,
  });

  return (
    <div
      ref={hostRef}
      className={className}
      style={{
        width,
        height,
        ...style,
      }}
    />
  );
}
