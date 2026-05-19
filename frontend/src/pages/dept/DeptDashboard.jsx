import { useState, useEffect } from 'react';
import { departmentApi, reviewApi, socialApi, aiApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { toast } from 'sonner';
import {
  ClipboardList, Star, MessageSquare, Loader2, Send, Sparkles, CheckCircle,
  Clock, ChevronDown, ChevronUp, Filter
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import PlatformIcon from '../../components/PlatformIcon';

function StarRating({ rating }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={12} className={i <= rating ? 'fill-yellow-400 text-yellow-400' : 'fill-gray-100 text-gray-300'} />
      ))}
    </div>
  );
}

const STATUS_COLORS = {
  pending: 'bg-blue-100 text-blue-700',
  submitted: 'bg-violet-100 text-violet-700',
  approved: 'bg-emerald-100 text-emerald-700',
  draft: 'bg-amber-100 text-amber-700',
};

function AssignmentCard({ assignment, onReplySubmit }) {
  const { user } = useAuth();
  const { currentBranch } = useBranch();
  const [expanded, setExpanded] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  const item = assignment.item;
  const isReview = assignment.item_type === 'review';
  const alreadySubmitted = assignment.status === 'submitted' || assignment.status === 'approved';

  const generateAI = async () => {
    if (!item) return;
    setAiLoading(true);
    try {
      const { data } = await aiApi.suggestReply({
        platform: item.platform,
        item_type: assignment.item_type,
        text: isReview ? item.text : item.text,
        rating: isReview ? item.rating : undefined,
        reviewer_name: isReview ? item.reviewer_name : item.commenter_name,
        business_name: user?.client?.name,
        business_type: user?.client?.business_type,
        brand_tone: currentBranch?.brand_tone || 'professional',
        language: currentBranch?.language || 'English',
      });
      setSuggestions(data.suggestions);
    } catch (e) { toast.error('AI generation failed'); }
    finally { setAiLoading(false); }
  };

  const handleSubmit = async () => {
    if (!replyText.trim()) return toast.error('Write a reply first');
    setSubmitting(true);
    try {
      if (isReview) {
        await reviewApi.reply(item.id, { reply_text: replyText });
      } else {
        const postId = item.post_id || item.post?.id;
        await socialApi.replyToComment(postId, item.id, { reply_text: replyText });
      }
      toast.success('Reply submitted for approval');
      onReplySubmit(assignment.id);
      setExpanded(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to submit reply');
    } finally {
      setSubmitting(false);
    }
  };

  if (!item) return null;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-3">
          {isReview ? (
            <Star size={18} className="text-amber-500 shrink-0 mt-0.5" />
          ) : (
            <MessageSquare size={18} className="text-blue-500 shrink-0 mt-0.5" />
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <PlatformIcon platform={item.platform} size={14} />
              <span className="text-xs font-medium text-foreground">
                {isReview ? item.reviewer_name : item.commenter_name}
              </span>
              {isReview && <StarRating rating={item.rating} />}
              <span className={`text-xs px-2 py-0.5 rounded-full ml-auto ${STATUS_COLORS[assignment.status] || STATUS_COLORS.pending}`}>
                {assignment.status === 'submitted' ? 'Awaiting approval' : assignment.status}
              </span>
            </div>

            <p className={`text-sm text-foreground leading-relaxed ${!expanded ? 'line-clamp-2' : ''}`}>
              {isReview ? item.text : item.text}
            </p>

            {item.draft_reply && (
              <div className="mt-2 p-2 bg-violet-50 dark:bg-violet-900/20 rounded-lg">
                <p className="text-xs text-violet-600 font-medium mb-0.5">Your submitted reply:</p>
                <p className="text-xs text-foreground">{item.draft_reply}</p>
              </div>
            )}

            {assignment.notes && (
              <p className="text-xs text-muted-foreground mt-1">Note: {assignment.notes}</p>
            )}

            {!alreadySubmitted && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"
                data-testid={`expand-assignment-${assignment.id}`}
              >
                <Send size={11} />
                {expanded ? 'Hide Reply Form' : 'Write Reply'}
                {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
            )}

            {alreadySubmitted && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-violet-600">
                <Clock size={12} />
                Reply submitted — awaiting admin approval
              </div>
            )}

            {/* Reply form */}
            {expanded && !alreadySubmitted && (
              <div className="mt-3 space-y-2 animate-slide-up">
                {suggestions.length > 0 && (
                  <div className="space-y-2">
                    {suggestions.map((s, i) => (
                      <div key={`${i}-${(s || '').slice(0, 24)}`} className="bg-violet-50 dark:bg-violet-900/20 rounded-lg p-2.5 border border-violet-100 dark:border-violet-800">
                        <p className="text-xs text-foreground mb-1.5 leading-relaxed">{s}</p>
                        <button onClick={() => { setReplyText(s); setSuggestions([]); }} className="text-xs text-violet-600 font-medium hover:underline">
                          Use this
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  rows={4}
                  placeholder="Write your reply..."
                  data-testid={`reply-input-${assignment.id}`}
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="text-xs h-8 gap-1" onClick={generateAI} disabled={aiLoading}>
                    {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} className="text-violet-500" />}
                    AI Reply
                  </Button>
                  <Button
                    size="sm"
                    className="text-xs h-8 gap-1"
                    onClick={handleSubmit}
                    disabled={submitting || !replyText.trim()}
                    data-testid={`submit-reply-${assignment.id}`}
                  >
                    {submitting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                    Submit for Approval
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DeptDashboard() {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    departmentApi.getAssignments()
      .then(({ data }) => setAssignments(data))
      .catch((err) => console.error('Failed to load assignments:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleReplySubmit = (assignmentId) => {
    setAssignments(prev => prev.map(a =>
      a.id === assignmentId ? { ...a, status: 'submitted' } : a
    ));
  };

  const filtered = assignments.filter(a => {
    if (filter === 'all') return true;
    if (filter === 'pending') return a.status === 'pending';
    if (filter === 'submitted') return a.status === 'submitted';
    if (filter === 'reviews') return a.item_type === 'review';
    if (filter === 'comments') return a.item_type === 'comment';
    return true;
  });

  const pendingCount = assignments.filter(a => a.status === 'pending').length;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Manrope' }}>My Assignments</h1>
          {pendingCount > 0 && (
            <span className="bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">
              {pendingCount} pending
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">Welcome, {user?.name}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Assigned', count: assignments.length, color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' },
          { label: 'Pending Reply', count: pendingCount, color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400' },
          { label: 'Submitted', count: assignments.filter(a => a.status === 'submitted').length, color: 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400' },
        ].map(s => (
          <div key={s.label} className={`${s.color} rounded-xl p-4 text-center`}>
            <p className="text-2xl font-bold" style={{ fontFamily: 'Manrope' }}>{s.count}</p>
            <p className="text-xs mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'all', label: 'All' },
          { key: 'pending', label: 'Pending' },
          { key: 'submitted', label: 'Submitted' },
          { key: 'reviews', label: 'Reviews' },
          { key: 'comments', label: 'Comments' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              filter === f.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
            data-testid={`filter-${f.key}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Assignments */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <ClipboardList size={40} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">
            {filter === 'all' ? 'No assignments yet' : `No ${filter} items`}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Items assigned to you will appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(assignment => (
            <AssignmentCard
              key={assignment.id}
              assignment={assignment}
              onReplySubmit={handleReplySubmit}
            />
          ))}
        </div>
      )}
    </div>
  );
}
