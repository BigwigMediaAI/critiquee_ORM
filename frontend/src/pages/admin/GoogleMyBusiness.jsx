import { useState, useEffect, useCallback, useRef } from 'react';
import { useBranch } from '../../context/BranchContext';
import { gmbApi } from '../../api';
import { toast } from 'sonner';
import {
  Search, Star, MapPin, TrendingUp, Brain, Loader2, Check, ChevronRight,
  ExternalLink, Globe, Phone, RefreshCw, X, AlertTriangle, Award,
  ThumbsUp, ThumbsDown, Minus, Lightbulb, Shield, BarChart3, Users,
  Target, Trash2, Key, Eye, Share2, Download, ChevronLeft, Filter, QrCode, Copy, Link, Code2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { ScrollArea } from '../../components/ui/scroll-area';
import { Progress } from '../../components/ui/progress';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from '../../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '../../components/ui/select';
import html2canvas from 'html2canvas';
import { QRCodeCanvas } from 'qrcode.react';
import EmbedReviewsTab from '../../components/EmbedReviewsTab';
import GMBInsightsTab from '../../components/GMBInsightsTab';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
  RadialBarChart, RadialBar, Legend
} from 'recharts';

const TABS = [
  { id: 'reviews', label: 'Review Statistics', icon: Star },
  { id: 'competitors', label: 'Ranking & Competitors', icon: Users },
  { id: 'performance', label: 'Google Performance', icon: TrendingUp },
  { id: 'insights', label: 'Profile Insights', icon: BarChart3 },
  { id: 'sentiment', label: 'Sentiment Analysis', icon: Brain },
  { id: 'embed', label: 'Embedding Reviews', icon: Code2 },
];

const RADIUS_OPTIONS = [
  { value: 1000, label: '1 km' },
  { value: 2000, label: '2 km' },
  { value: 5000, label: '5 km' },
  { value: 10000, label: '10 km' },
  { value: 25000, label: '25 km' },
  { value: 50000, label: '50 km' },
];

const PIE_COLORS = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e'];
const SENTIMENT_COLORS = { positive: '#22c55e', neutral: '#eab308', negative: '#ef4444' };

// ─── Setup Flow ─────────────────────────────────────────────────────────────

