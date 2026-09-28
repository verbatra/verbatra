import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  handleRefreshEvent,
  nextToastSlot,
  type RefreshToastView,
} from "../client/refresh-toast.js";
import { unreviewedRows } from "../client/review-queue-data.js";
import { PAGE_IDS, type PageId, pageHash, parsePageHash } from "../client/routes.js";
import { AgentToolsAlert } from "./AgentToolsAlert.js";
import { refreshBus, sessionStore } from "./api.js";
import type { IconName } from "./Icon.js";
import { readStoredSidebarCollapsed, storeSidebarCollapsed } from "./lib/sidebar-dom.js";
import type { PanelProps } from "./panel-props.js";
import { ActivityPanel } from "./panels/ActivityPanel.js";
import { ReviewPanel } from "./panels/ReviewPanel.js";
import { SettingsPanel } from "./panels/SettingsPanel.js";
import { TranslationsPanel } from "./panels/TranslationsPanel.js";
import { RefreshToast } from "./RefreshToast.js";
import { DesktopSidebar, MobileNavDrawer } from "./Sidebar.js";
import { TopBar } from "./TopBar.js";
import { Container } from "./ui.js";
import { useAgentToolsFailures } from "./use-agent-tools-status.js";
import { useReviewQueue } from "./use-review-queue.js";

const PAGE_LABELS: Readonly<Record<PageId, string>> = {
  translations: "Translations",
  review: "Review",
  activity: "Activity",
  settings: "Settings",
};

const PAGE_ICONS: Readonly<Record<PageId, IconName>> = {
  translations: "diff",
  review: "review",
  activity: "activity",
  settings: "settings",
};

const WORK_PAGES: readonly PageId[] = ["translations", "review"];
const REFERENCE_PAGES: readonly PageId[] = ["activity", "settings"];

const ZONED_PAGES = new Set([...WORK_PAGES, ...REFERENCE_PAGES]);
if (ZONED_PAGES.size !== PAGE_IDS.length || PAGE_IDS.some((page) => !ZONED_PAGES.has(page))) {
  throw new Error("WORK_PAGES and REFERENCE_PAGES must partition PAGE_IDS exactly");
}

const PAGE_PANELS: Readonly<Record<PageId, (props: PanelProps) => ReactNode>> = {
  translations: TranslationsPanel,
  review: ReviewPanel,
  activity: ActivityPanel,
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
  const [page, setPage] = useState<PageId>(() => parsePageHash(window.location.hash));
  const [sessionExpired, setSessionExpired] = useState(isSessionExpired());
  const [toast, setToast] = useState<RefreshToastView | undefined>(undefined);
  const [refreshToken, setRefreshToken] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readStoredSidebarCollapsed);

  useEffect(() => {
    function onHashChange(): void {
      setPage(parsePageHash(window.location.hash));
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

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
      onNavigate={setPage}
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
  onNavigate,
  refreshToken,
  toast,
  onDismissToast,
  mobileNavOpen,
  onSetMobileNavOpen,
  sidebarCollapsed,
  onToggleSidebar,
}: {
  readonly page: PageId;
  readonly onNavigate: (page: PageId) => void;
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
    window.location.hash = pageHash(next);
    onNavigate(next);
    onSetMobileNavOpen(false);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <DesktopSidebar
        workPages={WORK_PAGES}
        referencePages={REFERENCE_PAGES}
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
          workPages={WORK_PAGES}
          referencePages={REFERENCE_PAGES}
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
