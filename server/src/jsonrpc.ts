/**
 * A JSON-RPC 2.0 error envelope for responses that never reach the MCP SDK
 * (wrong HTTP method, unparseable body, unexpected failure). `id` is null
 * because we could not, or did not, read one from the request.
 */
export interface JsonRpcErrorBody {
  jsonrpc: "2.0";
  error: { code: number; message: string };
  id: null;
}

export function jsonRpcError(code: number, message: string): JsonRpcErrorBody {
  return { jsonrpc: "2.0", error: { code, message }, id: null };
}
