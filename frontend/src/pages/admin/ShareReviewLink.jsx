import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useBranch } from "../../context/BranchContext";
import { reviewLinkApi } from "../../api";
import { toast } from "sonner";
import {
  Share2,
  QrCode,
  Copy,
  Download,
  Link,
  Loader2,
  Star,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Search,
  Eye,
  ToggleLeft,
  ToggleRight,
  Users,
  CheckCircle2,
  XCircle,
  Phone,
  Mail,
  Clock,
  Plus,
  Trash2,
  Globe,
  ExternalLink,
  FileDown,
  Cake,
  X,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Switch } from "../../components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { QRCodeCanvas } from "qrcode.react";

const API_URL = process.env.REACT_APP_BACKEND_URL;

function SearchableDropdown({
  label,
  value,
  options,
  search,
  onSearchChange,
  onSelect,
  placeholder,
  open,
  onOpenChange,
  testId,
  disabled,
  emptyHint,
}) {
  const selected = options.find((o) => o.value === value);
  const norm = (s) => (s || "").toLowerCase();
  const filtered = options.filter((o) => {
    const q = norm(search);
    if (!q) return true;
    return norm(o.label).includes(q) || norm(o.region || "").includes(q);
  });

  return (
    <div className="relative">
      <label className="text-xs font-medium text-muted-foreground mb-1 block">
        {label}
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onOpenChange(!open)}
        data-testid={testId}
        className={`w-full h-9 px-3 rounded-lg border bg-background text-sm flex items-center justify-between gap-2 transition-all ${
          disabled
            ? "border-input opacity-60 cursor-not-allowed text-muted-foreground"
            : "border-input hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-ring"
        }`}
      >
        <span
          className={
            selected
              ? "text-foreground truncate"
              : "text-muted-foreground truncate"
          }
        >
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && !disabled && (
        <div className="absolute z-30 left-0 right-0 mt-1 max-h-72 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          <div className="p-2 border-b border-border bg-muted/30">
            <div className="relative">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                autoFocus
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search…"
                className="h-8 text-xs pl-7"
                data-testid={`${testId}-search`}
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                {emptyHint || "No results"}
              </div>
            ) : (
              filtered.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => {
                    onSelect(opt.value);
                    onSearchChange("");
                    onOpenChange(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-muted/60 transition-colors ${
                    opt.value === value
                      ? "bg-primary/5 text-primary font-medium"
                      : "text-foreground"
                  }`}
                  data-testid={`${testId}-option-${opt.value}`}
                >
                  <span className="truncate">{opt.label}</span>
                  {opt.region && (
                    <Badge
                      variant="outline"
                      className="text-[10px] shrink-0 font-normal"
                    >
                      {opt.region}
                    </Badge>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryPlatformPicker({
  categories,
  categoryKey,
  onCategoryChange,
  platformKey,
  onPlatformChange,
  categorySearch,
  setCategorySearch,
  platformSearch,
  setPlatformSearch,
  showCategoryList,
  setShowCategoryList,
  showPlatformList,
  setShowPlatformList,
}) {
  const categoryOptions = categories.map((c) => ({
    value: c.value,
    label: c.label,
  }));
  const currentCategory = categories.find((c) => c.value === categoryKey);
  const platformOptions = currentCategory?.platforms || [];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <SearchableDropdown
        label="Business Category"
        value={categoryKey}
        options={categoryOptions}
        search={categorySearch}
        onSearchChange={setCategorySearch}
        onSelect={onCategoryChange}
        placeholder="Select a category…"
        open={showCategoryList}
        onOpenChange={(v) => {
          setShowCategoryList(v);
          if (v) setShowPlatformList(false);
        }}
        testId="platform-category-select"
        emptyHint="No matching categories"
      />
      <SearchableDropdown
        label="Platform"
        value={platformKey}
        options={platformOptions}
        search={platformSearch}
        onSearchChange={setPlatformSearch}
        onSelect={onPlatformChange}
        placeholder={
          categoryKey ? "Select a platform…" : "Pick a category first"
        }
        open={showPlatformList}
        onOpenChange={(v) => {
          setShowPlatformList(v);
          if (v) setShowCategoryList(false);
        }}
        testId="platform-select"
        disabled={!categoryKey}
        emptyHint="No matching platforms"
      />
    </div>
  );
}

export default function ShareReviewLink() {
  const { currentBranch } = useBranch();
  const qrRef = useRef(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  // Submissions state
  const [submissions, setSubmissions] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [ratingFilter, setRatingFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [dobFrom, setDobFrom] = useState("");
  const [dobTo, setDobTo] = useState("");
  const [showDobFilter, setShowDobFilter] = useState(false);
  const [subLoading, setSubLoading] = useState(false);
  const perPage = 10;

  // Custom platforms state
  const [platformOptions, setPlatformOptions] = useState([]);
  const [platformCategories, setPlatformCategories] = useState([]);
  const [customPlatforms, setCustomPlatforms] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCategoryKey, setNewCategoryKey] = useState("");
  const [newPlatformKey, setNewPlatformKey] = useState("");
  const [newPlatformName, setNewPlatformName] = useState("");
  const [newPlatformUrl, setNewPlatformUrl] = useState("");
  const [addingPlatform, setAddingPlatform] = useState(false);

  // Search state for the two dropdowns
  const [categorySearch, setCategorySearch] = useState("");
  const [platformSearch, setPlatformSearch] = useState("");
  const [showCategoryList, setShowCategoryList] = useState(false);
  const [showPlatformList, setShowPlatformList] = useState(false);

  // Rating dimensions (multi-aspect rating prompts)
  const [dimensions, setDimensions] = useState([]);
  const [savingDimensions, setSavingDimensions] = useState(false);

  // Submission detail dialog
  const [detailSubmission, setDetailSubmission] = useState(null);

  const branchId = currentBranch?.id || "default";
  const branchParam = useMemo(
    () => (currentBranch ? { branch_id: currentBranch.id } : {}),
    [currentBranch],
  );
  const reviewUrl = `${API_URL}/review/${branchId}`;

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const params = currentBranch ? { branch_id: currentBranch.id } : {};
      const { data } = await reviewLinkApi.getSettings(params);
      setSettings(data);
      setDimensions(
        Array.isArray(data?.rating_dimensions) ? data.rating_dimensions : [],
      );
    } catch (err) {
      console.error("Failed to load settings:", err);
      toast.error("Failed to load review link settings");
    } finally {
      setLoading(false);
    }
  }, [branchParam]);

  const fetchSubmissions = useCallback(async () => {
    setSubLoading(true);
    try {
      const params = currentBranch ? { branch_id: currentBranch.id } : {};
      params.page = page;
      params.limit = perPage;
      if (ratingFilter !== "all") params.rating_filter = ratingFilter;
      if (searchText.trim()) params.search = searchText.trim();
      if (dobFrom) params.dob_from = dobFrom;
      if (dobTo) params.dob_to = dobTo;
      const { data } = await reviewLinkApi.getSubmissions(params);
      setSubmissions(data.submissions || []);
      setTotal(data.total || 0);
      setTotalPages(data.total_pages || 1);
    } catch (err) {
      console.error("Failed to load submissions:", err);
      toast.error("Failed to load submissions");
    } finally {
      setSubLoading(false);
    }
  }, [branchParam, page, perPage, ratingFilter, searchText, dobFrom, dobTo]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);
  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);
  useEffect(() => {
    setPage(1);
  }, [ratingFilter, searchText, dobFrom, dobTo]);

  const fetchPlatformOptions = useCallback(async () => {
    try {
      const { data } = await reviewLinkApi.getPlatformOptions();
      setPlatformOptions(data.options || []);
    } catch (err) {
      console.error("Failed to load platform options:", err);
    }
  }, []);

  const fetchPlatformCategories = useCallback(async () => {
    try {
      const { data } = await reviewLinkApi.getPlatformCategories();
      setPlatformCategories(data.categories || []);
    } catch (err) {
      console.error("Failed to load platform categories:", err);
    }
  }, []);

  const fetchCustomPlatforms = useCallback(async () => {
    try {
      const params = currentBranch ? { branch_id: currentBranch.id } : {};
      const { data } = await reviewLinkApi.getCustomPlatforms(params);
      setCustomPlatforms(data.platforms || []);
    } catch (err) {
      console.error("Failed to load custom platforms:", err);
    }
  }, [branchParam]);

  useEffect(() => {
    fetchPlatformOptions();
  }, [fetchPlatformOptions]);
  useEffect(() => {
    fetchPlatformCategories();
  }, [fetchPlatformCategories]);
  useEffect(() => {
    fetchCustomPlatforms();
  }, [fetchCustomPlatforms]);

  const handleAddPlatform = async () => {
    if (!newCategoryKey) return toast.error("Please select a category");
    if (!newPlatformKey) return toast.error("Please select a platform");
    if (!newPlatformUrl.trim()) return toast.error("Please enter a review URL");
    if (newPlatformKey === "other" && !newPlatformName.trim())
      return toast.error("Please enter a platform name");

    setAddingPlatform(true);
    try {
      await reviewLinkApi.addCustomPlatform(
        {
          platform_key: newPlatformKey,
          platform_name:
            newPlatformKey === "other" ? newPlatformName.trim() : "",
          review_url: newPlatformUrl.trim(),
          category: newCategoryKey,
        },
        branchParam,
      );
      toast.success("Platform added");
      setNewCategoryKey("");
      setNewPlatformKey("");
      setNewPlatformName("");
      setNewPlatformUrl("");
      setCategorySearch("");
      setPlatformSearch("");
      setShowAddForm(false);
      fetchCustomPlatforms();
    } catch (err) {
      console.error("Failed to add platform:", err);
      toast.error(err.response?.data?.detail || "Failed to add platform");
    } finally {
      setAddingPlatform(false);
    }
  };

  const handleDeletePlatform = async (id) => {
    try {
      await reviewLinkApi.deleteCustomPlatform(id);
      toast.success("Platform removed");
      fetchCustomPlatforms();
    } catch (err) {
      console.error("Failed to remove platform:", err);
      toast.error("Failed to remove platform");
    }
  };

  // CSV Export handler
  const [exporting, setExporting] = useState(false);
  const handleExportCSV = async (period) => {
    setExporting(true);
    try {
      const params = currentBranch
        ? { branch_id: currentBranch.id, period }
        : { period };
      const { data } = await reviewLinkApi.exportSubmissions(params);
      const url = window.URL.createObjectURL(
        new Blob([data], { type: "text/csv" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `review_submissions_${period}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("Report downloaded");
    } catch (err) {
      console.error("Export failed:", err);
      toast.error("Failed to download report");
    } finally {
      setExporting(false);
    }
  };

  const handleToggle = async (checked) => {
    setToggling(true);
    try {
      await reviewLinkApi.updateSettings(
        { positive_only: checked },
        branchParam,
      );
      setSettings((prev) => ({ ...prev, positive_only: checked }));
      toast.success(
        checked ? "Positive feedback filter enabled" : "Filter disabled",
      );
    } catch (err) {
      console.error("Failed to update setting:", err);
      toast.error("Failed to update setting");
    } finally {
      setToggling(false);
    }
  };

  // ─── Rating dimensions management ───
  const addDimension = () => {
    if (dimensions.length >= 10) {
      toast.error("Maximum 10 rating dimensions");
      return;
    }
    setDimensions((prev) => [
      ...prev,
      { id: `new-${Date.now()}`, label: "", required: true },
    ]);
  };
  const updateDimension = (idx, patch) => {
    setDimensions((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)),
    );
  };
  const removeDimension = (idx) => {
    setDimensions((prev) => prev.filter((_, i) => i !== idx));
  };
  const saveDimensions = async () => {
    const cleaned = dimensions
      .map((d) => ({ ...d, label: (d.label || "").trim() }))
      .filter((d) => d.label);
    if (cleaned.some((d) => d.label.length > 60)) {
      toast.error("Each label must be 60 characters or less");
      return;
    }
    setSavingDimensions(true);
    try {
      await reviewLinkApi.updateSettings(
        { rating_dimensions: cleaned },
        branchParam,
      );
      setSettings((prev) => ({ ...prev, rating_dimensions: cleaned }));
      setDimensions(cleaned);
      toast.success(
        cleaned.length === 0
          ? "Reverted to default single rating"
          : `Saved ${cleaned.length} rating dimension${cleaned.length === 1 ? "" : "s"}`,
      );
    } catch (err) {
      toast.error(
        err.response?.data?.detail || "Failed to save rating dimensions",
      );
    } finally {
      setSavingDimensions(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard
      .writeText(reviewUrl)
      .then(() => toast.success("Link copied!"))
      .catch(() => toast.error("Copy failed"));
  };

  const handleDownloadQR = () => {
    const canvas = qrRef.current?.querySelector("canvas");
    if (!canvas) return;
    const size = 400;
    const pad = 40;
    const fullCanvas = document.createElement("canvas");
    fullCanvas.width = size + pad * 2;
    fullCanvas.height = size + pad * 2 + 60;
    const ctx = fullCanvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, fullCanvas.width, fullCanvas.height);
    ctx.drawImage(canvas, pad, pad, size, size);
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 16px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Leave us a Review", fullCanvas.width / 2, size + pad + 30);
    ctx.fillStyle = "#64748b";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(
      "Scan to share your feedback",
      fullCanvas.width / 2,
      size + pad + 50,
    );
    const link = document.createElement("a");
    link.download = "review-qr-code.png";
    link.href = fullCanvas.toDataURL("image/png");
    link.click();
    toast.success("QR code downloaded!");
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Leave a Review",
          text: "Share your feedback with us",
          url: reviewUrl,
        });
      } catch (err) {
        if (err.name !== "AbortError") console.error("Share failed:", err);
      }
    } else {
      handleCopyLink();
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Loader2 size={32} className="animate-spin mb-3" />
        <span className="text-sm">Loading...</span>
      </div>
    );
  }

  return (
    <div data-testid="share-review-link-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Share Review Link
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Collect customer reviews via a shareable link and QR code
          </p>
        </div>
      </div>

      {/* Link + QR + Toggle Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* QR Code Card */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <QrCode size={16} className="text-primary" /> QR Code
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <div
              ref={qrRef}
              className="p-4 bg-white rounded-xl border border-border/50"
            >
              <QRCodeCanvas
                value={reviewUrl}
                size={160}
                level="H"
                bgColor="#ffffff"
                fgColor="#0f172a"
                includeMargin={false}
              />
            </div>
            <div className="flex gap-2 w-full">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadQR}
                className="flex-1 gap-1.5 text-xs"
                data-testid="download-qr"
              >
                <Download size={13} /> Download
              </Button>
              <Button
                size="sm"
                onClick={handleShare}
                className="flex-1 gap-1.5 text-xs"
                data-testid="share-link"
              >
                <Share2 size={13} /> Share
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Link + Settings Card */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Link size={16} className="text-primary" /> Review Link & Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Shareable Link */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Shareable Review Link
              </label>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 flex-1 p-2.5 bg-muted rounded-lg border border-border/50">
                  <Link size={14} className="text-muted-foreground shrink-0" />
                  <span
                    className="text-sm text-foreground truncate flex-1 select-all"
                    data-testid="review-link-url"
                  >
                    {reviewUrl}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    window.open(reviewUrl, "_blank", "noopener,noreferrer")
                  }
                  className="shrink-0 h-10 w-10"
                  title="Preview review form"
                  data-testid="preview-link-btn"
                >
                  <Eye size={15} />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyLink}
                  className="shrink-0 h-10 w-10"
                  data-testid="copy-link-btn"
                >
                  <Copy size={15} />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Share this link with your customers to collect reviews
              </p>
            </div>

            {/* Positive Only Toggle */}
            <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30">
              <div className="flex-1 mr-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-foreground">
                    Accept only positive feedback
                  </span>
                  <Badge
                    variant={settings?.positive_only ? "default" : "secondary"}
                    className="text-[10px]"
                  >
                    {settings?.positive_only ? "ON" : "OFF"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  When enabled, customers with ratings of 3.5+ stars will be
                  redirected to leave reviews on your connected platforms
                  (Google, TripAdvisor, etc.). Lower ratings are captured
                  internally only.
                </p>
              </div>
              <Switch
                checked={settings?.positive_only || false}
                onCheckedChange={handleToggle}
                disabled={toggling}
                data-testid="positive-only-toggle"
              />
            </div>

            {/* Rating dimensions configuration */}
            <div
              className="rounded-lg border border-border p-4 bg-card"
              data-testid="rating-dimensions-card"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p
                    className="text-sm font-semibold text-foreground flex items-center gap-2"
                    style={{ fontFamily: "Manrope" }}
                  >
                    <Star size={14} className="text-primary" />
                    Rating Categories
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Customise the rating prompts customers see (e.g. "Rate
                    Food", "Rate Service"). Leave empty to use the default
                    single "How was your experience?" prompt.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addDimension}
                  disabled={dimensions.length >= 10}
                  className="gap-1 shrink-0"
                  data-testid="add-rating-dimension-btn"
                >
                  <Plus size={13} /> Add
                </Button>
              </div>

              {dimensions.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-2 text-center">
                  Default:{" "}
                  <span className="font-medium text-foreground">
                    "How was your experience?"
                  </span>{" "}
                  (single 5-star rating)
                </p>
              ) : (
                <div className="space-y-2">
                  {dimensions.map((dim, idx) => (
                    <div
                      key={dim.id || idx}
                      className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border border-border/50"
                      data-testid={`rating-dimension-row-${idx}`}
                    >
                      <Input
                        value={dim.label}
                        onChange={(e) =>
                          updateDimension(idx, { label: e.target.value })
                        }
                        placeholder={`e.g. ${["Food Quality", "Service", "Cleanliness", "Ambience"][idx % 4]}`}
                        className="h-8 text-sm flex-1"
                        maxLength={60}
                        data-testid={`rating-dimension-label-${idx}`}
                      />
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={dim.required}
                          onChange={(e) =>
                            updateDimension(idx, { required: e.target.checked })
                          }
                          className="rounded"
                          data-testid={`rating-dimension-required-${idx}`}
                        />
                        Required
                      </label>
                      <button
                        onClick={() => removeDimension(idx)}
                        className="text-muted-foreground hover:text-destructive p-1 shrink-0"
                        title="Remove"
                        data-testid={`remove-rating-dimension-${idx}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end mt-3">
                <Button
                  size="sm"
                  onClick={saveDimensions}
                  disabled={savingDimensions}
                  className="gap-1.5"
                  data-testid="save-rating-dimensions-btn"
                >
                  {savingDimensions ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={13} />
                  )}
                  Save categories
                </Button>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold text-foreground">{total}</p>
                <p className="text-xs text-muted-foreground">
                  Total Submissions
                </p>
              </div>
              <div className="text-center p-3 rounded-lg bg-emerald-500/5">
                <p className="text-2xl font-bold text-emerald-600">
                  {submissions.length > 0
                    ? submissions.filter((s) => s.is_positive).length
                    : 0}
                </p>
                <p className="text-xs text-muted-foreground">
                  Positive (this page)
                </p>
              </div>
              <div className="text-center p-3 rounded-lg bg-red-500/5">
                <p className="text-2xl font-bold text-red-600">
                  {submissions.length > 0
                    ? submissions.filter((s) => !s.is_positive).length
                    : 0}
                </p>
                <p className="text-xs text-muted-foreground">
                  Negative (this page)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Custom Review Platforms */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe size={16} className="text-primary" /> Review Platforms
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddForm(!showAddForm)}
              className="gap-1.5 text-xs"
              data-testid="add-platform-btn"
            >
              <Plus size={13} /> Add Platform
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add Form */}
          {showAddForm && (
            <div
              className="p-4 rounded-lg border border-border bg-muted/30 space-y-3"
              data-testid="add-platform-form"
            >
              <CategoryPlatformPicker
                categories={platformCategories}
                categoryKey={newCategoryKey}
                onCategoryChange={(v) => {
                  setNewCategoryKey(v);
                  setNewPlatformKey("");
                  setNewPlatformName("");
                  setPlatformSearch("");
                }}
                platformKey={newPlatformKey}
                onPlatformChange={(v) => {
                  setNewPlatformKey(v);
                  setNewPlatformName("");
                }}
                categorySearch={categorySearch}
                setCategorySearch={setCategorySearch}
                platformSearch={platformSearch}
                setPlatformSearch={setPlatformSearch}
                showCategoryList={showCategoryList}
                setShowCategoryList={setShowCategoryList}
                showPlatformList={showPlatformList}
                setShowPlatformList={setShowPlatformList}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {newPlatformKey === "other" && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Custom Platform Name
                    </label>
                    <Input
                      value={newPlatformName}
                      onChange={(e) => setNewPlatformName(e.target.value)}
                      placeholder="e.g., My Website"
                      className="h-9 text-sm"
                      data-testid="platform-custom-name"
                    />
                  </div>
                )}
                <div
                  className={newPlatformKey === "other" ? "" : "sm:col-span-2"}
                >
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Review Page URL
                  </label>
                  <Input
                    value={newPlatformUrl}
                    onChange={(e) => setNewPlatformUrl(e.target.value)}
                    placeholder="https://www.tripadvisor.com/your-business/review"
                    className="h-9 text-sm"
                    data-testid="platform-url-input"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewCategoryKey("");
                    setNewPlatformKey("");
                    setNewPlatformUrl("");
                    setNewPlatformName("");
                    setCategorySearch("");
                    setPlatformSearch("");
                  }}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleAddPlatform}
                  disabled={addingPlatform}
                  className="gap-1 text-xs"
                  data-testid="save-platform-btn"
                >
                  {addingPlatform ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Plus size={12} />
                  )}
                  Add
                </Button>
              </div>
            </div>
          )}

          {/* Platform List */}
          {customPlatforms.length === 0 && !showAddForm ? (
            <div className="text-center py-6">
              <Globe
                size={28}
                className="mx-auto text-muted-foreground/30 mb-2"
              />
              <p className="text-sm text-muted-foreground">
                No custom review platforms added
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Add platforms like TripAdvisor, Booking.com, or any custom
                review page
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {customPlatforms.map((cp) => (
                <div
                  key={cp.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors"
                  data-testid={`custom-platform-${cp.id}`}
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Globe size={15} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-foreground">
                        {cp.platform_name}
                      </p>
                      {cp.category && (
                        <Badge
                          variant="outline"
                          className="text-[10px] font-normal"
                        >
                          {platformCategories
                            .find((c) => c.value === cp.category)
                            ?.label?.split("(")[0]
                            ?.trim() || cp.category}
                        </Badge>
                      )}
                    </div>
                    <a
                      href={cp.review_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-primary truncate block max-w-lg"
                    >
                      {cp.review_url}
                    </a>
                  </div>
                  <a
                    href={cp.review_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink size={14} />
                  </a>
                  <button
                    onClick={() => handleDeletePlatform(cp.id)}
                    className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500"
                    data-testid={`delete-platform-${cp.id}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submissions Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users size={16} className="text-primary" /> Review Submissions
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Download Report Dropdown */}
              <Select onValueChange={handleExportCSV} disabled={exporting}>
                <SelectTrigger
                  className="w-[150px] h-8 text-xs"
                  data-testid="download-report-btn"
                >
                  {exporting ? (
                    <Loader2 size={12} className="mr-1 animate-spin" />
                  ) : (
                    <FileDown size={12} className="mr-1" />
                  )}
                  <SelectValue placeholder="Download Report" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="weekly">This Week</SelectItem>
                  <SelectItem value="monthly">This Month</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>
              <Select value={ratingFilter} onValueChange={setRatingFilter}>
                <SelectTrigger
                  className="w-[140px] h-8 text-xs"
                  data-testid="submissions-filter"
                >
                  <Filter size={12} className="mr-1" />
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Ratings</SelectItem>
                  <SelectItem value="positive">Positive (3.5+)</SelectItem>
                  <SelectItem value="negative">Negative (&lt;3.5)</SelectItem>
                  {[5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5].map((r) => (
                    <SelectItem key={r} value={String(r)}>
                      {r} Stars
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* DOB Filter */}
              <div className="relative">
                <Button
                  type="button"
                  variant={dobFrom || dobTo ? "default" : "outline"}
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={() => setShowDobFilter((v) => !v)}
                  data-testid="dob-filter-toggle"
                >
                  <Cake size={12} />
                  {dobFrom || dobTo ? (
                    <span>
                      DOB: {dobFrom || "…"} → {dobTo || "…"}
                    </span>
                  ) : (
                    <span>DOB</span>
                  )}
                  <ChevronDown
                    size={12}
                    className={`transition-transform ${showDobFilter ? "rotate-180" : ""}`}
                  />
                </Button>
                {showDobFilter && (
                  <div
                    className="absolute right-0 mt-1 z-30 w-[280px] p-3 rounded-lg border border-border bg-popover shadow-lg"
                    data-testid="dob-filter-popover"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-foreground">
                        Filter by Date of Birth
                      </span>
                      {(dobFrom || dobTo) && (
                        <button
                          type="button"
                          onClick={() => {
                            setDobFrom("");
                            setDobTo("");
                          }}
                          className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                          data-testid="dob-filter-clear"
                        >
                          <X size={10} /> Clear
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      <div>
                        <label className="text-[10px] font-medium text-muted-foreground mb-1 block">
                          From
                        </label>
                        <Input
                          type="date"
                          value={dobFrom}
                          max={dobTo || undefined}
                          onChange={(e) => setDobFrom(e.target.value)}
                          className="h-8 text-xs"
                          data-testid="dob-filter-from"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-muted-foreground mb-1 block">
                          To
                        </label>
                        <Input
                          type="date"
                          value={dobTo}
                          min={dobFrom || undefined}
                          onChange={(e) => setDobTo(e.target.value)}
                          className="h-8 text-xs"
                          data-testid="dob-filter-to"
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground pt-1">
                        Only submissions with a DOB in this range will be shown.
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div className="relative">
                <Search
                  size={13}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  placeholder="Search name, email..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="h-8 text-xs pl-8 w-[180px]"
                  data-testid="submissions-search"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {subLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 size={18} className="animate-spin mr-2" />
              <span className="text-sm">Loading submissions...</span>
            </div>
          ) : submissions.length === 0 ? (
            <div className="text-center py-10">
              <Users
                size={32}
                className="mx-auto text-muted-foreground/30 mb-2"
              />
              <p className="text-sm text-muted-foreground">
                No submissions yet
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Share the review link to start collecting feedback
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {submissions.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors"
                  data-testid={`submission-${sub.id}`}
                >
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary">
                    {sub.name?.[0]?.toUpperCase() || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-sm font-medium text-foreground">
                        {sub.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDetailSubmission(sub)}
                        className="flex items-center gap-0.5 group hover:bg-muted/60 rounded px-1 py-0.5 transition-colors"
                        title={
                          sub.ratings && sub.ratings.length > 1
                            ? "Click to see breakdown"
                            : "View details"
                        }
                        data-testid={`submission-rating-btn-${sub.id}`}
                      >
                        {Array.from({ length: 5 }).map((_, i) => {
                          const filled = i + 1 <= Math.floor(sub.rating);
                          const half = !filled && i + 0.5 <= sub.rating;
                          return (
                            <Star
                              key={`star-${sub.id || sub._id || i}-${i}`}
                              size={12}
                              className={
                                filled || half
                                  ? "text-amber-400 fill-amber-400"
                                  : "text-muted-foreground/30"
                              }
                              style={
                                half
                                  ? {
                                      clipPath: "inset(0 50% 0 0)",
                                      fill: "#fbbf24",
                                    }
                                  : undefined
                              }
                            />
                          );
                        })}
                        <span className="text-xs text-muted-foreground ml-1 group-hover:text-foreground">
                          {sub.rating}
                        </span>
                        {sub.ratings && sub.ratings.length > 1 && (
                          <span className="text-[10px] text-muted-foreground ml-0.5 group-hover:text-primary">
                            ({sub.ratings.length})
                          </span>
                        )}
                      </button>
                      {sub.is_positive ? (
                        <Badge
                          variant="default"
                          className="text-[10px] gap-0.5 bg-emerald-500/10 text-emerald-600 border-0"
                        >
                          <CheckCircle2 size={10} /> Positive
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="text-[10px] gap-0.5 bg-red-500/10 text-red-600 border-0"
                        >
                          <XCircle size={10} /> Negative
                        </Badge>
                      )}
                      {sub.redirected_to_platforms && (
                        <Badge
                          variant="outline"
                          className="text-[10px] gap-0.5"
                        >
                          Redirected
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-1">
                      <span className="flex items-center gap-1">
                        <Mail size={10} /> {sub.email}
                      </span>
                      {sub.mobile && (
                        <span className="flex items-center gap-1">
                          <Phone size={10} /> {sub.mobile}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock size={10} />{" "}
                        {new Date(sub.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {sub.review_text && (
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {sub.review_text}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {total > 0 && (
            <div className="flex items-center justify-between pt-4 mt-4 border-t border-border">
              <span className="text-xs text-muted-foreground">
                Showing {(page - 1) * perPage + 1}-
                {Math.min(page * perPage, total)} of {total}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="h-7 w-7 p-0"
                >
                  <ChevronLeft size={14} />
                </Button>
                <span className="text-xs px-2">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="h-7 w-7 p-0"
                >
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submission detail dialog */}
      <Dialog
        open={!!detailSubmission}
        onOpenChange={(open) => !open && setDetailSubmission(null)}
      >
        <DialogContent
          className="sm:max-w-md"
          data-testid="submission-detail-dialog"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star size={16} className="text-amber-400 fill-amber-400" />{" "}
              Submission Details
            </DialogTitle>
            <DialogDescription>
              {detailSubmission?.name} ·{" "}
              {detailSubmission &&
                new Date(detailSubmission.created_at).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          {detailSubmission && (
            <div className="space-y-4">
              {/* Per-dimension ratings */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Ratings
                </p>
                <div className="space-y-1.5">
                  {(detailSubmission.ratings &&
                  detailSubmission.ratings.length > 0
                    ? detailSubmission.ratings
                    : [
                        {
                          id: "default",
                          label: "Overall",
                          value: detailSubmission.rating,
                        },
                      ]
                  ).map((r, idx) => (
                    <div
                      key={r.id || idx}
                      className="flex items-center justify-between gap-3 p-2 rounded-lg bg-muted/40"
                      data-testid={`detail-rating-${r.id || idx}`}
                    >
                      <span className="text-sm text-foreground">
                        {r.label || "Rating"}
                      </span>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, i) => {
                          const filled = i + 1 <= Math.floor(r.value);
                          const half = !filled && i + 0.5 <= r.value;
                          return (
                            <Star
                              key={`detail-star-${idx}-${i}`}
                              size={14}
                              className={
                                filled || half
                                  ? "text-amber-400 fill-amber-400"
                                  : "text-muted-foreground/30"
                              }
                              style={
                                half
                                  ? {
                                      clipPath: "inset(0 50% 0 0)",
                                      fill: "#fbbf24",
                                    }
                                  : undefined
                              }
                            />
                          );
                        })}
                        <span className="text-xs text-muted-foreground ml-1 tabular-nums">
                          {r.value}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {detailSubmission.ratings &&
                  detailSubmission.ratings.length > 1 && (
                    <p className="text-[11px] text-muted-foreground mt-2 text-right">
                      Average:{" "}
                      <span className="font-semibold text-foreground">
                        {detailSubmission.rating}
                      </span>{" "}
                      / 5
                    </p>
                  )}
              </div>

              {/* Customer details */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Email
                  </p>
                  <p className="text-foreground break-all">
                    {detailSubmission.email}
                  </p>
                </div>
                {detailSubmission.mobile && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      Mobile
                    </p>
                    <p className="text-foreground">{detailSubmission.mobile}</p>
                  </div>
                )}
                {detailSubmission.date_of_birth && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      Date of Birth
                    </p>
                    <p className="text-foreground">
                      {detailSubmission.date_of_birth}
                    </p>
                  </div>
                )}
              </div>

              {detailSubmission.review_text && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                    Review
                  </p>
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed bg-muted/30 rounded-lg p-3">
                    {detailSubmission.review_text}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
