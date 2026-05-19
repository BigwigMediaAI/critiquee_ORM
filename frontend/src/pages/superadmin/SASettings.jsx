import { useState } from 'react';
import { authApi } from '../../api';
import { toast } from 'sonner';
import { KeyRound, Loader2, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';

function ChangePasswordCard() {
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [show, setShow] = useState({ current: false, new: false, confirm: false });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.current_password || !form.new_password || !form.confirm_password) {
      return toast.error('All fields are required');
    }
    if (form.new_password !== form.confirm_password) {
      return toast.error('New passwords do not match');
    }
    if (form.new_password.length < 6) {
      return toast.error('Password must be at least 6 characters');
    }
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
          data-testid={`${field}-input`}
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
    <Card className="max-w-md">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: 'Manrope' }}>
          <KeyRound size={16} className="text-primary" /> Change Password
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <PasswordField field="current_password" label="Current Password" showKey="current" />
          <PasswordField field="new_password" label="New Password" showKey="new" />
          <PasswordField field="confirm_password" label="Confirm New Password" showKey="confirm" />
          <Button type="submit" disabled={loading} className="w-full gap-2" data-testid="change-password-btn">
            {loading ? <Loader2 size={14} className="animate-spin" /> : success ? <CheckCircle size={14} /> : <KeyRound size={14} />}
            {loading ? 'Updating...' : success ? 'Updated!' : 'Update Password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function SASettings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'Manrope' }}>Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your Super Admin account settings</p>
      </div>
      <ChangePasswordCard />
    </div>
  );
}
