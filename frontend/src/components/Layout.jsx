import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useBranch } from '../context/BranchContext';
import { useTheme } from 'next-themes';
import {
  LayoutDashboard, Star, MessageSquare, Users, Settings, BarChart3,
  Globe, LogOut, Menu, X, Sun, Moon, Building2, ChevronDown, ClipboardList,
  PenSquare, GitBranch, MapPin, Share2, QrCode
} from 'lucide-react';
import { reviewApi, socialApi } from '../api';
import NotificationBell from './NotificationBell';
import LanguageSelector from './LanguageSelector';
import { Button } from './ui/button';
import { Avatar, AvatarFallback } from './ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from './ui/dropdown-menu';

const NAV_ITEMS = {
  super_admin: [
    { labelKey: 'nav.dashboard', icon: LayoutDashboard, path: '/super-admin' },
    { labelKey: 'nav.clients', icon: Building2, path: '/super-admin/clients' },
    { labelKey: 'nav.shareReview', icon: Share2, path: '/super-admin/share-review' },
    { labelKey: 'nav.settings', icon: Settings, path: '/super-admin/settings' },
  ],
  business_admin: [
    { labelKey: 'nav.dashboard', icon: LayoutDashboard, path: '/admin' },
    { labelKey: 'nav.reviews', icon: Star, path: '/admin/reviews', notifKey: 'reviews' },
    { labelKey: 'nav.social', icon: MessageSquare, path: '/admin/social', notifKey: 'social' },
    { labelKey: 'nav.createPost', icon: PenSquare, path: '/admin/create-post' },
    { labelKey: 'nav.departments', icon: Users, path: '/admin/departments' },
    { labelKey: 'nav.platforms', icon: Globe, path: '/admin/platforms' },
    { labelKey: 'nav.reports', icon: BarChart3, path: '/admin/reports' },
    { labelKey: 'nav.branches', icon: GitBranch, path: '/admin/branches' },
    { labelKey: 'nav.gmb', icon: MapPin, path: '/admin/gmb' },
    { labelKey: 'nav.shareReview', icon: Share2, path: '/admin/share-review' },
    { labelKey: 'nav.eventQR', icon: QrCode, path: '/admin/events' },
    { labelKey: 'nav.settings', icon: Settings, path: '/admin/settings' },
  ],
  department: [
    { labelKey: 'nav.myAssignments', icon: ClipboardList, path: '/dept' },
    { labelKey: 'nav.shareReview', icon: Share2, path: '/dept/share-review' },
    { labelKey: 'nav.settings', icon: Settings, path: '/dept/settings' },
  ],
};

