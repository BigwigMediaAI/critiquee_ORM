import { useState, useEffect, useMemo } from 'react';
import { reportsApi } from '../../api';
import { useBranch } from '../../context/BranchContext';
import {
  Star, MessageSquare, TrendingUp, CheckCircle, BarChart2, Activity,
  Download, Filter, Calendar, Loader2, ChevronDown,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuLabel,
} from '../../components/ui/dropdown-menu';
import PlatformIcon, { getPlatformLabel } from '../../components/PlatformIcon';
import { toast } from 'sonner';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell,
} from 'recharts';

const STAR_COLORS = { 5: '#10b981', 4: '#3b82f6', 3: '#f59e0b', 2: '#f97316', 1: '#ef4444' };
const CHART_COLORS = ['#1e40af', '#10b981', '#f59e0b', '#ef4444', '#7c3aed', '#0ea5e9'];

const ACTION_LABELS = {
  reply_posted: 'Reply posted',
  reply_draft_submitted: 'Draft submitted',
  reply_approved: 'Reply approved',
  assigned_to_dept: 'Assigned to dept',
  comment_reply_posted: 'Comment replied',
};

const PRESETS = [
  { id: '7d', label: 'Last 7 days', days: 7 },
  { id: '14d', label: 'Last 14 days', days: 14 },
  { id: '30d', label: 'Last 30 days', days: 30 },
  { id: '90d', label: 'Last 90 days', days: 90 },
  { id: 'all', label: 'All time', days: null },
  { id: 'custom', label: 'Custom range', days: null },
];

const PLATFORMS = ['google', 'facebook', 'instagram', 'twitter', 'youtube', 'tripadvisor'];

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

