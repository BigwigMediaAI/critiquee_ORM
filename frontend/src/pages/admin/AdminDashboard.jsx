import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { reportsApi, reviewApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { Star, MessageSquare, AlertCircle, TrendingUp, ArrowRight, CheckCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import PlatformIcon from '../../components/PlatformIcon';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const STAR_COLORS = { 5: '#10b981', 4: '#3b82f6', 3: '#f59e0b', 2: '#f97316', 1: '#ef4444' };

function StarRating({ rating }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={12} className={i <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300 fill-gray-100'} />
      ))}
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, sub, linkTo }) {
  const content = (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold text-foreground mt-1" style={{ fontFamily: 'Manrope' }}>{value ?? 0}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-2.5 rounded-xl ${color}`}>
            <Icon size={20} className="text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
  return linkTo ? <Link to={linkTo}>{content}</Link> : content;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const { currentBranch } = useBranch();
  const [summary, setSummary] = useState(null);
  const [recentReviews, setRecentReviews] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState({ reviews: [], comments: [], total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = currentBranch ? { branch_id: currentBranch.id } : {};
    Promise.all([
      reportsApi.getSummary(params),
      reviewApi.getReviews({ limit: 5, ...params }),
      reviewApi.getPendingApprovals(params),
    ])
      .then(([s, r, p]) => {
        setSummary(s.data);
        setRecentReviews(r.data.reviews || []);
        setPendingApprovals(p.data);
      })
      .catch((err) => console.error('Failed to load dashboard:', err))
      .finally(() => setLoading(false));
  }, [currentBranch]);

  const ratingData = summary ? Object.entries(summary.reviews.rating_distribution || {})
    .map(([k, v]) => ({ name: `${k}★`, count: v, rating: parseInt(k) }))
    .sort((a, b) => b.rating - a.rating) : [];

  const statusBadge = (status) => {
    const map = {
      new: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      seen: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
      replied: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
      assigned: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      draft: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
    };
    return map[status] || map.seen;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Manrope' }}>
          Welcome back, {user?.name}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">{user?.client?.name} · Reputation Overview</p>
      </div>

      {/* Pending Approvals Banner */}
      {pendingApprovals.total > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
          <Clock size={18} className="text-amber-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              {pendingApprovals.total} reply{pendingApprovals.total !== 1 ? 's' : ''} pending your approval
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400">Department users have submitted replies for review</p>
          </div>
          <Link to="/admin/reviews?status=draft" className="text-xs font-medium text-amber-700 dark:text-amber-300 hover:underline shrink-0">
            Review now
          </Link>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Reviews" value={summary?.reviews?.total} icon={Star} color="bg-amber-500" linkTo="/admin/reviews" />
        <StatCard title="Avg Rating" value={summary?.reviews?.avg_rating} icon={TrendingUp} color="bg-blue-500" sub={`${summary?.reviews?.response_rate || 0}% response rate`} />
        <StatCard title="Pending Replies" value={summary?.reviews?.pending} icon={AlertCircle} color="bg-red-500" linkTo="/admin/reviews?status=new" />
        <StatCard title="Social Comments" value={summary?.social?.total_comments} icon={MessageSquare} color="bg-violet-500" linkTo="/admin/social" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Rating distribution chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base" style={{ fontFamily: 'Manrope' }}>Rating Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-48 bg-muted rounded animate-pulse" />
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={ratingData} layout="vertical" margin={{ left: 0, right: 10 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={28} />
                  <Tooltip formatter={(v) => [v, 'Reviews']} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {ratingData.map((entry) => (
                      <Cell key={entry.name} fill={STAR_COLORS[entry.rating] || '#3b82f6'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Recent Reviews */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base" style={{ fontFamily: 'Manrope' }}>Recent Reviews</CardTitle>
              <Link to="/admin/reviews" className="text-xs text-primary flex items-center gap-1 hover:underline">
                View all <ArrowRight size={12} />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />)}</div>
            ) : recentReviews.length === 0 ? (
              <div className="text-center py-8">
                <Star size={28} className="text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No reviews yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentReviews.map(review => (
                  <Link key={review.id} to={`/admin/reviews/${review.id}`}
                    className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/60 transition-colors group"
                  >
                    <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                      <PlatformIcon platform={review.platform} size={16} />
                      {!review.is_seen && <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium text-foreground">{review.reviewer_name}</span>
                        <StarRating rating={review.rating} />
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{review.text}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(review.status)}`}>
                        {review.status}
                      </span>
                      <span className="text-xs text-muted-foreground">{review.date}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
