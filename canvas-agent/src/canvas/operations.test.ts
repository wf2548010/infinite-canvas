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

test("canvas_generate_image still produces run_generation", () => {
    const ops = opsOf("canvas_generate_image", { prompt: "a dog", autoRun: true });
    assert.ok(ops.some((op) => op.type === "run_generation"));
});

test("canvas_director_apply creates a director node from shots", () => {
    const ops = opsOf("canvas_director_apply", {
        title: "雨夜",
        mode: "r2v",
        shots: [
            { title: "撑伞", prompt: "走进雨里", seconds: 5 },
            { title: "回头", prompt: "在路灯下回头", seconds: 10, continuity: true },
        ],
    });
    const added = ops.find((op) => op.type === "add_node");
    assert.equal(added?.nodeType, "director");
    assert.equal(added?.title, "雨夜");
    assert.equal(added?.metadata?.director?.r2v?.length, 2);
    assert.equal(added?.metadata?.director?.r2v?.[1]?.continuity, true);
    assert.equal(added?.metadata?.director?.r2v?.[1]?.seconds, 10);
});

test("canvas_director_apply updates the existing director node", () => {
    const request = buildCanvasToolRequest("canvas_director_apply", { nodeId: "dir-1", commonPrompt: "保持短发" }, {
        nodes: [{ id: "dir-1", type: "director", title: "雨夜", position: { x: 0, y: 0 }, width: 340, height: 168, metadata: { director: { title: "雨夜", mode: "r2v", r2v: [{ id: "s1", title: "撑伞", prompt: "走", seconds: 5, run: true }] } } }],
    });
    const ops = (request.input as { ops: Array<Record<string, any>> }).ops;
    assert.equal(ops[0].type, "update_node");
    assert.equal(ops[0].id, "dir-1");
    assert.equal(ops[0].metadata.director.commonPrompt, "保持短发");
    assert.equal(ops[0].metadata.director.r2v[0].id, "s1");
});

test("canvas_director_generate asks the page to start that director node", () => {
    const ops = opsOf("canvas_director_generate", { nodeId: "dir-1", shotIds: ["s2"] });
    assert.deepEqual(ops, [{ type: "run_director", nodeId: "dir-1", shotIds: ["s2"] }]);
});
