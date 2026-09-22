import React from 'react';

const config = {
  logo: <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em' }}>Loupe</span>,
  project: { link: 'https://github.com/arinze-clinton/loupe-motion' },
  docsRepositoryBase: 'https://github.com/arinze-clinton/loupe-motion/tree/main/site',
  footer: {
    content: (
      <span>
        Loupe — timeline-first motion authoring. MIT-adjacent; see LICENSE.
      </span>
    ),
  },
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="description" content="Loupe — scrub, annotate, and hand off React animations against a deterministic timeline." />
    </>
  ),
  color: { hue: 212 },
};

export default config;
