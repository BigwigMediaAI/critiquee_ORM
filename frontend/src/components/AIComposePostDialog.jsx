import { useState } from 'react';
import { aiApi } from '../api';
import { toast } from 'sonner';
import { Sparkles, Loader2, Wand2, Hash, Search, Copy, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Badge } from './ui/badge';

const TONES = ['engaging', 'professional', 'friendly', 'witty', 'inspirational', 'urgent'];

export default function AIComposePostDialog({ open, onOpenChange, onApply }) {
  const [prompt, setPrompt] = useState('');
  const [tone, setTone] = useState('engaging');
  const [includeHashtags, setIncludeHashtags] = useState(true);
  const [includeKeywords, setIncludeKeywords] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const reset = () => {
    setPrompt('');
    setTone('engaging');
    setIncludeHashtags(true);
    setIncludeKeywords(true);
    setResult(null);
  };

  const handleGenerate = async () => {
    if (prompt.trim().length < 3) return toast.error('Please enter a topic (min 3 chars)');
    setLoading(true);
    try {
      const { data } = await aiApi.composePost({
        prompt: prompt.trim(),
        tone,
        include_hashtags: includeHashtags,
        include_keywords: includeKeywords,
      });
      setResult(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'AI compose failed');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = (mode) => {
    if (!result) return;
    const parts = [result.content || ''];
    if (includeHashtags && result.hashtags?.length) {
      parts.push('\n\n' + result.hashtags.join(' '));
    }
    const composed = parts.join('').trim();
    onApply?.(composed, { mode });
    toast.success(mode === 'replace' ? 'Post content replaced' : 'Post content inserted');
    reset();
    onOpenChange(false);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
      .then(() => toast.success('Copied to clipboard'))
      .catch(() => toast.error('Copy failed'));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 size={18} className="text-primary" />
            Compose Post with AI
          </DialogTitle>
          <DialogDescription>
            Describe what you want to post. AI will generate the caption, hashtags and SEO keywords for you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="ai-compose-prompt" className="text-sm font-medium">
              What's the post about?
            </Label>
            <textarea
              id="ai-compose-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="e.g. Announce our new weekend brunch menu featuring 20+ international dishes, kid-friendly, valet parking available"
              disabled={loading}
              data-testid="ai-compose-prompt"
              className="mt-1.5 w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none transition-all"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Tone</Label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                disabled={loading}
                data-testid="ai-compose-tone"
                className="mt-1 w-full h-9 px-2 rounded-lg border border-input bg-background text-sm capitalize focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {TONES.map((t) => (
                  <option key={t} value={t} className="capitalize">{t}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Switch
                id="ai-include-hashtags"
                checked={includeHashtags}
                onCheckedChange={setIncludeHashtags}
                disabled={loading}
                data-testid="ai-include-hashtags-toggle"
              />
              <Label htmlFor="ai-include-hashtags" className="text-xs cursor-pointer">
                Include hashtags
              </Label>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Switch
                id="ai-include-keywords"
                checked={includeKeywords}
                onCheckedChange={setIncludeKeywords}
                disabled={loading}
                data-testid="ai-include-keywords-toggle"
              />
              <Label htmlFor="ai-include-keywords" className="text-xs cursor-pointer">
                Include SEO keywords
              </Label>
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={loading || prompt.trim().length < 3}
            className="w-full gap-2"
            data-testid="ai-compose-generate-btn"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {loading ? 'Generating…' : result ? 'Regenerate' : 'Generate Post'}
          </Button>

          {result && (
            <div className="space-y-3 pt-2 border-t border-border" data-testid="ai-compose-result">
              <div className="rounded-xl border border-border p-3.5 bg-muted/30">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Caption</span>
                  <button
                    onClick={() => copyToClipboard(result.content)}
                    className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  >
                    <Copy size={11} /> Copy
                  </button>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{result.content}</p>
              </div>

              {includeHashtags && result.hashtags?.length > 0 && (
                <div className="rounded-xl border border-border p-3.5 bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
                      <Hash size={12} /> Hashtags ({result.hashtags.length})
                    </span>
                    <button
                      onClick={() => copyToClipboard(result.hashtags.join(' '))}
                      className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                    >
                      <Copy size={11} /> Copy
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {result.hashtags.map((h) => (
                      <Badge key={h} variant="secondary" className="text-xs font-mono">{h}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {includeKeywords && result.keywords?.length > 0 && (
                <div className="rounded-xl border border-border p-3.5 bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
                      <Search size={12} /> SEO Keywords
                    </span>
                    <button
                      onClick={() => copyToClipboard(result.keywords.join(', '))}
                      className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                    >
                      <Copy size={11} /> Copy
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {result.keywords.map((k) => (
                      <Badge key={k} variant="outline" className="text-xs">{k}</Badge>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Keywords help search visibility — they aren't auto-inserted into the caption.
                  </p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <Button
                  variant="outline"
                  onClick={() => handleApply('append')}
                  className="flex-1 gap-2"
                  data-testid="ai-compose-append-btn"
                >
                  <Plus size={14} /> Append to current post
                </Button>
                <Button
                  onClick={() => handleApply('replace')}
                  className="flex-1 gap-2"
                  data-testid="ai-compose-replace-btn"
                >
                  <Wand2 size={14} /> Use this post
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
