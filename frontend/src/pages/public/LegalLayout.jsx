import { Link } from 'react-router-dom';
import { Star, ArrowLeft, Mail } from 'lucide-react';

/**
 * Shared layout for public legal pages (Privacy Policy, Terms & Conditions).
 * Renders a centered, readable column with a Critiquee header and a footer
 * containing back-link + cross-link to the sibling legal page.
 */
export default function LegalLayout({ title, lastUpdated, otherLink, otherLabel, children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="border-b border-slate-200/70 bg-white/70 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 group" data-testid="legal-header-home-link">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-md shadow-blue-600/20 group-hover:scale-105 transition-transform">
              <Star size={16} className="text-white fill-white" />
            </div>
            <span className="text-base font-bold text-slate-800 tracking-tight">Critiquee</span>
          </Link>
          <Link
            to={otherLink}
            className="text-xs font-medium text-slate-500 hover:text-blue-600 transition-colors"
            data-testid="legal-header-other-link"
          >
            {otherLabel}
          </Link>
        </div>
      </header>

      {/* Body */}
      <main className="max-w-3xl mx-auto px-5 py-10 sm:py-14">
        <div className="mb-8">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors mb-4"
            data-testid="legal-back-link"
          >
            <ArrowLeft size={12} /> Back to home
          </Link>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight" data-testid="legal-title">
            {title}
          </h1>
          {lastUpdated && (
            <p className="text-xs text-slate-500 mt-2">Last updated: {lastUpdated}</p>
          )}
        </div>

        <article className="legal-prose" data-testid="legal-content">
          {children}
        </article>

        {/* Footer */}
        <footer className="mt-14 pt-6 border-t border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <Mail size={12} />
              <span>
                Questions?{' '}
                <a href="mailto:support@critiquee.com" className="text-blue-600 hover:underline">
                  support@critiquee.com
                </a>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Link to="/pp" className="hover:text-slate-700 hover:underline">Privacy Policy</Link>
              <span className="text-slate-300">·</span>
              <Link to="/tandc" className="hover:text-slate-700 hover:underline">Terms &amp; Conditions</Link>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-3">
            © {new Date().getFullYear()} Critiquee. All rights reserved.
          </p>
        </footer>
      </main>
    </div>
  );
}