export default function Layout() {
  const { user, logout } = useAuth();
  const { branches, currentBranch, selectBranch } = useBranch();
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [notifs, setNotifs] = useState({ reviews: 0, social: 0 });

  const navItems = NAV_ITEMS[user?.role] || [];

  useEffect(() => {
    if (user?.role === 'super_admin' || !currentBranch) return;
    const fetchCounts = async () => {
      try {
        const params = currentBranch ? { branch_id: currentBranch.id } : {};
        const [r, s] = await Promise.all([
          reviewApi.getCounts(params),
          socialApi.getCounts(params)
        ]);
        setNotifs({ reviews: r.data.unseen || 0, social: s.data.unseen || 0 });
      } catch (e) { console.error('Failed to fetch notification counts:', e); }
    };
    fetchCounts();
    const timer = setInterval(fetchCounts, 30000);
    return () => clearInterval(timer);
  }, [user, currentBranch]);

  const isActive = (path) => {
    if (path === '/admin' || path === '/super-admin' || path === '/dept') {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  const canSwitchBranch = user?.role === 'business_admin' && branches.length > 1;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-card border-r border-border transition-all duration-300 ${collapsed ? 'w-16' : 'w-60'}`}>
        {/* Logo */}
        <div className="flex items-center h-16 px-4 border-b border-border shrink-0">
          {!collapsed ? (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shrink-0">
                <span className="text-primary-foreground font-bold text-sm">C</span>
              </div>
              <span className="font-bold text-lg text-foreground" style={{ fontFamily: 'Manrope' }}>Critiquee</span>
            </div>
          ) : (
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center mx-auto">
              <span className="text-primary-foreground font-bold text-sm">H</span>
            </div>
          )}
        </div>

        {/* Nav Items */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
          {navItems.map((item) => {
            const active = isActive(item.path);
            const count = item.notifKey ? notifs[item.notifKey] : 0;
            const label = t(item.labelKey);
            return (
              <Link
                key={item.path}
                to={item.path}
                data-testid={`nav-${item.labelKey.replace(/\./g, '-')}`}
                title={label}
                className={`flex items-center gap-3 px-3 h-10 rounded-lg transition-all duration-150 relative group ${
                  active
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <item.icon size={18} className="shrink-0" />
                {!collapsed && (
                  <>
                    <span className="text-sm flex-1 truncate min-w-0">{label}</span>
                    {count > 0 && (
                      <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse shrink-0" />
                    )}
                  </>
                )}
                {collapsed && count > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* User profile */}
        <div className="border-t border-border p-3 shrink-0">
          <div className={`flex items-center gap-2 ${collapsed ? 'justify-center' : ''}`}>
            <Avatar className="w-8 h-8 shrink-0">
              <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{user?.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{user?.role?.replace(/_/g, ' ')}</p>
                </div>
                <button
                  onClick={() => { logout(); navigate('/login'); }}
                  data-testid="logout-btn"
                  className="text-muted-foreground hover:text-foreground transition-colors p-1"
                >
                  <LogOut size={15} />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className={`flex flex-col flex-1 transition-all duration-300 ${collapsed ? 'ml-16' : 'ml-60'}`}>
        {/* Top bar */}
        <header className="sticky top-0 z-40 h-14 flex items-center justify-between px-5 bg-background/80 backdrop-blur-sm border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-muted"
              data-testid="sidebar-toggle"
            >
              {collapsed ? <Menu size={18} /> : <X size={18} />}
            </button>

            {/* Business name badge */}
            {user?.client?.name && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/8 rounded-lg border border-primary/15" data-testid="business-name-badge">
                <Building2 size={13} className="text-primary shrink-0" />
                <span className="text-sm font-semibold text-foreground leading-none" style={{ fontFamily: 'Manrope' }}>
                  {user.client.name}
                </span>
              </div>
            )}

            {/* Branch selector — shown for business_admin and department */}
            {currentBranch && user?.role !== 'super_admin' && (
              canSwitchBranch ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 h-8 text-xs font-medium border-primary/20 hover:border-primary/40"
                      data-testid="branch-selector"
                    >
                      <GitBranch size={12} className="text-primary" />
                      <span className="max-w-[140px] truncate">{currentBranch.name}</span>
                      <ChevronDown size={11} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[180px]">
                    <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium">Switch Branch</div>
                    <DropdownMenuSeparator />
                    {branches.map(b => (
                      <DropdownMenuItem
                        key={b.id}
                        onClick={() => selectBranch(b)}
                        className={`gap-2 ${currentBranch.id === b.id ? 'font-semibold text-primary' : ''}`}
                        data-testid={`branch-option-${b.id}`}
                      >
                        <GitBranch size={12} />
                        {b.name}
                        {currentBranch.id === b.id && (
                          <span className="ml-auto text-xs text-primary">Active</span>
                        )}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate('/admin/branches')} className="text-xs text-muted-foreground">
                      Manage Branches...
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-muted rounded-lg border border-border"
                  data-testid="branch-badge"
                >
                  <GitBranch size={12} className="text-muted-foreground shrink-0" />
                  <span className="text-xs font-medium text-foreground truncate max-w-[120px]">
                    {currentBranch.name}
                  </span>
                </div>
              )
            )}
          </div>

          <div className="flex items-center gap-1">
            <LanguageSelector />
            <NotificationBell />
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              data-testid="theme-toggle"
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
