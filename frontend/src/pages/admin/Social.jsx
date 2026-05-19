import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { socialApi, aiApi, departmentApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { toast } from 'sonner';
import {
  MessageSquare, Heart, ChevronDown, ChevronUp, Sparkles, Loader2,
  Send, UserPlus, CheckCircle, RefreshCw, Settings, Image
} from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import PlatformIcon, { PLATFORM_CONFIG } from '../../components/PlatformIcon';
import DataPagination, { usePagination } from '../../components/DataPagination';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const PLATFORMS = ['facebook', 'instagram', 'linkedin', 'x'];
const STATUS_COLORS = {
  new: 'bg-blue-100 text-blue-700', seen: 'bg-gray-100 text-gray-600',
  replied: 'bg-emerald-100 text-emerald-700', assigned: 'bg-amber-100 text-amber-700',
  draft: 'bg-violet-100 text-violet-700',
};

function resolveImageUrl(url) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${BACKEND_URL}${url}`;
}

function CommentRow({ comment, postId, onReplySubmit, departments, user, clientInfo }) {
  const [open, setOpen] = useState(false);
  const [replyText, setReplyText] = useState(comment.reply_text || '');
  const [submitting, setSubmitting] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedDept, setSelectedDept] = useState('');
  const [assigning, setAssigning] = useState(false);

  const generateAI = async () => {
    setAiLoading(true);
    try {
      const { data } = await aiApi.suggestReply({
        platform: comment.platform,
        item_type: 'comment',
        text: comment.text,
        reviewer_name: comment.commenter_name || comment.author_name,
        business_name: clientInfo?.name,
        business_type: clientInfo?.business_type,
        brand_tone: clientInfo?.brand_tone || 'professional',
        language: clientInfo?.language || 'English',
      });
      setSuggestions(data.suggestions);
    } catch (e) { toast.error('AI generation failed'); }
    finally { setAiLoading(false); }
  };

  const submitReply = async () => {
    if (!replyText.trim()) return toast.error('Write a reply first');
    setSubmitting(true);
    try {
      await socialApi.replyToComment(postId, comment.id, { reply_text: replyText });
      toast.success(user?.role === 'department' ? 'Reply submitted for approval' : 'Reply posted');
      onReplySubmit(comment.id, replyText);
      setOpen(false);
    } catch (e) { toast.error('Failed to submit reply'); }
    finally { setSubmitting(false); }
  };

  const assignComment = async () => {
    if (!selectedDept) return toast.error('Select a department');
    setAssigning(true);
    try {
      await socialApi.assignComment(postId, comment.id, { department_id: selectedDept });
      toast.success('Comment assigned');
    } catch (e) { toast.error('Failed to assign'); }
    finally { setAssigning(false); }
  };

  const isReplied = comment.status === 'replied';
  const commenterName = comment.commenter_name || comment.author_name || 'Anonymous';

  return (
    <div className="border-l-2 border-border pl-4 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-semibold text-foreground">{commenterName}</span>
            {!comment.is_seen && <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_COLORS[comment.status] || STATUS_COLORS.seen}`}>{comment.status}</span>
          </div>
          <p className="text-sm text-foreground">{comment.text}</p>
          {isReplied && comment.reply_text && (
            <p className="text-xs text-emerald-600 mt-1">Replied: {comment.reply_text}</p>
          )}
        </div>
        {!isReplied && (
          <button
            onClick={() => setOpen(!open)}
            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15 hover:border-primary/30 transition-colors shrink-0"
            data-testid={`reply-comment-btn-${comment.id}`}
          >
            <Send size={12} /> Reply
            {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
        {isReplied && <CheckCircle size={14} className="text-emerald-500 shrink-0" />}
      </div>

      {open && (
        <div className="mt-3 space-y-2 animate-slide-up">
          {suggestions.length > 0 && (
            <div className="space-y-1.5">
              {suggestions.map((s, i) => (
                <div key={`${i}-${(s || '').slice(0, 24)}`} className="bg-violet-50 dark:bg-violet-900/20 rounded-lg p-2.5 border border-violet-100 dark:border-violet-800">
                  <p className="text-xs text-foreground mb-1.5">{s}</p>
                  <button onClick={() => { setReplyText(s); setSuggestions([]); }} className="text-xs text-violet-600 font-medium hover:underline">Use this</button>
                </div>
              ))}
            </div>
          )}
          <textarea
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            rows={3}
            placeholder="Write your reply..."
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            data-testid={`comment-reply-textarea-${comment.id}`}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={generateAI} disabled={aiLoading}>
              {aiLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} className="text-violet-500" />}
              AI Reply
            </Button>
            {user?.role === 'business_admin' && departments.length > 0 && (
              <select
                value={selectedDept}
                onChange={e => setSelectedDept(e.target.value)}
                className="px-2 py-1 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Assign to dept...</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            )}
            {selectedDept && (
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={assignComment} disabled={assigning}>
                <UserPlus size={11} /> Assign
              </Button>
            )}
            <Button size="sm" className="text-xs h-7 gap-1 ml-auto" onClick={submitReply} disabled={submitting || !replyText.trim()}>
              {submitting ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
              {user?.role === 'department' ? 'Submit' : 'Post'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Social() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { currentBranch } = useBranch();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePlatform, setActivePlatform] = useState('');
  const [expandedPost, setExpandedPost] = useState(null);
  const [postData, setPostData] = useState({});
  const [loadingPost, setLoadingPost] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [clientInfo, setClientInfo] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem('handleey_user');
    if (stored) { try { setClientInfo(JSON.parse(stored)?.client); } catch (err) { console.error('Parse error:', err); } }
    const params = currentBranch ? { branch_id: currentBranch.id } : {};
    departmentApi.getDepartments(params).then(({ data }) => setDepartments(data || [])).catch((err) => console.error('Failed to load departments:', err));
  }, [currentBranch]);

  const fetchPosts = useCallback(() => {
    setLoading(true);
    const params = { platform: activePlatform || undefined, limit: 30 };
    if (currentBranch) params.branch_id = currentBranch.id;
    socialApi.getPosts(params)
      .then(({ data }) => setPosts(data.posts || []))
      .catch((err) => console.error('Failed to load posts:', err))
      .finally(() => setLoading(false));
  }, [activePlatform, currentBranch]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const handleExpandPost = async (postId) => {
    if (expandedPost === postId) { setExpandedPost(null); return; }
    setExpandedPost(postId);
    if (!postData[postId]) {
      setLoadingPost(postId);
      try {
        const { data } = await socialApi.getPost(postId);
        setPostData(p => ({ ...p, [postId]: data }));
      } catch (e) { console.error('Failed to load post:', e); }
      finally { setLoadingPost(null); }
    }
  };

  const handleReplySubmit = (postId, commentId, replyText) => {
    setPostData(prev => ({
      ...prev,
      [postId]: {
        ...prev[postId],
        comments: (prev[postId]?.comments || []).map(c =>
          c.id === commentId ? { ...c, status: 'replied', reply_text: replyText } : c
        )
      }
    }));
  };

  const unseenCount = posts.filter(p => p.unseen_comments > 0).length;
  const hasDemoData = posts.some(p => p.is_demo);
  const pagination = usePagination(posts, 10, [activePlatform]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold" style={{ fontFamily: 'Manrope' }}>Social</h1>
            {unseenCount > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-medium animate-pulse">
                {unseenCount} new
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{posts.length} posts loaded</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={fetchPosts} data-testid="refresh-social-btn">
            <RefreshCw size={14} /> Refresh
          </Button>
        </div>
      </div>

      {/* Platform tabs */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setActivePlatform('')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
            !activePlatform ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
          data-testid="platform-tab-all"
        >
          All
        </button>
        {PLATFORMS.map(p => (
          <button
            key={p}
            onClick={() => setActivePlatform(p === activePlatform ? '' : p)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              activePlatform === p ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
            data-testid={`platform-tab-${p}`}
          >
            <PlatformIcon platform={p} size={14} />
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 space-y-4">
          <MessageSquare size={40} className="text-muted-foreground mx-auto" />
          <div>
            <p className="text-foreground font-medium">No social posts yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Connect and sync a social platform to see posts and comments, or load demo data to preview the interface.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => navigate('/admin/platforms')}
              data-testid="goto-platforms-social-btn"
            >
              <Settings size={14} /> Go to Platforms
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {hasDemoData && null}
          {pagination.pageItems.map(post => {
            const expanded = expandedPost === post.id;
            const postComments = postData[post.id]?.comments || [];
            return (
              <Card key={post.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-3">
                    <PlatformIcon platform={post.platform} size={20} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm text-foreground leading-relaxed ${!expanded ? 'line-clamp-3' : ''}`}>
                        {post.content}
                      </p>

                      {/* Post images */}
                      {post.media_urls && post.media_urls.length > 0 && (
                        <div className="flex gap-1.5 mt-2 overflow-x-auto">
                          {post.media_urls.slice(0, 4).map((url, idx) => (
                            <img
                              key={url || `post-img-${idx}`}
                              src={resolveImageUrl(url)}
                              alt={`post-img-${idx + 1}`}
                              className="w-16 h-16 rounded-lg object-cover border border-border shrink-0"
                            />
                          ))}
                          {post.media_urls.length > 4 && (
                            <div className="w-16 h-16 rounded-lg border border-border bg-muted flex items-center justify-center shrink-0">
                              <span className="text-xs text-muted-foreground flex flex-col items-center gap-0.5">
                                <Image size={12} />
                                +{post.media_urls.length - 4}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-4 mt-3">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Heart size={12} /> {post.likes_count}
                        </span>
                        <button
                          onClick={() => handleExpandPost(post.id)}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                          data-testid={`expand-post-${post.id}`}
                        >
                          <MessageSquare size={12} />
                          {post.total_comments || 0} comments
                          {post.unseen_comments > 0 && (
                            <span className="ml-1 bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                              {post.unseen_comments} new
                            </span>
                          )}
                          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {new Date(post.posted_at).toLocaleDateString()}
                        </span>
                      </div>

                      {/* Comments */}
                      {expanded && (
                        <div className="mt-4 space-y-3 animate-slide-up">
                          {loadingPost === post.id ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 size={14} className="animate-spin" /> Loading comments...
                            </div>
                          ) : postComments.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No comments yet</p>
                          ) : (
                            postComments.map(comment => (
                              <CommentRow
                                key={comment.id}
                                comment={comment}
                                postId={post.id}
                                departments={departments}
                                user={user}
                                clientInfo={clientInfo}
                                onReplySubmit={(cId, text) => handleReplySubmit(post.id, cId, text)}
                              />
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          <DataPagination {...pagination} itemLabel="posts" testIdPrefix="social-pagination" className="mt-2 bg-card rounded-xl border border-border" />
        </div>
      )}
    </div>
  );
}
