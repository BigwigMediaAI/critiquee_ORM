import { useState, useEffect, useCallback } from "react";
import { superAdminApi } from "../../api";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Building2,
  MoreVertical,
  Power,
  PowerOff,
  KeyRound,
  Loader2,
  Check,
  Edit2,
  MapPin,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Input } from "../../components/ui/input";
import PlatformIcon, { getPlatformLabel } from "../../components/PlatformIcon";
import DataPagination, { usePagination } from "../../components/DataPagination";

// ─── Places API Key Management Dialog ───────────────────────────────────────

function PlacesApiKeyDialog({ open, onClose, client }) {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editBranch, setEditBranch] = useState(null);
  const [newKey, setNewKey] = useState("");
  const [showKey, setShowKey] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !client) return;
    setLoading(true);
    superAdminApi
      .getPlacesApiKeys(client.id)
      .then(({ data }) => setBranches(data.branches || []))
      .catch(() => toast.error("Failed to load API keys"))
      .finally(() => setLoading(false));
  }, [open, client]);

  const handleSave = async (branchId) => {
    if (!newKey.trim()) return toast.error("API key is required");
    setSaving(true);
    try {
      await superAdminApi.updatePlacesApiKey(client.id, {
        branch_id: branchId,
        api_key: newKey.trim(),
      });
      toast.success("API key updated");
      setEditBranch(null);
      setNewKey("");
      // Refresh
      const { data } = await superAdminApi.getPlacesApiKeys(client.id);
      setBranches(data.branches || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (branchId) => {
    try {
      await superAdminApi.removePlacesApiKey(client.id, branchId);
      toast.success("API key and business data removed");
      const { data } = await superAdminApi.getPlacesApiKeys(client.id);
      setBranches(data.branches || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to remove");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg" data-testid="places-api-key-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <MapPin size={18} className="text-primary" />
            Places API Keys — {client?.name}
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 size={20} className="animate-spin mr-2" /> Loading...
          </div>
        ) : branches.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No branches found for this client.
          </p>
        ) : (
          <div className="space-y-3 max-h-[50vh] overflow-y-auto">
            {branches.map((b) => (
              <div
                key={b.branch_id}
                className="p-3 rounded-lg border border-border bg-muted/20"
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {b.branch_name}
                    </p>
                    {b.connected_business && (
                      <p className="text-xs text-muted-foreground">
                        Connected: {b.connected_business}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant={b.has_key ? "default" : "secondary"}
                    className="text-[10px]"
                  >
                    {b.has_key ? "Key Set" : "No Key"}
                  </Badge>
                </div>

                {/* Show current masked key */}
                {b.has_key && editBranch !== b.branch_id && (
                  <div className="flex items-center gap-2 mt-2">
                    <code className="text-xs bg-muted px-2 py-1 rounded font-mono flex-1">
                      {showKey[b.branch_id] ? b.masked_key : "••••••••••••"}
                    </code>
                    <button
                      onClick={() =>
                        setShowKey((s) => ({
                          ...s,
                          [b.branch_id]: !s[b.branch_id],
                        }))
                      }
                      className="p-1 hover:bg-muted rounded"
                      title="Toggle visibility"
                    >
                      {showKey[b.branch_id] ? (
                        <EyeOff size={13} />
                      ) : (
                        <Eye size={13} />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setEditBranch(b.branch_id);
                        setNewKey("");
                      }}
                      className="p-1 hover:bg-muted rounded text-primary"
                      title="Edit key"
                      data-testid={`edit-apikey-${b.branch_id}`}
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={() => handleRemove(b.branch_id)}
                      className="p-1 hover:bg-muted rounded text-red-500"
                      title="Remove key & data"
                      data-testid={`remove-apikey-${b.branch_id}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}

                {/* No key — show set button */}
                {!b.has_key && editBranch !== b.branch_id && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 text-xs h-7 gap-1"
                    onClick={() => {
                      setEditBranch(b.branch_id);
                      setNewKey("");
                    }}
                    data-testid={`set-apikey-${b.branch_id}`}
                  >
                    <Plus size={12} /> Set API Key
                  </Button>
                )}

                {/* Edit mode */}
                {editBranch === b.branch_id && (
                  <div className="flex items-center gap-2 mt-2">
                    <Input
                      placeholder="AIzaSy..."
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value)}
                      className="h-8 text-xs flex-1"
                      type="password"
                      data-testid={`apikey-input-${b.branch_id}`}
                    />
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => handleSave(b.branch_id)}
                      disabled={saving}
                      data-testid={`save-apikey-${b.branch_id}`}
                    >
                      {saving ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Check size={12} />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setEditBranch(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ALL_PLATFORMS = [
  // Reviews & Local
  "google",
  "yelp",
  "trustpilot",
  "foursquare",
  // Social
  "facebook",
  "instagram",
  "linkedin",
  "x",
  "youtube",
  "reddit",
  // Hospitality
  "tripadvisor",
  "booking",
  "expedia",
  "hotels_com",
  "agoda",
  "opentable",
  // Travel
  "viator",
  "getyourguide",
  "airbnb",
  // Properties
  "zillow",
  "realtor",
];
const BUSINESS_TYPES = [
  "hotel",
  "restaurant",
  "retail",
  "spa",
  "clinic",
  "saas",
  "other",
];

function ClientFormModal({ open, onClose, onSaved, editClient }) {
  const isEdit = !!editClient;
  const [form, setForm] = useState({
    name: "",
    business_type: "hotel",
    email: "",
    admin_name: "",
    admin_email: "",
    admin_password: "",
    enabled_platforms: ALL_PLATFORMS.slice(),
    is_active: true,
    brand_tone: "professional",
    language: "en",
    approval_required: false,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (editClient) {
      setForm({
        name: editClient.name || "",
        business_type: editClient.business_type || "hotel",
        email: editClient.email || "",
        admin_name: editClient.admin_user?.name || "",
        admin_email: editClient.admin_user?.email || "",
        admin_password: "",
        enabled_platforms:
          editClient.enabled_platforms || ALL_PLATFORMS.slice(),
        is_active: editClient.is_active !== false,
        brand_tone: editClient.brand_tone || "professional",
        language: editClient.language || "en",
        approval_required: editClient.approval_required || false,
      });
    } else {
      setForm({
        name: "",
        business_type: "hotel",
        email: "",
        admin_name: "",
        admin_email: "",
        admin_password: "",
        enabled_platforms: ALL_PLATFORMS.slice(),
        is_active: true,
        brand_tone: "professional",
        language: "en",
        approval_required: false,
      });
    }
  }, [editClient, open]);

  const toggle = (p) => {
    setForm((f) => ({
      ...f,
      enabled_platforms: f.enabled_platforms.includes(p)
        ? f.enabled_platforms.filter((x) => x !== p)
        : [...f.enabled_platforms, p],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name) {
      return toast.error("Business name is required");
    }
    if (!isEdit && (!form.admin_email || !form.admin_password)) {
      return toast.error(
        "Admin email and password are required for new clients",
      );
    }

    setLoading(true);
    try {
      if (isEdit) {
        await superAdminApi.updateClient(editClient.id, {
          name: form.name,
          business_type: form.business_type,
          email: form.email,
          enabled_platforms: form.enabled_platforms,
          is_active: form.is_active,
          brand_tone: form.brand_tone,
          language: form.language,
          approval_required: form.approval_required,
        });
        toast.success(`Client "${form.name}" updated!`);
      } else {
        const { data } = await superAdminApi.createClient(form);
        const bizKey = data.business_key;
        toast.success(
          `Client "${form.name}" created!  Business Key: ${bizKey}`,
          {
            duration: 10000,
            description: "Share this key with the business admin for login.",
          },
        );
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(
        err.response?.data?.detail ||
          `Failed to ${isEdit ? "update" : "create"} client`,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "Manrope" }}>
            {isEdit ? "Edit Client" : "Create New Client"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1.5">
                Business Name *
              </label>
              <input
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="Grand Hotel"
                data-testid="client-name-input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Business Type
              </label>
              <select
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.business_type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, business_type: e.target.value }))
                }
              >
                {BUSINESS_TYPES.map((t) => (
                  <option key={t} value={t} className="capitalize">
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Business Email
              </label>
              <input
                type="text"
                inputMode="email"
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
                placeholder="info@hotel.com"
              />
            </div>
          </div>

          {/* Status toggle for edit mode */}
          {isEdit && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
              <div>
                <p className="text-sm font-medium">Account Status</p>
                <p className="text-xs text-muted-foreground">
                  {form.is_active
                    ? "Account is active and can access the platform"
                    : "Account is paused"}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({ ...f, is_active: !f.is_active }))
                }
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  form.is_active ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    form.is_active ? "left-7" : "left-1"
                  }`}
                />
              </button>
            </div>
          )}

          {/* Admin account section - only for new clients */}
          {!isEdit && (
            <div className="border-t pt-4">
              <p
                className="text-sm font-semibold text-foreground mb-3"
                style={{ fontFamily: "Manrope" }}
              >
                Admin Account
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Admin Name *
                  </label>
                  <input
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={form.admin_name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, admin_name: e.target.value }))
                    }
                    placeholder="John Manager"
                    data-testid="admin-name-input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Admin Email *
                  </label>
                  <input
                    type="email"
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={form.admin_email}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, admin_email: e.target.value }))
                    }
                    placeholder="admin@hotel.com"
                    data-testid="admin-email-input"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1.5">
                    Admin Password *
                  </label>
                  <input
                    type="password"
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={form.admin_password}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, admin_password: e.target.value }))
                    }
                    placeholder="••••••••"
                    data-testid="admin-password-input"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Settings section */}
          <div className="border-t pt-4">
            <p
              className="text-sm font-semibold text-foreground mb-3"
              style={{ fontFamily: "Manrope" }}
            >
              Settings
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Brand Tone
                </label>
                <select
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={form.brand_tone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, brand_tone: e.target.value }))
                  }
                >
                  <option value="professional">Professional</option>
                  <option value="friendly">Friendly</option>
                  <option value="formal">Formal</option>
                  <option value="casual">Casual</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Language
                </label>
                <select
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={form.language}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, language: e.target.value }))
                  }
                >
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="it">Italian</option>
                  <option value="pt">Portuguese</option>
                  <option value="zh">Chinese</option>
                  <option value="ja">Japanese</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.approval_required}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        approval_required: e.target.checked,
                      }))
                    }
                    className="rounded border-input"
                  />
                  <span className="text-sm">
                    Require approval before sending replies
                  </span>
                </label>
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <p
              className="text-sm font-semibold text-foreground mb-3"
              style={{ fontFamily: "Manrope" }}
            >
              Enabled Platforms
            </p>
            <div className="grid grid-cols-3 gap-2">
              {ALL_PLATFORMS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => toggle(p)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                    form.enabled_platforms.includes(p)
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {form.enabled_platforms.includes(p) && (
                    <Check size={12} className="text-primary shrink-0" />
                  )}
                  <PlatformIcon platform={p} size={14} />
                  <span className="text-xs truncate">
                    {getPlatformLabel(p)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              data-testid="save-client-btn"
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin mr-2" />
              ) : null}
              {isEdit ? "Save Changes" : "Create Client"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function SAClients() {
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editClient, setEditClient] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [apiKeyClient, setApiKeyClient] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchClients = useCallback(() => {
    setLoading(true);
    superAdminApi
      .getClients()
      .then(({ data }) => setClients(data))
      .catch(() => toast.error("Failed to load clients"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const openCreate = () => {
    setEditClient(null);
    setShowForm(true);
  };

  const openEdit = (client) => {
    setEditClient(client);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditClient(null);
  };

  const toggleActive = async (client) => {
    try {
      await superAdminApi.updateClient(client.id, {
        is_active: !client.is_active,
      });
      toast.success(`Client ${client.is_active ? "paused" : "activated"}`);
      fetchClients();
    } catch (e) {
      toast.error("Failed to update client");
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword) return toast.error("Enter a new password");
    try {
      await superAdminApi.resetAdminPassword(resetTarget.id, {
        new_password: newPassword,
      });
      toast.success("Password reset successfully");
      setResetTarget(null);
      setNewPassword("");
    } catch (e) {
      toast.error("Failed to reset password");
    }
  };

  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase()),
  );

  const pagination = usePagination(filtered, 10, [search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Manrope" }}>
            Clients
          </h1>
          <p className="text-sm text-muted-foreground">
            {clients.length} total client{clients.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="gap-2"
          data-testid="add-client-btn"
        >
          <Plus size={16} /> Add Client
        </Button>
      </div>

      <div className="relative">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Search clients..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="client-search-input"
        />
      </div>

      {loading ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Building2 size={40} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No clients found</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {pagination.pageItems.map((client) => (
            <Card key={client.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                      <span className="text-primary font-bold">
                        {client.name[0]?.toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground text-sm">
                          {client.name}
                        </p>
                        <Badge
                          variant={client.is_active ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {client.is_active ? "Active" : "Paused"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {client.admin_user?.email || client.email}
                      </p>
                      {client.business_key && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <KeyRound
                            size={11}
                            className="text-primary shrink-0"
                          />
                          <span className="font-mono text-xs font-bold text-primary tracking-wider">
                            {client.business_key}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(
                                client.business_key,
                              );
                              toast.success("Business Key copied!");
                            }}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                            title="Copy key"
                            data-testid={`copy-key-${client.id}`}
                          >
                            Copy
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="hidden sm:flex items-center gap-1.5">
                      {(client.enabled_platforms || []).slice(0, 4).map((p) => (
                        <PlatformIcon key={p} platform={p} size={16} />
                      ))}
                      {(client.enabled_platforms || []).length > 4 && (
                        <span className="text-xs text-muted-foreground">
                          +{(client.enabled_platforms || []).length - 4}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground hidden md:block">
                      {client.review_count} reviews
                    </span>
                    <span className="text-xs text-muted-foreground hidden md:block capitalize">
                      {client.business_type}
                    </span>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          data-testid={`client-actions-${client.id}`}
                        >
                          <MoreVertical size={16} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => openEdit(client)}
                          className="gap-2"
                          data-testid={`edit-client-${client.id}`}
                        >
                          <Edit2 size={14} /> Edit Client
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => toggleActive(client)}
                          className="gap-2"
                        >
                          {client.is_active ? (
                            <PowerOff size={14} />
                          ) : (
                            <Power size={14} />
                          )}
                          {client.is_active
                            ? "Pause Account"
                            : "Activate Account"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setResetTarget(client);
                            setNewPassword("");
                          }}
                          className="gap-2"
                        >
                          <KeyRound size={14} /> Reset Admin Password
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setApiKeyClient(client)}
                          className="gap-2"
                          data-testid={`places-apikey-${client.id}`}
                        >
                          <MapPin size={14} /> Places API Key
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          <DataPagination
            {...pagination}
            itemLabel="clients"
            testIdPrefix="clients-pagination"
            className="bg-card rounded-xl border border-border"
          />
        </div>
      )}

      <ClientFormModal
        open={showForm}
        onClose={closeForm}
        onSaved={fetchClients}
        editClient={editClient}
      />

      {/* Reset Password Dialog */}
      <Dialog open={!!resetTarget} onOpenChange={() => setResetTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset Admin Password</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Set a new password for{" "}
            <strong>
              {resetTarget?.admin_user?.name || resetTarget?.name}
            </strong>
          </p>
          <input
            type="password"
            className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            data-testid="reset-password-input"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleResetPassword}
              data-testid="reset-password-confirm-btn"
            >
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PlacesApiKeyDialog
        open={!!apiKeyClient}
        onClose={() => setApiKeyClient(null)}
        client={apiKeyClient}
      />
    </div>
  );
}
