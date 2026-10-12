import Calculator from "@/components/Calculator";

export default function Home() {
  return (
    <main className="shell">
      <header className="masthead">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <svg viewBox="0 0 32 32" width="28" height="28">
              <path d="M3 26 C 10 26, 14 8, 29 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="29" cy="6" r="2.5" fill="currentColor" />
            </svg>
          </span>
          <span className="brand-name">NetWise</span>
        </div>
        <p className="tagline">
          See how likely your money is to last, then get a plain-English read on what to change.
        </p>
      </header>
      <Calculator />
      <footer className="footer">
        Educational tool, not financial advice. Projections use randomized market returns and are
        shown in today&apos;s dollars.
      </footer>
    </main>
  );
}
