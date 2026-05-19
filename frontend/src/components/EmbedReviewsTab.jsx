import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Copy, Check, Eye, Code2, Sparkles, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useBranch } from '../context/BranchContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function CodeBlock({ value, testId }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative group">
      <pre
        className="bg-slate-950 text-slate-100 text-xs font-mono p-4 pr-14 rounded-xl overflow-x-auto leading-relaxed border border-slate-800"
        data-testid={testId}
      >
        <code>{value}</code>
      </pre>
      <Button
        size="sm"
        variant="secondary"
        onClick={handleCopy}
        className="absolute top-2 right-2 h-7 gap-1.5 text-xs"
        data-testid={`${testId}-copy`}
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}

export default function EmbedReviewsTab() {
  const { currentBranch } = useBranch();

  const branchId = currentBranch?.id || 'YOUR_BRANCH_ID';
  const scriptUrl = `${BACKEND_URL}/api/embed/script`;

  const htmlSnippet = useMemo(
    () =>
      `<!-- Critiquee Reviews Widget -->\n<div id="critiquee-reviews" data-branch="${branchId}" data-api="${BACKEND_URL}"></div>\n<script src="${scriptUrl}" async></script>`,
    [branchId, scriptUrl]
  );

  const reactSnippet = useMemo(
    () =>
      `import { useEffect } from 'react';\n\nexport function CritiqueeReviews() {\n  useEffect(() => {\n    const s = document.createElement('script');\n    s.src = '${scriptUrl}';\n    s.async = true;\n    document.body.appendChild(s);\n    return () => { s.remove(); };\n  }, []);\n\n  return (\n    <div id="critiquee-reviews"\n         data-branch="${branchId}"\n         data-api="${BACKEND_URL}" />\n  );\n}`,
    [branchId, scriptUrl]
  );

  // Live preview: write the snippet into an iframe via srcDoc
  const previewHtml = useMemo(
    () =>
      `<!doctype html><html><head><meta charset="utf-8" /><title>Preview</title><style>body{margin:0;padding:16px;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,sans-serif}</style></head><body>${htmlSnippet}</body></html>`,
    [htmlSnippet]
  );

  return (
    <div className="space-y-5">
      {/* Hero */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="pt-5 pb-5 flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0">
            <Code2 size={20} />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-base mb-1 flex items-center gap-2">
              Embed your Google reviews anywhere
              <span className="text-[10px] uppercase tracking-wide bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                Live
              </span>
            </h3>
            <p className="text-sm text-muted-foreground">
              Drop the snippet on any website, landing page, or CMS to display a beautiful
              auto-scrolling marquee of your latest Google reviews. Pauses on hover. Auto-refreshes when
              new reviews arrive.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* HTML Snippet */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Code2 size={14} className="text-primary" />
              HTML / Universal
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Works on any website (WordPress, Shopify, Wix, plain HTML, etc.)
            </p>
          </CardHeader>
          <CardContent>
            <CodeBlock value={htmlSnippet} testId="embed-html-snippet" />
          </CardContent>
        </Card>

        {/* React Snippet */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles size={14} className="text-primary" />
              React / Next.js
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Drop into any React component, page, or layout.
            </p>
          </CardHeader>
          <CardContent>
            <CodeBlock value={reactSnippet} testId="embed-react-snippet" />
          </CardContent>
        </Card>
      </div>

      {/* Preview */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-sm flex items-center gap-2">
            <Eye size={14} className="text-primary" />
            Live preview
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs h-7"
            onClick={() => {
              // Use a Blob URL to avoid document.write XSS surface
              const blob = new Blob([previewHtml], { type: 'text/html' });
              const url = URL.createObjectURL(blob);
              const w = window.open(url, '_blank', 'noopener,noreferrer');
              if (w) {
                // Revoke the URL after the new tab loads it (safe cleanup)
                setTimeout(() => URL.revokeObjectURL(url), 30000);
              }
            }}
            data-testid="embed-open-preview-btn"
          >
            <ExternalLink size={12} /> Open in new tab
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-border overflow-hidden bg-muted/20">
            <iframe
              title="Critiquee Reviews Preview"
              srcDoc={previewHtml}
              className="w-full bg-white"
              style={{ height: 360, border: 0 }}
              sandbox="allow-scripts allow-same-origin"
              data-testid="embed-preview-iframe"
            />
          </div>
          {!currentBranch && (
            <p className="text-xs text-amber-600 mt-2">
              Pick a branch to see real reviews in the preview.
            </p>
          )}
        </CardContent>
      </Card>

      {/* How it works */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">How it works</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="text-sm space-y-2 text-muted-foreground list-decimal pl-5">
            <li>Copy the HTML snippet above.</li>
            <li>Paste it anywhere on your site — no build step required.</li>
            <li>The widget fetches your latest Google reviews and renders a smooth marquee.</li>
            <li>It auto-adapts to light & dark backgrounds and pauses on hover.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
