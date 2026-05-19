import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { reviewApi, aiApi, departmentApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { toast } from 'sonner';
import {
  Star, ChevronLeft, Sparkles, Loader2, CheckCircle, Clock, Send, UserPlus, ExternalLink, AlertCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import PlatformIcon, { getPlatformLabel } from '../../components/PlatformIcon';

function StarRating({ rating }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={14} className={i <= rating ? 'fill-yellow-400 text-yellow-400' : 'fill-gray-100 text-gray-300'} />
      ))}
    </div>
  );
}

const STATUS_COLORS = {
  new: 'bg-blue-100 text-blue-700', seen: 'bg-gray-100 text-gray-600',
  replied: 'bg-emerald-100 text-emerald-700', assigned: 'bg-amber-100 text-amber-700',
  draft: 'bg-violet-100 text-violet-700',
};

export default function ReviewDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { currentBranch } = useBranch();
  const navigate = useNavigate();
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selectedDept, setSelectedDept] = useState('');
  const [assignNotes, setAssignNotes] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    const params = currentBranch ? { branch_id: currentBranch.id } : {};
    Promise.all([
      reviewApi.getReview(id),
      departmentApi.getDepartments(params),
    ]).then(([r, d]) => {
      setReview(r.data);
      setDepartments(d.data || []);
      if (r.data.reply_text) setReplyText(r.data.reply_text);
    }).catch(() => toast.error('Failed to load review'))
      .finally(() => setLoading(false));
  }, [id, currentBranch]);

  const handleGenerateAI = async () => {
    if (!review) return;
    setAiLoading(true);
    setSuggestions([]);
    try {
      const { data } = await aiApi.suggestReply({
        platform: review.platform,
        item_type: 'review',
        text: review.text,
        rating: review.rating,
        reviewer_name: review.reviewer_name,
        business_name: user?.client?.name,
        business_type: user?.client?.business_type,
        brand_tone: currentBranch?.brand_tone || 'professional',
        language: currentBranch?.language || 'English',
        do_dont_rules: currentBranch?.do_dont_rules || [],
      });
      setSuggestions(data.suggestions);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'AI generation failed');
    } finally {
      setAiLoading(false);
    }
  };

  const handleReply = async () => {
    if (!replyText.trim()) return toast.error('Please write a reply');
    setSubmitting(true);
    try {
      const { data } = await reviewApi.reply(id, { reply_text: replyText });
      const isDraft = user?.role === 'department';
      const baseToast = isDraft ? 'Reply submitted for approval' : 'Reply saved';
      if (data?.platform_reply_unsupported) {
        toast.success(`${baseToast} — this platform requires a manual reply (CTA shown below)`);
      } else {
        toast.success(isDraft ? baseToast : 'Reply posted successfully');
      }
      setReview(prev => ({
        ...prev,
        status: isDraft ? 'draft' : 'replied',
        reply_text: isDraft ? null : replyText,
        draft_reply: isDraft ? replyText : null,
        platform_reply_unsupported: data?.platform_reply_unsupported || prev?.platform_reply_unsupported,
        platform_reply_message: data?.platform_reply_message || prev?.platform_reply_message,
        platform_external_url: data?.platform_external_url || prev?.platform_external_url,
        platform_external_label: data?.platform_external_label || prev?.platform_external_label,
      }));
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to submit reply');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedDept) return toast.error('Select a department');
    setAssigning(true);
    try {
      await reviewApi.assign(id, { department_id: selectedDept, notes: assignNotes });
      toast.success('Review assigned successfully');
      setReview(prev => ({ ...prev, status: 'assigned', assigned_dept_id: selectedDept }));
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to assign review');
    } finally {
      setAssigning(false);
    }
  };

  const handleApproveReply = async () => {
    setApproving(true);
    try {
      await reviewApi.approveReply(id);
      toast.success('Reply approved and posted');
      setReview(prev => ({
        ...prev, status: 'replied', reply_text: prev.draft_reply, draft_reply: null
      }));
    } catch (e) {
      toast.error('Failed to approve reply');
    } finally {
      setApproving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-primary" />
    </div>
  );

  if (!review) return (
    <div className="text-center py-16">
      <p className="text-muted-foreground">Review not found</p>
      <Link to="/admin/reviews" className="text-primary text-sm hover:underline mt-2 block">Back to Reviews</Link>
    </div>
  );

  const isReplied = review.status === 'replied';
  const isDraft = review.status === 'draft';
  const isAssigned = !!review.assigned_dept_id;
  const canReply = !isReplied;

  return (
    <div className="space-y-5 max-w-5xl">
      <Link to="/admin/reviews" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ChevronLeft size={16} /> Back to Reviews
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Left: Review + Reply */}
        <div className="lg:col-span-3 space-y-5">
          {/* Review card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <PlatformIcon platform={review.platform} size={22} />
                  <div>
                    <p className="font-semibold text-foreground">{review.reviewer_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <StarRating rating={review.rating} />
                      <span className="text-xs text-muted-foreground">{review.date}</span>
                    </div>
                  </div>
                </div>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[review.status] || STATUS_COLORS.seen}`}>
                  {review.status}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-foreground leading-relaxed text-sm">{review.text}</p>
            </CardContent>
          </Card>

          {/* Pending Approval Banner (Business Admin) */}
          {isDraft && review.draft_reply && user?.role === 'business_admin' && (
            <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock size={16} className="text-amber-600" />
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Draft reply pending approval</p>
                </div>
                <p className="text-sm text-foreground mb-3 italic">"{review.draft_reply}"</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleApproveReply} disabled={approving} className="gap-1.5">
                    {approving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                    Approve & Post
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setReplyText(review.draft_reply)}>
                    Edit Reply
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Already replied */}
          {isReplied && review.reply_text && (
            <Card className="border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-700">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle size={16} className="text-emerald-600" />
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                    {review.platform_reply_unsupported ? 'Reply saved (manual posting required)' : 'Reply posted'}
                  </p>
                </div>
                <p className="text-sm text-foreground italic">"{review.reply_text}"</p>

                {review.platform_reply_unsupported && (
                  <div
                    className="mt-3 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3"
                    data-testid="manual-reply-cta"
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                        {review.platform_reply_message ||
                          "This platform's API doesn't allow third-party replies. Use the link below to post your response manually."}
                      </p>
                    </div>
                    {review.platform_external_url && (
                      <a
                        href={review.platform_external_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium transition-colors"
                        data-testid="manual-reply-cta-link"
                      >
                        <ExternalLink size={12} />
                        {review.platform_external_label || 'Reply on platform'}
                      </a>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Reply editor */}
          {canReply && !isDraft && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: 'Manrope' }}>
                  <Send size={16} /> Write Reply
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* AI Suggestions */}
                {suggestions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles size={12} className="text-violet-500" /> AI Suggestions
                    </p>
                    {suggestions.map((s, i) => (
                      <div key={`${i}-${(s || '').slice(0, 24)}`} className="bg-violet-50 dark:bg-violet-900/20 rounded-lg p-3 border border-violet-100 dark:border-violet-800">
                        <p className="text-sm text-foreground mb-2 leading-relaxed">{s}</p>
                        <button
                          onClick={() => { setReplyText(s); setSuggestions([]); }}
                          className="text-xs text-violet-600 hover:text-violet-700 font-medium hover:underline"
                          data-testid={`use-suggestion-${i}`}
                        >
                          Use this reply
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  rows={5}
                  placeholder="Write your reply to this review..."
                  data-testid="reply-textarea"
                  className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none transition-all"
                />
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateAI}
                    disabled={aiLoading}
                    className="gap-1.5"
                    data-testid="generate-ai-reply-btn"
                  >
                    {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} className="text-violet-500" />}
                    {aiLoading ? 'Generating...' : 'Generate AI Reply'}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleReply}
                    disabled={submitting || !replyText.trim()}
                    className="gap-1.5"
                    data-testid="submit-reply-btn"
                  >
                    {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    {user?.role === 'department' ? 'Submit for Approval' : 'Post Reply'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Info + Actions */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardContent className="pt-5 space-y-3">
              {[
                { label: 'Platform', value: <PlatformIcon platform={review.platform} showLabel size={14} /> },
                { label: 'Rating', value: <StarRating rating={review.rating} /> },
                { label: 'Status', value: <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[review.status]}`}>{review.status}</span> },
                { label: 'Date', value: <span className="text-sm">{review.date}</span> },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{row.label}</span>
                  <div className="text-sm text-foreground">{row.value}</div>
                </div>
              ))}
              {review.assigned_dept && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Assigned to</span>
                  <span className="text-xs font-medium text-amber-600">{review.assigned_dept.name}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Assign to Department (Business Admin only, not yet assigned) */}
          {user?.role === 'business_admin' && !isAssigned && !isReplied && departments.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-1.5" style={{ fontFamily: 'Manrope' }}>
                  <UserPlus size={14} /> Assign to Department
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <select
                  value={selectedDept}
                  onChange={e => setSelectedDept(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  data-testid="dept-select"
                >
                  <option value="">Select department...</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <textarea
                  value={assignNotes}
                  onChange={e => setAssignNotes(e.target.value)}
                  rows={2}
                  placeholder="Notes (optional)..."
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  data-testid="assign-notes"
                />
                <Button
                  className="w-full"
                  size="sm"
                  onClick={handleAssign}
                  disabled={assigning || !selectedDept}
                  data-testid="assign-review-btn"
                >
                  {assigning ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                  Assign Review
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
