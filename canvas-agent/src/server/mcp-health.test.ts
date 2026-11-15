import assert from "node:assert/strict";
import test from "node:test";

import { canvasAgentHealthUrl } from "./mcp.js";

test("canvas agent liveness uses /health", () => {
    assert.equal(canvasAgentHealthUrl("http://127.0.0.1:17371"), "http://127.0.0.1:17371/health");
    assert.equal(canvasAgentHealthUrl("http://127.0.0.1:17371/"), "http://127.0.0.1:17371/health");
    assert.equal(canvasAgentHealthUrl("http://127.0.0.1:17371").endsWith("/api/session"), false);
});