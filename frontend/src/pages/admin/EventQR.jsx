import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeCanvas } from 'qrcode.react';
import { eventApi } from '../../api';
import { useBranch } from '../../context/BranchContext';
import { toast } from 'sonner';
import {
  QrCode, Plus, Calendar, MapPin, Users, Download, Trash2, Copy, Check,
  ExternalLink, Link as LinkIcon, Loader2, Filter, Share2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '../../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import DataPagination, { usePagination } from '../../components/DataPagination';

const APP_URL = window.location.origin;

const LIFECYCLE_STYLE = {
  upcoming: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  live: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  ended: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

function downloadQR(eventId, eventName) {
  const canvas = document.getElementById(`qr-${eventId}`);
  if (!canvas) return;
  const url = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.download = `${(eventName || 'event').replace(/\s+/g, '_')}_qr.png`;
  link.href = url;
  link.click();
}

async function shareEvent({ eventId, eventName, eventVenue, eventDate, link, t }) {
  const safeName = eventName || 'Event';
  const dateStr = eventDate ? new Date(eventDate).toLocaleDateString() : '';
  const venueStr = eventVenue ? ` at ${eventVenue}` : '';
  const shareTitle = `${safeName} — Registration`;
  const shareText = `You're invited to ${safeName}${venueStr}${dateStr ? ` on ${dateStr}` : ''}. Register here:`;

  // Try sharing the QR PNG as a file (Web Share API Level 2 — mobile + recent desktop browsers)
  try {
    const canvas = document.getElementById(`qr-${eventId}`);
    if (canvas && navigator.canShare && typeof canvas.toBlob === 'function') {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (blob) {
        const file = new File(
          [blob],
          `${safeName.replace(/\s+/g, '_')}_qr.png`,
          { type: 'image/png' },
        );
        const fileShareData = { files: [file], title: shareTitle, text: shareText, url: link };
        if (navigator.canShare(fileShareData)) {
          await navigator.share(fileShareData);
          return;
        }
      }
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return; // user cancelled
    // fall through to text/url share
  }

  // Fallback 1: native share without file (URL + text only)
  try {
    if (navigator.share) {
      await navigator.share({ title: shareTitle, text: shareText, url: link });
      return;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
  }

  // Fallback 2: copy link to clipboard
  try {
    await navigator.clipboard.writeText(link);
    toast.success(
      t ? t('events.linkCopied') : 'Link copied to clipboard',
      { description: 'Sharing is not supported on this device — link copied instead.' },
    );
  } catch {
    toast.error('Unable to share or copy link');
  }
}

function CreateEventDialog({ open, onOpenChange, onCreated }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ name: '', venue: '', description: '', event_date: '', event_time: '', event_end_date: '', callback_url: '' });
  const [saving, setSaving] = useState(false);

  const reset = () => setForm({ name: '', venue: '', description: '', event_date: '', event_time: '', event_end_date: '', callback_url: '' });

  const handleSubmit = async () => {
    if (!form.name.trim()) return toast.error('Event name required');
    if (!form.event_date) return toast.error('Event date required');

    const eventDateIso = form.event_time
      ? new Date(`${form.event_date}T${form.event_time}`).toISOString()
      : new Date(`${form.event_date}T09:00`).toISOString();

    const endIso = form.event_end_date ? new Date(`${form.event_end_date}T23:59`).toISOString() : null;

    setSaving(true);
    try {
      const cbUrl = form.callback_url.trim();
      // Light client-side guard — backend re-validates. Prevent obvious typos
      // like missing "https://" before letting the user submit.
      if (cbUrl && !/^https?:\/\//i.test(cbUrl)) {
        setSaving(false);
        return toast.error('Callback URL must start with http:// or https://');
      }
      const { data } = await eventApi.create({
        name: form.name.trim(),
        venue: form.venue.trim(),
        description: form.description.trim(),
        event_date: eventDateIso,
        event_end_date: endIso,
        callback_url: cbUrl || null,
      });
      toast.success('Event created');
      onCreated(data);
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to create event');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md" data-testid="create-event-dialog">
        <DialogHeader>
          <DialogTitle>{t('events.createEvent')}</DialogTitle>
          <DialogDescription>Create a registration link and QR code for your event.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="evt-name" className="text-xs">{t('events.eventName')} *</Label>
            <Input id="evt-name" data-testid="event-name-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Summer Gala 2026" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="evt-venue" className="text-xs">{t('events.venue')}</Label>
            <Input id="evt-venue" data-testid="event-venue-input" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="Grand Ballroom" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="evt-date" className="text-xs">{t('events.eventDate')} *</Label>
              <Input id="evt-date" data-testid="event-date-input" type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="evt-time" className="text-xs">{t('common.time')}</Label>
              <Input id="evt-time" type="time" value={form.event_time} onChange={(e) => setForm({ ...form, event_time: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="evt-end" className="text-xs">{t('events.eventEndDate')}</Label>
            <Input id="evt-end" type="date" value={form.event_end_date} onChange={(e) => setForm({ ...form, event_end_date: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="evt-desc" className="text-xs">{t('events.description')}</Label>
            <textarea id="evt-desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="evt-callback" className="text-xs flex items-center gap-1">
              <ExternalLink size={11} className="text-muted-foreground" />
              Callback URL <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="evt-callback"
              data-testid="event-callback-input"
              type="url"
              inputMode="url"
              value={form.callback_url}
              onChange={(e) => setForm({ ...form, callback_url: e.target.value })}
              placeholder="https://your-site.com/thank-you"
            />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              If set, attendees will be redirected here after they register. Leave empty to show the default "Thank you" screen.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t('common.cancel')}</Button>
          <Button onClick={handleSubmit} disabled={saving} className="gap-2" data-testid="create-event-submit-btn">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RegistrationsDialog({ open, onOpenChange, eventId, eventName }) {
  const { t } = useTranslation();
  const [regs, setRegs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open || !eventId) return;
    setLoading(true);
    setSearch('');
    eventApi.getRegistrations(eventId)
      .then(({ data }) => setRegs(data.registrations || []))
      .catch(() => toast.error('Failed to load registrations'))
      .finally(() => setLoading(false));
  }, [open, eventId]);

  const handleExport = async () => {
    try {
      const res = await eventApi.exportRegistrations(eventId);
      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `registrations_${(eventName || 'event').replace(/\s+/g, '_')}.csv`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Export failed');
    }
  };

  const filtered = search.trim()
    ? regs.filter((r) => {
        const q = search.toLowerCase();
        return (
          r.name?.toLowerCase().includes(q) ||
          r.email?.toLowerCase().includes(q) ||
          r.mobile?.includes(q)
        );
      })
    : regs;

  const pagination = usePagination(filtered, 10, [search, eventId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-0">
        <div className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Users size={16} className="text-primary" />
            {eventName} — {t('events.registrations')}
          </DialogTitle>
          <DialogDescription className="text-xs mt-1">
            {regs.length} {regs.length === 1 ? 'person has' : 'people have'} registered
          </DialogDescription>
        </div>

        <div className="px-5 py-3 flex items-center gap-2 border-b border-border bg-muted/20">
          <Input
            placeholder={t('common.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs h-8 text-xs"
            data-testid="reg-search-input"
          />
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={!regs.length}
            className="gap-2 h-8"
            data-testid="export-registrations-btn"
          >
            <Download size={12} /> {t('events.exportRegistrations')}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <Users size={32} className="text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-sm text-muted-foreground">
                {regs.length === 0 ? 'No registrations yet.' : 'No matches found.'}
              </p>
              {regs.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Share the registration link with your audience to start collecting registrations.
                </p>
              )}
            </div>
          ) : (
            <div className="border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">{t('common.name')}</th>
                    <th className="px-3 py-2 font-medium">{t('common.email')}</th>
                    <th className="px-3 py-2 font-medium">{t('common.mobile')}</th>
                    <th className="px-3 py-2 font-medium">{t('events.createdDate')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.pageItems.map((r, idx) => (
                    <tr key={r.id} className="border-t border-border hover:bg-accent/5" data-testid={`reg-row-${r.id}`}>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{pagination.startIdx + idx}</td>
                      <td className="px-3 py-2.5 font-medium">{r.name}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{r.email}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{r.mobile}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <DataPagination {...pagination} itemLabel="registrations" testIdPrefix="regs-pagination" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function QRPreviewDialog({ open, onOpenChange, event }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  if (!event) return null;
  const link = `${APP_URL}/event/${event.id}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success(t('events.linkCopied'));
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="qr-preview-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <QrCode size={16} className="text-primary" />
            {event.name}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-3 flex-wrap text-xs">
            {event.event_date && (
              <span className="inline-flex items-center gap-1">
                <Calendar size={11} /> {new Date(event.event_date).toLocaleDateString()}
              </span>
            )}
            {event.venue && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={11} /> {event.venue}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl bg-muted/30 py-5 text-center">
          <div className="inline-block bg-white p-3 rounded-xl border border-border shadow-sm">
            <QRCodeCanvas id={`qr-modal-${event.id}`} value={link} size={200} level="H" includeMargin={false} />
          </div>
          <p className="text-xs text-muted-foreground mt-3">Scan or share the link below</p>
        </div>

        <div className="space-y-3 w-full overflow-hidden">
          <div className="space-y-1.5 w-full">
            <Label className="text-xs text-muted-foreground">{t('events.registrationLink')}</Label>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted text-xs border border-border w-full">
              <LinkIcon size={12} className="text-muted-foreground shrink-0" />
              <span
                className="flex-1 font-mono overflow-hidden text-ellipsis whitespace-nowrap"
                style={{ minWidth: 0 }}
                data-testid="qr-link-display"
              >
                {link}
              </span>
              <button
                onClick={handleCopy}
                className="text-primary hover:opacity-70 shrink-0 p-1 rounded hover:bg-background"
                data-testid="copy-link-btn"
                title={t('events.copyLink')}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 w-full">
            <Button variant="outline" size="sm" className="gap-1.5 w-full" onClick={() => window.open(link, '_blank')}>
              <ExternalLink size={13} /> Open
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 w-full"
              onClick={() =>
                shareEvent({
                  eventId: event.id,
                  eventName: event.name,
                  eventVenue: event.venue,
                  eventDate: event.event_date,
                  link,
                  t,
                })
              }
              data-testid="share-qr-modal-btn"
            >
              <Share2 size={13} /> Share
            </Button>
            <Button
              size="sm"
              className="gap-1.5 w-full"
              onClick={() => {
                const canvas = document.getElementById(`qr-modal-${event.id}`);
                if (canvas) {
                  const a = document.createElement('a');
                  a.download = `${event.name.replace(/\s+/g, '_')}_qr.png`;
                  a.href = canvas.toDataURL('image/png');
                  a.click();
                }
              }}
              data-testid="download-qr-btn"
            >
              <Download size={13} /> {t('events.downloadQR')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function EventQR() {
  const { t } = useTranslation();
  const { currentBranch } = useBranch();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showRegs, setShowRegs] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all'); // active | inactive
  const [filterLifecycle, setFilterLifecycle] = useState('all'); // upcoming | live | ended
  const [search, setSearch] = useState('');

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const params = currentBranch ? { branch_id: currentBranch.id } : {};
      const { data } = await eventApi.list(params);
      setEvents(data.events || []);
    } catch (e) {
      toast.error('Failed to load events');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchEvents(); }, [currentBranch]);

  const handleToggleActive = async (evt) => {
    try {
      const { data } = await eventApi.update(evt.id, { is_active: !evt.is_active });
      setEvents((prev) => prev.map((e) => (e.id === evt.id ? data : e)));
      toast.success(`Event ${data.is_active ? 'activated' : 'deactivated'}`);
    } catch {
      toast.error('Failed to update');
    }
  };

  const handleDelete = async (evt) => {
    if (!window.confirm(t('events.deleteConfirm'))) return;
    try {
      await eventApi.remove(evt.id);
      setEvents((prev) => prev.filter((e) => e.id !== evt.id));
      toast.success('Event deleted');
    } catch {
      toast.error('Delete failed');
    }
  };

  const handleExportEvents = async () => {
    try {
      const params = currentBranch ? { branch_id: currentBranch.id } : {};
      const res = await eventApi.exportEvents(params);
      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `events_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Export failed');
    }
  };

  const filtered = events.filter((evt) => {
    if (filterStatus !== 'all') {
      const isActive = evt.is_active !== false;
      if (filterStatus === 'active' && !isActive) return false;
      if (filterStatus === 'inactive' && isActive) return false;
    }
    if (filterLifecycle !== 'all' && evt.lifecycle !== filterLifecycle) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!evt.name?.toLowerCase().includes(q) && !evt.venue?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const eventsPagination = usePagination(filtered, 10, [search, filterStatus, filterLifecycle, currentBranch?.id]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ fontFamily: 'Manrope' }}>
            <QrCode size={24} className="text-primary" />
            {t('events.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('events.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportEvents} className="gap-2" data-testid="export-events-btn">
            <Download size={14} /> {t('events.exportEvents')}
          </Button>
          <Button onClick={() => setShowCreate(true)} className="gap-2" data-testid="create-event-btn">
            <Plus size={14} /> {t('events.createEvent')}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Filter size={13} /> Filters:
            </div>
            <Input
              placeholder={t('common.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
              data-testid="event-search-input"
            />
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[150px]" data-testid="filter-status">
                <SelectValue placeholder={t('events.filterStatus')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('events.filterAll')} {t('events.filterStatus')}</SelectItem>
                <SelectItem value="active">{t('common.active')}</SelectItem>
                <SelectItem value="inactive">{t('common.inactive')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterLifecycle} onValueChange={setFilterLifecycle}>
              <SelectTrigger className="w-[180px]" data-testid="filter-lifecycle">
                <SelectValue placeholder={t('events.filterLifecycle')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('events.filterAll')} {t('events.filterLifecycle')}</SelectItem>
                <SelectItem value="upcoming">{t('events.lifecycle.upcoming')}</SelectItem>
                <SelectItem value="live">{t('events.lifecycle.live')}</SelectItem>
                <SelectItem value="ended">{t('events.lifecycle.ended')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* DataTable */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 flex justify-center"><Loader2 size={22} className="animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <QrCode size={36} className="text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground" data-testid="no-events-msg">{events.length === 0 ? t('events.noEvents') : 'No events match filters'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-medium">{t('events.eventName')}</th>
                    <th className="px-4 py-3 font-medium">{t('events.eventDate')}</th>
                    <th className="px-4 py-3 font-medium">{t('events.qrCode')}</th>
                    <th className="px-4 py-3 font-medium">{t('events.registrations')}</th>
                    <th className="px-4 py-3 font-medium">{t('common.status')}</th>
                    <th className="px-4 py-3 font-medium">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {eventsPagination.pageItems.map((evt) => (
                    <tr key={evt.id} className="border-t border-border hover:bg-accent/5" data-testid={`event-row-${evt.id}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{evt.name}</div>
                        {evt.venue && (
                          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <MapPin size={10} /> {evt.venue}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar size={11} />
                          {new Date(evt.event_date).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => { setSelectedEvent(evt); setShowQR(true); }}
                          className="bg-white p-1.5 rounded-lg border border-border hover:border-primary hover:shadow-md transition-all"
                          title="View QR"
                          data-testid={`qr-thumb-${evt.id}`}
                        >
                          <QRCodeCanvas
                            id={`qr-${evt.id}`}
                            value={`${APP_URL}/event/${evt.id}`}
                            size={96}
                            level="M"
                          />
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => { setSelectedEvent(evt); setShowRegs(true); }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/15 text-sm font-medium transition-colors"
                          data-testid={`view-regs-${evt.id}`}
                          title={t('events.viewRegistrations')}
                        >
                          <Users size={12} />
                          <span>{evt.registrations_count ?? 0}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={evt.is_active !== false}
                            onCheckedChange={() => handleToggleActive(evt)}
                            data-testid={`active-toggle-${evt.id}`}
                          />
                          <Badge className={`text-xs ${LIFECYCLE_STYLE[evt.lifecycle] || ''}`}>
                            {t(`events.lifecycle.${evt.lifecycle || 'upcoming'}`)}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => { setSelectedEvent(evt); setShowRegs(true); }}
                            title={t('events.viewRegistrations')}
                            data-testid={`view-regs-action-${evt.id}`}
                          >
                            <Users size={13} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => downloadQR(evt.id, evt.name)}
                            title={t('events.downloadQR')}
                            data-testid={`download-qr-${evt.id}`}
                          >
                            <Download size={13} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-primary hover:text-primary"
                            onClick={() =>
                              shareEvent({
                                eventId: evt.id,
                                eventName: evt.name,
                                eventVenue: evt.venue,
                                eventDate: evt.event_date,
                                link: `${APP_URL}/event/${evt.id}`,
                                t,
                              })
                            }
                            title={t('events.shareQR') || 'Share QR'}
                            data-testid={`share-qr-${evt.id}`}
                          >
                            <Share2 size={13} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => {
                              navigator.clipboard.writeText(`${APP_URL}/event/${evt.id}`);
                              toast.success(t('events.linkCopied'));
                            }}
                            title={t('events.copyLink')}
                            data-testid={`copy-link-${evt.id}`}
                          >
                            <Copy size={13} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                            onClick={() => handleDelete(evt)}
                            title={t('common.delete')}
                            data-testid={`delete-event-${evt.id}`}
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <DataPagination {...eventsPagination} itemLabel="events" testIdPrefix="events-pagination" />
            </div>
          )}
        </CardContent>
      </Card>

      <CreateEventDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={(evt) => setEvents((prev) => [evt, ...prev])}
      />
      <QRPreviewDialog open={showQR} onOpenChange={setShowQR} event={selectedEvent} />
      <RegistrationsDialog
        open={showRegs}
        onOpenChange={setShowRegs}
        eventId={selectedEvent?.id}
        eventName={selectedEvent?.name}
      />
    </div>
  );
}
