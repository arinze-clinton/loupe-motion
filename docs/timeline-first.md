# The timeline-first pitch

Most React animation today is **fire-and-forget**.

```tsx
<motion.div animate={{ opacity: 1 }} transition={{ duration: 0.5 }} />
```

You set it off. The browser runs it. You can't pause it. You can't scrub it. You can't ask "what frame is this animation on right now?" If something looks wrong at the 320ms mark, you can't open it up and inspect that exact moment. You either change a number and reload, or you slow the animation 4× in Chrome DevTools and try to time your eye.

That works for one element. It falls apart the second your scene has more than three.

## What "timeline-first" means

Every motion is a function of `time`. Time is a single shared `MotionValue` that one `requestAnimationFrame` loop advances. There's no internal state machine, no `useState` toggles, no `AnimatePresence` mount cycles. Just a number going up.

```tsx
const opacity = useTimelineValue(0, 1, { phase: 'enter' });
<motion.div style={{ opacity }} />
```

This looks similar but is profoundly different:

- **Pausing** is clearing the rAF loop — the value freezes
- **Scrubbing** is `time.set(840)` — the value snaps to whatever `useTimelineValue` would compute at 840ms
- **Reversing** is decrementing time — the value reverses cleanly because it was always derived
- **Looping** is `time = 0` — every animation resets together because they all read from the same source
- **Reproducing a bug** is "scrub to 320ms in the `enter` phase" — exact, every time

You stop describing animations and start treating them like a video edit you can scrub through.

## Why this matters for AI-assisted work

This is the bigger reason Loupe exists.

When you describe a motion bug to an AI agent, you're trying to communicate three things at once:
1. **Which** element you mean
2. **When** in the animation it happens
3. **What** is wrong

Without timeline-first motion, item 2 is impossible to state precisely. "When it fades in" — when, exactly? "About halfway through" — about? "Right after the bubble lands" — does the agent know which bubble? You end up writing paragraphs of narration to pin down a single moment. The agent guesses, you correct, you guess again.

With timeline-first motion + Loupe:
1. Click the element with Loupe's picker — selector + component name + source file are captured
2. Pause at the exact moment — phase + ms elapsed are captured
3. Type the feedback — your sentence travels with all that structured context

Paste into the agent's chat. The agent jumps straight to the code, narrows to the right phase, and changes the right number. No back-and-forth.

## The trade-off

Timeline-first motion has one cost: you have to think about phases up front. You can't just slap `animate={{ opacity: 1 }}` on something and walk away. You have to decide what phase this animation belongs to, and what the durations are.

In practice this is a feature, not a tax. Naming your phases (`idle`, `enter`, `hold`, `exit`) forces you to articulate the *shape* of the motion before you write it. The animation is more deliberate because the structure is explicit. The "thinking time" you spend on phase design is "thinking time" you used to spend later, debugging why two animations stepped on each other.

## What still belongs as fire-and-forget

Not everything should be timeline-bound. Some motion is correctly fire-and-forget:

- **Hover, focus, active states** — these are state-driven UI feedback, not authored sequences. A `:hover` transition or a `motion.button whileHover` is exactly right.
- **Drag interactions** — the user is the timeline. You're reacting, not authoring.
- **Loading spinners** — they don't have a beginning or an end. They just spin.

Loupe's `scan` command knows the difference and won't flag these.

## In short

Timeline-first motion is to animation what Git is to file editing. Until you have it, you don't realize how much of your work was guesswork. Once you have it, going back feels like coding without version control.
