import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  handleRefreshEvent,
  nextToastSlot,
  type RefreshToastView,
} from "../client/refresh-toast.js";
import { type ReviewQueueData, unreviewedRows } from "../client/review-queue-data.js";
import type { PageId } from "../client/routes.js";
import type { RefreshableView } from "../client/state.js";
import { AgentToolsAlert } from "./AgentToolsAlert.js";
import { AppHeader } from "./AppHeader.js";
import { refreshBus, sessionStore } from "./api.js";
import { cn } from "./lib/cn.js";
import { PAGE_MAX_CLASS } from "./lib/page-width.js";
import { useScrollToTopOnLinkNavigation } from "./link-scroll.js";
import { NavDrawer } from "./NavDrawer.js";
import type { PanelProps } from "./panel-props.js";
import { GlossaryPanel } from "./panels/GlossaryPanel.js";
import { OverviewPanel } from "./panels/OverviewPanel.js";
import { ReviewPanel } from "./panels/ReviewPanel.js";
import { SettingsPanel } from "./panels/SettingsPanel.js";
import { TranslationsPanel } from "./panels/TranslationsPanel.js";
import { RefreshToast } from "./RefreshToast.js";
import { useAgentToolsFailures } from "./use-agent-tools-status.js";
import { useMediaQuery, XL_QUERY } from "./use-media-query.js";
import { useReviewQueue } from "./use-review-queue.js";
import { useCanonicalHash, useRoute } from "./use-route.js";

const PAGE_PANELS: Readonly<Record<PageId, (props: PanelProps) => ReactNode>> = {
  overview: OverviewPanel,
  translations: TranslationsPanel,
  review: ReviewPanel,
  glossary: GlossaryPanel,
  settings: SettingsPanel,
};

function waitingCount(queue: RefreshableView<ReviewQueueData>): number | undefined {
  return queue.kind === "data" && queue.data.available
    ? unreviewedRows(queue.data).length
    : undefined;
}

function focusMain(): void {
  document.getElementById("main")?.focus();
}

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
  const route = useRoute();
  const { page } = route;
  useScrollToTopOnLinkNavigation(route);
  useCanonicalHash();
  const [sessionExpired, setSessionExpired] = useState(isSessionExpired());
  const [toast, setToast] = useState<RefreshToastView | undefined>(undefined);
  const [refreshToken, setRefreshToken] = useState(0);
  const [gitRefreshToken, setGitRefreshToken] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(
    () => sessionStore.subscribe((state) => setSessionExpired(state.kind === "session-expired")),
    [],
  );
  useEffect(
    () =>
      refreshBus.subscribe((event) => {
        const handled = handleRefreshEvent(event);
        if (handled.kind === "git") {
          setGitRefreshToken((token) => token + 1);
          return;
        }
        setRefreshToken((token) => token + 1);
        setToast(handled.toast);
      }),
    [],
  );

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
      gitRefreshToken={gitRefreshToken}
      toast={toast}
      onDismissToast={handleDismissToast}
      mobileNavOpen={mobileNavOpen}
      onSetMobileNavOpen={setMobileNavOpen}
    />
  );
}

function AppShell({
  page,
  refreshToken,
  gitRefreshToken,
  toast,
  onDismissToast,
  mobileNavOpen,
  onSetMobileNavOpen,
}: {
  readonly page: PageId;
  readonly refreshToken: number;
  readonly gitRefreshToken: number;
  readonly toast: RefreshToastView | undefined;
  readonly onDismissToast: () => void;
  readonly mobileNavOpen: boolean;
  readonly onSetMobileNavOpen: (open: boolean) => void;
}): ReactNode {
  const [retries, setRetries] = useState(0);
  const reviewQueue = useReviewQueue(refreshToken + retries);
  const agentToolsFailures = useAgentToolsFailures();
  const reviewCount = waitingCount(reviewQueue);
  const pageBadges: Readonly<Partial<Record<PageId, number>>> =
    reviewCount === undefined ? {} : { review: reviewCount };

  const ActivePanel = PAGE_PANELS[page];
  const wide = useMediaQuery(XL_QUERY, false);
  const wideRef = useRef(wide);
  const activeLinkRef = useRef<HTMLAnchorElement>(null);

  useLayoutEffect(() => {
    wideRef.current = wide;
  });

  useEffect(() => {
    if (wide && mobileNavOpen) {
      onSetMobileNavOpen(false);
      activeLinkRef.current?.focus();
    }
  }, [wide, mobileNavOpen, onSetMobileNavOpen]);

  return (
    <div className="group/page flex min-h-screen flex-col bg-background text-foreground [--page-max:var(--container-6xl)] has-[[data-split]]:[--page-max:var(--width-layout)]">
      <button
        type="button"
        className="fixed start-2 top-2 z-50 -translate-y-24 rounded-md border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground focus-visible:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        onClick={focusMain}
      >
        Skip to main content
      </button>
      <AppHeader
        activePage={page}
        pageBadges={pageBadges}
        onOpenMenu={() => onSetMobileNavOpen(true)}
        activeLinkRef={activeLinkRef}
      />
      {mobileNavOpen ? (
        <NavDrawer
          activePage={page}
          pageBadges={pageBadges}
          onClose={() => onSetMobileNavOpen(false)}
          shouldRestoreFocus={() => !wideRef.current}
        />
      ) : null}
      <main id="main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
        <div
          data-page-width=""
          className={cn(PAGE_MAX_CLASS, "mx-auto w-full px-4 py-6 md:px-8 md:py-8")}
        >
          <AgentToolsAlert failures={agentToolsFailures} />
          {page === "overview" ? (
            <OverviewPanel
              refreshToken={refreshToken + retries}
              gitRefreshToken={gitRefreshToken}
              reviewQueue={reviewQueue}
              onRetry={() => setRetries((count) => count + 1)}
            />
          ) : (
            <ActivePanel refreshToken={refreshToken} />
          )}
        </div>
      </main>
      {toast !== undefined ? <RefreshToast view={toast} onDismiss={onDismissToast} /> : null}
    </div>
  );
}
