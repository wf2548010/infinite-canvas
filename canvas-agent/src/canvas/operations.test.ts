import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCanvasToolRequest } from "./operations.js";

function opsOf(name: Parameters<typeof buildCanvasToolRequest>[0], input: Record<string, unknown>) {
    const request = buildCanvasToolRequest(name, input, null);
    return (request.input as { ops: Array<Record<string, any>> }).ops;
}

test("generation flow reuses referenced nodes when the prompt only mentions them", () => {
    const ops = opsOf("canvas_generate_image", { prompt: "@[node:text-1]", referenceNodeIds: ["text-1"], title: "Flow", autoRun: true });
    const addedTextNodes = ops.filter((op) => op.type === "add_node" && op.nodeType === "text");
    const config = ops.find((op) => op.type === "add_node" && op.nodeType === "config");
    const runs = ops.filter((op) => op.type === "run_generation");
    assert.equal(addedTextNodes.length, 0);
    assert.equal(ops.filter((op) => op.type === "connect_nodes" && op.fromNodeId === "text-1" && String(op.toNodeId).startsWith("config-")).length, 1);
    assert.match(String(config?.metadata?.prompt), /^@\[node:text-1\]$/);
    assert.equal(runs.length, 1);
});

test("generation flow still creates a prompt node for prose prompts", () => {
    const ops = opsOf("canvas_generate_image", { prompt: "a cat on a roof", referenceNodeIds: ["text-1"], autoRun: true });
    assert.equal(ops.filter((op) => op.type === "add_node" && op.nodeType === "text").length, 1);
    const config = ops.find((op) => op.type === "add_node" && op.nodeType === "config");
    assert.match(String(config?.metadata?.prompt), /@\[node:text-/);
});

test("canvas_generate_audio creates an audio generation flow with run_generation", () => {
    const ops = opsOf("canvas_generate_audio", { prompt: "轻快的钢琴曲", autoRun: true });
    const config = ops.find((op) => op.type === "add_node" && op.nodeType === "config");
    const runs = ops.filter((op) => op.type === "run_generation");
    assert.equal(String(config?.metadata?.generationMode), "audio");
    assert.equal(runs.length, 1);
    assert.equal(runs[0].mode, "audio");
});

test("canvas_generate_image keeps the production asset code on the config node", () => {
    const ops = opsOf("canvas_generate_image", { prompt: "林夏", assetKind: "character", assetCode: "CHR-001", assetName: "林夏", autoRun: true });
    const config = ops.find((op) => op.type === "add_node" && op.nodeType === "config");
    assert.equal(config?.metadata?.productionRole, "character");
    assert.equal(config?.metadata?.productionCode, "CHR-001");
    assert.equal(config?.metadata?.productionName, "林夏");
});

test("canvas_generate_image still produces run_generation", () => {
    const ops = opsOf("canvas_generate_image", { prompt: "a dog", autoRun: true });
    assert.ok(ops.some((op) => op.type === "run_generation"));
});
