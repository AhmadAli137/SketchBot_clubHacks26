import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="footer" style={{ position: 'relative', zIndex: 1 }}>
      <div className="container">
        <div className="footer-inner">
          <div className="footer-brand">
            <div className="nav-logo-mark" style={{ width: 30, height: 30, borderRadius: 8, fontSize: '0.68rem' }}>SB</div>
            <span>SketchBot</span>
          </div>
          <div className="footer-links">
            <Link href="/"        className="footer-link">Overview</Link>
            <Link href="/pricing" className="footer-link">Pricing</Link>
            <Link href="/portal"  className="footer-link">Portal</Link>
            <Link href="/sign-in" className="footer-link">Sign in</Link>
            <a href="mailto:hello@sketchbot.app" className="footer-link">Contact</a>
          </div>
        </div>
        <p className="footer-copy">
          © {new Date().getFullYear()} SketchBot. Built to make robotics education accessible to every classroom.
        </p>
      </div>
    </footer>
  );
}
