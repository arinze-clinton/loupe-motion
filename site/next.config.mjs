import nextra from 'nextra';

const withNextra = nextra({
  theme: 'nextra-theme-docs',
  themeConfig: './theme.config.tsx',
});

export default withNextra({
  reactStrictMode: true,
  // Loupe ships ESM/CJS; transpile it so Next handles the package cleanly.
  transpilePackages: ['@arinze-clinton/loupe'],
});
