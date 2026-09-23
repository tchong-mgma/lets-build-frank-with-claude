import { useCallback, useState } from "react";
import AppLayout from "@cloudscape-design/components/app-layout";
import Flashbar, { type FlashbarProps } from "@cloudscape-design/components/flashbar";
import SideNavigation from "@cloudscape-design/components/side-navigation";
import type { FrankClient } from "./frank/client";
import Overview from "./pages/Overview";
import Tools from "./pages/Tools";

export type PageId = "overview" | "tools";

export interface AppProps {
  client: FrankClient;
  initialPage?: PageId;
}

const HREF: Record<PageId, string> = { overview: "#/overview", tools: "#/tools" };

/** Reads the page from a hash such as "#/tools". Anything else is the overview. */
export function pageFromHash(hash: string): PageId {
  return hash === HREF.tools ? "tools" : "overview";
}

export default function App({ client, initialPage = "overview" }: AppProps) {
  const [page, setPage] = useState<PageId>(initialPage);
  const [flash, setFlash] = useState<FlashbarProps.MessageDefinition[]>([]);

  const reportError = useCallback((message: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setFlash((items) => [
      ...items,
      {
        id,
        type: "error",
        header: "Something went wrong talking to Frank",
        content: message,
        dismissible: true,
        dismissLabel: "Dismiss",
        onDismiss: () => setFlash((current) => current.filter((item) => item.id !== id)),
      },
    ]);
  }, []);

  return (
    <AppLayout
      toolsHide
      notifications={<Flashbar items={flash} />}
      navigation={
        <SideNavigation
          header={{ href: HREF.overview, text: "Frank" }}
          activeHref={HREF[page]}
          items={[
            { type: "link", text: "Overview", href: HREF.overview },
            { type: "link", text: "Tools", href: HREF.tools },
          ]}
          onFollow={(event) => {
            event.preventDefault();
            const next = pageFromHash(event.detail.href);
            setPage(next);
            if (typeof window !== "undefined") window.history.replaceState(null, "", HREF[next]);
          }}
        />
      }
      content={page === "tools" ? <Tools client={client} onError={reportError} /> : <Overview client={client} />}
    />
  );
}
