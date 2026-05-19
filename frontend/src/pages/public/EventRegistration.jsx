import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Calendar, MapPin, Loader2, CheckCircle, AlertCircle, Send, QrCode } from 'lucide-react';
import { eventApi } from '../../api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent } from '../../components/ui/card';
import { toast } from 'sonner';

const LIFECYCLE_LABEL = {
  upcoming: { color: 'bg-blue-50 text-blue-700 border-blue-200', label: 'Upcoming' },
  live: { color: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Happening now' },
};

export default function EventRegistration() {
  const { eventId } = useParams();
  const { t } = useTranslation();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', mobile: '' });

  useEffect(() => {
    eventApi.publicInfo(eventId)
      .then(({ data }) => setEvent(data))
      .catch((e) => setError(e.response?.data?.detail || 'Event not found'))
      .finally(() => setLoading(false));
  }, [eventId]);

  const validateEmail = (e) => /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(e);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.mobile.trim()) {
      return toast.error('Please fill all fields');
    }
    if (!validateEmail(form.email)) return toast.error('Invalid email');
    if (form.mobile.replace(/\D/g, '').length < 5) return toast.error('Invalid mobile');

    setSubmitting(true);
    try {
      const { data } = await eventApi.publicRegister(eventId, {
        name: form.name.trim(),
        email: form.email.trim(),
        mobile: form.mobile.trim(),
      });
      // If the event has a callback URL configured, redirect there instead
      // of showing the default success screen. Server already validated the
      // URL on create; client just sanity-checks the scheme one more time.
      const cb = data?.callback_url || event?.callback_url;
      if (cb && /^https?:\/\//i.test(cb)) {
        // Tiny success flash so the user knows we accepted the registration
        // before the new page loads on slow networks.
        toast.success('Registered — redirecting…');
        // Use replace so the back button skips the now-stale form page.
        window.location.replace(cb);
        return;
      }
      setSuccess(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10">
        <Loader2 size={28} className="animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-red-50 via-background to-red-50 dark:from-red-950/20 dark:to-red-950/20">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-3">
            <AlertCircle size={36} className="text-red-500 mx-auto" />
            <h2 className="text-lg font-semibold">Unable to register</h2>
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-emerald-50 via-background to-emerald-50 dark:from-emerald-950/20 dark:to-emerald-950/20">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-3" data-testid="event-success">
            <CheckCircle size={48} className="text-emerald-500 mx-auto" />
            <h2 className="text-xl font-semibold">{t('events.registerSuccess')}</h2>
            <p className="text-sm text-muted-foreground">{event?.name}</p>
            {event?.event_date && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground pt-2">
                <Calendar size={14} />
                {new Date(event.event_date).toLocaleString()}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const lc = LIFECYCLE_LABEL[event?.lifecycle];

  return (
    <div className="min-h-screen px-4 py-8 bg-gradient-to-br from-primary/5 via-background to-primary/10">
      <div className="max-w-md mx-auto space-y-4">
        <div className="text-center space-y-1">
          <div className="inline-flex w-12 h-12 rounded-2xl bg-primary text-primary-foreground items-center justify-center mb-2">
            <QrCode size={24} />
          </div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Manrope' }}>{event.name}</h1>
          {event.description && <p className="text-sm text-muted-foreground">{event.description}</p>}
        </div>

        <Card>
          <CardContent className="pt-5 space-y-3">
            {lc && (
              <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border ${lc.color}`}>
                {lc.label}
              </span>
            )}
            {event.event_date && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar size={14} className="text-primary" />
                <span>{new Date(event.event_date).toLocaleString()}</span>
              </div>
            )}
            {event.venue && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin size={14} className="text-primary" />
                <span>{event.venue}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <h2 className="text-base font-semibold mb-4">{t('events.registerNow')}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="reg-name" className="text-xs">{t('common.name')} *</Label>
                <Input id="reg-name" data-testid="reg-name-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-email" className="text-xs">{t('common.email')} *</Label>
                <Input id="reg-email" data-testid="reg-email-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-mobile" className="text-xs">{t('common.mobile')} *</Label>
                <Input id="reg-mobile" data-testid="reg-mobile-input" type="tel" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} required />
              </div>
              <Button type="submit" disabled={submitting} className="w-full gap-2 mt-3" data-testid="reg-submit-btn">
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {submitting ? '...' : t('events.registerNow')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
