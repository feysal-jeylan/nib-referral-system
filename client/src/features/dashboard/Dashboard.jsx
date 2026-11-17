/**
 * features/dashboard/Dashboard.jsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Dynamic Permission-Driven Dashboard Shell.
 *
 * Navigation is now driven by user.permissions[] returned from /api/auth/me,
 * NOT by hardcoded role strings. Each nav item declares the permission key
 * required to see it. Items without a permission key are always visible.
 *
 * Security fallback: if the user navigates to a page whose permission they
 * lack, they are automatically redirected to 'overview' and shown AccessDenied.
 *
 * Backward compatibility:
 *   - Admin users still see Admin-labelled portal header.
 *   - Agent users still see their own labels ("My Dashboard", "My Referrals").
 *   - SettingsPage and all existing pages receive identical props.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Megaphone,
  FileText,
  Terminal,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  UserCog,
  Shield,
  Wallet,
} from 'lucide-react';

import useAppStore from '@/store/useAppStore';
import Toast from '@/components/ui/Toast';
import usePermissions from '@/features/auth/usePermissions';

// ── Page imports ──────────────────────────────────────────────────────────────
import Overview            from './pages/Overview';
import AgentOverview       from './pages/AgentOverview';
import SettingsPage        from './pages/SettingsPage';
import FinancePage         from '@/features/finance/pages/FinancePage';
import AgentsPage          from '@/features/agents/pages/AgentsPage';
import CampaignsPage       from '@/features/campaigns/pages/CampaignsPage';
import ReferralsPage       from '@/features/referrals/pages/ReferralsPage';
import IntegrationLogsPage from '@/features/integration/pages/IntegrationLogsPage';
import UsersPage           from '@/features/users/pages/UsersPage';
import RolesPage           from '@/features/roles/pages/RolesPage';
import AccessDenied        from '@/components/ui/AccessDenied';

// ── Brand colours ─────────────────────────────────────────────────────────────
const BRAND      = '#8A4D1F';
const CHOCOLATE  = '#3E2723';
const MUTED      = '#9C8577';
const IVORY      = '#FAF8F5';
const BORDER_CLR = 'rgba(138,77,31,0.12)';

// ── Unified Nav Config ────────────────────────────────────────────────────────
// permission: null → always visible (e.g. Settings)
// agentLabel: alternate label for agent-role users
const NAV_CONFIG = [
  { key: 'overview',  label: 'Overview',         agentLabel: 'My Dashboard', Icon: LayoutDashboard, permission: 'view_dashboard' },
  { key: 'agents',    label: 'Agents',            Icon: Users,                permission: 'view_agents'    },
  { key: 'campaigns', label: 'Campaigns',         Icon: Megaphone,            permission: 'view_campaigns' },
  { key: 'referrals', label: 'Referrals',         agentLabel: 'My Referrals', Icon: FileText,        permission: 'view_referrals' },
  { key: 'finance',   label: 'Finance',           Icon: Wallet,               permission: 'view_finance'   },
  { key: 'logs',      label: 'Integration Logs',  Icon: Terminal,             permission: 'view_logs'      },
  { key: 'users',     label: 'User Management',   Icon: UserCog,              permission: 'view_users'     },
  { key: 'roles',     label: 'Role Management',   Icon: Shield,               permission: 'view_roles'     },
  { key: 'settings',  label: 'Settings',          Icon: Settings,             permission: null             },
];

// ── NavItem Component ─────────────────────────────────────────────────────────
function NavItem({ item, active, collapsed, onClick }) {
  const { Icon, label } = item;
  return (
    <button
      onClick={() => onClick(item.key)}
      title={collapsed ? label : undefined}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
                 font-medium transition-all duration-150 outline-none"
      style={{
        background: active ? 'rgba(138,77,31,0.10)' : 'transparent',
        color:      active ? CHOCOLATE : MUTED,
        borderLeft: active ? `3px solid ${BRAND}` : '3px solid transparent',
      }}
      onMouseEnter={e => {
        if (!active) {
          e.currentTarget.style.background = 'rgba(138,77,31,0.06)';
          e.currentTarget.style.color = CHOCOLATE;
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = MUTED;
        }
      }}
    >
      <Icon
        size={18}
        strokeWidth={active ? 2.2 : 1.8}
        style={{ color: active ? BRAND : 'inherit', flexShrink: 0 }}
      />
      {!collapsed && <span className="truncate leading-none">{label}</span>}
    </button>
  );
}

// ── Main Dashboard Shell ──────────────────────────────────────────────────────
export default function Dashboard({ user: propUser, logout }) {
  const storeUser     = useAppStore(s => s.user);
  const user          = storeUser || propUser;

  const activePage    = useAppStore(s => s.activePage);
  const setActivePage = useAppStore(s => s.setActivePage);
  const collapsed     = useAppStore(s => s.sidebarCollapsed);
  const toggleSidebar = useAppStore(s => s.toggleSidebar);
  const clearUser     = useAppStore(s => s.clearUser);

  const { hasPermission, isAdmin } = usePermissions();

  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((t) => {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }, []);

  async function handleLogout() {
    await logout();
    clearUser();
  }

  // ── Build visible nav based on user.permissions[] ────────────────────────────
  const isAgent = Boolean(user?.agent_id);

  const visibleNav = NAV_CONFIG.filter(item => {
    if (!item.permission) return true;                    // always show (Settings)
    return hasPermission(item.permission);
  }).map(item => ({
    ...item,
    // Apply agentLabel ONLY when user is an Agent (has agent_id)
    label: (isAgent && item.agentLabel) ? item.agentLabel : item.label,
  }));

  // ── Page title: derive from visible nav item label ───────────────────────────
  const currentNavItem = visibleNav.find(n => n.key === activePage);
  const pageTitle      = currentNavItem?.label ?? 'Dashboard';

  // ── Security fallback: if activePage is not in visibleNav, go to overview ───
  const isPageAllowed = !activePage ||
    activePage === 'overview' ||
    visibleNav.some(n => n.key === activePage);

  useEffect(() => {
    if (!isPageAllowed) {
      setActivePage('overview');
    }
  }, [isPageAllowed, setActivePage]);

  // ── Content Router ────────────────────────────────────────────────────────────
  function renderPage() {
    const page  = isPageAllowed ? activePage : 'overview';
    const props = { user, isAdmin, onToast: showToast };

    // Permission guard: if user navigates here but lost access, show AccessDenied
    const navItem    = NAV_CONFIG.find(n => n.key === page);
    const needsPerm  = navItem?.permission;
    if (needsPerm && !hasPermission(needsPerm)) {
      return <AccessDenied onGoHome={() => setActivePage('overview')} />;
    }

    switch (page) {
      // ── Shared pages (permission-gated by backend, UI handles both roles) ──
      case 'overview':
        return isAgent
          ? <AgentOverview {...props} />
          : <Overview      {...props} />;

      case 'agents':    return <AgentsPage          {...props} />;
      case 'campaigns': return <CampaignsPage       {...props} />;
      case 'referrals': return <ReferralsPage       {...props} />;
      case 'logs':      return <IntegrationLogsPage {...props} />;
      case 'settings':  return <SettingsPage        {...props} />;

      // ── Finance: gated by view_finance ───────────────────────────────────
      case 'finance':
        return <FinancePage {...props} />;

      // ── New RBAC admin pages ───────────────────────────────────────────────
      case 'users':     return <UsersPage           {...props} />;
      case 'roles':     return <RolesPage           {...props} />;

      default:          return isAgent
        ? <AgentOverview {...props} />
        : <Overview      {...props} />;
    }
  }

  const sidebarW = collapsed ? '72px' : '240px';

  // ── Portal subtitle label ────────────────────────────────────────────────────
  const portalLabel = isAgent ? 'Agent Portal' : (isAdmin ? 'Admin Portal' : 'Staff Portal');
  const roleLabel   = isAgent ? 'Agent' : (user?.role || (isAdmin ? 'Administrator' : 'Staff'));

  return (
    <div className="flex min-h-screen" style={{ background: IVORY }}>

      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <aside
        className="fixed top-0 left-0 h-screen flex flex-col z-40 transition-all duration-200"
        style={{
          width: sidebarW,
          background: '#FFFFFF',
          borderRight: `1px solid ${BORDER_CLR}`,
          boxShadow: '2px 0 12px rgba(62,39,35,0.06)',
        }}
        aria-label="Main navigation"
      >
        {/* Logo */}
        <div
          className="flex items-center gap-3 px-4 flex-shrink-0"
          style={{ borderBottom: `1px solid ${BORDER_CLR}`, height: '64px' }}
        >
          <img
            src="/nib-logo.png"
            alt="NIB"
            className="rounded-full object-cover flex-shrink-0"
            style={{ width: '36px', height: '36px' }}
          />
          {!collapsed && (
            <div className="overflow-hidden">
              <p className="font-bold text-sm leading-tight truncate" style={{ color: CHOCOLATE }}>
                NIB Referral
              </p>
              <p className="text-[10px] truncate" style={{ color: MUTED }}>
                {portalLabel}
              </p>
            </div>
          )}
        </div>

        {/* Nav list */}
        <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-0.5">
          {visibleNav.map(item => (
            <NavItem
              key={item.key}
              item={item}
              active={activePage === item.key}
              collapsed={collapsed}
              onClick={setActivePage}
            />
          ))}
        </nav>

        {/* Bottom: user profile + logout + collapse toggle */}
        <div
          className="flex-shrink-0 px-2 pb-4 pt-3 space-y-1"
          style={{ borderTop: `1px solid ${BORDER_CLR}` }}
        >
          {!collapsed && (
            <div className="px-3 py-2 rounded-lg mb-1" style={{ background: IVORY }}>
              <p className="text-xs font-semibold truncate leading-none" style={{ color: CHOCOLATE }}>
                {user?.username ?? 'User'}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>
                {roleLabel}
              </p>
            </div>
          )}

          <button
            id="logout-btn"
            onClick={handleLogout}
            title="Sign Out"
            aria-label="Sign out"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                       text-sm font-medium transition-all duration-150"
            style={{ color: MUTED }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(220,38,38,0.08)';
              e.currentTarget.style.color = '#b91c1c';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = MUTED;
            }}
          >
            <LogOut size={18} strokeWidth={1.8} style={{ flexShrink: 0 }} />
            {!collapsed && <span className="truncate">Sign Out</span>}
          </button>

          <button
            onClick={toggleSidebar}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg
                       text-xs font-medium transition-all duration-150"
            style={{ color: MUTED }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(138,77,31,0.06)';
              e.currentTarget.style.color = CHOCOLATE;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = MUTED;
            }}
          >
            {collapsed ? <ChevronRight size={15} /> : <><ChevronLeft size={15} /><span>Collapse</span></>}
          </button>
        </div>
      </aside>

      {/* ── Main area ──────────────────────────────────────────────────── */}
      <div
        className="flex-1 flex flex-col min-h-screen transition-all duration-200"
        style={{ marginLeft: sidebarW }}
      >
        {/* Top bar */}
        <header
          className="sticky top-0 z-30 flex items-center justify-between px-6 flex-shrink-0"
          style={{
            height: '64px',
            background: '#FFFFFF',
            borderBottom: `1px solid ${BORDER_CLR}`,
            boxShadow: '0 1px 4px rgba(62,39,35,0.04)',
          }}
        >
          <h1 className="font-bold text-base" style={{ color: CHOCOLATE }}>
            {pageTitle}
          </h1>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold leading-none" style={{ color: CHOCOLATE }}>
                {user?.username ?? 'User'}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: MUTED }}>
                {roleLabel}
              </p>
            </div>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center
                         text-white text-xs font-bold flex-shrink-0 select-none"
              style={{ background: BRAND }}
              aria-hidden="true"
            >
              {user?.username?.charAt(0).toUpperCase() ?? 'U'}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto" style={{ background: IVORY }}>
          {renderPage()}
        </main>
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
