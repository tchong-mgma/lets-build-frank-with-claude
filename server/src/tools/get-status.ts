import { z } from "zod";
import { defineTool } from "./define.js";

/** ADR-002's first tool: proves the pipeline, client wiring and console. */
export const getStatus = defineTool({
  name: "get_status",
  description:
    "Returns Frank's version, how long he has been running, and a greeting. Use it to check that Frank is up and reachable; it reads nothing outside Frank.",
  input: z.object({}).strict(),
  run: (_input, ctx) => {
    const uptimeSeconds = Math.floor(process.uptime());
    const version = ctx.config.version;
    const greeting = "Hi, I'm Frank. I look at things; I don't change them.";
    return {
      summary: `Frank ${version} is up and has been running for ${uptimeSeconds} seconds.`,
      version,
      uptimeSeconds,
      greeting,
    };
  },
});
