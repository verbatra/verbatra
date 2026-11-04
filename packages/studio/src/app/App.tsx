import type { IconName } from "@verbatra/ui";
import { Container } from "@verbatra/ui";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  handleRefreshEvent,
  nextToastSlot,
  type RefreshToastView,
} from "../client/refresh-toast.js";
import { unreviewedRows } from "../client/review-queue-data.js";
import type { PageId } from "../client/routes.js";
import { AgentToolsAlert } from "./AgentToolsAlert.js";
import { refreshBus, sessionStore } from "./api.js";
import { readStoredSidebarCollapsed, storeSidebarCollapsed } from "./lib/sidebar-dom.js";
import { NAV_GROUPS } from "./nav-groups.js";
import type { PanelProps } from "./panel-props.js";
import { ActivityPanel } from "./panels/ActivityPanel.js";
import { GlossaryPanel } from "./panels/GlossaryPanel.js";
import { ReviewPanel } from "./panels/ReviewPanel.js";
import { SettingsPanel } from "./panels/SettingsPanel.js";
import { TranslationsPanel } from "./panels/TranslationsPanel.js";
import { RefreshToast } from "./RefreshToast.js";
import { DesktopSidebar, MobileNavDrawer } from "./Sidebar.js";
import { TopBar } from "./TopBar.js";
import { useAgentToolsFailures } from "./use-agent-tools-status.js";
import { useReviewQueue } from "./use-review-queue.js";
import { navigateToPage, useCanonicalHash, useRoute } from "./use-route.js";

const PAGE_LABELS: Readonly<Record<PageId, string>> = {
  overview: "Overview",
  translations: "Translations",
  review: "Review",
  glossary: "Glossary",
  settings: "Settings",
};

const PAGE_ICONS: Readonly<Record<PageId, IconName>> = {
  overview: "activity",
  translations: "diff",
  review: "review",
  glossary: "book",
  settings: "settings",
};

const PAGE_PANELS: Readonly<Record<PageId, (props: PanelProps) => ReactNode>> = {
  overview: ActivityPanel,
  translations: TranslationsPanel,
  review: ReviewPanel,
  glossary: GlossaryPanel,
  settings: SettingsPanel,
};

function SessionExpiredNotice(): ReactNode {
  return (
    <div className="flex h-screen items-center justify-center p-6 text-center" role="alert">
      <div className="max-w-md">
        <h1 className="mb-3 text-xl font-semibold text-foreground">Session expired</h1>
        <p className="text-muted-foreground">
          Open the URL the running Verbatra Studio printed in its terminal again, or start Studio
          again if it has stopped.
        </p>
      </div>
    </div>
  );
}

function isSessionExpired(): boolean {
  return sessionStore.getState().kind === "session-expired";
}

export function App(): ReactNode {
  const { page } = useRoute();
  useCanonicalHash();
  const [sessionExpired, setSessionExpired] = useState(isSessionExpired());
  const [toast, setToast] = useState<RefreshToastView | undefined>(undefined);
  const [refreshToken, setRefreshToken] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readStoredSidebarCollapsed);

  useEffect(
    () => sessionStore.subscribe((state) => setSessionExpired(state.kind === "session-expired")),
    [],
  );
  useEffect(
    () =>
      refreshBus.subscribe((event) => {
        const handled = handleRefreshEvent(event);
        if (handled.bumpToken) {
          setRefreshToken((token) => token + 1);
        }
        setToast(handled.toast);
      }),
    [],
  );

  function handleToggleSidebar(): void {
    setSidebarCollapsed((current) => {
      storeSidebarCollapsed(!current);
      return !current;
    });
  }

  function handleDismissToast(): void {
    setToast((current) => nextToastSlot(current, { kind: "dismiss" }));
  }

  if (sessionExpired) {
    return <SessionExpiredNotice />;
  }

  return (
    <AppShell
      page={page}
      refreshToken={refreshToken}
      toast={toast}
      onDismissToast={handleDismissToast}
      mobileNavOpen={mobileNavOpen}
      onSetMobileNavOpen={setMobileNavOpen}
      sidebarCollapsed={sidebarCollapsed}
      onToggleSidebar={handleToggleSidebar}
    />
  );
}

function AppShell({
  page,
  refreshToken,
  toast,
  onDismissToast,
  mobileNavOpen,
  onSetMobileNavOpen,
  sidebarCollapsed,
  onToggleSidebar,
}: {
  readonly page: PageId;
  readonly refreshToken: number;
  readonly toast: RefreshToastView | undefined;
  readonly onDismissToast: () => void;
  readonly mobileNavOpen: boolean;
  readonly onSetMobileNavOpen: (open: boolean) => void;
  readonly sidebarCollapsed: boolean;
  readonly onToggleSidebar: () => void;
}): ReactNode {
  const reviewQueue = useReviewQueue(refreshToken);
  const agentToolsFailures = useAgentToolsFailures();
  const reviewCount = reviewQueue.kind === "data" ? unreviewedRows(reviewQueue.data).length : 0;
  const pageBadges: Readonly<Partial<Record<PageId, number>>> = { review: reviewCount };

  const ActivePanel = PAGE_PANELS[page];

  function navigate(next: PageId): void {
    navigateToPage(next);
    onSetMobileNavOpen(false);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <DesktopSidebar
        groups={NAV_GROUPS}
        pageLabels={PAGE_LABELS}
        pageIcons={PAGE_ICONS}
        pageBadges={pageBadges}
        activePage={page}
        onSelectPage={navigate}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={onToggleSidebar}
      />
      {mobileNavOpen ? (
        <MobileNavDrawer
          groups={NAV_GROUPS}
          pageLabels={PAGE_LABELS}
          pageIcons={PAGE_ICONS}
          pageBadges={pageBadges}
          activePage={page}
          onSelectPage={navigate}
          onClose={() => onSetMobileNavOpen(false)}
        />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar pageLabel={PAGE_LABELS[page]} onOpenNav={() => onSetMobileNavOpen(true)} />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <Container>
            <AgentToolsAlert failures={agentToolsFailures} />
            <ActivePanel refreshToken={refreshToken} />
          </Container>
        </main>
      </div>
      {toast !== undefined ? <RefreshToast view={toast} onDismiss={onDismissToast} /> : null}
    </div>
  );
}