function StatCard({ title, value, icon: Icon, color, sub }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold mt-1" style={{ fontFamily: 'Manrope' }}>{value ?? 0}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-2.5 rounded-xl ${color}`}>
            <Icon size={20} className="text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Reports() {
  const { currentBranch } = useBranch();
  const [summary, setSummary] = useState(null);
  const [trends, setTrends] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [preset, setPreset] = useState('14d');
  const [dateFrom, setDateFrom] = useState(isoDaysAgo(14));
  const [dateTo, setDateTo] = useState(todayIso());
  const [platform, setPlatform] = useState('all');

  const handlePreset = (id) => {
    setPreset(id);
    const cfg = PRESETS.find((p) => p.id === id);
    if (cfg?.days) {
      setDateFrom(isoDaysAgo(cfg.days));
      setDateTo(todayIso());
    } else if (id === 'all') {
      setDateFrom('');
      setDateTo('');
    }
    // 'custom' → keep current values, user edits manually
  };

  const filterParams = useMemo(() => {
    const p = {};
    if (currentBranch?.id) p.branch_id = currentBranch.id;
    if (dateFrom) p.date_from = dateFrom;
    if (dateTo) p.date_to = dateTo;
    if (platform && platform !== 'all') p.platform = platform;
    return p;
  }, [currentBranch, dateFrom, dateTo, platform]);

  const trendDays = useMemo(() => {
    if (preset === 'all') return 365;
    if (preset === 'custom' && dateFrom && dateTo) {
      const diff = (new Date(dateTo) - new Date(dateFrom)) / (1000 * 60 * 60 * 24);
      return Math.max(1, Math.ceil(diff));
    }
    return PRESETS.find((p) => p.id === preset)?.days || 14;
  }, [preset, dateFrom, dateTo]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      reportsApi.getSummary(filterParams),
      reportsApi.getTrends(trendDays, filterParams),
      reportsApi.getAuditLogs({ limit: 20 }),
    ])
      .then(([s, t, l]) => {
        setSummary(s.data);
        setTrends(t.data);
        setLogs(l.data);
      })
      .catch((err) => {
        console.error('Failed to load reports:', err);
        toast.error('Failed to load reports');
      })
      .finally(() => setLoading(false));
  }, [filterParams, trendDays]);

  const handleExport = async (kind) => {
    if (exporting) return;
    setExporting(true);
    try {
      const fnMap = {
        summary: () => reportsApi.exportSummary(filterParams),
        reviews: () => reportsApi.exportReviews(filterParams),
        comments: () => reportsApi.exportComments(filterParams),
        audit: () => reportsApi.exportAuditLogs({ date_from: dateFrom, date_to: dateTo }),
      };
      const res = await fnMap[kind]();
      const blob = new Blob([res.data], { type: 'text/csv' });
      downloadBlob(blob, `${kind}_${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success(`${kind === 'audit' ? 'Audit logs' : kind[0].toUpperCase() + kind.slice(1)} exported`);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const ratingData = summary
    ? Object.entries(summary.reviews?.rating_distribution || {})
        .map(([k, v]) => ({ name: `${k}★`, count: v, rating: parseInt(k) }))
        .sort((a, b) => a.rating - b.rating)
    : [];

  const platformData = summary
    ? Object.entries(summary.reviews?.by_platform || {})
        .map(([k, v]) => ({ name: getPlatformLabel(k), platform: k, count: v.count, avg: v.avg_rating }))
        .sort((a, b) => b.count - a.count)
    : [];

  const periodLabel = preset === 'all'
    ? 'All time'
    : preset === 'custom'
      ? `${dateFrom || '—'} → ${dateTo || '—'}`
      : (PRESETS.find((p) => p.id === preset)?.label || '');

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Manrope' }}>Reports & Analytics</h1>
          <p className="text-sm text-muted-foreground">{periodLabel}{platform !== 'all' && ` · ${getPlatformLabel(platform)}`}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="gap-2" disabled={exporting} data-testid="reports-download-btn">
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Download Report
              <ChevronDown size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[220px]">
            <DropdownMenuLabel className="text-xs">Export with current filters</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleExport('summary')} data-testid="export-summary">
              <BarChart2 size={14} className="mr-2 text-primary" /> Summary report
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('reviews')} data-testid="export-reviews">
              <Star size={14} className="mr-2 text-amber-500" /> Reviews list
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('comments')} data-testid="export-comments">
              <MessageSquare size={14} className="mr-2 text-violet-500" /> Social comments
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('audit')} data-testid="export-audit">
              <Activity size={14} className="mr-2 text-emerald-500" /> Activity log
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Filter size={12} /> Filters
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Period</Label>
              <Select value={preset} onValueChange={handlePreset}>
                <SelectTrigger className="w-[160px] h-9" data-testid="filter-preset">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPreset('custom'); }}
                className="h-9 w-[150px]"
                data-testid="filter-from"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPreset('custom'); }}
                className="h-9 w-[150px]"
                data-testid="filter-to"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Platform</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="w-[160px] h-9" data-testid="filter-platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All platforms</SelectItem>
                  {PLATFORMS.map((p) => (
                    <SelectItem key={p} value={p}>{getPlatformLabel(p)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(preset !== '14d' || platform !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-xs"
                onClick={() => { setPreset('14d'); handlePreset('14d'); setPlatform('all'); }}
                data-testid="filter-reset"
              >
                Reset
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Reviews" value={summary?.reviews?.total} icon={Star} color="bg-amber-500" />
        <StatCard title="Avg Rating" value={summary?.reviews?.avg_rating} icon={TrendingUp} color="bg-blue-500" sub={`${summary?.reviews?.response_rate || 0}% response rate`} />
        <StatCard title="Replied" value={summary?.reviews?.replied} icon={CheckCircle} color="bg-emerald-500" />
        <StatCard title="Social Comments" value={summary?.social?.total_comments} icon={MessageSquare} color="bg-violet-500" sub={`${summary?.social?.replied_comments || 0} replied`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Rating trends */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: 'Manrope' }}>
              <Activity size={16} className="text-primary" /> Review Trends (14 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-48 bg-muted rounded animate-pulse" />
            ) : trends.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip labelFormatter={l => `Date: ${l}`} formatter={(v, n) => [v, n === 'count' ? 'Reviews' : 'Avg Rating']} />
                  <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Reviews" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Rating distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: 'Manrope' }}>
              <BarChart2 size={16} className="text-amber-500" /> Rating Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-48 bg-muted rounded animate-pulse" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={ratingData}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v) => [v, 'Reviews']} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {ratingData.map(entry => (
                      <Cell key={entry.name} fill={STAR_COLORS[entry.rating] || '#3b82f6'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Platform breakdown */}
      {platformData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base" style={{ fontFamily: 'Manrope' }}>Reviews by Platform</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {platformData.map((p, i) => {
                const pct = summary?.reviews?.total ? Math.round(p.count / summary.reviews.total * 100) : 0;
                return (
                  <div key={p.name} className="flex items-center gap-3">
                    <PlatformIcon platform={p.platform} size={16} />
                    <span className="text-sm text-foreground w-24 shrink-0">{p.name}</span>
                    <div className="flex-1 bg-muted rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-16 text-right">{p.count} ({pct}%)</span>
                    <span className="text-xs text-muted-foreground w-12 text-right">★{p.avg}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Audit Logs */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base" style={{ fontFamily: 'Manrope' }}>Activity Log</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No activity yet</p>
          ) : (
            <div className="space-y-2">
              {logs.map(log => (
                <div key={log.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-primary">{log.user?.name?.[0] || '?'}</span>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-foreground">{log.user?.name || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {ACTION_LABELS[log.action] || log.action} · {log.item_type}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
