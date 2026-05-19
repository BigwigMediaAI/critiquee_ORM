import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Star, Loader2, ExternalLink, Check, Send, ArrowRight, ClipboardCheck } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent } from '../../components/ui/card';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const PLATFORM_ICONS = {
  google: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  ),
  tripadvisor: (
    <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="10" fill="#34E0A1"/><text x="12" y="16" textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">T</text></svg>
  ),
  booking: (
    <svg viewBox="0 0 24 24" width="20" height="20"><rect width="24" height="24" rx="4" fill="#003580"/><text x="12" y="16" textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">B</text></svg>
  ),
  facebook: (
    <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="10" fill="#1877F2"/><path d="M15.5 12.5h-2v7h-3v-7h-2v-2.5h2v-1.5c0-2.1 1-3.5 3.5-3.5h2v2.5h-1.5c-.8 0-1 .3-1 1v1.5h2.5l-.5 2.5z" fill="white"/></svg>
  ),
  yelp: (
    <svg viewBox="0 0 24 24" width="20" height="20"><rect width="24" height="24" rx="4" fill="#D32323"/><text x="12" y="16" textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">Y</text></svg>
  ),
  trustpilot: (
    <svg viewBox="0 0 24 24" width="20" height="20"><rect width="24" height="24" rx="4" fill="#00B67A"/><text x="12" y="16" textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">T</text></svg>
  ),
  expedia: (
    <svg viewBox="0 0 24 24" width="20" height="20"><rect width="24" height="24" rx="4" fill="#FBCE00"/><text x="12" y="16" textAnchor="middle" fontSize="10" fill="#1C3150" fontWeight="bold">E</text></svg>
  ),
  hotels_com: (
    <svg viewBox="0 0 24 24" width="20" height="20"><rect width="24" height="24" rx="4" fill="#D32F2F"/><text x="12" y="16" textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">H</text></svg>
  ),
  opentable: (
    <svg viewBox="0 0 24 24" width="20" height="20"><rect width="24" height="24" rx="4" fill="#DA3743"/><text x="12" y="16" textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">O</text></svg>
  ),
  zomato: (
    <svg viewBox="0 0 24 24" width="20" height="20"><rect width="24" height="24" rx="4" fill="#E23744"/><text x="12" y="16" textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">Z</text></svg>
  ),
  agoda: (
    <svg viewBox="0 0 24 24" width="20" height="20"><rect width="24" height="24" rx="4" fill="#5C2D91"/><text x="12" y="16" textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">A</text></svg>
  ),
  airbnb: (
    <svg viewBox="0 0 24 24" width="20" height="20"><rect width="24" height="24" rx="4" fill="#FF5A5F"/><text x="12" y="16" textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">A</text></svg>
  ),
  foursquare: (
    <svg viewBox="0 0 24 24" width="20" height="20"><rect width="24" height="24" rx="4" fill="#F94877"/><text x="12" y="16" textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">F</text></svg>
  ),
  glassdoor: (
    <svg viewBox="0 0 24 24" width="20" height="20"><rect width="24" height="24" rx="4" fill="#0CAA41"/><text x="12" y="16" textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">G</text></svg>
  ),
};

function DefaultPlatformIcon({ name }) {
  const letter = (name || '?')[0].toUpperCase();
  return (
    <svg viewBox="0 0 24 24" width="20" height="20">
      <rect width="24" height="24" rx="4" fill="#6366f1"/>
      <text x="12" y="16" textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">{letter}</text>
    </svg>
  );
}

