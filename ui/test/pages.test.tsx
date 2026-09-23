import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import createWrapper from "@cloudscape-design/components/test-utils/dom";
import { describe, expect, it, vi } from "vitest";
import App from "../src/App";
import type { FrankClient, ToolInfo } from "../src/frank/client";
import { formatUptime } from "../src/pages/Overview";

const STATUS = {
  summary: "Frank 0.1.0 is up and has been running for 125 seconds.",
  version: "0.1.0",
  uptimeSeconds: 125,
  greeting: "Hi, I'm Frank.",
};

const TOOLS: ToolInfo[] = [
  {
    name: "get_status",
    description: "Returns Frank's version, uptime and a greeting.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "search_things",
    description: "Searches things.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look for." },
        limit: { type: "integer", description: "Most results to return." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
];

function fakeClient(overrides: Partial<FrankClient> = {}): FrankClient {
  return {
    getStatus: vi.fn(async () => STATUS),
    listTools: vi.fn(async () => TOOLS),
    callTool: vi.fn(async () => ({ isError: false as const, data: { summary: "Found 2 things.", count: 2 } })),
    ...overrides,
  };
}

function callButton(container: HTMLElement): HTMLElement {
  const button = container.querySelector<HTMLElement>('form button[type="submit"]');
  if (!button) throw new Error("no Call button");
  return button;
}

async function selectTool(container: HTMLElement, name: string) {
  const table = createWrapper(container).findTable()!;
  await waitFor(() => expect(table.findRows()).toHaveLength(TOOLS.length));
  const index = TOOLS.findIndex((t) => t.name === name) + 1; // rows are 1-based
  await userEvent.click(table.findRowSelectionArea(index)!.getElement());
}

describe("Overview", () => {
  it("renders Frank's status", async () => {
    render(<App client={fakeClient()} />);
    expect(await screen.findByText(STATUS.summary)).toBeTruthy();
    expect(screen.getByText("0.1.0")).toBeTruthy();
    expect(screen.getByText("2m 5s")).toBeTruthy();
    expect(screen.getByText(STATUS.greeting)).toBeTruthy();
    expect(screen.getByText("Connected")).toBeTruthy();
  });

  it("says Frank did not answer when the call fails, and Retry tries again", async () => {
    const getStatus = vi
      .fn<FrankClient["getStatus"]>()
      .mockRejectedValueOnce(new Error("Could not reach Frank: fetch failed"))
      .mockResolvedValue(STATUS);
    render(<App client={fakeClient({ getStatus })} />);
    expect(await screen.findByText("Frank did not answer")).toBeTruthy();
    expect(screen.getByText("Could not reach Frank: fetch failed")).toBeTruthy();
    expect(screen.getByText("Not reachable")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(STATUS.summary)).toBeTruthy();
    expect(getStatus).toHaveBeenCalledTimes(2);
  });

  it("formats uptime", () => {
    expect(formatUptime(5)).toBe("5s");
    expect(formatUptime(125)).toBe("2m 5s");
    expect(formatUptime(3600)).toBe("1h 0m 0s");
    expect(formatUptime(90061)).toBe("1d 1h 1m 1s");
  });
});

describe("Tools", () => {
  it("lists tools, and selecting one renders its fields", async () => {
    const { container } = render(<App client={fakeClient()} initialPage="tools" />);
    expect(await screen.findByText("search_things")).toBeTruthy();
    await selectTool(container, "search_things");
    const labels = createWrapper(container)
      .findAllFormFields()
      .map((f) => f.findLabel()!.getElement().textContent);
    expect(labels).toEqual(["query", "limit"]);
  });

  it("calls the tool with typed arguments and shows the summary", async () => {
    const client = fakeClient();
    const { container } = render(<App client={client} initialPage="tools" />);
    await selectTool(container, "search_things");
    const wrapper = createWrapper(container);
    const [query, limit] = wrapper.findAllInputs();
    query!.setInputValue("frank");
    limit!.setInputValue("5");
    await userEvent.click(callButton(container));
    await waitFor(() => expect(client.callTool).toHaveBeenCalledWith("search_things", { query: "frank", limit: 5 }));
    expect(await screen.findByText("Found 2 things.")).toBeTruthy();
    expect(container.textContent).toContain('"count": 2');
  });

  it("calls a tool with no parameters with {}", async () => {
    const client = fakeClient();
    const { container } = render(<App client={client} initialPage="tools" />);
    await selectTool(container, "get_status");
    await userEvent.click(callButton(container));
    await waitFor(() => expect(client.callTool).toHaveBeenCalledWith("get_status", {}));
  });

  it("shows an isError result's message", async () => {
    const message = 'MCP error -32602: Input validation error: Unrecognized key: "bogus"';
    const client = fakeClient({ callTool: vi.fn(async () => ({ isError: true as const, message })) });
    const { container } = render(<App client={client} initialPage="tools" />);
    await selectTool(container, "get_status");
    await userEvent.click(callButton(container));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByText("The tool returned an error")).toBeTruthy();
  });

  it("reports an unreachable Frank in the flashbar", async () => {
    const client = fakeClient({ listTools: vi.fn(async () => Promise.reject(new Error("Could not reach Frank: down"))) });
    const { container } = render(<App client={client} initialPage="tools" />);
    await waitFor(() => expect(createWrapper(container).findFlashbar()!.findItems()).toHaveLength(1));
    expect(container.textContent).toContain("Could not reach Frank: down");
  });
});

describe("navigation", () => {
  it("switches pages from the side navigation", async () => {
    const { container } = render(<App client={fakeClient()} />);
    await screen.findByText(STATUS.summary);
    const nav = createWrapper(container).findSideNavigation()!;
    await userEvent.click(nav.findLinkByHref("#/tools")!.getElement());
    expect(await screen.findByText("Available tools")).toBeTruthy();
  });
});
