import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Loader2, RefreshCcw, Check } from 'lucide-react';
import { aiApi } from '../api';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { Label } from './ui/label';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function resolveImageUrl(url) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${BACKEND_URL}${url}`;
}

export default function AIImageDialog({ open, onOpenChange, onUseImage }) {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState('');

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error('Please enter a prompt');
      return;
    }
    setLoading(true);
    setGeneratedUrl('');
    try {
      const { data } = await aiApi.generateImage({ prompt: prompt.trim(), number_of_images: 1 });
      const url = data?.urls?.[0];
      if (!url) {
        toast.error('No image returned. Try again.');
      } else {
        setGeneratedUrl(url);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Image generation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleUse = () => {
    if (!generatedUrl) return;
    onUseImage({ url: generatedUrl, preview: resolveImageUrl(generatedUrl) });
    handleClose();
    toast.success('AI image added to your post');
  };

  const handleClose = () => {
    setPrompt('');
    setGeneratedUrl('');
    setLoading(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-lg" data-testid="ai-image-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={18} className="text-primary" />
            {t('createPost.aiImageTitle')}
          </DialogTitle>
          <DialogDescription>{t('createPost.aiImageDesc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ai-prompt" className="text-xs">Prompt</Label>
            <textarea
              id="ai-prompt"
              data-testid="ai-prompt-textarea"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder={t('createPost.aiPromptPlaceholder')}
              disabled={loading}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {loading && (
            <div className="flex flex-col items-center justify-center py-8 gap-3 bg-muted/30 rounded-xl border border-dashed border-border">
              <Loader2 size={24} className="animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">{t('createPost.generating')}</p>
              <p className="text-xs text-muted-foreground">This may take up to 60 seconds</p>
            </div>
          )}

          {generatedUrl && !loading && (
            <div className="space-y-2">
              <div className="rounded-xl overflow-hidden border border-border bg-muted/30">
                <img
                  src={resolveImageUrl(generatedUrl)}
                  alt="AI generated"
                  className="w-full h-auto max-h-[400px] object-contain"
                  data-testid="ai-generated-image"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {!generatedUrl ? (
            <>
              <Button variant="outline" onClick={handleClose} disabled={loading}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={loading || !prompt.trim()}
                data-testid="ai-generate-btn"
                className="gap-2"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {loading ? t('createPost.generating') : t('createPost.generateAi')}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={handleGenerate} disabled={loading} className="gap-2" data-testid="ai-regenerate-btn">
                <RefreshCcw size={14} />
                {t('createPost.regenerate')}
              </Button>
              <Button onClick={handleUse} className="gap-2" data-testid="ai-use-image-btn">
                <Check size={14} />
                {t('createPost.useImage')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
