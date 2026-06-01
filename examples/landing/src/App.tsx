import {
  AnnotationOverlay,
  AnnotationPins,
  AnnotationsProvider,
  LoupePanel,
  LoupeRegistryProvider,
} from '@arinze-clinton/loupe';
import { HeroChecklistScene } from './scenes/HeroScene';
import { ScheduleScene } from './scenes/FeaturesScene';
import { InsightsScene } from './scenes/CtaScene';
import { PublishScene } from './scenes/PublishScene';
import { tokens } from './tokens';

/**
 * Harbor — a fake "launch toolkit" landing page styled after Krepling.
 *
 * Page chrome is STATIC. Headlines, copy, nav — none of it animates.
 * The animated bits live inside three diegetic product-mock scenes,
 * each wrapped in its own <TimelineProvider> so Loupe can scrub them
 * independently.
 */
export function App() {
  return (
    <LoupeRegistryProvider>
      <AnnotationsProvider>
        <TopNav />
        <main>
          <HeroSection />
          <ScheduleSection />
          <InsightsSection />
          <PublishSection />
          <ClosingSection />
        </main>
        <Footer />
        <LoupePanel />
        <AnnotationOverlay />
        <AnnotationPins />
      </AnnotationsProvider>
    </LoupeRegistryProvider>
  );
}

function TopNav() {
  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: tokens.color.canvas,
        height: 64,
        display: 'flex',
        alignItems: 'center',
        padding: `0 ${tokens.space.xl}px`,
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Wordmark />
        <div
          style={{
            display: 'flex',
            gap: tokens.space.lg,
            alignItems: 'center',
          }}
        >
          <NavLink>Product</NavLink>
          <NavLink>Pricing</NavLink>
          <NavLink>Customers</NavLink>
          <NavLink>Changelog</NavLink>
        </div>
        <div style={{ display: 'flex', gap: tokens.space.xs, alignItems: 'center' }}>
          <button
            style={{
              background: 'transparent',
              color: tokens.color.ink,
              border: 'none',
              padding: '8px 14px',
              fontSize: 14,
              fontWeight: 500,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            Sign in
          </button>
          <PrimaryButton>Start free</PrimaryButton>
        </div>
      </div>
    </nav>
  );
}

function Wordmark() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: tokens.space.xs,
        fontSize: 18,
        fontWeight: 600,
        letterSpacing: '-0.4px',
        color: tokens.color.ink,
      }}
    >
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: 7,
          background: tokens.color.accent,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 5,
            borderRadius: 3,
            background: tokens.color.canvas,
          }}
        />
      </div>
      Harbor
    </div>
  );
}

function NavLink({ children }: { children: React.ReactNode }) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      style={{
        color: tokens.color.inkMuted,
        fontSize: 14,
        textDecoration: 'none',
        fontWeight: 500,
      }}
    >
      {children}
    </a>
  );
}

