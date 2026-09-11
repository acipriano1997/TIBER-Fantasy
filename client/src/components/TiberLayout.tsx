import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";

interface NavItem {
  label: string;
  path: string;
  badge?: string;
  comingSoon?: boolean;
}

type NavSectionConfig = {
  label: string;
  description?: string;
  items: NavItem[];
};

const navSections: NavSectionConfig[] = [
  {
    label: "Primary",
    description: "Inspectable systems only.",
    items: [
      { label: "Command Center", path: "/command-center", badge: "V1" },
      { label: "Beat Vegas", path: "/command-center/beat-vegas", badge: "R&D" },
      { label: "ESPN Draft", path: "/command-center/draft", badge: "LIVE" },
      { label: "Post-Cutoff Ledger", path: "/observatory/post-cutoff-ledger", badge: "NEW" },
      { label: "Management", path: "/management", badge: "NEW" },
      { label: "Records", path: "/records", badge: "NEW" },
      { label: "Rankings", path: "/tiers", badge: "LIVE" },
      { label: "Rookie Board", path: "/rookies", badge: "2026" },
    ],
  },
  {
    label: "Reference",
    description: "Architecture and capability docs.",
    items: [
      { label: "Metrics Dictionary", path: "/metrics-dictionary" },
      { label: "Architecture", path: "/architecture" },
    ],
  },
];

function getSection(location: string): string {
  if (location.startsWith("/command-center/draft")) return "ESPN Draft";
  if (location.startsWith("/command-center/beat-vegas")) return "Beat Vegas · Research";
  if (location.startsWith("/command-center")) return "Command Center";
  if (location === "/" || location.startsWith("/observatory") || location.startsWith("/stress-lab")) return "Observatory";
  if (location.startsWith("/draft-review")) return "Draft Review";
  if (location.startsWith("/management") || location.startsWith("/team-management")) return "Management";
  if (location.startsWith("/records")) return "Records";
  if (location.startsWith("/tiers") || location.startsWith("/rankings")) return "Rankings";
  if (location.startsWith("/rookies")) return "Rookies";
  if (location.startsWith("/tiber-data-lab/command-center")) return "Command Center Lab";
  if (location.startsWith("/tiber-data-lab/player-research")) return "Player Research";
  if (location.startsWith("/tiber-data-lab/team-research")) return "Team Research";
  if (location.startsWith("/tiber-data-lab")) return "Data Lab";
  if (location.startsWith("/forge-workbench")) return "FORGE Workbench";
  if (location.startsWith("/forge")) return "FORGE";
  if (location.startsWith("/catalyst")) return "CATALYST";
  if (location.startsWith("/player/")) return "Player";
  if (location.startsWith("/admin")) return "Admin";
  if (location.startsWith("/schedule")) return "Schedule";
  if (location.startsWith("/metrics-dictionary")) return "Metrics";
  if (location.startsWith("/architecture")) return "Architecture";
  if (location.startsWith("/sentinel")) return "Sentinel";
  if (location.startsWith("/tiberclaw")) return "TiberClaw";
  return "TIBER";
}

function NavSection({
  label,
  description,
  items,
  onNavigate,
}: NavSectionConfig & { onNavigate?: () => void }) {
  const [location] = useLocation();

  return (
    <>
      <div className="nav-section-label">
        <div>{label}</div>
        {description && (
          <div style={{ marginTop: 4, fontSize: 10, opacity: 0.85 }}>
            {description}
          </div>
        )}
      </div>
      {items.map((item) => {
        const isActive = item.path === "/"
          ? location === "/"
          : item.path === "/command-center"
            ? location === "/command-center" || location.startsWith("/command-center/weekly") || location.startsWith("/command-center/waivers") || location.startsWith("/command-center/trades")
            : location.startsWith(item.path) && item.path !== "#";

        if (item.comingSoon) {
          return (
            <div
              key={item.label}
              className="nav-item"
              style={{ opacity: 0.4, cursor: "default" }}
            >
              {item.label}
              <span className="nav-badge">Soon</span>
            </div>
          );
        }

        return (
          <Link
            key={item.label}
            href={item.path}
            className={`nav-item ${isActive ? "active" : ""}`}
            onClick={onNavigate}
          >
            {item.label}
            {item.badge && <span className="nav-badge">{item.badge}</span>}
          </Link>
        );
      })}
    </>
  );
}

function SidebarContents({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();

  return (
    <>
      <div className="sidebar-header">
        <Link
          href="/"
          onClick={onNavigate}
          style={{
            textDecoration: "none",
            color: "inherit",
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            minHeight: "auto",
            minWidth: "auto",
          }}
        >
          <span className="logo-text">TIBER Observatory</span>
          <span className="logo-dot" />
        </Link>
      </div>

      <div className="sidebar-nav">
        <Link
          href="/"
          className={`nav-item ${location === "/" ? "active" : ""}`}
          onClick={onNavigate}
        >
          Observatory
        </Link>
        {navSections.map((section) => (
          <NavSection
            key={section.label}
            label={section.label}
            description={section.description}
            items={section.items}
            onNavigate={onNavigate}
          />
        ))}
      </div>

      <div className="sidebar-footer">
        <div className="user-pill">
          <div>
            <div className="user-name">Operator surface</div>
            <div className="user-league">Guarded actions</div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function TiberLayout({
  children,
  publicDraftReviewOnly = false,
}: {
  children: React.ReactNode;
  publicDraftReviewOnly?: boolean;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  if (publicDraftReviewOnly) {
    return (
      <>
        <header className="tiber-topbar">
          <div className="tiber-topbar-brand">
            <Link href="/draft-review" className="tiber-topbar-logo-link">
              <span className="tiber-topbar-logo">TIBER</span>
            </Link>
            <span className="tiber-topbar-sep" />
            <span className="tiber-topbar-section">Draft Review</span>
          </div>
        </header>
        <main className="tiber-main tiber-main-public">{children}</main>
      </>
    );
  }

  return (
    <>
      <header className="tiber-topbar">
        <div className="tiber-topbar-brand">
          <button
            className="tiber-hamburger tiber-topbar-ham"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={18} />
          </button>
          <Link href="/" className="tiber-topbar-logo-link">
            <span className="tiber-topbar-logo">TIBER</span>
          </Link>
          <span className="tiber-topbar-sep" />
          <span className="tiber-topbar-section">{getSection(location)}</span>
        </div>
        <nav className="tiber-topbar-quicknav">
          <Link href="/command-center/draft" className="tmd-topbar-link">ESPN Draft</Link>
          <Link href="/command-center" className="tmd-topbar-link">Command Center</Link>
          <Link href="/command-center/beat-vegas" className="tmd-topbar-link">Beat Vegas</Link>
          <Link href="/records" className="tmd-topbar-link">Records</Link>
          <Link href="/tiers" className="tmd-topbar-link">Rankings</Link>
          <Link href="/rookies" className="tmd-topbar-link">Rookies</Link>
        </nav>
      </header>

      <nav className="tiber-sidebar tiber-sidebar-desktop">
        <SidebarContents />
      </nav>

      {mobileOpen && (
        <div
          className="tiber-drawer-overlay"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <nav className={`tiber-sidebar tiber-sidebar-mobile ${mobileOpen ? "open" : ""}`}>
        <button
          className="tiber-drawer-close"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        >
          <X size={18} />
        </button>
        <SidebarContents onNavigate={() => setMobileOpen(false)} />
      </nav>

      <main className="tiber-main">{children}</main>
    </>
  );
}
