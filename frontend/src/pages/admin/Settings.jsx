import { useState, useEffect } from 'react';
import { settingsApi, authApi } from '../../api';
import { useBranch } from '../../context/BranchContext';
import { toast } from 'sonner';
import {
  Plus, X, Loader2, Save, Shield, KeyRound, Eye, EyeOff, CheckCircle, Bot, Star, Signature, Sparkles
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Switch } from '../../components/ui/switch';
import { Badge } from '../../components/ui/badge';

const TONES = ['professional', 'friendly', 'formal', 'polite', 'enthusiastic'];
const LANGUAGES = ['English', 'Hindi', 'Spanish', 'French', 'German', 'Arabic', 'Portuguese'];

function ChangePasswordCard() {
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [show, setShow] = useState({ current: false, new: false, confirm: false });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.current_password || !form.new_password || !form.confirm_password)
      return toast.error('All fields are required');
    if (form.new_password !== form.confirm_password)
      return toast.error('New passwords do not match');
    if (form.new_password.length < 6)
      return toast.error('Password must be at least 6 characters');
    setLoading(true);
    try {
      await authApi.changePassword(form);
      toast.success('Password updated successfully');
      setSuccess(true);
      setForm({ current_password: '', new_password: '', confirm_password: '' });
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  const PasswordField = ({ field, label, showKey }) => (
    <div>
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={show[showKey] ? 'text' : 'password'}
          value={form[field]}
          onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
          className="w-full px-3 py-2.5 pr-10 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
          placeholder="••••••••"
          data-testid={`admin-${field}-input`}
        />
        <button
          type="button"
          onClick={() => setShow(s => ({ ...s, [showKey]: !s[showKey] }))}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {show[showKey] ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: 'Manrope' }}>
          <KeyRound size={16} className="text-primary" /> Change Password
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
          <PasswordField field="current_password" label="Current Password" showKey="current" />
          <PasswordField field="new_password" label="New Password" showKey="new" />
          <PasswordField field="confirm_password" label="Confirm New Password" showKey="confirm" />
          <Button type="submit" disabled={loading} className="w-full gap-2" data-testid="admin-change-password-btn">
            {loading ? <Loader2 size={14} className="animate-spin" /> : success ? <CheckCircle size={14} /> : <KeyRound size={14} />}
            {loading ? 'Updating...' : success ? 'Updated!' : 'Update Password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { currentBranch } = useBranch();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newRule, setNewRule] = useState('');

  const [form, setForm] = useState({
    brand_tone: 'professional',
    language: 'English',
    approval_required: true,
    do_dont_rules: [],
    google_auto_reply_enabled: false,
    signature: '',
    signature_enabled: false,
    seo_keywords: [],
  });
  const [newKeyword, setNewKeyword] = useState('');

  // Track auto-reply toggle separately for instant save
  const [autoReplyToggling, setAutoReplyToggling] = useState(false);

  useEffect(() => {
    if (!currentBranch) return;
    setLoading(true);
    settingsApi.getSettings({ branch_id: currentBranch.id })
      .then(({ data }) => {
        setSettings(data);
        setForm({
          brand_tone: data.brand_tone || 'professional',
          language: data.language || 'English',
          approval_required: data.approval_required !== false,
          do_dont_rules: data.do_dont_rules || [],
          google_auto_reply_enabled: data.google_auto_reply_enabled || false,
          signature: data.signature || '',
          signature_enabled: data.signature_enabled || false,
          seo_keywords: data.seo_keywords || [],
        });
      })
      .catch((err) => console.error('Failed to load settings:', err))
      .finally(() => setLoading(false));
  }, [currentBranch]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const params = currentBranch ? { branch_id: currentBranch.id } : {};
      await settingsApi.updateSettings(form, params);
      toast.success('Settings saved');
    } catch (e) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const addRule = () => {
    if (!newRule.trim()) return;
    setForm(f => ({ ...f, do_dont_rules: [...f.do_dont_rules, newRule.trim()] }));
    setNewRule('');
  };

  const removeRule = (i) => {
    setForm(f => ({ ...f, do_dont_rules: f.do_dont_rules.filter((_, idx) => idx !== i) }));
  };

  const addKeyword = () => {
    const k = newKeyword.trim();
    if (!k) return;
    if ((form.seo_keywords || []).includes(k)) {
      setNewKeyword('');
      return;
    }
    if ((form.seo_keywords || []).length >= 30) {
      toast.error('Maximum 30 keywords');
      return;
    }
    setForm(f => ({ ...f, seo_keywords: [...(f.seo_keywords || []), k] }));
    setNewKeyword('');
  };

  const removeKeyword = (i) => {
    setForm(f => ({ ...f, seo_keywords: (f.seo_keywords || []).filter((_, idx) => idx !== i) }));
  };

  // Toggle auto-reply and save immediately
  const handleAutoReplyToggle = async (checked) => {
    setAutoReplyToggling(true);
    const prev = form.google_auto_reply_enabled;
    setForm(f => ({ ...f, google_auto_reply_enabled: checked }));
    try {
      const params = currentBranch ? { branch_id: currentBranch.id } : {};
      await settingsApi.updateSettings({ google_auto_reply_enabled: checked }, params);
      toast.success(checked ? 'Auto-reply enabled for Google reviews' : 'Auto-reply disabled');
    } catch (err) {
      console.error('Failed to update auto-reply:', err);
      setForm(f => ({ ...f, google_auto_reply_enabled: prev }));
      toast.error('Failed to update auto-reply setting');
    } finally {
      setAutoReplyToggling(false);
    }
  };

  const addLocation = async () => {
    if (!newLocation.trim()) return;
    setAddingLocation(true);
    try {
      await settingsApi.addLocation({ name: newLocation });
      toast.success('Location added');
      setNewLocation('');
      settingsApi.getSettings().then(({ data }) => setSettings(data)).catch((err) => console.error('Refresh failed:', err));
    } catch (e) { toast.error('Failed to add location'); }
    finally { setAddingLocation(false); }
  };

  if (loading) return (
    <div className="space-y-4">
      {[1, 2, 3].map(i => <div key={i} className="h-40 bg-muted rounded-xl animate-pulse" />)}
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Manrope' }}>Settings</h1>
          <p className="text-sm text-muted-foreground">{currentBranch?.name || settings?.name} · Branch Configuration</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2" data-testid="save-settings-btn">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save Changes
        </Button>
      </div>

      {/* Brand & AI Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base" style={{ fontFamily: 'Manrope' }}>Brand & AI Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Brand Tone</label>
              <select
                className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.brand_tone}
                onChange={e => setForm(f => ({ ...f, brand_tone: e.target.value }))}
                data-testid="brand-tone-select"
              >
                {TONES.map(t => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
              <p className="text-xs text-muted-foreground mt-1">Used for AI reply generation</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Reply Language</label>
              <select
                className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.language}
                onChange={e => setForm(f => ({ ...f, language: e.target.value }))}
                data-testid="language-select"
              >
                {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Approval Workflow */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: 'Manrope' }}>
            <Shield size={16} /> Approval Workflow
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 rounded-xl bg-muted/60">
            <div>
              <p className="text-sm font-medium text-foreground">Require approval for department replies</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                When enabled, department users must submit replies for your approval before posting
              </p>
            </div>
            <button
              onClick={() => setForm(f => ({ ...f, approval_required: !f.approval_required }))}
              data-testid="approval-toggle"
              className={`w-12 h-6 rounded-full transition-all shrink-0 ml-4 ${form.approval_required ? 'bg-primary' : 'bg-muted border border-border'}`}
            >
              <span className={`block w-5 h-5 bg-white rounded-full shadow-sm transition-transform mx-0.5 ${form.approval_required ? 'translate-x-6' : 'translate-x-0'}`} />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Do/Don't Rules */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base" style={{ fontFamily: 'Manrope' }}>AI Reply Rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            These rules are sent to AI when generating reply suggestions. Example: "Never promise refunds", "Always mention our loyalty program"
          </p>
          <div className="space-y-2">
            {form.do_dont_rules.map((rule, idx) => (
              <div key={`rule-${idx}-${rule.slice(0, 24)}`} className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/60">
                <span className="text-sm text-foreground flex-1">{rule}</span>
                <button
                  onClick={() => removeRule(idx)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  data-testid={`remove-rule-${idx}`}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Add a rule (e.g. Never promise refunds)"
              value={newRule}
              onChange={e => setNewRule(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addRule()}
              data-testid="new-rule-input"
            />
            <Button onClick={addRule} variant="outline" size="sm" className="gap-1" data-testid="add-rule-btn">
              <Plus size={14} /> Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* SEO Keywords */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: 'Manrope' }}>
            <Sparkles size={16} className="text-primary" /> SEO Keywords
            <Badge variant="secondary" className="text-[10px] font-normal ml-1">{(form.seo_keywords || []).length}/30</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Keywords AI weaves into review replies and post captions to keep your messaging on-brand and search-friendly.
            Examples: <span className="font-mono text-foreground">"luxury rooftop dining"</span>,
            {' '}<span className="font-mono text-foreground">"family-friendly hotel"</span>,
            {' '}<span className="font-mono text-foreground">"airport pickup"</span>.
          </p>
          <div className="flex flex-wrap gap-1.5" data-testid="seo-keywords-list">
            {(form.seo_keywords || []).length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-2">No keywords yet — add a few to personalise AI output.</p>
            ) : (
              (form.seo_keywords || []).map((k, idx) => (
                <Badge
                  key={`kw-${idx}-${k.slice(0, 24)}`}
                  variant="secondary"
                  className="gap-1.5 pl-2.5 pr-1 py-1 text-xs"
                >
                  {k}
                  <button
                    onClick={() => removeKeyword(idx)}
                    className="rounded-full hover:bg-foreground/10 transition-colors w-4 h-4 inline-flex items-center justify-center"
                    data-testid={`remove-keyword-${idx}`}
                    aria-label={`Remove keyword ${k}`}
                  >
                    <X size={11} />
                  </button>
                </Badge>
              ))
            )}
          </div>
          <div className="flex gap-2">
            <input
              className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Add a keyword (e.g. rooftop pool, family-friendly)"
              value={newKeyword}
              onChange={e => setNewKeyword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
              data-testid="new-keyword-input"
              maxLength={60}
            />
            <Button
              onClick={addKeyword}
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={!newKeyword.trim() || (form.seo_keywords || []).length >= 30}
              data-testid="add-keyword-btn"
            >
              <Plus size={14} /> Add
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Tip: think branded terms, signature dishes, neighbourhood names, and unique amenities. Click <strong>Save Changes</strong> at the top to apply.
          </p>
        </CardContent>
      </Card>

      {/* Reply Signature */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: 'Manrope' }}>
            <Signature size={16} className="text-primary" /> Reply Signature
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4 p-4 rounded-lg border border-border bg-muted/30">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-foreground">
                  Auto-append signature to AI replies
                </span>
                <Badge variant={form.signature_enabled ? 'default' : 'secondary'} className="text-[10px]">
                  {form.signature_enabled ? 'ON' : 'OFF'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                When enabled, the signature below is automatically appended to every AI-generated reply
                for reviews, comments, and social messages — keeping replies consistent across channels.
              </p>
            </div>
            <Switch
              checked={form.signature_enabled}
              onCheckedChange={(v) => setForm(f => ({ ...f, signature_enabled: v }))}
              data-testid="signature-enabled-toggle"
            />
          </div>

          <div>
            <label htmlFor="signature-text" className="block text-sm font-medium mb-1.5">
              Signature Text
            </label>
            <textarea
              id="signature-text"
              value={form.signature}
              onChange={(e) => setForm(f => ({ ...f, signature: e.target.value.slice(0, 500) }))}
              rows={4}
              placeholder={'— Best regards,\nThe Team at [Your Business]\nphone | website'}
              data-testid="signature-textarea"
              disabled={!form.signature_enabled}
              className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring transition-all disabled:opacity-60"
            />
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-muted-foreground">
                Tip: Save your signature, then click <strong>Save Changes</strong> at the top to apply.
              </p>
              <span className={`text-xs ${form.signature.length > 450 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                {form.signature.length}/500
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Google Auto-Reply Setting */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bot size={16} className="text-primary" /> Google Review Auto-Reply
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30">
            <div className="flex-1 mr-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-foreground">
                  Auto-reply to positive Google reviews
                </span>
                <Badge variant={form.google_auto_reply_enabled ? 'default' : 'secondary'} className="text-[10px]">
                  {form.google_auto_reply_enabled ? 'ON' : 'OFF'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                When enabled, the system will automatically generate and post AI-powered replies for <strong>4-star and 5-star</strong> unreplied Google reviews. Limited to <strong>5 replies per day</strong>. Replies match your configured brand tone and language settings.
              </p>
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Star size={11} className="text-amber-400 fill-amber-400" /> 4-5 star reviews only
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Bot size={11} /> Max 5 replies/day
                </div>
              </div>
            </div>
            <Switch
              checked={form.google_auto_reply_enabled}
              onCheckedChange={handleAutoReplyToggle}
              disabled={autoReplyToggling || loading}
              data-testid="auto-reply-toggle"
            />
          </div>
          {form.google_auto_reply_enabled && (
            <div className="mt-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
              <p className="text-xs text-emerald-700 flex items-center gap-1.5">
                <CheckCircle size={12} />
                Auto-reply is active. The system will check for unreplied reviews every 4 hours using your brand tone: <strong>{form.brand_tone}</strong>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Change Password */}
      <ChangePasswordCard />
    </div>
  );
}