function SetupFlow({ onComplete, hasApiKey, branchParam }) {
  const [step, setStep] = useState(hasApiKey ? 2 : 1);
  const [apiKey, setApiKey] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleSaveKey = async () => {
    if (!apiKey.trim()) return toast.error('Please enter your Google API key');
    setLoading(true);
    try {
      await gmbApi.saveApiKey({ api_key: apiKey.trim() }, branchParam);
      toast.success('API key saved');
      setStep(2);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save API key');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return toast.error('Please enter a search query');
    setLoading(true);
    try {
      const { data } = await gmbApi.search({ query: searchQuery.trim() }, branchParam);
      setResults(data.places || []);
      if (!data.places?.length) toast.info('No businesses found. Try a different search.');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await gmbApi.selectBusiness({ place_id: selected.place_id }, branchParam);
      toast.success('Business connected successfully!');
      setConfirmOpen(false);
      onComplete();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save business');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <MapPin size={28} className="text-blue-500" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Connect Google My Business</h1>
        <p className="text-muted-foreground">Search and select your business listing to get started</p>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {[1, 2].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
              step >= s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}>
              {step > s ? <Check size={16} /> : s}
            </div>
            {s < 2 && <div className={`w-12 h-0.5 ${step > s ? 'bg-primary' : 'bg-muted'}`} />}
          </div>
        ))}
      </div>

      {/* Step 1: API Key */}
      {step === 1 && (
        <Card data-testid="gmb-setup-apikey">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Key size={18} className="text-primary" />
              Enter Google Places API Key
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              A Google Places API key is required to fetch business data. You can get one from the{' '}
              <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer"
                className="text-primary underline">Google Cloud Console</a>. Make sure the
              <strong> Places API (New)</strong> is enabled.
            </p>
            <Input
              placeholder="AIzaSy..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              data-testid="gmb-api-key-input"
              type="password"
            />
            <Button onClick={handleSaveKey} disabled={loading} className="w-full" data-testid="gmb-save-key-btn">
              {loading ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
              Save & Continue
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Search & Select */}
      {step === 2 && (
        <Card data-testid="gmb-setup-search">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Search size={18} className="text-primary" />
              Search Your Business
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="e.g. Hilton Hotel New York"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                data-testid="gmb-search-input"
              />
              <Button onClick={handleSearch} disabled={loading} data-testid="gmb-search-btn">
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              </Button>
            </div>

            {results.length > 0 && (
              <ScrollArea className="max-h-[400px]">
                <div className="space-y-2">
                  {results.map((place) => (
                    <div
                      key={place.place_id}
                      onClick={() => { setSelected(place); setConfirmOpen(true); }}
                      data-testid={`gmb-result-${place.place_id}`}
                      className="flex items-start gap-3 p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all"
                    >
                      <MapPin size={18} className="text-primary mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground text-sm">{place.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{place.address}</p>
                        <div className="flex items-center gap-3 mt-1">
                          {place.rating && (
                            <span className="flex items-center gap-1 text-xs text-amber-500">
                              <Star size={11} fill="currentColor" /> {place.rating}
                            </span>
                          )}
                          {place.user_rating_count > 0 && (
                            <span className="text-xs text-muted-foreground">{place.user_rating_count} reviews</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-muted-foreground mt-1" />
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent data-testid="gmb-confirm-dialog">
          <DialogHeader>
            <DialogTitle>Confirm Business Selection</DialogTitle>
            <DialogDescription>Please verify the details below before connecting.</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 py-2">
              <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                <MapPin size={20} className="text-primary mt-0.5" />
                <div>
                  <p className="font-semibold text-foreground">{selected.name}</p>
                  <p className="text-sm text-muted-foreground">{selected.address}</p>
                  <div className="flex items-center gap-3 mt-2">
                    {selected.rating && (
                      <Badge variant="secondary" className="gap-1">
                        <Star size={11} fill="currentColor" className="text-amber-500" /> {selected.rating}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{selected.user_rating_count || 0} reviews</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={handleConfirm} disabled={loading} data-testid="gmb-confirm-btn">
              {loading ? <Loader2 size={16} className="animate-spin mr-2" /> : <Check size={16} className="mr-2" />}
              Confirm & Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Review Link Share Dialog ───────────────────────────────────────────────

function ReviewLinkDialog({ open, onClose, business }) {
  const qrRef = useRef(null);
  const reviewUrl = business?.place_id
    ? `https://search.google.com/local/writereview?placeid=${business.place_id}`
    : '';

  const handleCopyLink = () => {
    navigator.clipboard.writeText(reviewUrl).then(() => toast.success('Link copied!')).catch(() => toast.error('Copy failed'));
  };

  const handleDownloadQR = () => {
    const canvas = qrRef.current?.querySelector('canvas');
    if (!canvas) return;

    // Create a nicer image with padding and business name
    const size = 400;
    const pad = 40;
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = size + pad * 2;
    fullCanvas.height = size + pad * 2 + 60;
    const ctx = fullCanvas.getContext('2d');

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.roundRect(0, 0, fullCanvas.width, fullCanvas.height, 16);
    ctx.fill();

    // QR Code
    ctx.drawImage(canvas, pad, pad, size, size);

    // Business name
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(business?.name || 'Leave a Review', fullCanvas.width / 2, size + pad + 30);

    // Subtitle
    ctx.fillStyle = '#64748b';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('Scan to leave a Google Review', fullCanvas.width / 2, size + pad + 50);

    const link = document.createElement('a');
    link.download = `review-qr-${business?.name?.replace(/\s/g, '-') || 'business'}.png`;
    link.href = fullCanvas.toDataURL('image/png');
    link.click();
    toast.success('QR code downloaded!');
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Review ${business?.name}`, text: `Leave a review for ${business?.name}`, url: reviewUrl });
      } catch (err) {
        // navigator.share throws when user cancels — ignore silently, but log other errors
        if (err && err.name !== 'AbortError') {
          console.warn('Share failed:', err);
        }
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto" data-testid="review-link-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <QrCode size={18} className="text-primary" />
            Google Review Link
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          <div ref={qrRef} className="p-5 bg-white rounded-xl border border-border/50">
            <QRCodeCanvas
              value={reviewUrl}
              size={180}
              level="H"
              bgColor="#ffffff"
              fgColor="#0f172a"
              includeMargin={false}
            />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-semibold text-foreground">{business?.name}</p>
            <p className="text-xs text-muted-foreground">Scan the QR code or share the link below to collect Google reviews</p>
          </div>
          <div className="flex items-center gap-2 w-full p-2.5 bg-muted rounded-lg">
            <Link size={14} className="text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground truncate flex-1">{reviewUrl}</span>
            <button onClick={handleCopyLink} className="p-1.5 hover:bg-background rounded text-muted-foreground hover:text-foreground shrink-0" data-testid="copy-review-link">
              <Copy size={14} />
            </button>
          </div>
        </div>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button variant="outline" onClick={handleDownloadQR} className="gap-1.5" data-testid="download-qr-btn">
            <Download size={14} /> Download QR
          </Button>
          <Button onClick={handleShare} className="gap-1.5" data-testid="share-review-link-btn">
            <Share2 size={14} /> Share
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Business Header ────────────────────────────────────────────────────────

function BusinessHeader({ business, onRemove, onRefresh, loading }) {
  const [removeOpen, setRemoveOpen] = useState(false);
  const [reviewLinkOpen, setReviewLinkOpen] = useState(false);

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center shrink-0">
          <MapPin size={22} className="text-blue-500" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-foreground">{business.name}</h1>
            <button
              onClick={() => setReviewLinkOpen(true)}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
              title="Share Google Review Link"
              data-testid="gmb-share-review-link"
            >
              <Share2 size={16} />
            </button>
          </div>
          <p className="text-sm text-muted-foreground">{business.address}</p>
          <div className="flex items-center gap-3 mt-1.5">
            {business.rating && (
              <Badge variant="secondary" className="gap-1 text-xs">
                <Star size={11} fill="currentColor" className="text-amber-500" /> {business.rating}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">{business.user_rating_count || 0} reviews</span>
            {business.website_uri && (
              <a href={business.website_uri} target="_blank" rel="noreferrer" className="text-xs text-primary flex items-center gap-1 hover:underline">
                <Globe size={11} /> Website
              </a>
            )}
            {business.google_maps_uri && (
              <a href={business.google_maps_uri} target="_blank" rel="noreferrer" className="text-xs text-primary flex items-center gap-1 hover:underline">
                <ExternalLink size={11} /> Maps
              </a>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading} data-testid="gmb-refresh-btn">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setRemoveOpen(true)} className="text-red-500 hover:text-red-600" data-testid="gmb-remove-btn">
          <Trash2 size={14} />
        </Button>
      </div>

      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Business</DialogTitle>
            <DialogDescription>This will disconnect "{business.name}" from your account. You can reconnect later.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { onRemove(); setRemoveOpen(false); }} data-testid="gmb-confirm-remove-btn">
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReviewLinkDialog
        open={reviewLinkOpen}
        onClose={() => setReviewLinkOpen(false)}
        business={business}
      />
    </div>
  );
}

// ─── Review Statistics Tab ──────────────────────────────────────────────────

function ReviewShareCard({ review, businessName, onClose }) {
  const cardRef = useRef(null);
  const [generating, setGenerating] = useState(false);

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setGenerating(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const link = document.createElement('a');
      link.download = `review-${review.author?.replace(/\s/g, '_') || 'anonymous'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast.success('Image downloaded!');
    } catch (e) {
      toast.error('Failed to generate image');
    } finally {
      setGenerating(false);
    }
  };

  const handleShare = async () => {
    if (!cardRef.current) return;
    setGenerating(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
        logging: false,
      });
      canvas.toBlob(async (blob) => {
        if (navigator.share && blob) {
          const file = new File([blob], 'review.png', { type: 'image/png' });
          await navigator.share({ files: [file], title: `Review by ${review.author}` });
        } else {
          // Fallback: download
          const link = document.createElement('a');
          link.download = `review-${review.author?.replace(/\s/g, '_') || 'anonymous'}.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();
          toast.success('Image downloaded!');
        }
        setGenerating(false);
      }, 'image/png');
    } catch (e) {
      toast.error('Failed to share');
      setGenerating(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
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
            <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 16, fontWeight: 600, letterSpacing: 1 }}>
              {businessName?.toUpperCase() || 'REVIEW'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 700, fontSize: 18,
              }}>
                {review.author?.[0] || '?'}
              </div>
              <div>
                <div style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 15 }}>{review.author}</div>
                <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span key={`star-${i}`} style={{ color: i < review.rating ? '#facc15' : '#334155', fontSize: 16 }}>
                      &#9733;
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div style={{
              color: '#e2e8f0', fontSize: 14, lineHeight: 1.7, fontStyle: 'italic',
              borderLeft: '3px solid #3b82f6', paddingLeft: 14,
            }}>
              "{review.text || 'No text'}"
            </div>
            {review.time_description && (
              <div style={{ color: '#475569', fontSize: 11, marginTop: 16, textAlign: 'right' }}>
                {review.time_description}
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
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

function AllReviewsDialog({ businessName, open, onClose, branchParam }) {
  const [filterRating, setFilterRating] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);
  const [shareReview, setShareReview] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [oauthStatus, setOauthStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const perPage = 10;

  // Fetch Google OAuth connection status
  useEffect(() => {
    if (!open) return;
    const branchId = branchParam?.branch_id;
    (async () => {
      try {
        const params = branchId ? { branch_id: branchId } : {};
        const { data } = await gmbApi.getGoogleOAuthStatus(params);
        setOauthStatus(data);
      } catch (err) { console.error('Failed to load OAuth status:', err); }
    })();
  }, [open, branchParam?.branch_id]);

  const fetchReviews = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const params = { ...branchParam, page, limit: perPage };
      if (filterRating !== 'all') params.rating = parseInt(filterRating);
      if (searchText.trim()) params.search = searchText.trim();
      const { data } = await gmbApi.getAllReviews(params);
      setReviews(data.reviews || []);
      setTotal(data.total || 0);
      setTotalPages(data.total_pages || 1);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  }, [open, page, filterRating, searchText, branchParam?.branch_id]);

  useEffect(() => { fetchReviews(); }, [fetchReviews]);
  useEffect(() => { setPage(1); }, [filterRating, searchText]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data } = await gmbApi.syncReviews(branchParam);
      toast.success(`Synced ${data.synced_count || 0} reviews from Google`);
      fetchReviews();
      // Refresh OAuth status
      const { data: status } = await gmbApi.getGoogleOAuthStatus(branchParam);
      setOauthStatus(status);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh]" data-testid="all-reviews-dialog">
          <DialogHeader>
            <DialogTitle className="text-lg">All Reviews ({total})</DialogTitle>
          </DialogHeader>
          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-muted-foreground" />
              <Select value={filterRating} onValueChange={setFilterRating}>
                <SelectTrigger className="w-[130px] h-8 text-xs" data-testid="reviews-filter-rating">
                  <SelectValue placeholder="All Ratings" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Ratings</SelectItem>
                  {[5, 4, 3, 2, 1].map((s) => (
                    <SelectItem key={s} value={String(s)}>{s} Stars</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input
              placeholder="Search reviews..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="h-8 text-xs flex-1 min-w-[150px]"
              data-testid="reviews-search-input"
            />
          </div>
          {/* Google OAuth Sync Banner */}
          {oauthStatus && (
            <div className={`flex items-center justify-between p-3 rounded-lg text-sm ${
              oauthStatus.connected
                ? 'bg-emerald-500/5 border border-emerald-500/10'
                : 'bg-amber-500/5 border border-amber-500/10'
            }`}>
              <div className="flex items-center gap-2">
                {oauthStatus.connected ? (
                  <>
                    <Check size={14} className="text-emerald-500" />
                    <span className="text-foreground">
                      Google OAuth connected — <strong>{oauthStatus.synced_reviews}</strong> reviews synced
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={14} className="text-amber-500" />
                    <span className="text-foreground">
                      Connect Google OAuth in <strong>Platforms</strong> to fetch all {total > 5 ? total : '300+'} reviews
                    </span>
                  </>
                )}
              </div>
              {oauthStatus.connected && (
                <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} className="text-xs h-7 gap-1" data-testid="gmb-sync-reviews-btn">
                  {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                  Sync All Reviews
                </Button>
              )}
            </div>
          )}
          {/* Table */}
          <ScrollArea className="max-h-[55vh]">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                <Loader2 size={18} className="animate-spin mr-2" /> Loading reviews...
              </div>
            ) : reviews.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">No reviews match your filters</div>
            ) : (
              <div className="space-y-3">
                {reviews.map((r, i) => (
                  <div key={r.review_id || r.author_url || `${r.author}-${r.time}`} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg border border-border/50">
                    <div className="w-9 h-9 bg-primary/10 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-primary">
                      {r.author?.[0] || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">{r.author}</span>
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, s) => (
                            <Star key={`star-${s}`} size={11} className={s < r.rating ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30'} />
                          ))}
                        </div>
                        <span className="text-xs text-muted-foreground">{r.time_description}</span>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{r.text || 'No text'}</p>
                    </div>
                    <button
                      onClick={() => setShareReview(r)}
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary transition-colors shrink-0"
                      title="Share as image"
                      data-testid={`review-share-icon-${i}`}
                    >
                      <Share2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
          {/* Pagination */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="text-xs text-muted-foreground">
              Showing {total > 0 ? (page - 1) * perPage + 1 : 0}-{Math.min(page * perPage, total)} of {total}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="h-7 w-7 p-0">
                <ChevronLeft size={14} />
              </Button>
              <span className="text-xs px-2">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="h-7 w-7 p-0">
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {shareReview && (
        <ReviewShareCard review={shareReview} businessName={businessName} onClose={() => setShareReview(null)} />
      )}
    </>
  );
}

function ReviewStatsTab({ branchParam, businessName }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [allReviewsOpen, setAllReviewsOpen] = useState(false);

  const fetch = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const { data: d } = await gmbApi.getReviewStats({ ...branchParam, refresh });
      setData(d);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load review stats');
    } finally {
      setLoading(false);
    }
  }, [branchParam?.branch_id]);

  useEffect(() => { fetch(); }, [fetch]);

  if (loading && !data) return <LoadingState message="Loading review statistics..." />;
  if (!data) return <EmptyState message="Unable to load review statistics" />;

  const distData = Object.entries(data.distribution || {})
    .map(([star, count]) => ({ star: `${star}`, count, fill: PIE_COLORS[parseInt(star) - 1] }))
    .reverse();

  const totalDist = Object.values(data.distribution || {}).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6" data-testid="gmb-review-stats">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard icon={Star} label="Average Rating" value={data.avg_rating?.toFixed(1) || '0'} sub="/5" color="text-amber-500" />
        <MetricCard icon={BarChart3} label="Total Reviews" value={data.total_reviews?.toLocaleString() || '0'} color="text-blue-500" />
        <MetricCard icon={Target} label="Target Rating" value={data.target_rating?.toFixed(1) || '5.0'} sub="/5" color="text-emerald-500" />
        <MetricCard
          icon={TrendingUp}
          label={`Reviews to reach ${data.practical_target || 4.9}`}
          value={data.reviews_for_target?.toLocaleString() || '0'}
          sub="5-star reviews"
          color="text-purple-500"
        />
      </div>

      {/* Rating Distribution */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Rating Distribution</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => fetch(true)} disabled={loading}>
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Bar Chart */}
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distData} layout="vertical" margin={{ left: 10 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="star" width={40} tick={{ fontSize: 13 }}
                    tickFormatter={(v) => `${v} \u2605`} />
                  <Tooltip formatter={(v) => [`${v} reviews`, 'Count']} />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={24}>
                    {distData.map((entry) => <Cell key={entry.star} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Percentage Bars */}
            <div className="space-y-3">
              {distData.map((d) => (
                <div key={d.star} className="flex items-center gap-3">
                  <span className="text-sm w-12 text-right font-medium">{d.star} <Star size={11} className="inline text-amber-400" /></span>
                  <Progress value={totalDist ? (d.count / totalDist) * 100 : 0} className="h-2.5 flex-1" />
                  <span className="text-xs text-muted-foreground w-16 text-right">
                    {totalDist ? ((d.count / totalDist) * 100).toFixed(1) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Reviews */}
      {data.reviews?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Reviews</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAllReviewsOpen(true)}
                className="text-xs gap-1"
                data-testid="gmb-view-all-reviews-btn"
              >
                <Eye size={13} /> View All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.reviews.slice(0, 3).map((r) => (
                <div key={r.review_id || r.author_url || `${r.author}-${r.time}`} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                  <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-primary">
                    {r.author?.[0] || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">{r.author}</span>
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, s) => (
                          <Star key={`star-${s}`} size={11} className={s < r.rating ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30'} />
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">{r.time_description}</span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{r.text || 'No text'}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <AllReviewsDialog
        businessName={businessName}
        open={allReviewsOpen}
        onClose={() => setAllReviewsOpen(false)}
        branchParam={branchParam}
      />
    </div>
  );
}

// ─── Competitors Tab ────────────────────────────────────────────────────────

function CompetitorsTab({ branchParam, business }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [radius, setRadius] = useState(5000);

  const fetch = useCallback(async (r = radius, refresh = false) => {
    setLoading(true);
    try {
      const { data: d } = await gmbApi.getCompetitors({ ...branchParam, radius: r, refresh });
      setData(d);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load competitors');
    } finally {
      setLoading(false);
    }
  }, [branchParam?.branch_id]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleRadiusChange = (r) => { setRadius(r); fetch(r, true); };

  if (loading && !data) return <LoadingState message="Finding nearby competitors..." />;
  if (!data) return <EmptyState message="Unable to load competitor data" />;

  const competitors = data.competitors || [];
  const ourBiz = data.our_business || business;

  // Use real search rank from backend (always computed, never 0)
  const searchRank = data.search_rank || 1;
  const totalInArea = data.total_in_area || (competitors.length + 1);

  return (
    <div className="space-y-6" data-testid="gmb-competitors">
      {/* Rank Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard icon={Award} label="Search Rank" value={`#${searchRank}`} sub={`of ${totalInArea}`} color="text-blue-500" />
        <MetricCard icon={Users} label="Related Competitors" value={competitors.length} color="text-purple-500" />
        <MetricCard icon={Target} label="Search Radius" value={RADIUS_OPTIONS.find((r) => r.value === radius)?.label || `${radius}m`} color="text-emerald-500" />
      </div>

      {/* Radius Selector */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-foreground">Search Radius:</span>
            {RADIUS_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={radius === opt.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleRadiusChange(opt.value)}
                disabled={loading}
                className="text-xs h-7"
                data-testid={`gmb-radius-${opt.value}`}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Map Embed */}
      {ourBiz?.lat && ourBiz?.lng && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Area Map</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full h-[300px] rounded-lg overflow-hidden bg-muted">
              <iframe
                title="Business Map"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://www.google.com/maps?q=${ourBiz.lat},${ourBiz.lng}&z=14&output=embed`}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Competitor List */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Competitor Comparison</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => fetch(radius, true)} disabled={loading}>
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {competitors.length === 0 ? (
            <EmptyState message="No competitors found in this radius" />
          ) : (
            <div className="space-y-2">
              {/* Our business highlighted */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">
                  #{searchRank}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{ourBiz.name} <Badge className="ml-1 text-[10px]">You</Badge></p>
                </div>
                <div className="flex items-center gap-4 text-xs shrink-0">
                  <span className="flex items-center gap-1 text-amber-500 font-medium">
                    <Star size={12} fill="currentColor" /> {ourBiz.rating || '-'}
                  </span>
                  <span className="text-muted-foreground">{ourBiz.user_rating_count || 0} reviews</span>
                </div>
              </div>
              {/* Competitors */}
              {competitors.map((c, i) => {
                const cRank = c.search_rank || (i + 1);
                const ratingDiff = (ourBiz.rating || 0) - (c.rating || 0);
                return (
                  <div key={c.place_id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors border border-transparent hover:border-border">
                    <span className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                      #{cRank}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.address}</p>
                    </div>
                    <div className="flex items-center gap-4 text-xs shrink-0">
                      <span className="flex items-center gap-1 text-amber-500 font-medium">
                        <Star size={12} fill="currentColor" /> {c.rating || '-'}
                      </span>
                      <span className="text-muted-foreground w-16 text-right">{c.user_rating_count || 0} reviews</span>
                      <Badge variant={ratingDiff > 0 ? 'default' : ratingDiff < 0 ? 'destructive' : 'secondary'} className="text-[10px] w-14 justify-center">
                        {ratingDiff > 0 ? '+' : ''}{ratingDiff.toFixed(1)}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Performance Tab ────────────────────────────────────────────────────────

function PerformanceTab({ branchParam }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await gmbApi.getPerformance(branchParam);
      setData(d);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load performance data');
    } finally {
      setLoading(false);
    }
  }, [branchParam?.branch_id]);

  useEffect(() => { fetch(); }, [fetch]);

  if (loading && !data) return <LoadingState message="Calculating performance..." />;
  if (!data) return <EmptyState message="Unable to load performance data" />;

  const score = data.score || {};
  const breakdown = score.breakdown || {};
  const radialData = [
    { name: 'Score', value: score.total_score || 0, fill: score.total_score >= 70 ? '#22c55e' : score.total_score >= 40 ? '#eab308' : '#ef4444' },
  ];

  return (
    <div className="space-y-6" data-testid="gmb-performance">
      {/* Score */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-1">
          <CardContent className="pt-6 flex flex-col items-center">
            <div className="h-[180px] w-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="90%" data={radialData} startAngle={90} endAngle={-270}>
                  <RadialBar dataKey="value" cornerRadius={10} background={{ fill: 'hsl(var(--muted))' }} />
                </RadialBarChart>
              </ResponsiveContainer>
            </div>
            <div className="text-center -mt-[105px]">
              <p className="text-3xl font-bold text-foreground">{score.total_score || 0}</p>
              <p className="text-xs text-muted-foreground">/ 100</p>
            </div>
            <p className="text-sm font-medium text-foreground mt-14">Overall Performance Score</p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Score Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(breakdown).map(([key, val]) => (
              <div key={key} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium capitalize">{key}</span>
                  <span className="text-sm text-muted-foreground">{val.score}/{val.max}</span>
                </div>
                <Progress value={(val.score / val.max) * 100} className="h-2" />
                <p className="text-xs text-muted-foreground">{val.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Ranking */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard icon={Award} label="Local Rank" value={`#${data.rank}`} sub={`of ${data.total_in_area}`} color="text-blue-500" />
        <MetricCard icon={Star} label="Rating" value={data.rating?.toFixed(1) || '-'} sub="/5" color="text-amber-500" />
        <MetricCard icon={BarChart3} label="Total Reviews" value={data.user_rating_count?.toLocaleString() || '0'} color="text-purple-500" />
      </div>

      {/* Keywords */}
      {data.keywords?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Keyword Visibility</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">Your business appears for these search categories:</p>
            <div className="flex flex-wrap gap-2">
              {data.keywords.map((kw) => (
                <Badge key={kw} variant="secondary" className="text-xs">{kw}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Lightbulb size={16} className="text-amber-500" /> Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {!data.has_website && (
              <RecommendationItem type="warning" text="Add a website link to your Google Business Profile to improve completeness score." />
            )}
            {!data.has_phone && (
              <RecommendationItem type="warning" text="Add a phone number to your business listing for better customer accessibility." />
            )}
            {(data.rating || 0) < 4.0 && (
              <RecommendationItem type="info" text="Focus on improving customer experience to boost your average rating above 4.0." />
            )}
            {(data.user_rating_count || 0) < 50 && (
              <RecommendationItem type="info" text="Encourage satisfied customers to leave reviews. More reviews improve search visibility." />
            )}
            {data.rank > 3 && (
              <RecommendationItem type="info" text="You're not in the top 3 locally. Improving ratings and review volume can help." />
            )}
            {(data.rating || 0) >= 4.0 && data.has_website && data.has_phone && data.rank <= 3 && (
              <RecommendationItem type="success" text="Great job! Your business profile is well-optimized. Keep engaging with customers." />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Sentiment Tab ──────────────────────────────────────────────────────────

function SentimentTab({ branchParam }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    const branchId = branchParam?.branch_id;
    (async () => {
      try {
        const params = branchId ? { branch_id: branchId } : {};
        const { data: d } = await gmbApi.getSentiment(params);
        if (d.sentiment) setData(d.sentiment);
      } catch (err) { console.error('Failed to load sentiment:', err); }
      finally { setInitialLoading(false); }
    })();
  }, [branchParam?.branch_id]);

  const runAnalysis = async () => {
    setLoading(true);
    try {
      const { data: d } = await gmbApi.runSentiment(branchParam);
      setData(d.sentiment);
      toast.success('Sentiment analysis complete');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Sentiment analysis failed');
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) return <LoadingState message="Loading sentiment data..." />;

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-16" data-testid="gmb-sentiment-empty">
        <Brain size={48} className="text-muted-foreground/30 mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">AI Sentiment Analysis</h3>
        <p className="text-sm text-muted-foreground mb-6 text-center max-w-md">
          Analyze your customer reviews using AI to uncover sentiment patterns, common complaints, strengths, and actionable improvement suggestions.
        </p>
        <Button onClick={runAnalysis} disabled={loading} data-testid="gmb-run-sentiment-btn">
          {loading ? <Loader2 size={16} className="animate-spin mr-2" /> : <Brain size={16} className="mr-2" />}
          Run AI Analysis
        </Button>
      </div>
    );
  }

  const sentimentPie = [
    { name: 'Positive', value: data.positive_percentage || 0, fill: SENTIMENT_COLORS.positive },
    { name: 'Neutral', value: data.neutral_percentage || 0, fill: SENTIMENT_COLORS.neutral },
    { name: 'Negative', value: data.negative_percentage || 0, fill: SENTIMENT_COLORS.negative },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6" data-testid="gmb-sentiment">
      <div className="flex items-center justify-between">
        <div />
        <Button variant="outline" size="sm" onClick={runAnalysis} disabled={loading} data-testid="gmb-rerun-sentiment-btn">
          {loading ? <Loader2 size={14} className="animate-spin mr-1" /> : <RefreshCw size={14} className="mr-1" />}
          Re-analyze
        </Button>
      </div>

      {/* Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-1">
          <CardContent className="pt-6 flex flex-col items-center">
            <div className="h-[180px] w-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={sentimentPie} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" paddingAngle={3}>
                    {sentimentPie.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip formatter={(v) => [`${v}%`, '']} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <SentimentBadge sentiment={data.overall_sentiment} />
            <p className="text-sm text-muted-foreground mt-1">Score: {data.sentiment_score}/10</p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">{data.summary}</p>
            {data.rating_prediction && (
              <div className="flex items-start gap-2 p-3 bg-blue-500/5 rounded-lg border border-blue-500/10">
                <TrendingUp size={16} className="text-blue-500 mt-0.5 shrink-0" />
                <p className="text-sm text-foreground">{data.rating_prediction}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Strengths & Complaints */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ThumbsUp size={16} className="text-emerald-500" /> Strengths
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.strengths?.length ? (
              <div className="space-y-2">
                {data.strengths.map((s) => (
                  <div key={s} className="flex items-start gap-2 text-sm">
                    <Check size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                    <span className="text-muted-foreground">{s}</span>
                  </div>
                ))}
              </div>
            ) : <EmptyState message="No strengths identified" />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ThumbsDown size={16} className="text-red-500" /> Common Complaints
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.complaints?.length ? (
              <div className="space-y-2">
                {data.complaints.map((c) => (
                  <div key={c} className="flex items-start gap-2 text-sm">
                    <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
                    <span className="text-muted-foreground">{c}</span>
                  </div>
                ))}
              </div>
            ) : <EmptyState message="No complaints identified" />}
          </CardContent>
        </Card>
      </div>

      {/* Improvement Suggestions */}
      {data.improvement_suggestions?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb size={16} className="text-amber-500" /> Improvement Suggestions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.improvement_suggestions.map((s) => (
                <div key={s.title} className="flex items-start gap-3 p-3 bg-amber-500/5 rounded-lg border border-amber-500/10">
                  <div className="w-6 h-6 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0 text-xs font-bold text-amber-600">
                    {data.improvement_suggestions.indexOf(s) + 1}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{s.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Shared Components ──────────────────────────────────────────────────────

function MetricCard({ icon: Icon, label, value, sub, color = 'text-primary' }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon size={15} className={color} />
          <span className="text-xs text-muted-foreground font-medium">{label}</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-foreground">{value}</span>
          {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <Loader2 size={32} className="animate-spin mb-3" />
      <span className="text-sm">{message}</span>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
      <AlertTriangle size={24} className="mb-2 opacity-30" />
      <span className="text-sm">{message}</span>
    </div>
  );
}

function SentimentBadge({ sentiment }) {
  const config = {
    positive: { icon: ThumbsUp, color: 'text-emerald-500 bg-emerald-500/10', label: 'Positive' },
    neutral: { icon: Minus, color: 'text-amber-500 bg-amber-500/10', label: 'Neutral' },
    negative: { icon: ThumbsDown, color: 'text-red-500 bg-red-500/10', label: 'Negative' },
  };
  const c = config[sentiment] || config.neutral;
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium mt-2 ${c.color}`}>
      <c.icon size={14} /> {c.label}
    </div>
  );
}

function RecommendationItem({ type, text }) {
  const icons = { warning: AlertTriangle, info: Lightbulb, success: Check };
  const colors = { warning: 'text-amber-500 bg-amber-500/5 border-amber-500/10', info: 'text-blue-500 bg-blue-500/5 border-blue-500/10', success: 'text-emerald-500 bg-emerald-500/5 border-emerald-500/10' };
  const Icon = icons[type] || Lightbulb;
  return (
    <div className={`flex items-start gap-2 p-3 rounded-lg border ${colors[type]}`}>
      <Icon size={15} className="mt-0.5 shrink-0" />
      <span className="text-sm text-foreground">{text}</span>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function GoogleMyBusiness() {
  const { currentBranch } = useBranch();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('reviews');

  const branchParam = currentBranch ? { branch_id: currentBranch.id } : {};

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await gmbApi.getStatus(branchParam);
      setStatus(data);
    } catch (e) {
      toast.error('Failed to load GMB status');
    } finally {
      setLoading(false);
    }
  }, [currentBranch?.id]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleRemove = async () => {
    try {
      await gmbApi.removeBusiness(branchParam);
      toast.success('Business disconnected');
      fetchStatus();
    } catch (e) {
      toast.error('Failed to remove business');
    }
  };

  if (loading && !status) {
    return <LoadingState message="Loading Google My Business..." />;
  }

  // Setup flow
  if (!status?.configured) {
    return (
      <SetupFlow
        onComplete={fetchStatus}
        hasApiKey={status?.has_api_key}
        branchParam={branchParam}
      />
    );
  }

  return (
    <div data-testid="gmb-page">
      <BusinessHeader
        business={status.business}
        onRemove={handleRemove}
        onRefresh={fetchStatus}
        loading={loading}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6 w-full justify-start flex-wrap h-auto gap-1 bg-transparent p-0">
          {TABS.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              data-testid={`gmb-tab-${tab.id}`}
              className="gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg px-4 py-2 text-sm"
            >
              <tab.icon size={14} />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="reviews">
          <ReviewStatsTab branchParam={branchParam} businessName={status.business?.name} />
        </TabsContent>
        <TabsContent value="competitors">
          <CompetitorsTab branchParam={branchParam} business={status.business} />
        </TabsContent>
        <TabsContent value="performance">
          <PerformanceTab branchParam={branchParam} />
        </TabsContent>
        <TabsContent value="insights">
          <GMBInsightsTab branchParam={branchParam} />
        </TabsContent>
        <TabsContent value="sentiment">
          <SentimentTab branchParam={branchParam} />
        </TabsContent>
        <TabsContent value="embed">
          <EmbedReviewsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
