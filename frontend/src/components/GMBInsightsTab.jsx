import { useState, useEffect, useCallback } from 'react';
import { gmbApi } from '../api';
import { toast } from 'sonner';
import {
  Loader2, BarChart3, Phone, Globe, MapPin, MessageSquare, CalendarRange,
  RefreshCw, Search, Eye, AlertTriangle, ExternalLink,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';

const RANGE_OPTIONS = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 180, label: 'Last 6 months' },
];

const KPI_CONFIG = [
  { key: 'impressions', label: 'Profile Impressions', icon: Eye, color: '#6366f1', hint: 'Times your profile appeared in Google Search & Maps' },
  { key: 'calls', label: 'Phone Calls', icon: Phone, color: '#10b981', hint: 'Tap-to-call clicks from your profile' },
  { key: 'directions', label: 'Direction Requests', icon: MapPin, color: '#f59e0b', hint: 'People who asked for directions to your business' },
  { key: 'website_clicks', label: 'Website Clicks', icon: Globe, color: '#0ea5e9', hint: 'Clicks on your listed website link' },
  { key: 'messages', label: 'Messages', icon: MessageSquare, color: '#ec4899', hint: 'Conversations started via Google Business Messages' },
  { key: 'bookings', label: 'Bookings', icon: CalendarRange, color: '#8b5cf6', hint: 'Bookings made through Reserve with Google' },
];

const TICK_STYLE = { fontSize: 11, fill: 'currentColor', opacity: 0.6 };
const fmt = (n) => new Intl.NumberFormat().format(n || 0);

function KpiCard({ kpi, value }) {
  const Icon = kpi.icon;
  return (
    <div
      className="rounded-xl border border-border bg-card p-4 hover:shadow-sm transition-shadow"
      data-testid={`gmb-insights-kpi-${kpi.key}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{kpi.label}</span>
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${kpi.color}15` }}
        >
          <Icon size={14} style={{ color: kpi.color }} />
        </span>
      </div>
      <p className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Manrope' }}>{fmt(value)}</p>
      <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{kpi.hint}</p>
    </div>
  );
}

