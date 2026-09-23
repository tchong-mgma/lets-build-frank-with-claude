import { useCallback, useEffect, useState } from "react";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import type { FrankClient, Status } from "../frank/client";

type State =
  | { kind: "loading" }
  | { kind: "ok"; status: Status }
  | { kind: "error"; message: string };

export function formatUptime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const parts = [
    days && `${days}d`,
    (days || hours) && `${hours}h`,
    (days || hours || minutes) && `${minutes}m`,
    `${seconds}s`,
  ].filter(Boolean);
  return parts.join(" ");
}

/** Frank's get_status output and whether he's answering. */
export default function Overview({ client }: { client: FrankClient }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      setState({ kind: "ok", status: await client.getStatus() });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  const health =
    state.kind === "loading" ? (
      <StatusIndicator type="loading">Connecting</StatusIndicator>
    ) : state.kind === "ok" ? (
      <StatusIndicator type="success">Connected</StatusIndicator>
    ) : (
      <StatusIndicator type="error">Not reachable</StatusIndicator>
    );

  return (
    <ContentLayout header={<Header variant="h1" description="Frank's status, straight from get_status.">Overview</Header>}>
      <SpaceBetween size="l">
        {state.kind === "error" && (
          <Alert
            type="error"
            header="Frank did not answer"
            action={<Button formAction="none" onClick={() => void load()}>Retry</Button>}
          >
            {state.message}
          </Alert>
        )}
        <Container
          header={
            <Header
              variant="h2"
              actions={
                <Button formAction="none" iconName="refresh" ariaLabel="Refresh status" onClick={() => void load()} disabled={state.kind === "loading"} />
              }
            >
              Status
            </Header>
          }
        >
          <SpaceBetween size="m">
            {state.kind === "ok" && <Box variant="p">{state.status.summary}</Box>}
            <KeyValuePairs
              columns={4}
              items={[
                { label: "Connection", value: health },
                { label: "Version", value: state.kind === "ok" ? state.status.version : "-" },
                { label: "Uptime", value: state.kind === "ok" ? formatUptime(state.status.uptimeSeconds) : "-" },
                { label: "Greeting", value: state.kind === "ok" ? state.status.greeting : "-" },
              ]}
            />
          </SpaceBetween>
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}
