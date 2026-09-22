import { useState } from 'react';

/**
 * A slim hero band for the top of the Overview: the install command (the
 * honest trust flex for a young package — copyable) plus links out. No faked
 * download count.
 */
export function HeroHeader() {
  const [copied, setCopied] = useState(false);
  const cmd = 'npm install @arinze-clinton/loupe -D';

  const copy = () => {
    navigator.clipboard?.writeText(cmd).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      },
      () => {},
    );
  };

  return (
    <div className="loupe-hero">
      <span className="loupe-hero-cmd">
        <span>{cmd}</span>
        <button type="button" onClick={copy} aria-label="Copy install command">
          {copied ? 'copied ✓' : 'copy'}
        </button>
      </span>
      <span className="loupe-hero-links">
        <a href="https://www.npmjs.com/package/@arinze-clinton/loupe" target="_blank" rel="noreferrer">
          npm
        </a>
        {'  ·  '}
        <a href="https://github.com/arinze-clinton/loupe-motion" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </span>
    </div>
  );
}
