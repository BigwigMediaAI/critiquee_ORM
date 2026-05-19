import { useState, useEffect, useCallback } from 'react';
import { settingsApi, platformApi, syncApi } from '../../api';
import { useBranch } from '../../context/BranchContext';
import { toast } from 'sonner';
import { 
  Globe, CheckCircle, XCircle, AlertCircle, Loader2, RefreshCw, 
  Settings, Eye, EyeOff, ExternalLink, Key, Info, ChevronDown, ChevronUp, Save,
  Zap, RotateCw, Wifi, WifiOff, Copy
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../../components/ui/collapsible';
import PlatformIcon, { getPlatformLabel, PLATFORM_CONFIG } from '../../components/PlatformIcon';

const PLATFORM_DESCRIPTIONS = {
  google: 'Connect to view and reply to Google Business reviews',
  yelp: 'Pull your Yelp Fusion API rating, review snippets and photos',
  trustpilot: 'Read & reply to verified Trustpilot reviews via OAuth',
  foursquare: 'Read tips, ratings and check-ins for your venues',
  tripadvisor: 'Manage TripAdvisor hotel & restaurant reviews',
  facebook: 'Monitor Facebook page recommendations and comments',
  instagram: 'View and engage with Instagram posts & comments',
  linkedin: 'Manage LinkedIn company page posts and comments',
  x: 'Monitor X (Twitter) mentions and replies',
  youtube: 'Manage YouTube video comments and replies',
  reddit: 'Monitor and reply to Reddit posts and comments',
  booking: 'Manage Booking.com property reviews',
  expedia: 'Manage Expedia, Hotels.com and Vrbo reviews',
  hotels_com: 'Hotels.com reviews via Expedia Partner Central',
  agoda: 'Manage Agoda guest reviews via YCS Smart Connect',
  opentable: 'Manage OpenTable restaurant reviews',
  viator: 'Manage Viator tour & activity reviews',
  getyourguide: 'Manage GetYourGuide activity reviews',
  airbnb: 'Manage Airbnb host reviews (channel-manager partners only)',
  zillow: 'Read Zillow Premier Agent ratings and leads',
  realtor: 'Read Realtor.com agent ratings and reviews',
};

// Categories shown as section headers in the UI (in display order)
const CATEGORY_ORDER = [
  'Reviews & Local',
  'Social',
  'Hospitality',
  'Travel',
  'Properties',
  'Other',
];

const CATEGORY_LABELS = {
  'Reviews & Local': { title: 'Reviews & Local', subtitle: 'General review and local-listing platforms' },
  Social: { title: 'Social', subtitle: 'Social media engagement and community management' },
  Hospitality: { title: 'Hospitality', subtitle: 'Hotels, restaurants and OTAs' },
  Travel: { title: 'Travel & Tours', subtitle: 'Tours, activities and short-stay platforms' },
  Properties: { title: 'Properties & Real Estate', subtitle: 'Real-estate listings and agent ratings' },
  Other: { title: 'Other', subtitle: 'Additional integrations' },
};

// Platforms that support sync/test APIs
const SYNCABLE_PLATFORMS = ['google', 'facebook', 'youtube', 'reddit', 'yelp', 'trustpilot', 'foursquare', 'zomato', 'justdial'];

// Detect URLs in instruction strings and render them as clickable links
function LinkifiedText({ text }) {
  const urlRegex = /(https?:\/\/[^\s<>")]+|[\w.-]+@[\w.-]+\.[a-zA-Z]{2,})/g;
  const parts = text.split(urlRegex);
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        if (urlRegex.test(part)) {
          urlRegex.lastIndex = 0; // reset stateful regex
          const isEmail = part.includes('@') && !part.startsWith('http');
          const href = isEmail ? `mailto:${part}` : part;
          return (
            <a
              key={`link-${i}`}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:text-primary/80 break-all"
            >
              {part}
            </a>
          );
        }
        return <span key={`txt-${i}`}>{part}</span>;
      })}
    </>
  );
}