function HalfStarRating({ value, onChange }) {
  const [hover, setHover] = useState(0);

  return (
    <div className="flex items-center gap-1" data-testid="star-rating-input">
      {Array.from({ length: 5 }).map((_, i) => {
        const starNum = i + 1;
        const leftHalf = starNum - 0.5;
        return (
          <div key={i} className="relative w-8 h-8 cursor-pointer">
            {/* Left half */}
            <div
              className="absolute inset-0 w-1/2 z-10"
              onMouseEnter={() => setHover(leftHalf)}
              onMouseLeave={() => setHover(0)}
              onClick={() => onChange(leftHalf)}
            />
            {/* Right half */}
            <div
              className="absolute right-0 top-0 w-1/2 h-full z-10"
              onMouseEnter={() => setHover(starNum)}
              onMouseLeave={() => setHover(0)}
              onClick={() => onChange(starNum)}
            />
            {/* Star display */}
            <Star
              size={30}
              className={`absolute inset-0 transition-colors ${
                (hover || value) >= starNum
                  ? 'text-amber-400 fill-amber-400'
                  : (hover || value) >= leftHalf
                  ? 'text-amber-400'
                  : 'text-gray-300'
              }`}
              style={
                (hover || value) >= leftHalf && (hover || value) < starNum
                  ? {
                      background: 'linear-gradient(90deg, #fbbf24 50%, #d1d5db 50%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      fill: 'url(#half-fill)',
                    }
                  : undefined
              }
            />
            {/* Half star SVG overlay */}
            {(hover || value) >= leftHalf && (hover || value) < starNum && (
              <svg className="absolute inset-0" viewBox="0 0 30 30" width="30" height="30">
                <defs>
                  <clipPath id={`half-${i}`}><rect x="0" y="0" width="15" height="30" /></clipPath>
                </defs>
                <path
                  d="M15 2l3.7 7.5L27 10.9l-6 5.8 1.4 8.3L15 21l-7.4 4 1.4-8.3-6-5.8 8.3-1.4z"
                  fill="#fbbf24"
                  clipPath={`url(#half-${i})`}
                />
              </svg>
            )}
          </div>
        );
      })}
      {(hover || value) > 0 && (
        <span className="text-lg font-semibold text-foreground ml-2">{hover || value}</span>
      )}
    </div>
  );
}

// Step states
const STEP_FORM = 'form';
const STEP_THANK_YOU = 'thank_you';
const STEP_PLATFORMS = 'platforms';

export default function ReviewForm() {
  const { branchId } = useParams();
  const [businessInfo, setBusinessInfo] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(STEP_FORM);

  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [dob, setDob] = useState('');
  const [ratings, setRatings] = useState({}); // {dimensionId: starValue}
  const [reviewText, setReviewText] = useState('');

  // Platforms
  const [platforms, setPlatforms] = useState([]);
  const [clickedPlatforms, setClickedPlatforms] = useState(new Set());
  const [reviewCopied, setReviewCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/review-link/public/${branchId}`);
        if (res.ok) {
          setBusinessInfo(await res.json());
        }
      } catch (err) { console.error('Failed to load business info:', err); }
      finally { setPageLoading(false); }
    })();
  }, [branchId]);

  // Resolve the active rating dimensions — falls back to the implicit single
  // "How was your experience?" prompt when the business hasn't configured any.
  const activeDimensions = (businessInfo?.rating_dimensions && businessInfo.rating_dimensions.length > 0)
    ? businessInfo.rating_dimensions
    : [{ id: 'default', label: 'How was your experience?', required: true }];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Please enter your name');
    if (!email.trim()) return toast.error('Please enter your email');
    // Validate every required dimension has a rating
    for (const dim of activeDimensions) {
      const v = ratings[dim.id];
      if (dim.required && (!v || v <= 0)) {
        return toast.error(`Please rate "${dim.label}"`);
      }
    }
    // At least one rating required overall
    const submittedRatings = activeDimensions
      .map((d) => ({ id: d.id, label: d.label, value: ratings[d.id] || 0 }))
      .filter((r) => r.value > 0);
    if (submittedRatings.length === 0) {
      return toast.error('Please give at least one star rating');
    }

    setSubmitting(true);

    // Initiate the clipboard write synchronously, while we're still inside the
    // user-gesture (form submit) chain. Awaiting `fetch` first would break the
    // gesture chain and Safari / strict CSP would reject the writeText call.
    // We hold the Promise and await it after the API call resolves.
    const trimmedText = reviewText.trim();
    let copyPromise = null;
    if (trimmedText) {
      try {
        copyPromise = navigator.clipboard.writeText(trimmedText);
      } catch {
        /* clipboard unavailable (e.g. insecure iframe) — fall through */
      }
    }

    try {
      const res = await fetch(`${API_URL}/api/review-link/public/${branchId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          mobile: mobile.trim(),
          date_of_birth: dob || null,
          ratings: submittedRatings,
          review_text: reviewText.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Submission failed');

      // Auto-copy the review text to the clipboard so the customer can paste
      // it on any external platform (Google / TripAdvisor / etc.) they're
      // redirected to next.
      if (copyPromise) {
        try {
          await copyPromise;
          setReviewCopied(true);
          toast.success('Review copied to clipboard — paste it on the next platform!');
        } catch {
          /* clipboard blocked (e.g. older browser) — silent fallback */
        }
      }

      if (data.redirect_to_platforms) {
        // Fetch platforms
        try {
          const pRes = await fetch(`${API_URL}/api/review-link/public/${branchId}/platforms`);
          const pData = await pRes.json();
          if (pData.platforms?.length > 0) {
            setPlatforms(pData.platforms);
            setStep(STEP_PLATFORMS);
            return;
          }
        } catch (err) { console.error('Failed to load platforms:', err); /* fall through to thank you */ }
      }
      setStep(STEP_THANK_YOU);
    } catch (err) {
      toast.error(err.message || 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePlatformClick = (platform) => {
    window.open(platform.review_url, '_blank');
    setClickedPlatforms(prev => {
      const next = new Set(prev);
      next.add(platform.platform);
      return next;
    });
  };

  const remainingPlatforms = platforms.filter(p => !clickedPlatforms.has(p.platform));

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-blue-500" />
      </div>
    );
  }

  if (!businessInfo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full"><CardContent className="pt-6 text-center">
          <p className="text-muted-foreground">This review link is not available.</p>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-blue-600/20">
            <Star size={24} className="text-white fill-white" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">{businessInfo.business_name}</h1>
          {businessInfo.branch_name && (
            <p className="text-sm text-slate-500 mt-0.5">{businessInfo.branch_name}</p>
          )}
        </div>

        {/* Form Step */}
        {step === STEP_FORM && (
          <Card className="shadow-xl shadow-black/5 border-0" data-testid="review-form-card">
            <CardContent className="pt-6 space-y-5">
              {/* Multi-aspect ratings */}
              <div className="space-y-4" data-testid="rating-dimensions">
                {activeDimensions.map((dim) => (
                  <div key={dim.id} className="text-center" data-testid={`rating-dim-${dim.id}`}>
                    <p className="text-sm text-slate-600 font-medium">
                      {dim.label}
                      {dim.required && <span className="text-rose-500 ml-0.5">*</span>}
                    </p>
                    <div className="flex justify-center mt-2">
                      <HalfStarRating
                        value={ratings[dim.id] || 0}
                        onChange={(v) => setRatings((prev) => ({ ...prev, [dim.id]: v }))}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1 block">Name *</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your full name"
                    data-testid="review-name"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1 block">Email *</label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    data-testid="review-email"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1 block">Mobile Number</label>
                  <Input
                    type="tel"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    placeholder="+1 234 567 890"
                    data-testid="review-mobile"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1 block">
                    Date of Birth <span className="text-slate-400 font-normal text-xs">(optional)</span>
                  </label>
                  <Input
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    max={new Date().toISOString().slice(0, 10)}
                    data-testid="review-dob"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1 block">Your Review</label>
                  <textarea
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    placeholder="Tell us about your experience..."
                    rows={3}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                    data-testid="review-text"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full gap-2"
                  disabled={submitting || activeDimensions.some(d => d.required && !(ratings[d.id] > 0))}
                  data-testid="submit-review-btn"
                >
                  {submitting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                  Submit Review
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Thank You Step */}
        {step === STEP_THANK_YOU && (
          <Card className="shadow-xl shadow-black/5 border-0" data-testid="thank-you-card">
            <CardContent className="pt-8 pb-8 text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                <Check size={32} className="text-emerald-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-800">Thank you for your feedback!</h2>
              <p className="text-sm text-slate-500 max-w-sm mx-auto">
                We appreciate you taking the time to share your experience with us. Your feedback helps us improve.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Platform Redirect Step */}
        {step === STEP_PLATFORMS && (
          <Card className="shadow-xl shadow-black/5 border-0" data-testid="platforms-card">
            <CardContent className="pt-6 space-y-5">
              <div className="text-center">
                <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Check size={28} className="text-emerald-600" />
                </div>
                <h2 className="text-lg font-bold text-slate-800">Thank you!</h2>
                <p className="text-sm text-slate-500 mt-1">
                  We'd love for you to share your experience on these platforms too
                </p>
              </div>

              {reviewCopied && remainingPlatforms.length > 0 && (
                <div
                  className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-100 text-blue-800"
                  data-testid="review-copied-hint"
                >
                  <ClipboardCheck size={16} className="text-blue-600 shrink-0 mt-0.5" />
                  <div className="text-xs leading-relaxed">
                    <strong className="font-semibold">Your review is copied to your clipboard.</strong>{' '}
                    Just paste it (Ctrl/Cmd + V) when you reach the platform.
                  </div>
                </div>
              )}

              {remainingPlatforms.length > 0 ? (
                <div className="space-y-2">
                  {remainingPlatforms.map((p) => (
                    <button
                      key={p.platform}
                      onClick={() => handlePlatformClick(p)}
                      className="w-full flex items-center gap-3 p-3.5 rounded-lg border border-border hover:border-blue-300 hover:bg-blue-50/50 transition-all group"
                      data-testid={`platform-${p.platform}`}
                    >
                      <div className="shrink-0">
                        {PLATFORM_ICONS[p.platform] || <DefaultPlatformIcon name={p.name} />}
                      </div>
                      <span className="text-sm font-medium text-slate-700 flex-1 text-left">
                        Leave a review on {p.name}
                      </span>
                      <ExternalLink size={15} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4">
                  <Check size={24} className="mx-auto text-emerald-500 mb-2" />
                  <p className="text-sm text-slate-600 font-medium">All done! Thank you for your reviews.</p>
                </div>
              )}

              {clickedPlatforms.size > 0 && remainingPlatforms.length > 0 && (
                <p className="text-xs text-center text-slate-400">
                  {clickedPlatforms.size} of {platforms.length} platform{platforms.length > 1 ? 's' : ''} reviewed
                </p>
              )}

              <Button
                variant="ghost"
                className="w-full text-slate-500 text-sm"
                onClick={() => setStep(STEP_THANK_YOU)}
                data-testid="skip-platforms-btn"
              >
                {remainingPlatforms.length > 0 ? 'Skip' : 'Done'}
                <ArrowRight size={14} className="ml-1" />
              </Button>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-slate-400 mt-4">
          Powered by Critiquee
        </p>
        <div className="flex items-center justify-center gap-3 mt-1.5 text-[11px] text-slate-400">
          <a
            href="/tandc"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-600 hover:underline transition-colors"
            data-testid="footer-tandc-link"
          >
            T&amp;C
          </a>
          <span className="text-slate-300">·</span>
          <a
            href="/pp"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-600 hover:underline transition-colors"
            data-testid="footer-privacy-link"
          >
            Privacy Policy
          </a>
        </div>
      </div>
    </div>
  );
}
