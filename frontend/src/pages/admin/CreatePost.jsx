import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { socialApi, settingsApi, scheduledPostsApi, uploadApi } from '../../api';
import { useBranch } from '../../context/BranchContext';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';
import {
  PenSquare, Send, Loader2, CheckCircle, XCircle, Clock, AlertCircle,
  Calendar, CalendarClock, List, Trash2, Play, ImagePlus, X, Image, Eye, Sparkles
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import PlatformIcon, { getPlatformLabel } from '../../components/PlatformIcon';
import PostPreviewDialog from '../../components/PostPreviewDialog';
import AIImageDialog from '../../components/AIImageDialog';
import AIComposePostDialog from '../../components/AIComposePostDialog';
import DataPagination, { usePagination } from '../../components/DataPagination';

const MAX_CHARS = 2200;
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Only the platforms that have a content feed where you can publish a post.
// Review-only platforms (Yelp, Trustpilot, TripAdvisor, Booking.com, Expedia,
// Hotels.com, Agoda, OpenTable, Viator, GetYourGuide, Airbnb, Zillow,
// Realtor.com, Foursquare) are intentionally excluded from the "Publish to"
// list because they don't accept user-published posts.
const POSTABLE_PLATFORMS = new Set([
  'google',     // Google Business Profile Posts
  'facebook',   // Page posts
  'instagram',  // Feed posts
  'linkedin',   // Company page posts
  'x',          // Tweets
  'youtube',    // Community posts / video uploads
  'reddit',     // Submissions
]);

const STATUS_CONFIG = {
  idle: null,
  publishing: { icon: Clock, color: 'text-amber-500', label: 'Publishing...' },
  success: { icon: CheckCircle, color: 'text-emerald-500', label: 'Published to platform' },
  saved_only: { icon: CheckCircle, color: 'text-blue-500', label: 'Saved (not connected)' },
  failed: { icon: XCircle, color: 'text-red-500', label: 'Failed' },
  skipped: { icon: AlertCircle, color: 'text-muted-foreground', label: 'Skipped' },
};

const SCHEDULED_STATUS = {
  scheduled: { color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', label: 'Scheduled' },
  publishing: { color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', label: 'Publishing' },
  published: { color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', label: 'Published' },
  partial: { color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', label: 'Partial' },
  failed: { color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', label: 'Failed' },
  cancelled: { color: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400', label: 'Cancelled' },
};

function resolveImageUrl(url) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${BACKEND_URL}${url}`;
}

function ImageUploadArea({ images, setImages, disabled }) {
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (images.length + files.length > 10) {
      toast.error('Maximum 10 images allowed');
      return;
    }
    const valid = files.filter(f => f.type.startsWith('image/'));
    if (valid.length !== files.length) {
      toast.error('Only image files are allowed');
    }
    setImages(prev => [...prev, ...valid.map(f => ({ file: f, preview: URL.createObjectURL(f) }))]);
    e.target.value = '';
  };

  const removeImage = (idx) => {
    setImages(prev => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label className="text-sm text-muted-foreground">Images (optional, max 10)</Label>
        <span className="text-xs text-muted-foreground">{images.length}/10</span>
      </div>

      {images.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
          {images.map((img, idx) => (
            <div key={img.url || img.preview || `upload-${idx}`} className="relative shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-border group">
              <img
                src={img.preview || resolveImageUrl(img.url)}
                alt={`upload-${idx + 1}`}
                className="w-full h-full object-cover"
              />
              {!disabled && (
                <button
                  onClick={() => removeImage(idx)}
                  className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  data-testid={`remove-image-${idx}`}
                >
                  <X size={10} />
                </button>
              )}
            </div>
          ))}
          {images.length < 10 && !disabled && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0 w-20 h-20 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
              data-testid="add-more-images-btn"
            >
              <ImagePlus size={20} />
            </button>
          )}
        </div>
      )}

      {images.length === 0 && (
        <button
          onClick={() => !disabled && fileInputRef.current?.click()}
          disabled={disabled}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-border bg-muted/20 text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-muted/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="image-upload-area"
        >
          <Image size={18} />
          <span className="text-sm">Click to add images (JPG, PNG, GIF, WebP)</span>
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        data-testid="image-file-input"
      />
    </div>
  );
}

function ScheduledPostsList({ loading, posts, onPublishNow, onDelete }) {
  const pagination = usePagination(posts || [], 5, [posts?.length]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />)}
      </div>
    );
  }

  if (!posts || posts.length === 0) {
    return (
      <div className="text-center py-8">
        <Calendar size={32} className="text-muted-foreground mx-auto mb-2" />
        <p className="text-muted-foreground">No scheduled posts</p>
        <p className="text-xs text-muted-foreground">Use the scheduler to queue posts for later</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pagination.pageItems.map(post => {
        const statusConfig = SCHEDULED_STATUS[post.status] || SCHEDULED_STATUS.scheduled;
        return (
          <div
            key={post.id}
            className="p-4 rounded-xl border border-border bg-card hover:bg-accent/5 transition-colors"
            data-testid={`scheduled-post-${post.id}`}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                {post.platforms?.map(p => (
                  <div key={p} className="flex items-center gap-1">
                    <PlatformIcon platform={p} size={14} />
                  </div>
                ))}
                <Badge className={`text-xs ${statusConfig.color}`}>{statusConfig.label}</Badge>
              </div>
              <div className="flex items-center gap-1">
                {post.status === 'scheduled' && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => onPublishNow(post.id)}
                      title="Publish now"
                      data-testid={`publish-now-${post.id}`}
                    >
                      <Play size={14} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                      onClick={() => onDelete(post.id)}
                      title="Delete"
                      data-testid={`delete-scheduled-${post.id}`}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </>
                )}
              </div>
            </div>
            <p className="text-sm text-foreground line-clamp-2 mb-2">{post.content}</p>

            {post.image_urls && post.image_urls.length > 0 && (
              <div className="flex gap-1.5 mb-2 overflow-x-auto">
                {post.image_urls.slice(0, 4).map((url, idx) => (
                  <img
                    key={url || `img-${idx}`}
                    src={resolveImageUrl(url)}
                    alt={`img-${idx + 1}`}
                    className="w-12 h-12 rounded-lg object-cover border border-border shrink-0"
                  />
                ))}
                {post.image_urls.length > 4 && (
                  <div className="w-12 h-12 rounded-lg border border-border bg-muted flex items-center justify-center shrink-0">
                    <span className="text-xs text-muted-foreground">+{post.image_urls.length - 4}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock size={12} />
              <span>
                {post.status === 'published'
                  ? `Published ${new Date(post.published_at).toLocaleString()}`
                  : `Scheduled for ${new Date(post.scheduled_at).toLocaleString()}`
                }
              </span>
            </div>
            {post.publish_results && Object.keys(post.publish_results).length > 0 && (
              <div className="mt-2 pt-2 border-t border-border">
                <div className="flex items-center gap-2 flex-wrap">
                  {Object.entries(post.publish_results).map(([platform, result]) => (
                    <Badge
                      key={platform}
                      variant="outline"
                      className={`text-xs ${result.status === 'success' ? 'border-emerald-200 text-emerald-700' : 'border-red-200 text-red-700'}`}
                    >
                      <PlatformIcon platform={platform} size={10} className="mr-1" />
                      {result.status === 'success' ? 'OK' : 'Failed'}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
      <DataPagination
        {...pagination}
        itemLabel="posts"
        testIdPrefix="scheduled-pagination"
        pageSizeOptions={[5, 10, 25]}
        className="rounded-xl border border-border"
      />
    </div>
  );
}

export default function CreatePost() {
  const { currentBranch } = useBranch();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [content, setContent] = useState('');
  const [platforms, setPlatforms] = useState([]);
  const [selected, setSelected] = useState([]);
  const [publishing, setPublishing] = useState(false);
  const [statuses, setStatuses] = useState({});
  const [done, setDone] = useState(false);
  const [loadingPlatforms, setLoadingPlatforms] = useState(true);
  const [images, setImages] = useState([]);
  const [uploadingImages, setUploadingImages] = useState(false);

  // Preview & AI image dialogs
  const [showPreview, setShowPreview] = useState(false);
  const [showAIImage, setShowAIImage] = useState(false);
  const [showAICompose, setShowAICompose] = useState(false);

  // Scheduler state
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [scheduling, setScheduling] = useState(false);

  // Scheduled posts list
  const [showScheduledPosts, setShowScheduledPosts] = useState(false);
  const [scheduledPosts, setScheduledPosts] = useState([]);
  const [loadingScheduled, setLoadingScheduled] = useState(false);

  useEffect(() => {
    const params = currentBranch ? { branch_id: currentBranch.id } : {};
    settingsApi.getPlatforms(params)
      .then(({ data }) => {
        setPlatforms(data);
        const connected = data.filter(p => POSTABLE_PLATFORMS.has(p.platform) && p.status === 'connected').map(p => p.platform);
        setSelected(connected);
      })
      .catch((err) => console.error('Failed to load platforms:', err))
      .finally(() => setLoadingPlatforms(false));
  }, [currentBranch]);

  const fetchScheduledPosts = async () => {
    setLoadingScheduled(true);
    try {
      const params = currentBranch ? { branch_id: currentBranch.id } : {};
      const { data } = await scheduledPostsApi.getPosts(params);
      setScheduledPosts(data.posts || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingScheduled(false);
    }
  };

  useEffect(() => {
    if (showScheduledPosts) fetchScheduledPosts();
  }, [showScheduledPosts, currentBranch]);

  const togglePlatform = (p) => {
    setSelected(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  const uploadImagesAndGetUrls = async () => {
    const filesToUpload = images.filter(img => img.file);
    if (filesToUpload.length === 0) return images.map(img => img.url).filter(Boolean);

    setUploadingImages(true);
    try {
      const { data } = await uploadApi.uploadImages(filesToUpload.map(img => img.file));
      return data.urls || [];
    } catch (e) {
      toast.error('Image upload failed. Post will be created without images.');
      return [];
    } finally {
      setUploadingImages(false);
    }
  };

  const handlePublish = async () => {
    if (!content.trim()) return toast.error('Post content is required');
    if (selected.length === 0) return toast.error('Select at least one platform');

    const imageUrls = await uploadImagesAndGetUrls();

    setPublishing(true);
    setDone(false);
    const initialStatuses = {};
    selected.forEach(p => { initialStatuses[p] = 'publishing'; });
    setStatuses(initialStatuses);

    const results = {};
    for (const platform of selected) {
      try {
        const { data } = await socialApi.createPost({
          platform,
          content,
          location_id: currentBranch?.id || null,
          image_urls: imageUrls,
        });
        // Distinguish: actually published to platform vs saved locally only
        const status = data.platform_published ? 'success' : 'saved_only';
        results[platform] = status;
        setStatuses(prev => ({ ...prev, [platform]: status }));
      } catch (e) {
        results[platform] = 'failed';
        setStatuses(prev => ({ ...prev, [platform]: 'failed' }));
      }
      await new Promise(r => setTimeout(r, 400));
    }

    setPublishing(false);
    setDone(true);

    const publishedCount = Object.values(results).filter(v => v === 'success').length;
    const savedCount = Object.values(results).filter(v => v === 'saved_only').length;
    const failedCount = Object.values(results).filter(v => v === 'failed').length;

    if (failedCount === selected.length) {
      toast.error('Failed to publish to any platform');
    } else if (publishedCount > 0) {
      const savedNote = savedCount > 0 ? `, ${savedCount} saved locally (not connected)` : '';
      toast.success(`Published to ${publishedCount} platform${publishedCount > 1 ? 's' : ''}${savedNote}!`);
    } else if (savedCount > 0) {
      toast.info(`Post saved to ${savedCount} platform${savedCount > 1 ? 's' : ''} locally. Connect platforms to publish live.`);
    }
  };

  const handleSchedule = async () => {
    if (!content.trim()) return toast.error('Post content is required');
    if (selected.length === 0) return toast.error('Select at least one platform');
    if (!scheduledDate || !scheduledTime) return toast.error('Please select date and time');

    const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`);
    if (scheduledAt <= new Date()) return toast.error('Scheduled time must be in the future');

    const imageUrls = await uploadImagesAndGetUrls();

    setScheduling(true);
    try {
      await scheduledPostsApi.createPost({
        platforms: selected,
        content,
        scheduled_at: scheduledAt.toISOString(),
        branch_id: currentBranch?.id || null,
        image_urls: imageUrls,
      });
      toast.success('Post scheduled successfully!');
      handleReset();
      setScheduleMode(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to schedule post');
    } finally {
      setScheduling(false);
    }
  };

  const handleReset = () => {
    setContent('');
    setStatuses({});
    setDone(false);
    setScheduledDate('');
    setScheduledTime('');
    setImages([]);
    const connected = platforms.filter(p => POSTABLE_PLATFORMS.has(p.platform) && p.status === 'connected').map(p => p.platform);
    setSelected(connected);
  };

  const handleDeleteScheduled = async (postId) => {
    if (!window.confirm('Delete this scheduled post?')) return;
    try {
      await scheduledPostsApi.deletePost(postId);
      toast.success('Scheduled post deleted');
      fetchScheduledPosts();
    } catch (e) {
      toast.error('Failed to delete');
    }
  };

  const handlePublishNow = async (postId) => {
    if (!window.confirm('Publish this post now?')) return;
    try {
      const { data } = await scheduledPostsApi.publishNow(postId);
      if (data.status === 'published') toast.success('Post published successfully!');
      else if (data.status === 'partial') toast.warning('Post partially published');
      else toast.error('Failed to publish');
      fetchScheduledPosts();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to publish');
    }
  };

  const charsLeft = MAX_CHARS - content.length;
  const connectedPlatforms = platforms.filter(p => POSTABLE_PLATFORMS.has(p.platform) && p.status === 'connected');
  const disconnectedPlatforms = platforms.filter(p => POSTABLE_PLATFORMS.has(p.platform) && p.status !== 'connected');
  const isProcessing = publishing || scheduling || uploadingImages;

  const getMinDate = () => new Date().toISOString().split('T')[0];
  const getMinTime = () => {
    if (scheduledDate === getMinDate()) {
      const now = new Date();
      now.setMinutes(now.getMinutes() + 5);
      return now.toTimeString().slice(0, 5);
    }
    return '00:00';
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Manrope' }}>{t('createPost.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('createPost.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setShowPreview(true)}
            data-testid="open-preview-btn"
          >
            <Eye size={14} />
            {t('createPost.preview')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setShowScheduledPosts(true)}
            data-testid="view-scheduled-btn"
          >
            <List size={14} />
            {t('createPost.scheduledPosts')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Post composer */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: 'Manrope' }}>
                  <PenSquare size={16} className="text-primary" /> Compose Post
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 border-primary/30 text-primary hover:bg-primary/5"
                  onClick={() => setShowAICompose(true)}
                  disabled={isProcessing}
                  data-testid="open-ai-compose-btn"
                >
                  <Sparkles size={13} />
                  Compose with AI
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value.slice(0, MAX_CHARS))}
                  rows={7}
                  placeholder="What would you like to share? Write your post caption here..."
                  disabled={isProcessing}
                  data-testid="post-content-textarea"
                  className="w-full px-4 py-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none transition-all"
                />
                <span className={`absolute bottom-3 right-3 text-xs ${charsLeft < 100 ? 'text-red-500' : 'text-muted-foreground'}`}>
                  {charsLeft}
                </span>
              </div>

              {/* Image upload + AI image generation */}
              <div className="space-y-2">
                <ImageUploadArea images={images} setImages={setImages} disabled={isProcessing} />
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 border-primary/30 text-primary hover:bg-primary/5"
                    onClick={() => setShowAIImage(true)}
                    disabled={isProcessing || images.length >= 10}
                    data-testid="open-ai-image-btn"
                  >
                    <Sparkles size={14} />
                    {t('createPost.generateAi')}
                  </Button>
                </div>
              </div>

              {/* Upload progress indicator */}
              {uploadingImages && (
                <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                  <Loader2 size={14} className="animate-spin" />
                  Uploading images...
                </div>
              )}

              {/* Schedule toggle */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border">
                <button
                  onClick={() => setScheduleMode(false)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    !scheduleMode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  data-testid="publish-now-tab"
                >
                  <Send size={14} />
                  Publish Now
                </button>
                <button
                  onClick={() => setScheduleMode(true)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    scheduleMode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  data-testid="schedule-tab"
                >
                  <CalendarClock size={14} />
                  Schedule
                </button>
              </div>

              {/* Schedule date/time picker */}
              {scheduleMode && (
                <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 space-y-3">
                  <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                    <Calendar size={16} />
                    <span className="text-sm font-medium">Schedule Publication</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="schedule-date" className="text-xs text-blue-600 dark:text-blue-400">Date</Label>
                      <Input
                        id="schedule-date"
                        type="date"
                        value={scheduledDate}
                        min={getMinDate()}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        className="bg-white dark:bg-background"
                        data-testid="schedule-date-input"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="schedule-time" className="text-xs text-blue-600 dark:text-blue-400">Time</Label>
                      <Input
                        id="schedule-time"
                        type="time"
                        value={scheduledTime}
                        min={getMinTime()}
                        onChange={(e) => setScheduledTime(e.target.value)}
                        className="bg-white dark:bg-background"
                        data-testid="schedule-time-input"
                      />
                    </div>
                  </div>
                  {scheduledDate && scheduledTime && (
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      Will be published on {new Date(`${scheduledDate}T${scheduledTime}`).toLocaleString()}
                    </p>
                  )}
                </div>
              )}

              {/* Publish status per platform */}
              {Object.keys(statuses).length > 0 && (
                <div className="space-y-2 border border-border rounded-xl p-4 bg-muted/30">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Publish Status</p>
                  {Object.entries(statuses).map(([platform, status]) => {
                    const cfg = STATUS_CONFIG[status];
                    if (!cfg) return null;
                    const { icon: Icon, color, label } = cfg;
                    return (
                      <div key={platform} className="flex items-center justify-between py-1.5">
                        <div className="flex items-center gap-2">
                          <PlatformIcon platform={platform} size={16} />
                          <span className="text-sm text-foreground">{getPlatformLabel(platform)}</span>
                        </div>
                        <div className={`flex items-center gap-1.5 ${color}`}>
                          {status === 'publishing' ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Icon size={14} />
                          )}
                          <span className="text-xs font-medium">{label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-2">
                {!done ? (
                  scheduleMode ? (
                    <Button
                      onClick={handleSchedule}
                      disabled={isProcessing || !content.trim() || selected.length === 0 || !scheduledDate || !scheduledTime}
                      className="gap-2"
                      data-testid="schedule-post-btn"
                    >
                      {isProcessing ? <Loader2 size={15} className="animate-spin" /> : <CalendarClock size={15} />}
                      {isProcessing ? 'Processing...' : `Schedule for ${selected.length} Platform${selected.length !== 1 ? 's' : ''}`}
                    </Button>
                  ) : (
                    <Button
                      onClick={handlePublish}
                      disabled={isProcessing || !content.trim() || selected.length === 0}
                      className="gap-2"
                      data-testid="publish-post-btn"
                    >
                      {isProcessing ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                      {isProcessing ? 'Processing...' : `Publish to ${selected.length} Platform${selected.length !== 1 ? 's' : ''}`}
                    </Button>
                  )
                ) : (
                  <Button onClick={handleReset} variant="outline" className="gap-2">
                    <PenSquare size={15} /> Create Another Post
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Platform selection */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm" style={{ fontFamily: 'Manrope' }}>
                Publish to ({selected.length} selected)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {loadingPlatforms ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />)}
                </div>
              ) : platforms.length === 0 ? (
                <p className="text-xs text-muted-foreground">No platforms enabled. Contact your admin.</p>
              ) : (
                <>
                  {connectedPlatforms.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Connected</p>
                      {connectedPlatforms.map(p => (
                        <button
                          key={p.platform}
                          onClick={() => !isProcessing && togglePlatform(p.platform)}
                          disabled={isProcessing}
                          data-testid={`platform-toggle-${p.platform}`}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-left ${
                            selected.includes(p.platform)
                              ? 'border-primary bg-primary/5 text-foreground'
                              : 'border-border text-muted-foreground hover:border-primary/30'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded flex items-center justify-center border shrink-0 ${
                            selected.includes(p.platform) ? 'bg-primary border-primary' : 'border-border'
                          }`}>
                            {selected.includes(p.platform) && (
                              <CheckCircle size={12} className="text-primary-foreground" />
                            )}
                          </div>
                          <PlatformIcon platform={p.platform} size={16} />
                          <span className="text-sm truncate">{getPlatformLabel(p.platform)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {disconnectedPlatforms.length > 0 && (
                    <div className="space-y-1.5 mt-3">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Not Connected</p>
                      {disconnectedPlatforms.map(p => (
                        <div
                          key={p.platform}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border text-muted-foreground opacity-50 cursor-not-allowed"
                        >
                          <div className="w-5 h-5 rounded border border-border shrink-0" />
                          <PlatformIcon platform={p.platform} size={16} />
                          <span className="text-sm truncate">{getPlatformLabel(p.platform)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
            <p className="text-xs text-blue-700 dark:text-blue-400 font-medium mb-1">Tip</p>
            <p className="text-xs text-blue-600 dark:text-blue-400 leading-relaxed">
              Connect platforms in the Platforms page to enable posting. Use the scheduler to queue posts for future publication.
            </p>
          </div>
        </div>
      </div>

      {/* Scheduled Posts Dialog */}
      <Dialog open={showScheduledPosts} onOpenChange={setShowScheduledPosts}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock size={20} className="text-primary" />
              Scheduled Posts
            </DialogTitle>
            <DialogDescription>
              View and manage your scheduled posts
            </DialogDescription>
          </DialogHeader>

          <ScheduledPostsList
            loading={loadingScheduled}
            posts={scheduledPosts}
            onPublishNow={handlePublishNow}
            onDelete={handleDeleteScheduled}
          />
        </DialogContent>
      </Dialog>

      {/* Post Preview Dialog */}
      <PostPreviewDialog
        open={showPreview}
        onOpenChange={setShowPreview}
        content={content}
        images={images}
        businessName={user?.client?.name || currentBranch?.name}
      />

      {/* AI Image Generation Dialog */}
      <AIImageDialog
        open={showAIImage}
        onOpenChange={setShowAIImage}
        onUseImage={(img) => setImages((prev) => [...prev, img])}
      />

      {/* AI Compose Post Dialog */}
      <AIComposePostDialog
        open={showAICompose}
        onOpenChange={setShowAICompose}
        onApply={(text, { mode }) => {
          if (mode === 'replace') {
            setContent(text.slice(0, MAX_CHARS));
          } else {
            setContent((prev) => {
              const merged = prev ? `${prev}\n\n${text}` : text;
              return merged.slice(0, MAX_CHARS);
            });
          }
        }}
      />
    </div>
  );
}
