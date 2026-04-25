// Vitest setup — happy-dom is loaded via vitest.config.ts.
// rAF in happy-dom defaults to setTimeout(..., 0); leave as-is so
// timeline tick tests can drive frames with `vi.useFakeTimers()` +
// `vi.advanceTimersByTime`.
