/**
 * Build a short, human-readable CSS selector path for a DOM element.
 * Optimized for legibility, not uniqueness — prefers id > short class chain > tag.
 */

const MAX_DEPTH = 5;
const MAX_CLASSES_PER_NODE = 2;

export function elementToSelector(el: Element | null): string {
  if (!el) return '';
  const parts: string[] = [];
  let node: Element | null = el;
  let depth = 0;
  while (node && node.nodeType === Node.ELEMENT_NODE && depth < MAX_DEPTH) {
    parts.unshift(nodeLabel(node));
    if (node.id) break;
    node = node.parentElement;
    depth++;
  }
  return parts.join(' > ');
}

function nodeLabel(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (el.id) return `${tag}#${el.id}`;
  const classAttr = el.getAttribute('class') ?? '';
  const classes = classAttr
    .split(/\s+/)
    .filter(Boolean)
    .filter((c) => c.length <= 20)
    .slice(0, MAX_CLASSES_PER_NODE);
  if (classes.length > 0) {
    return `${tag}.${classes.join('.')}`;
  }
  return tag;
}
