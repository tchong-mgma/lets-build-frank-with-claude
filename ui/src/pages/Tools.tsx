import { useCallback, useEffect, useState } from "react";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table from "@cloudscape-design/components/table";
import SchemaForm from "../components/SchemaForm";
import type { FrankClient, ToolCallOutcome, ToolInfo } from "../frank/client";

export interface ToolsProps {
  client: FrankClient;
  /** Reports failures that aren't a tool's own result, such as Frank being unreachable. */
  onError(message: string): void;
}

function summaryOf(data: unknown): string | undefined {
  if (data && typeof data === "object" && typeof (data as { summary?: unknown }).summary === "string") {
    return (data as { summary: string }).summary;
  }
  return undefined;
}

function ToolResult({ outcome }: { outcome: ToolCallOutcome }) {
  if (outcome.isError) {
    return (
      <Alert type="error" header="The tool returned an error">
        {outcome.message}
      </Alert>
    );
  }
  const summary = summaryOf(outcome.data);
  const json = typeof outcome.data === "string" ? outcome.data : JSON.stringify(outcome.data, null, 2);
  return (
    <SpaceBetween size="m">
      {summary !== undefined && (
        <Alert type="success" header="Summary">
          {summary}
        </Alert>
      )}
      <Container header={<Header variant="h3">Result</Header>}>
        <Box variant="pre">
          <Box variant="code">{json}</Box>
        </Box>
      </Container>
    </SpaceBetween>
  );
}

/** Frank's tools from MCP discovery, each with a form built from its schema. */
export default function Tools({ client, onError }: ToolsProps) {
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ToolInfo | undefined>();
  const [calling, setCalling] = useState(false);
  const [outcome, setOutcome] = useState<ToolCallOutcome | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTools(await client.listTools());
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [client, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const call = async (args: Record<string, unknown>) => {
    if (!selected) return;
    setCalling(true);
    setOutcome(undefined);
    try {
      setOutcome(await client.callTool(selected.name, args));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setCalling(false);
    }
  };

  return (
    <ContentLayout header={<Header variant="h1" description="Pick a tool, fill in its form, and call it.">Tools</Header>}>
      <SpaceBetween size="l">
        <Table
          variant="container"
          header={
            <Header
              variant="h2"
              counter={loading ? undefined : `(${tools.length})`}
              actions={<Button formAction="none" iconName="refresh" ariaLabel="Reload tools" onClick={() => void load()} disabled={loading} />}
            >
              Available tools
            </Header>
          }
          loading={loading}
          loadingText="Asking Frank for his tools"
          items={tools}
          trackBy="name"
          selectionType="single"
          selectedItems={selected ? [selected] : []}
          onSelectionChange={({ detail }) => {
            setSelected(detail.selectedItems[0]);
            setOutcome(undefined);
          }}
          ariaLabels={{
            selectionGroupLabel: "Tool selection",
            itemSelectionLabel: (_data, item) => `Select ${item.name}`,
            allItemsSelectionLabel: () => "Select all",
          }}
          columnDefinitions={[
            { id: "name", header: "Name", cell: (item) => <Box variant="code">{item.name}</Box> },
            { id: "description", header: "Description", cell: (item) => item.description ?? "" },
          ]}
          empty={<Box textAlign="center">Frank has no tools to show.</Box>}
        />

        {selected && (
          <Container header={<Header variant="h2" description={selected.description}>{selected.name}</Header>}>
            <SpaceBetween size="l">
              <SchemaForm key={selected.name} schema={selected.inputSchema} submitting={calling} onSubmit={(args) => void call(args)} />
              {outcome && <ToolResult outcome={outcome} />}
            </SpaceBetween>
          </Container>
        )}
      </SpaceBetween>
    </ContentLayout>
  );
}
