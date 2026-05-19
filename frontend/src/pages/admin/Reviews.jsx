import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { reviewApi } from '../../api';
import { useBranch } from '../../context/BranchContext';
import { toast } from 'sonner';
import { Star, Search, ChevronRight, RefreshCw, Settings, Sparkles, AlertCircle, Share2 } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import PlatformIcon from '../../components/PlatformIcon';
import DataPagination, { usePagination } from '../../components/DataPagination';
import ReviewShareCard from '../../components/ReviewShareCard';

function StarRating({ rating }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={13} className={i <= rating ? 'fill-yellow-400 text-yellow-400' : 'fill-gray-100 text-gray-300'} />
      ))}
    </div>
  );
}

const STATUS_COLORS = {
  new: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  seen: 'bg-gray-100 text-gray-600 dark:bg-gray-800',
  replied: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  assigned: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  draft: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
};

const SENTIMENT_CONFIG = {
  positive: { label: 'Positive', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', dot: 'bg-emerald-500' },
  negative: { label: 'Negative', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', dot: 'bg-red-500' },
  neutral:  { label: 'Neutral',  color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400', dot: 'bg-gray-400' },
  mixed:    { label: 'Mixed',    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', dot: 'bg-amber-500' },
};

const PLATFORMS = ['google', 'tripadvisor', 'facebook', 'instagram', 'linkedin', 'x', 'yelp', 'trustpilot', 'foursquare', 'zomato', 'justdial'];
const STATUSES = ['new', 'seen', 'replied', 'assigned', 'draft'];
const SENTIMENTS = ['positive', 'negative', 'neutral', 'mixed'];

export default function Reviews() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentBranch } = useBranch();
  const [reviews, setReviews] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [shareReview, setShareReview] = useState(null);

  const platform = searchParams.get('platform') || '';
  const status   = searchParams.get('status')   || '';
  const rating   = searchParams.get('rating')   || '';
  const sentiment = searchParams.get('sentiment') || '';
  const manualReply = searchParams.get('manual_reply') === '1';

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 50 };
      if (platform)  params.platform  = platform;
      if (status)    params.status    = status;
      if (rating)    params.rating    = parseInt(rating);
      if (sentiment) params.sentiment = sentiment;
      if (manualReply) params.manual_reply_needed = true;
      if (currentBranch) params.branch_id = currentBranch.id;
      const { data } = await reviewApi.getReviews(params);
      setReviews(data.reviews || []);
      setTotal(data.total || 0);
    } catch (e) { console.error('JSON parse error:', e); } finally {
      setLoading(false);
    }
  }, [platform, status, rating, sentiment, manualReply, currentBranch]);

  useEffect(() => { fetchReviews(); }, [fetchReviews]);

  const setFilter = (key, val) => {
    const p = new URLSearchParams(searchParams);
    if (val) p.set(key, val); else p.delete(key);
    setSearchParams(p);
  };

  const handleAnalyzeSentiment = async () => {
    setAnalyzing(true);
    try {
      const params = currentBranch ? { branch_id: currentBranch.id } : {};
      const { data } = await reviewApi.analyzeSentiment(params);
      toast.success(`Sentiment analyzed for ${data.updated} review${data.updated !== 1 ? 's' : ''}`);
      fetchReviews();
    } catch (e) {
      toast.error('Failed to analyze sentiment');
    } finally {
      setAnalyzing(false);
    }
  };

  const filtered = reviews.filter(r =>
    !search || r.reviewer_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.text?.toLowerCase().includes(search.toLowerCase())
  );

  const pagination = usePagination(filtered, 10, [search, platform, status, rating, sentiment, manualReply]);
  const unseenCount = reviews.filter(r => !r.is_seen).length;
  const unanalyzedCount = reviews.filter(r => !r.sentiment).length;
  const manualReplyCount = reviews.filter(r => r.platform_reply_unsupported && r.reply_text).length;
  const activeFilters = [platform, status, rating, sentiment, manualReply ? '1' : ''].filter(Boolean).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold" style={{ fontFamily: 'Manrope' }}>Reviews</h1>
            {unseenCount > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-medium animate-pulse">
                {unseenCount} new
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{total} total reviews</p>
        </div>
        <div className="flex items-center gap-2">
          {unanalyzedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleAnalyzeSentiment}
              disabled={analyzing}
              data-testid="analyze-sentiment-btn"
            >
              {analyzing
                ? <RefreshCw size={14} className="animate-spin" />
                : <Sparkles size={14} className="text-violet-500" />}
              {analyzing ? 'Analyzing...' : `Analyze Sentiment (${unanalyzedCount})`}
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-2" onClick={fetchReviews} data-testid="refresh-reviews-btn">
            <RefreshCw size={14} /> Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-44">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Search reviews..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="review-search-input"
          />
        </div>

        <select
          className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          value={platform}
          onChange={e => setFilter('platform', e.target.value)}
          data-testid="platform-filter"
        >
          <option value="">All Platforms</option>
          {PLATFORMS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
        </select>

        <select
          className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          value={status}
          onChange={e => setFilter('status', e.target.value)}
          data-testid="status-filter"
        >
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>

        <select
          className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          value={rating}
          onChange={e => setFilter('rating', e.target.value)}
          data-testid="rating-filter"
        >
          <option value="">All Ratings</option>
          {[5, 4, 3, 2, 1].map(r => <option key={r} value={r}>{r} Stars</option>)}
        </select>

        {/* Sentiment filter */}
        <select
          className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          value={sentiment}
          onChange={e => setFilter('sentiment', e.target.value)}
          data-testid="sentiment-filter"
        >
          <option value="">All Sentiments</option>
          {SENTIMENTS.map(s => (
            <option key={s} value={s}>{SENTIMENT_CONFIG[s].label}</option>
          ))}
        </select>

        {/* Manual reply filter chip — surfaces when at least one row needs it */}
        {(manualReplyCount > 0 || manualReply) && (
          <button
            type="button"
            onClick={() => setFilter('manual_reply', manualReply ? '' : '1')}
            data-testid="manual-reply-filter-toggle"
            className={`px-3 py-2 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
              manualReply
                ? 'bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-200'
                : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/10 dark:border-amber-800 dark:text-amber-400'
            }`}
          >
            <AlertCircle size={12} />
            Manual reply needed
            <span className={`min-w-[18px] text-center px-1 rounded-full text-[10px] tabular-nums ${
              manualReply
                ? 'bg-amber-700 text-white dark:bg-amber-400 dark:text-amber-950'
                : 'bg-amber-200 text-amber-800 dark:bg-amber-800/40 dark:text-amber-200'
            }`}>
              {manualReplyCount}
            </span>
          </button>
        )}

        {activeFilters > 0 && (
          <button
            onClick={() => setSearchParams({})}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-2 rounded-lg hover:bg-muted"
            data-testid="clear-filters-btn"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Sentiment summary pills — shown when reviews have been analyzed */}
      {reviews.length > 0 && reviews.some(r => r.sentiment) && !sentiment && (
        <div className="flex flex-wrap gap-2">
          {SENTIMENTS.map(s => {
            const count = reviews.filter(r => r.sentiment === s).length;
            if (count === 0) return null;
            const cfg = SENTIMENT_CONFIG[s];
            return (
              <button
                key={s}
                onClick={() => setFilter('sentiment', s)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all hover:opacity-80 ${cfg.color}`}
                data-testid={`sentiment-pill-${s}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                {cfg.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Reviews list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-4">
          <Star size={40} className="text-muted-foreground mx-auto" />
          <div>
            <p className="text-foreground font-medium">
              {sentiment ? `No ${SENTIMENT_CONFIG[sentiment]?.label.toLowerCase()} reviews found` : 'No reviews yet'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {sentiment
                ? 'Try a different sentiment filter or clear filters to see all reviews.'
                : 'Connect and sync a platform to see real reviews.'}
            </p>
          </div>
          {!sentiment && (
            <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate('/admin/platforms')} data-testid="goto-platforms-btn">
              <Settings size={14} /> Go to Platforms
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {pagination.pageItems.map(review => {
            const sentCfg = review.sentiment ? SENTIMENT_CONFIG[review.sentiment] : null;
            return (
              <Link key={review.id} to={`/admin/reviews/${review.id}`} data-testid={`review-item-${review.id}`}>
                <Card className="hover:shadow-md transition-all hover:border-primary/30 cursor-pointer">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start gap-3">
                      <div className="flex items-center gap-1.5 shrink-0 mt-1">
                        <PlatformIcon platform={review.platform} size={18} />
                        {!review.is_seen && <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-medium text-sm text-foreground">{review.reviewer_name}</span>
                          <StarRating rating={review.rating} />
                          <span className="text-xs text-muted-foreground">{review.date}</span>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">{review.text}</p>
                        {review.reply_text && (
                          <p className="text-xs text-emerald-600 mt-1 truncate">
                            Replied: {review.reply_text.slice(0, 80)}...
                          </p>
                        )}
                        {review.draft_reply && (
                          <p className="text-xs text-violet-600 mt-1 truncate">
                            Draft: {review.draft_reply.slice(0, 80)}...
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        {sentCfg && (
                          <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${sentCfg.color}`} data-testid={`sentiment-badge-${review.id}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sentCfg.dot}`} />
                            {sentCfg.label}
                          </span>
                        )}
                        {review.platform_reply_unsupported && review.reply_text && (
                          <span
                            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700"
                            data-testid={`manual-reply-badge-${review.id}`}
                            title={review.platform_reply_message || 'This platform requires the reply to be posted manually.'}
                          >
                            <AlertCircle size={11} />
                            Manual reply
                          </span>
                        )}
                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[review.status] || STATUS_COLORS.seen}`}>
                          {review.status}
                        </span>
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setShareReview(review);
                            }}
                            className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                            title="Share as image"
                            data-testid={`share-review-btn-${review.id}`}
                          >
                            <Share2 size={13} />
                          </button>
                          <ChevronRight size={14} className="text-muted-foreground" />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
          <DataPagination {...pagination} itemLabel="reviews" testIdPrefix="reviews-pagination" className="mt-2 bg-card rounded-xl border border-border" />
        </div>
      )}

      {/* Share Review-as-image dialog */}
      {shareReview && (
        <ReviewShareCard
          review={shareReview}
          businessName={currentBranch?.name || 'Review'}
          onClose={() => setShareReview(null)}
        />
      )}
    </div>
  );
}