function PrimaryButton({
  children,
  size = 'sm',
}: {
  children: React.ReactNode;
  size?: 'sm' | 'lg';
}) {
  const pad = size === 'lg' ? '14px 22px' : '10px 16px';
  const fontSize = size === 'lg' ? 15 : 14;
  return (
    <button
      style={{
        background: tokens.color.ink,
        color: tokens.color.inkOnDark,
        border: 'none',
        borderRadius: tokens.radius.pill,
        padding: pad,
        fontSize,
        fontWeight: 500,
        fontFamily: 'inherit',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function HeroSection() {
  return (
    <section
      style={{
        padding: `${tokens.space.section}px ${tokens.space.xl}px`,
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: '1.1fr 0.9fr',
          gap: tokens.space.xxl,
          alignItems: 'center',
        }}
      >
        <div>
          <Eyebrow>For product teams that ship a lot</Eyebrow>
          <h1
            style={{
              margin: `${tokens.space.md}px 0 0`,
              fontSize: 72,
              fontWeight: 600,
              lineHeight: 1.02,
              letterSpacing: '-2.4px',
              color: tokens.color.ink,
            }}
          >
            Launch days that don't feel like fires.
          </h1>
          <p
            style={{
              margin: `${tokens.space.lg}px 0 0`,
              maxWidth: 480,
              fontSize: 18,
              lineHeight: 1.5,
              color: tokens.color.inkMuted,
            }}
          >
            Harbor pulls your announcement, your posts, your changelog, and
            your customer emails into one calm checklist. Ship it from one
            place. Watch what landed.
          </p>
          <div
            style={{
              display: 'flex',
              gap: tokens.space.sm,
              marginTop: tokens.space.xl,
            }}
          >
            <PrimaryButton size="lg">Start free</PrimaryButton>
            <button
              style={{
                background: 'transparent',
                color: tokens.color.ink,
                border: `1px solid ${tokens.color.hairline}`,
                borderRadius: tokens.radius.pill,
                padding: '14px 22px',
                fontSize: 15,
                fontWeight: 500,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              Watch the tour
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <HeroChecklistScene />
        </div>
      </div>
    </section>
  );
}

function ScheduleSection() {
  return (
    <section
      style={{
        padding: `0 ${tokens.space.xl}px ${tokens.space.section}px`,
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          background: tokens.color.panelDark,
          color: tokens.color.inkOnDark,
          borderRadius: tokens.radius.xxl,
          padding: tokens.space.xxl,
        }}
      >
        <div style={{ maxWidth: 560 }}>
          <Eyebrow tone="onDark">Schedule</Eyebrow>
          <h2
            style={{
              margin: `${tokens.space.md}px 0 0`,
              fontSize: 44,
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: '-1.4px',
            }}
          >
            Schedule once, ship everywhere.
          </h2>
          <p
            style={{
              margin: `${tokens.space.lg}px 0 0`,
              fontSize: 16,
              lineHeight: 1.5,
              color: tokens.color.inkOnDarkMuted,
            }}
          >
            Drop announcements onto a single calendar. Harbor fans them out to
            X, your newsletter, in-app banners, and your customer list — at the
            time and tone you set.
          </p>
        </div>
        <div
          style={{
            marginTop: tokens.space.xxl,
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <ScheduleScene />
        </div>
      </div>
    </section>
  );
}

function InsightsSection() {
  return (
    <section
      style={{
        padding: `0 ${tokens.space.xl}px ${tokens.space.section}px`,
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          background: tokens.color.panelLight,
          borderRadius: tokens.radius.xxl,
          padding: tokens.space.xxl,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: tokens.space.xxl,
          alignItems: 'center',
        }}
      >
        <div>
          <Eyebrow>Insights</Eyebrow>
          <h2
            style={{
              margin: `${tokens.space.md}px 0 0`,
              fontSize: 44,
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: '-1.4px',
              color: tokens.color.ink,
            }}
          >
            See what actually landed.
          </h2>
          <p
            style={{
              margin: `${tokens.space.lg}px 0 0`,
              fontSize: 16,
              lineHeight: 1.5,
              color: tokens.color.inkMuted,
            }}
          >
            Signups, opens, replies, demo bookings — all attributed back to the
            channel and the moment they came in. No spreadsheets, no UTMs to
            stitch.
          </p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <InsightsScene />
        </div>
      </div>
    </section>
  );
}

function PublishSection() {
  return (
    <section
      style={{
        padding: `0 ${tokens.space.xl}px ${tokens.space.section}px`,
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: tokens.space.xxl,
          alignItems: 'center',
        }}
      >
        <div>
          <Eyebrow>Publish</Eyebrow>
          <h2
            style={{
              margin: `${tokens.space.md}px 0 0`,
              fontSize: 44,
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: '-1.4px',
              color: tokens.color.ink,
            }}
          >
            One click, every channel.
          </h2>
          <p
            style={{
              margin: `${tokens.space.lg}px 0 0`,
              fontSize: 16,
              lineHeight: 1.5,
              color: tokens.color.inkMuted,
            }}
          >
            Hit publish and Harbor fans the announcement out everywhere at once
            — then confirms each landing. (This mock is driven by GSAP, scrubbed
            through Loupe.)
          </p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <PublishScene />
        </div>
      </div>
    </section>
  );
}

function ClosingSection() {
  return (
    <section
      style={{
        padding: `0 ${tokens.space.xl}px ${tokens.space.section + 24}px`,
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          textAlign: 'center',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 56,
            fontWeight: 600,
            lineHeight: 1.04,
            letterSpacing: '-1.8px',
            color: tokens.color.ink,
            maxWidth: 720,
            marginInline: 'auto',
          }}
        >
          Your next launch deserves a calmer day.
        </h2>
        <div
          style={{
            marginTop: tokens.space.xl,
            display: 'flex',
            justifyContent: 'center',
            gap: tokens.space.sm,
          }}
        >
          <PrimaryButton size="lg">Start free</PrimaryButton>
          <button
            style={{
              background: 'transparent',
              color: tokens.color.ink,
              border: `1px solid ${tokens.color.hairline}`,
              borderRadius: tokens.radius.pill,
              padding: '14px 22px',
              fontSize: 15,
              fontWeight: 500,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            Talk to sales
          </button>
        </div>
      </div>
    </section>
  );
}

function Eyebrow({
  children,
  tone = 'onLight',
}: {
  children: React.ReactNode;
  tone?: 'onLight' | 'onDark';
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: '0.4px',
        textTransform: 'uppercase',
        color: tone === 'onDark' ? tokens.color.inkOnDarkMuted : tokens.color.inkSubtle,
        background:
          tone === 'onDark'
            ? 'rgba(244,239,233,0.08)'
            : 'rgba(20,17,15,0.05)',
        padding: '5px 10px',
        borderRadius: tokens.radius.pill,
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: 3,
          background: tokens.color.accent,
          display: 'inline-block',
        }}
      />
      {children}
    </div>
  );
}

function Footer() {
  return (
    <footer
      style={{
        padding: `${tokens.space.xxl}px ${tokens.space.xl}px`,
        borderTop: `1px solid ${tokens.color.hairline}`,
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          color: tokens.color.inkSubtle,
          fontSize: 13,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>© Harbor, Inc.</span>
        <span>Made for launch days.</span>
      </div>
    </footer>
  );
}
