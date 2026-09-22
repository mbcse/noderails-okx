/**
 * RPC / funding helper unit tests
 * Run with: pnpm --filter @mtxm/backend exec tsx test/rpc-error.test.ts
 */
import assert from "node:assert/strict";
import {
  extractErrorMessage,
  isSuiJsonRpcDeprecated,
  truncateRpcError,
} from "../src/lib/rpc-error.js";

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn())
    .then(() => console.log(`✓ ${name}`))
    .catch((err) => {
      console.error(`✗ ${name}`);
      throw err;
    });
}

await test("prefers ethers shortMessage over HTML body", () => {
  const err = {
    shortMessage: "bad response (status=403)",
    message: "bad response (status=403, headers={}, body=\"<!DOCTYPE html><html>blocked</html>\", requestBody=null, requestMethod=POST)",
  };
  assert.equal(extractErrorMessage(err), "bad response (status=403)");
  const truncated = truncateRpcError(err);
  assert.ok(!truncated.includes("<!DOCTYPE"));
  assert.ok(truncated.length <= 200);
});

await test("truncates first line and strips HTML", () => {
  const html = `<!DOCTYPE html>${"x".repeat(500)}`;
  const out = truncateRpcError(html, 40);
  assert.ok(!out.includes("<"));
  assert.ok(out.endsWith("…"));
  assert.ok(out.length <= 41);
});

await test("detects SUI JSON-RPC deprecation by code and message", () => {
  assert.equal(isSuiJsonRpcDeprecated({ code: -32601, message: "Method not found" }), true);
  assert.equal(
    isSuiJsonRpcDeprecated({
      message: "JSON-RPC on public fullnodes has been deprecated",
    }),
    true,
  );
  assert.equal(isSuiJsonRpcDeprecated({ message: "insufficient funds for gas" }), false);
});

console.log("All rpc-error tests passed");
