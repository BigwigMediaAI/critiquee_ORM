import { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { toast } from 'sonner';
import { Loader2, Download, Share2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';

const PLATFORM_LABEL = {
  google: 'Google',
  facebook: 'Facebook',
  instagram: 'Instagram',
  yelp: 'Yelp',
  trustpilot: 'Trustpilot',
  foursquare: 'Foursquare',
  zomato: 'Zomato',
  tripadvisor: 'TripAdvisor',
  booking: 'Booking.com',
  x: 'X',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  reddit: 'Reddit',
};

/**
 * Renders a stylised, image-exportable card for a review and lets the user
 * download it as a PNG or share it via the Web Share API. Used by both the
 * GMB tab and the main /admin/reviews list, so the export style stays
 * consistent across the app.
 *
 * Props:
 *   review        — { reviewer_name|author, rating, text, date|time_description, platform }
 *   businessName  — heading text shown at the top of the card
 *   onClose       — closes the parent dialog
 */
export default function ReviewShareCard({ review, businessName, onClose }) {
  const cardRef = useRef(null);
  const [generating, setGenerating] = useState(false);

  // Normalise field names so the same card works for both the GMB shape
  // ({author, time_description}) and the main /admin/reviews shape
  // ({reviewer_name, date, platform}).
  const author = review.reviewer_name || review.author || 'Anonymous';
  const ratingNum = Number(review.rating) || 0;
  const text = review.text || '';
  const dateLabel = review.date || review.time_description || '';
  const platformLabel = PLATFORM_LABEL[review.platform] || (review.platform || '').toString().toUpperCase();

  const renderToCanvas = async () => {
    if (!cardRef.current) throw new Error('Card not ready');
    return html2canvas(cardRef.current, {
      backgroundColor: null,
      scale: 2,
      useCORS: true,
      logging: false,
    });
  };

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const canvas = await renderToCanvas();
      const link = document.createElement('a');
      link.download = `review-${author.replace(/\s+/g, '_')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast.success('Image downloaded!');
    } catch (e) {
      console.error(e);
      toast.error('Failed to generate image');
    } finally {
      setGenerating(false);
    }
  };

  const handleShare = async () => {
    setGenerating(true);
    try {
      const canvas = await renderToCanvas();
      canvas.toBlob(async (blob) => {
        try {
          if (navigator.share && blob) {
            const file = new File([blob], 'review.png', { type: 'image/png' });
            const shareData = { files: [file], title: `Review by ${author}`, text: `"${text.slice(0, 140)}"` };
            if (navigator.canShare && !navigator.canShare(shareData)) {
              throw new Error('share-files-not-supported');
            }
            await navigator.share(shareData);
          } else {
            // Fallback: trigger download
            const link = document.createElement('a');
            link.download = `review-${author.replace(/\s+/g, '_')}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            toast.success('Image downloaded — sharing not supported on this device');
          }
        } catch (err) {
          if (err && err.name === 'AbortError') return; // user cancelled — silent
          // Final fallback: download
          const link = document.createElement('a');
          link.download = `review-${author.replace(/\s+/g, '_')}.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();
        } finally {
          setGenerating(false);
        }
      }, 'image/png');
    } catch (e) {
      console.error(e);
      toast.error('Failed to share');
      setGenerating(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]" data-testid="review-share-dialog">
        <DialogHeader>
          <DialogTitle className="text-base">Share Review</DialogTitle>
        </DialogHeader>
        <div className="flex justify-center py-2">
          <div
            ref={cardRef}
            style={{
              width: 420, padding: 32, borderRadius: 20,
              background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, letterSpacing: 1 }}>
                {(businessName || 'REVIEW').toUpperCase()}
              </div>
              {platformLabel && (
                <div style={{ color: '#60a5fa', fontSize: 10, fontWeight: 600, letterSpacing: 0.5, padding: '3px 8px', borderRadius: 999, background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.25)' }}>
                  {platformLabel}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 700, fontSize: 18,
              }}>
                {author?.[0] || '?'}
              </div>
              <div>
                <div style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 15 }}>{author}</div>
                <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span key={`star-${i}`} style={{ color: i < ratingNum ? '#facc15' : '#334155', fontSize: 16 }}>
                      &#9733;
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div style={{
              color: '#e2e8f0', fontSize: 14, lineHeight: 1.7, fontStyle: 'italic',
              borderLeft: '3px solid #3b82f6', paddingLeft: 14,
              maxHeight: 200, overflow: 'hidden',
            }}>
              "{text || 'No text'}"
            </div>
            {dateLabel && (
              <div style={{ color: '#475569', fontSize: 11, marginTop: 16, textAlign: 'right' }}>
                {dateLabel}
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} data-testid="review-share-close-btn">Close</Button>
          <Button variant="outline" onClick={handleDownload} disabled={generating} data-testid="review-download-btn">
            <Download size={14} className="mr-1" /> Download
          </Button>
          <Button onClick={handleShare} disabled={generating} data-testid="review-share-btn">
            {generating ? <Loader2 size={14} className="animate-spin mr-1" /> : <Share2 size={14} className="mr-1" />}
            Share
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