export default function GMBInsightsTab({ branchParam }) {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchInsights = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true); else setRefreshing(true);
    try {
      const params = { days };
      if (branchParam) params.branch_id = branchParam;
      const { data: payload } = await gmbApi.getInsights(params);
      setData(payload);
    } catch (e) {
      toast.error('Failed to load profile insights');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days, branchParam]);

  useEffect(() => { fetchInsights(true); }, [fetchInsights]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="animate-spin text-primary" />
      </div>
    );
  }

  // Empty / error states
  if (data?.status && data.status !== 'ok') {
    return <InsightsEmptyState data={data} onRetry={() => fetchInsights(true)} />;
  }

  const totals = data?.totals || {};
  const series = data?.timeseries || [];
  const keywords = data?.keywords || [];
  const totalImpressions = totals.impressions || 0;
  const totalClicks = (totals.calls || 0) + (totals.website_clicks || 0) + (totals.directions || 0);
  const ctr = totalImpressions ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0.00';

  return (
    <div className="space-y-5">
      {/* Header / range picker */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2" style={{ fontFamily: 'Manrope' }}>
            <BarChart3 size={18} className="text-primary" />
            Google Business Profile Insights
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time data from Google Business Profile Performance API
            {data?.range && (
              <span className="ml-2 inline-block">
                · {data.range.start} → {data.range.end}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))} data-testid="gmb-insights-range-select">
            <SelectTrigger className="h-9 w-44 text-sm" data-testid="gmb-insights-range-trigger">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchInsights(false)}
            disabled={refreshing}
            data-testid="gmb-insights-refresh-btn"
            className="gap-1.5"
          >
            {refreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Refresh
          </Button>
        </div>
      </div>

      {/* Topline summary */}
      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Impressions</p>
              <p className="text-3xl font-bold text-foreground" style={{ fontFamily: 'Manrope' }}>{fmt(totalImpressions)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Customer Actions</p>
              <p className="text-3xl font-bold text-foreground" style={{ fontFamily: 'Manrope' }}>{fmt(totalClicks)}</p>
              <p className="text-[11px] text-muted-foreground">Calls + Directions + Website</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Action Rate</p>
              <p className="text-3xl font-bold text-foreground" style={{ fontFamily: 'Manrope' }}>{ctr}%</p>
              <p className="text-[11px] text-muted-foreground">Actions / Impressions</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Daily Average</p>
              <p className="text-3xl font-bold text-foreground" style={{ fontFamily: 'Manrope' }}>
                {fmt(Math.round(totalImpressions / Math.max(days, 1)))}
              </p>
              <p className="text-[11px] text-muted-foreground">Impressions per day</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {KPI_CONFIG.map((kpi) => (
          <KpiCard key={kpi.key} kpi={kpi} value={totals[kpi.key] || 0} />
        ))}
      </div>

      {/* Time series chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: 'Manrope' }}>
            <BarChart3 size={16} className="text-primary" />
            Performance Over Time
          </CardTitle>
        </CardHeader>
        <CardContent>
          {series.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No daily data available for this range yet.</p>
          ) : (
            <div data-testid="gmb-insights-chart" className="w-full h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="grad-impressions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="grad-actions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={TICK_STYLE}
                    tickFormatter={(d) => d ? d.slice(5) : ''}
                  />
                  <YAxis tick={TICK_STYLE} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                    labelStyle={{ fontWeight: 600 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area
                    type="monotone" dataKey="impressions" name="Impressions"
                    stroke="#6366f1" fill="url(#grad-impressions)" strokeWidth={2}
                  />
                  <Area
                    type="monotone" dataKey="calls" name="Calls" stackId="2"
                    stroke="#10b981" fill="url(#grad-actions)" strokeWidth={2}
                  />
                  <Area
                    type="monotone" dataKey="website_clicks" name="Website" stackId="2"
                    stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.2} strokeWidth={2}
                  />
                  <Area
                    type="monotone" dataKey="directions" name="Directions" stackId="2"
                    stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top search keywords */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: 'Manrope' }}>
            <Search size={16} className="text-primary" />
            Top Search Keywords
            <Badge variant="secondary" className="text-[10px] font-normal ml-1">Last 30 days</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data?.keywords_error ? (
            <div className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
              {data.keywords_error}
            </div>
          ) : keywords.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No search-keyword data available yet — Google needs at least a few weeks of profile traffic.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border" data-testid="gmb-insights-keywords-table">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Keyword</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Impressions</th>
                  </tr>
                </thead>
                <tbody>
                  {keywords.map((kw) => (
                    <tr key={kw.keyword} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-2 text-foreground">{kw.keyword}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {kw.is_threshold ? '<' : ''}{fmt(kw.impressions)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-muted-foreground p-3 border-t border-border">
                Keywords with very low traffic are reported by Google as a threshold value (e.g. "&lt;5") to protect user privacy.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InsightsEmptyState({ data, onRetry }) {
  const isAuthIssue = data.status === 'auth_error' || data.status === 'not_authorised';
  const Icon = isAuthIssue ? AlertTriangle : BarChart3;
  const tone = isAuthIssue ? 'amber' : 'gray';
  return (
    <Card>
      <CardContent className="py-14 flex flex-col items-center text-center px-6">
        <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${tone === 'amber' ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-muted'}`}>
          <Icon size={26} className={tone === 'amber' ? 'text-amber-600' : 'text-muted-foreground'} />
        </div>
        <p className="text-base font-semibold text-foreground mb-1.5" style={{ fontFamily: 'Manrope' }}>
          {data.status === 'no_business' && 'Connect your Google Business Profile'}
          {data.status === 'not_authorised' && 'Google Business Profile not authorised'}
          {data.status === 'auth_error' && 'Reconnect Google Business Profile'}
          {data.status === 'error' && 'Could not load insights'}
        </p>
        <p className="text-sm text-muted-foreground max-w-md mb-4">{data.message}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5" data-testid="gmb-insights-retry-btn">
            <RefreshCw size={13} /> Retry
          </Button>
          {isAuthIssue && (
            <Button asChild size="sm" className="gap-1.5">
              <a href="/admin/platforms" data-testid="gmb-insights-platforms-link">
                <ExternalLink size={13} /> Open Platforms
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