function StatusIcon({ status }) {
  if (status === 'connected') return <CheckCircle size={16} className="text-emerald-500" />;
  if (status === 'error') return <AlertCircle size={16} className="text-red-500" />;
  return <XCircle size={16} className="text-muted-foreground" />;
}

export default function Platforms() {
  const { currentBranch } = useBranch();
  const [platforms, setPlatforms] = useState([]);
  const [platformConfigs, setPlatformConfigs] = useState({});
  const [credentials, setCredentials] = useState({});
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(null);
  const [testing, setTesting] = useState(null);
  const [syncing, setSyncing] = useState(null);
  const [showCredentialsDialog, setShowCredentialsDialog] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [credentialForm, setCredentialForm] = useState({
    client_id: '',
    client_secret: '',
    api_key: '',
    // Optional Trustpilot reply credentials (only used when selectedPlatform === 'trustpilot')
    trustpilot_username: '',
    trustpilot_password: '',
  });
  const [showTrustpilotReplyPanel, setShowTrustpilotReplyPanel] = useState(false);
  const [showTrustpilotPassword, setShowTrustpilotPassword] = useState(false);
  const [showSecrets, setShowSecrets] = useState({});
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [testResults, setTestResults] = useState({});

  const fetchData = useCallback(async () => {
    try {
      const params = currentBranch ? { branch_id: currentBranch.id } : {};
      const [platformsRes, configsRes, credsRes] = await Promise.all([
        settingsApi.getPlatforms(params),
        platformApi.getConfigs(),
        platformApi.getCredentials(params).catch(() => ({ data: [] }))
      ]);
      setPlatforms(platformsRes.data);
      setPlatformConfigs(configsRes.data);
      
      // Index credentials by platform
      const credsMap = {};
      (credsRes.data || []).forEach(c => { credsMap[c.platform] = c; });
      setCredentials(credsMap);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [currentBranch]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCredentialsDialog = (platform) => {
    setSelectedPlatform(platform);
    const existing = credentials[platform] || {};
    const additional = existing.additional_config || {};
    setCredentialForm({
      client_id: existing.oauth_client_id || '',
      client_secret: '', // Don't prefill secret for security
      api_key: '',
      trustpilot_username: '',
      trustpilot_password: '',
    });
    // Auto-expand the Trustpilot reply panel if previously configured (so user knows it's set)
    setShowTrustpilotReplyPanel(
      platform === 'trustpilot' && (additional.has_trustpilot_username || additional.has_trustpilot_password)
    );
    setShowTrustpilotPassword(false);
    // Auto-open instructions when the user hasn't configured this platform yet
    setInstructionsOpen(!credentials[platform]);
    setShowCredentialsDialog(true);
  };

  const copyRedirectUri = () => {
    const uri = `${window.location.origin}/admin/oauth/callback`;
    navigator.clipboard.writeText(uri)
      .then(() => toast.success('Redirect URI copied'))
      .catch(() => toast.error('Copy failed'));
  };

  const handleSaveCredentials = async () => {
    if (!selectedPlatform) return;
    
    const config = platformConfigs[selectedPlatform];
    if (!config) return;
    
    // Validate required fields
    if (config.required_fields.includes('client_id') && !credentialForm.client_id) {
      return toast.error('Client ID is required');
    }
    if (config.required_fields.includes('client_secret') && !credentialForm.client_secret && !credentials[selectedPlatform]) {
      return toast.error('Client Secret is required');
    }
    
    setSavingCredentials(true);
    try {
      const params = currentBranch ? { branch_id: currentBranch.id } : {};
      const additional_config = {};
      if (selectedPlatform === 'trustpilot') {
        if (credentialForm.trustpilot_username) {
          additional_config.trustpilot_username = credentialForm.trustpilot_username;
        }
        if (credentialForm.trustpilot_password) {
          additional_config.trustpilot_password = credentialForm.trustpilot_password;
        }
      }
      await platformApi.saveCredentials({
        platform: selectedPlatform,
        client_id: credentialForm.client_id || null,
        client_secret: credentialForm.client_secret || null,
        api_key: credentialForm.api_key || null,
        additional_config: Object.keys(additional_config).length ? additional_config : null,
      }, params);
      toast.success(`${getPlatformLabel(selectedPlatform)} credentials saved`);
      setShowCredentialsDialog(false);
      fetchData();
    } catch (e) {
      toast.error('Failed to save credentials');
    } finally {
      setSavingCredentials(false);
    }
  };

  const handleConnect = async (platform) => {
    const config = platformConfigs[platform];
    if (!config) return;
    
    // Check if credentials exist
    if (!credentials[platform]) {
      toast.error('Please configure your developer credentials first');
      openCredentialsDialog(platform);
      return;
    }
    
    if (config.auth_type === 'api_key') {
      // For API key auth, just mark as connected if we have the key
      setConnecting(platform);
      try {
        const params = currentBranch ? { branch_id: currentBranch.id } : {};
        await settingsApi.connectPlatform(platform, params);
        toast.success(`${getPlatformLabel(platform)} connected successfully`);
        fetchData();
      } catch (e) {
        toast.error(`Failed to connect ${getPlatformLabel(platform)}`);
      } finally {
        setConnecting(null);
      }
      return;
    }
    
    // OAuth flow
    setConnecting(platform);
    try {
      const params = currentBranch ? { branch_id: currentBranch.id } : {};
      params.redirect_uri = `${window.location.origin}/admin/oauth/callback`;
      const { data } = await platformApi.getOAuthUrl(platform, params);
      
      // Store state in localStorage for callback
      localStorage.setItem('oauth_state', data.state);
      localStorage.setItem('oauth_platform', platform);
      
      // Redirect to OAuth provider
      window.location.href = data.auth_url;
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to start connection');
      setConnecting(null);
    }
  };

  const handleDisconnect = async (platform) => {
    if (!window.confirm(`Disconnect ${getPlatformLabel(platform)}?`)) return;
    try {
      const params = currentBranch ? { branch_id: currentBranch.id } : {};
      await settingsApi.disconnectPlatform(platform, params);
      toast.success(`${getPlatformLabel(platform)} disconnected`);
      fetchData();
    } catch (e) {
      toast.error('Failed to disconnect');
    }
  };

  const handleTestConnection = async (platform) => {
    if (!SYNCABLE_PLATFORMS.includes(platform)) {
      toast.info(`API testing not available for ${getPlatformLabel(platform)}`);
      return;
    }
    
    setTesting(platform);
    try {
      const params = currentBranch ? { branch_id: currentBranch.id } : {};
      const { data } = await syncApi.testConnection(platform, params);
      setTestResults(prev => ({ ...prev, [platform]: data }));
      
      if (data.status === 'connected') {
        toast.success(`${getPlatformLabel(platform)} API connection verified!`);
      } else if (data.status === 'auth_error') {
        toast.error('Token expired. Please reconnect.');
      } else {
        toast.error(data.error || 'Connection test failed');
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to test connection');
    } finally {
      setTesting(null);
    }
  };

  const handleSync = async (platform) => {
    if (!SYNCABLE_PLATFORMS.includes(platform)) {
      toast.info(`Sync not available for ${getPlatformLabel(platform)}`);
      return;
    }
    
    setSyncing(platform);
    try {
      const params = currentBranch ? { branch_id: currentBranch.id } : {};
      const { data } = await syncApi.syncPlatform(platform, params);
      
      if (data.status === 'in_progress') {
        toast.success(`Sync started for ${getPlatformLabel(platform)}`);
      } else if (data.status === 'success') {
        toast.success(`Synced ${data.synced_count || data.synced_posts || data.synced_comments || 0} items from ${getPlatformLabel(platform)}`);
      } else {
        toast.error(data.error || 'Sync failed');
      }
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to sync');
    } finally {
      setSyncing(null);
    }
  };

  const toggleInstructions = () => {
    setInstructionsOpen(prev => !prev);
  };

  if (loading) return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}
    </div>
  );

  if (platforms.length === 0) return (
    <div className="text-center py-16">
      <Globe size={40} className="text-muted-foreground mx-auto mb-3" />
      <p className="text-muted-foreground">No platforms enabled</p>
      <p className="text-xs text-muted-foreground mt-1">Ask your Super Admin to enable platforms for your account</p>
    </div>
  );

  const connected = platforms.filter(p => p.status === 'connected').length;
  const configured = Object.keys(credentials).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Manrope' }}>Platform Connections</h1>
          <p className="text-sm text-muted-foreground">{connected} connected, {configured} configured</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={fetchData}>
          <RefreshCw size={14} /> Refresh
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Connected', count: platforms.filter(p => p.status === 'connected').length, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
          { label: 'Configured', count: configured, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
          { label: 'Not Connected', count: platforms.filter(p => p.status !== 'connected').length, color: 'text-muted-foreground', bg: 'bg-muted' },
        ].map(item => (
          <div key={item.label} className={`${item.bg} rounded-xl p-4 text-center`}>
            <p className={`text-2xl font-bold ${item.color}`} style={{ fontFamily: 'Manrope' }}>{item.count}</p>
            <p className="text-xs text-muted-foreground">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Info banner */}
      <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
        <div className="flex items-start gap-3">
          <Info size={18} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">How to connect platforms</p>
            <p className="text-xs text-blue-600 dark:text-blue-400 leading-relaxed">
              1. Click "Configure" to enter your developer app credentials for each platform<br/>
              2. Follow the setup instructions to create your app on the platform's developer portal<br/>
              3. Once configured, click "Connect" to authorize access via OAuth
            </p>
          </div>
        </div>
      </div>

      {/* Platform cards grouped by category */}
      {(() => {
        const grouped = {};
        platforms.forEach((p) => {
          const cat = platformConfigs[p.platform]?.category || 'Other';
          if (!grouped[cat]) grouped[cat] = [];
          grouped[cat].push(p);
        });

        const orderedCats = [
          ...CATEGORY_ORDER.filter((c) => grouped[c]?.length),
          ...Object.keys(grouped).filter((c) => !CATEGORY_ORDER.includes(c)),
        ];

        return orderedCats.map((category) => {
          const items = grouped[category];
          if (!items || !items.length) return null;
          const meta = CATEGORY_LABELS[category] || { title: category, subtitle: '' };
          const connectedInCat = items.filter((p) => p.status === 'connected').length;
          return (
            <section key={category} data-testid={`platforms-section-${category}`} className="space-y-3">
              <div className="flex items-end justify-between border-b border-border pb-2">
                <div>
                  <h2 className="text-lg font-semibold text-foreground" style={{ fontFamily: 'Manrope' }}>
                    {meta.title}
                    <span className="ml-2 text-xs text-muted-foreground font-normal">
                      {connectedInCat}/{items.length} connected
                    </span>
                  </h2>
                  {meta.subtitle && (
                    <p className="text-xs text-muted-foreground">{meta.subtitle}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {items.map((platform) => {
          const isConnected = platform.status === 'connected';
          const isError = platform.status === 'error';
          const isConnecting = connecting === platform.platform;
          const config = PLATFORM_CONFIG[platform.platform];
          const platformConfig = platformConfigs[platform.platform];
          const hasCreds = !!credentials[platform.platform];
          const isPartnerOnly = !!platformConfig?.partner_only;

          return (
            <Card
              key={platform.platform}
              className={`hover:shadow-md transition-shadow ${isConnected ? 'border-emerald-200 dark:border-emerald-800' : isError ? 'border-red-200 dark:border-red-800' : ''}`}
            >
              <CardContent className="pt-5 pb-5">
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${config?.bg || 'bg-muted'} shrink-0`}>
                    <PlatformIcon platform={platform.platform} size={24} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="font-semibold text-foreground">{getPlatformLabel(platform.platform)}</p>
                      <StatusIcon status={platform.status} />
                      {isPartnerOnly && (
                        <Badge variant="outline" className="text-[10px] border-amber-200 text-amber-700 dark:text-amber-400">
                          Partner-only
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      {PLATFORM_DESCRIPTIONS[platform.platform] || 'Platform integration'}
                    </p>

                    {/* Credentials status */}
                    <div className="flex items-center gap-2 mb-2">
                      <Badge
                        variant="outline"
                        className={`text-xs ${hasCreds ? 'border-blue-200 text-blue-700 dark:text-blue-400' : 'border-amber-200 text-amber-700 dark:text-amber-400'}`}
                      >
                        <Key size={10} className="mr-1" />
                        {hasCreds ? 'Credentials configured' : 'Credentials needed'}
                      </Badge>
                    </div>

                    {isConnected && platform.last_synced_at && (
                      <p className="text-xs text-emerald-600 mb-2">
                        Last synced: {new Date(platform.last_synced_at).toLocaleString()}
                      </p>
                    )}

                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="outline"
                        className={`text-xs ${isConnected ? 'border-emerald-200 text-emerald-700 dark:text-emerald-400' : isError ? 'border-red-200 text-red-700' : 'border-border text-muted-foreground'}`}
                      >
                        {isConnected ? 'Connected' : isError ? 'Error' : 'Not Connected'}
                      </Badge>

                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => openCredentialsDialog(platform.platform)}
                        data-testid={`configure-platform-${platform.platform}`}
                      >
                        <Settings size={11} />
                        Configure
                      </Button>

                      {!isConnected ? (
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => handleConnect(platform.platform)}
                          disabled={isConnecting || !hasCreds}
                          data-testid={`connect-platform-${platform.platform}`}
                        >
                          {isConnecting ? <Loader2 size={11} className="animate-spin" /> : null}
                          {isConnecting ? 'Connecting...' : platformConfig?.auth_type === 'oauth2' ? 'Authorize' : 'Connect'}
                        </Button>
                      ) : (
                        <>
                          {SYNCABLE_PLATFORMS.includes(platform.platform) && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                onClick={() => handleTestConnection(platform.platform)}
                                disabled={testing === platform.platform}
                                data-testid={`test-platform-${platform.platform}`}
                              >
                                {testing === platform.platform ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
                                Test
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                onClick={() => handleSync(platform.platform)}
                                disabled={syncing === platform.platform}
                                data-testid={`sync-platform-${platform.platform}`}
                              >
                                {syncing === platform.platform ? <Loader2 size={11} className="animate-spin" /> : <RotateCw size={11} />}
                                Sync
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-red-600 hover:text-red-700"
                            onClick={() => handleDisconnect(platform.platform)}
                            data-testid={`disconnect-platform-${platform.platform}`}
                          >
                            Disconnect
                          </Button>
                        </>
                      )}
                    </div>

                    {/* Test result display */}
                    {testResults[platform.platform] && isConnected && (() => {
                      const tr = testResults[platform.platform];
                      const isConnected2 = tr.status === 'connected';
                      const isApiDisabled = tr.status === 'api_disabled';
                      const isRateLimited = tr.status === 'rate_limited';
                      const isAuthError = tr.status === 'auth_error';
                      const tone = isConnected2
                        ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10 dark:border-emerald-800'
                        : isRateLimited
                          ? 'border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700'
                          : isApiDisabled
                            ? 'border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700'
                            : 'border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-700';

                      return (
                        <div className={`mt-3 p-2.5 rounded-lg border ${tone}`} data-testid={`test-result-${platform.platform}`}>
                          <div className="flex items-center gap-2 mb-1.5">
                            {isConnected2 ? (
                              <Wifi size={12} className="text-emerald-600" />
                            ) : (
                              <WifiOff size={12} className={isRateLimited ? 'text-amber-600' : isApiDisabled ? 'text-blue-600' : 'text-red-600'} />
                            )}
                            <span className="text-xs font-semibold">
                              {isConnected2 && 'API Connected'}
                              {isApiDisabled && 'API Not Enabled'}
                              {isRateLimited && 'Rate Limit Hit'}
                              {isAuthError && 'Authentication Expired'}
                              {!isConnected2 && !isApiDisabled && !isRateLimited && !isAuthError && 'Connection Issue'}
                            </span>
                            {tr.cached && (
                              <span className="text-[10px] text-muted-foreground ml-auto">cached</span>
                            )}
                          </div>

                          {/* Friendly success details */}
                          {isConnected2 && (
                            <>
                              {tr.channel_title && <p className="text-xs text-muted-foreground">Channel: {tr.channel_title}</p>}
                              {tr.username && <p className="text-xs text-muted-foreground">User: u/{tr.username}</p>}
                              {tr.pages_count > 0 && <p className="text-xs text-muted-foreground">{tr.pages_count} page(s) available</p>}
                              {tr.accounts_count > 0 && <p className="text-xs text-muted-foreground">{tr.accounts_count} account(s) available</p>}
                              {tr.business_name && <p className="text-xs text-muted-foreground">Business: {tr.business_name}</p>}
                            </>
                          )}

                          {/* Friendly error details + actionable CTA */}
                          {!isConnected2 && tr.error && (
                            <p className="text-xs text-foreground/80 leading-snug mb-2">{tr.error}</p>
                          )}
                          {!isConnected2 && tr.details_url && (
                            <a
                              href={tr.details_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              data-testid={`test-result-cta-${platform.platform}`}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                                isApiDisabled
                                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                  : isRateLimited
                                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                                    : 'bg-red-600 hover:bg-red-700 text-white'
                              }`}
                            >
                              <ExternalLink size={11} />
                              {tr.details_label || 'Open Google Cloud Console'}
                            </a>
                          )}
                          {isAuthError && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1 mt-1"
                              onClick={() => handleConnect(platform.platform)}
                              data-testid={`test-result-reconnect-${platform.platform}`}
                            >
                              Reconnect
                            </Button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
              </div>
            </section>
          );
        });
      })()}

      {/* Credentials Dialog */}
      <Dialog open={showCredentialsDialog} onOpenChange={setShowCredentialsDialog}>
        <DialogContent
          className="w-[calc(100vw-1rem)] sm:max-w-lg max-h-[calc(100vh-1rem)] sm:max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden"
          data-testid="configure-platform-dialog"
        >
          <DialogHeader className="px-5 sm:px-6 pt-5 sm:pt-6 pb-4 border-b border-border shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg pr-6">
              {selectedPlatform && <PlatformIcon platform={selectedPlatform} size={20} />}
              <span className="truncate">
                Configure {selectedPlatform && getPlatformLabel(selectedPlatform)}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Enter your developer app credentials to enable this integration
            </DialogDescription>
          </DialogHeader>

          {selectedPlatform && platformConfigs[selectedPlatform] && (
            <>
              <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-4 min-h-0">
              {/* Notes banner */}
              {platformConfigs[selectedPlatform].notes && (
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
                  <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                    {platformConfigs[selectedPlatform].notes}
                  </p>
                </div>
              )}

              {/* Quick links — Docs & Console */}
              <div className="flex flex-wrap items-center gap-2">
                {platformConfigs[selectedPlatform].apply_url && (
                  <a
                    href={platformConfigs[selectedPlatform].apply_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted/50 text-xs font-medium transition-colors"
                    data-testid="open-platform-console"
                  >
                    <ExternalLink size={11} /> Open Developer Console
                  </a>
                )}
                {platformConfigs[selectedPlatform].docs_url && (
                  <a
                    href={platformConfigs[selectedPlatform].docs_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted/50 text-xs font-medium transition-colors"
                    data-testid="open-platform-docs"
                  >
                    <Info size={11} /> API Docs
                  </a>
                )}
                {platformConfigs[selectedPlatform].partner_only && (
                  <Badge variant="outline" className="text-[10px] border-amber-200 text-amber-700 dark:text-amber-400">
                    Partner approval required
                  </Badge>
                )}
              </div>

              {/* Setup Instructions */}
              <Collapsible
                open={instructionsOpen}
                onOpenChange={setInstructionsOpen}
              >
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-between text-xs" data-testid="toggle-instructions-btn">
                    <span className="flex items-center gap-2">
                      <Info size={14} />
                      Setup Instructions
                      <Badge variant="secondary" className="text-[10px]">
                        {platformConfigs[selectedPlatform].instructions?.length || 0} steps
                      </Badge>
                    </span>
                    {instructionsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="p-4 rounded-lg bg-muted/40 border border-border">
                    <ol className="space-y-2.5 text-xs text-foreground/90" data-testid="setup-instructions-list">
                      {platformConfigs[selectedPlatform].instructions?.map((step, i) => (
                        <li key={`${selectedPlatform}-step-${i}`} className="flex gap-3">
                          <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold mt-0.5">
                            {i + 1}
                          </span>
                          <span className="leading-relaxed">
                            <LinkifiedText text={step} />
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Form fields */}
              <div className="space-y-3">
                {platformConfigs[selectedPlatform].required_fields?.includes('client_id') && (
                  <div className="space-y-1.5">
                    <Label htmlFor="client_id" className="text-sm">
                      Client ID / App ID <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="client_id"
                      value={credentialForm.client_id}
                      onChange={(e) => setCredentialForm(p => ({ ...p, client_id: e.target.value }))}
                      placeholder="Enter your app's Client ID"
                      data-testid="credential-client-id"
                    />
                  </div>
                )}

                {platformConfigs[selectedPlatform].required_fields?.includes('client_secret') && (
                  <div className="space-y-1.5">
                    <Label htmlFor="client_secret" className="text-sm">
                      Client Secret / App Secret <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="client_secret"
                        type={showSecrets.client_secret ? 'text' : 'password'}
                        value={credentialForm.client_secret}
                        onChange={(e) => setCredentialForm(p => ({ ...p, client_secret: e.target.value }))}
                        placeholder={credentials[selectedPlatform] ? '••••••••(unchanged)' : 'Enter your app\'s Client Secret'}
                        data-testid="credential-client-secret"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecrets(p => ({ ...p, client_secret: !p.client_secret }))}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showSecrets.client_secret ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {credentials[selectedPlatform] && (
                      <p className="text-xs text-muted-foreground">Leave blank to keep existing secret</p>
                    )}
                  </div>
                )}

                {platformConfigs[selectedPlatform].required_fields?.includes('api_key') && (
                  <div className="space-y-1.5">
                    <Label htmlFor="api_key" className="text-sm">
                      API Key <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="api_key"
                        type={showSecrets.api_key ? 'text' : 'password'}
                        value={credentialForm.api_key}
                        onChange={(e) => setCredentialForm(p => ({ ...p, api_key: e.target.value }))}
                        placeholder={credentials[selectedPlatform]?.has_api_key ? '••••••••(unchanged)' : 'Enter your API key'}
                        data-testid="credential-api-key"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecrets(p => ({ ...p, api_key: !p.api_key }))}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showSecrets.api_key ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {credentials[selectedPlatform]?.has_api_key && (
                      <p className="text-xs text-muted-foreground">Leave blank to keep existing API key</p>
                    )}
                  </div>
                )}

                {/* Trustpilot — optional reply credentials (OAuth password grant) */}
                {selectedPlatform === 'trustpilot' && (
                  <div className="rounded-lg border border-purple-200 dark:border-purple-700 bg-purple-50/50 dark:bg-purple-900/10 p-3" data-testid="trustpilot-reply-panel">
                    <button
                      type="button"
                      onClick={() => setShowTrustpilotReplyPanel(v => !v)}
                      className="w-full flex items-center justify-between text-left"
                      data-testid="toggle-trustpilot-reply-panel"
                    >
                      <div>
                        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                          Enable automatic replies
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              credentials[selectedPlatform]?.additional_config?.has_trustpilot_username &&
                              credentials[selectedPlatform]?.additional_config?.has_trustpilot_password &&
                              credentials[selectedPlatform]?.has_client_secret
                                ? 'border-emerald-200 text-emerald-700 dark:text-emerald-400'
                                : 'border-amber-200 text-amber-700 dark:text-amber-400'
                            }`}
                          >
                            {credentials[selectedPlatform]?.additional_config?.has_trustpilot_username &&
                             credentials[selectedPlatform]?.additional_config?.has_trustpilot_password &&
                             credentials[selectedPlatform]?.has_client_secret
                              ? 'Configured'
                              : 'Optional'}
                          </Badge>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Provide your API Secret + Business email & password to post replies via Trustpilot's OAuth API
                        </p>
                      </div>
                      {showTrustpilotReplyPanel ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>

                    {showTrustpilotReplyPanel && (
                      <div className="mt-3 pt-3 border-t border-purple-200 dark:border-purple-700 space-y-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="trustpilot-api-secret" className="text-sm">
                            API Secret
                          </Label>
                          <div className="relative">
                            <Input
                              id="trustpilot-api-secret"
                              type={showSecrets.client_secret ? 'text' : 'password'}
                              value={credentialForm.client_secret}
                              onChange={(e) => setCredentialForm(p => ({ ...p, client_secret: e.target.value }))}
                              placeholder={credentials[selectedPlatform]?.has_client_secret ? '••••••••(unchanged)' : 'Trustpilot API Secret'}
                              data-testid="credential-client-secret"
                            />
                            <button
                              type="button"
                              onClick={() => setShowSecrets(p => ({ ...p, client_secret: !p.client_secret }))}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              {showSecrets.client_secret ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="trustpilot-username" className="text-sm">
                            Business Account Email
                          </Label>
                          <Input
                            id="trustpilot-username"
                            type="email"
                            autoComplete="off"
                            value={credentialForm.trustpilot_username}
                            onChange={(e) => setCredentialForm(p => ({ ...p, trustpilot_username: e.target.value }))}
                            placeholder={credentials[selectedPlatform]?.additional_config?.has_trustpilot_username ? '••••••••(unchanged)' : 'business@example.com'}
                            data-testid="credential-trustpilot-username"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="trustpilot-password" className="text-sm">
                            Business Account Password
                          </Label>
                          <div className="relative">
                            <Input
                              id="trustpilot-password"
                              type={showTrustpilotPassword ? 'text' : 'password'}
                              autoComplete="off"
                              value={credentialForm.trustpilot_password}
                              onChange={(e) => setCredentialForm(p => ({ ...p, trustpilot_password: e.target.value }))}
                              placeholder={credentials[selectedPlatform]?.additional_config?.has_trustpilot_password ? '••••••••(unchanged)' : 'Your Business password'}
                              data-testid="credential-trustpilot-password"
                            />
                            <button
                              type="button"
                              onClick={() => setShowTrustpilotPassword(v => !v)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              {showTrustpilotPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                        </div>

                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          <strong>Stored encrypted.</strong> Used only to obtain a short-lived OAuth access token at reply-time via Trustpilot's password-grant flow. Leave any field blank to keep its existing value.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Redirect URI info — shown for OAuth platforms */}
              {platformConfigs[selectedPlatform].auth_type === 'oauth2' && (
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">
                        Authorized Redirect URI
                      </p>
                      <p className="text-xs text-amber-700 dark:text-amber-200 font-mono break-all bg-white/40 dark:bg-black/20 px-2 py-1 rounded" data-testid="oauth-redirect-uri">
                        {window.location.origin}/admin/oauth/callback
                      </p>
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5">
                        Add this exact URL (no trailing slash) to your app's authorized redirect URIs.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={copyRedirectUri}
                      className="h-7 text-xs gap-1.5 shrink-0 self-start border-amber-200 dark:border-amber-700"
                      data-testid="copy-redirect-uri-btn"
                    >
                      <Copy size={11} /> Copy
                    </Button>
                  </div>
                </div>
              )}
              </div>

              {/* Sticky footer with Cancel + Save */}
              <div className="flex gap-2 px-5 sm:px-6 py-3 sm:py-4 border-t border-border shrink-0 bg-background">
                <Button
                  variant="outline"
                  onClick={() => setShowCredentialsDialog(false)}
                  className="flex-1"
                  data-testid="cancel-credentials-btn"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveCredentials}
                  disabled={savingCredentials}
                  className="flex-1 gap-2"
                  data-testid="save-credentials-btn"
                >
                  {savingCredentials ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save Credentials
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
