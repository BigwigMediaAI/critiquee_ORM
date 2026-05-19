import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Monitor, Smartphone, MoreHorizontal, Heart, MessageCircle, Send, Bookmark } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from './ui/dialog';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function resolveImageUrl(url) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${BACKEND_URL}${url}`;
}

function PreviewCard({ content, imageUrls, businessName, mode }) {
  const isMobile = mode === 'mobile';
  const containerWidth = isMobile ? 'w-[360px]' : 'w-[520px]';

  return (
    <div className={`${containerWidth} mx-auto bg-white dark:bg-zinc-900 rounded-xl border border-border shadow-sm overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-white font-bold text-sm shrink-0">
          {(businessName || 'H').charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{businessName || 'Your Business'}</p>
          <p className="text-xs text-muted-foreground">Just now · Public</p>
        </div>
        <MoreHorizontal size={18} className="text-muted-foreground" />
      </div>

      {/* Content */}
      {content && (
        <div className="px-4 py-3">
          <p className={`whitespace-pre-wrap break-words text-foreground ${isMobile ? 'text-sm' : 'text-[15px]'} leading-relaxed`}>
            {content}
          </p>
        </div>
      )}

      {/* Images */}
      {imageUrls && imageUrls.length > 0 && (
        <div className={`grid gap-0.5 ${imageUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {imageUrls.slice(0, 4).map((url, idx) => {
            const isSingle = imageUrls.length === 1;
            return (
              <div
                key={url || `preview-${idx}`}
                className={`relative bg-muted/40 ${isSingle ? 'flex items-center justify-center max-h-[520px]' : 'aspect-square'}`}
              >
                <img
                  src={url}
                  alt={`preview-${idx + 1}`}
                  className={isSingle
                    ? 'max-h-[520px] w-auto max-w-full object-contain'
                    : 'w-full h-full object-contain'}
                />
                {idx === 3 && imageUrls.length > 4 && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-2xl font-bold">
                    +{imageUrls.length - 4}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-border">
        <div className="flex items-center gap-4 text-muted-foreground">
          <Heart size={isMobile ? 18 : 20} />
          <MessageCircle size={isMobile ? 18 : 20} />
          <Send size={isMobile ? 18 : 20} />
        </div>
        <Bookmark size={isMobile ? 18 : 20} className="text-muted-foreground" />
      </div>
    </div>
  );
}

export default function PostPreviewDialog({ open, onOpenChange, content, images, businessName }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState('desktop');

  // Local previews for unuploaded images, server URLs otherwise
  const imageUrls = (images || []).map((img) => img.preview || resolveImageUrl(img.url)).filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="post-preview-title">{t('createPost.previewPost')}</DialogTitle>
          <DialogDescription>
            See how your post will look once published.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 p-1 rounded-xl bg-muted/40 w-fit mx-auto">
          <button
            onClick={() => setMode('desktop')}
            data-testid="preview-mode-desktop"
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              mode === 'desktop' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
            }`}
          >
            <Monitor size={14} /> {t('createPost.previewDesktop')}
          </button>
          <button
            onClick={() => setMode('mobile')}
            data-testid="preview-mode-mobile"
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              mode === 'mobile' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
            }`}
          >
            <Smartphone size={14} /> {t('createPost.previewMobile')}
          </button>
        </div>

        <div className="py-4 flex justify-center bg-gradient-to-b from-muted/30 to-transparent rounded-xl">
          <PreviewCard
            content={content}
            imageUrls={imageUrls}
            businessName={businessName}
            mode={mode}
          />
        </div>

        {!content && imageUrls.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-4">
            Start typing or add an image to see the preview.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
