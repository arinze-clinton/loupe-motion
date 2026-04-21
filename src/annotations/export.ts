import type { Annotation } from './types';

/**
 * Serialize a list of annotations into a markdown block that can be pasted
 * into an AI agent (or any chat) and convey:
 *   - WHICH scene the user was reviewing (groups multiple scenes)
 *   - WHERE in the DOM the user was pointing
 *   - WHEN in the animation they were pointing
 *   - WHAT they wrote
 */
export function annotationsToMarkdown(list: Annotation[]): string {
  if (list.length === 0) return '_(no annotations)_';
  const date = new Date().toISOString().slice(0, 10);

  const grouped = new Map<string, Annotation[]>();
  for (const a of list) {
    const key = a.sceneId || 'unknown';
    const bucket = grouped.get(key) ?? [];
    bucket.push(a);
    grouped.set(key, bucket);
  }

  const sections: string[] = [];
  for (const [sceneId, items] of grouped) {
    const label = items[0]?.sceneLabel || sceneId;
    sections.push(`## ${label} · ${items.length} ${items.length === 1 ? 'item' : 'items'}\n`);
    sections.push(items.map((a, i) => formatOne(a, i + 1)).join('\n\n'));
  }

  return `# Loupe feedback · ${date}\n\n${sections.join('\n\n')}\n`;
}

function formatOne(a: Annotation, index: number): string {
  const title = [
    `#${index}`,
    a.phase || '—',
    `${formatMs(a.phaseElapsedMs)} / ${formatMs(a.phaseDurationMs)}`,
    `${formatMs(a.globalTimeMs)} / ${formatMs(a.totalDurationMs)} total`,
    `${a.totalPercent}%`,
  ].join(' · ');

  const lines: string[] = [`### ${title}`];

  if (a.region) {
    lines.push(
      `**Region:** x=${a.region.x.toFixed(1)}% y=${a.region.y.toFixed(1)}% w=${a.region.w.toFixed(1)}% h=${a.region.h.toFixed(1)}%`,
    );
  } else {
    const element = [
      a.componentName && `\`${a.componentName}\``,
      a.tagName && `(\`<${a.tagName}>\`)`,
    ]
      .filter(Boolean)
      .join(' ');
    if (element) lines.push(`**Element:** ${element}`);
    if (a.sourceLocation) lines.push(`**Source:** ${a.sourceLocation}`);
    if (a.selector) lines.push(`**Selector:** \`${a.selector}\``);
  }

  lines.push('');
  lines.push(a.note);
  return lines.join('\n');
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) return '∞';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
