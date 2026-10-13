import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
	FOOTER_COLOR_ROLES,
	type FooterColorConfig,
	footerConfigPath,
	loadFooterConfig,
	paintFooter,
	parseFooterColorConfig,
} from "../extensions/footer-config.ts";

type FakeTheme = {
	fgCalls: [string, string][];
	styleCalls: [string, unknown][];
	fg(token: string, text: string): string;
	style(text: string, options: { fg: unknown }): string;
};

function fakeTheme(): FakeTheme {
	const theme: FakeTheme = {
		fgCalls: [],
		styleCalls: [],
		fg(token, text) {
			theme.fgCalls.push([token, text]);
			return `<${token}>${text}</>`;
		},
		style(text, options) {
			theme.styleCalls.push([text, options]);
			return `<color>${text}</>`;
		},
	};
	return theme;
}

test("missing file returns empty colors and does not create the file", (t) => {
	const agentDir = mkdtempSync(join(tmpdir(), "pi-footer-config-"));
	t.after(() => rmSync(agentDir, { recursive: true, force: true }));
	assert.deepEqual(loadFooterConfig(agentDir), {});
	assert.equal(loadFooterConfig(agentDir).input, undefined);
	assert.equal(loadFooterConfig(mkdtempSync(join(tmpdir(), "pi-footer-config-"))).input, undefined);
});

test("full config accepts every color role", () => {
	const raw: Record<string, unknown> = {
		repository: "muted",
		branch: "accent",
		gitStatus: "warning",
		input: "#4ec9b0",
		output: 39,
		cache: "#c586c0",
		throughput: 220,
		cost: "#ce9178",
		context: "#89d185",
		model: "text",
		runtime: "muted",
		codegraphActive: "accent",
		separator: "dim",
	};
	const parsed = parseFooterColorConfig({ colors: raw });
	assert.deepEqual(Object.keys(parsed.colors).sort(), [...FOOTER_COLOR_ROLES].sort());
});

test("partial config only overrides provided roles", (t) => {
	const agentDir = mkdtempSync(join(tmpdir(), "pi-footer-config-"));
	t.after(() => rmSync(agentDir, { recursive: true, force: true }));
	const path = footerConfigPath(agentDir);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify({ colors: { input: "#4ec9b0" } }));
	const colors = loadFooterConfig(agentDir);
	assert.deepEqual(Object.keys(colors), ["input"]);
	assert.equal(colors.input?.kind, "color");
});

test("accepts theme tokens, hex, oklch, okhsl and ANSI boundaries", () => {
	for (const token of ["accent", "dim", "muted", "text", "success", "warning", "error", "thinkingText"]) {
		assert.equal(parseFooterColorConfig({ colors: { input: token } }).colors.input?.kind, "token", token);
	}
	for (const value of ["#0af", "#00aaff", "oklch(62% 0.1 200)", "okhsl(250 60% 55%)", 0, 255]) {
		assert.equal(parseFooterColorConfig({ colors: { input: value } }).colors.input?.kind, "color", String(value));
	}
});

test("rejects unknown root fields, roles and invalid colors", () => {
	const invalid: [unknown, RegExp][] = [
		["not an object", /JSON object/],
		[{}, /missing "colors"/],
		[{ extra: true, colors: {} }, /unknown field/],
		[{ colors: [] }, /must be an object/],
		[{ colors: { nope: "accent" } }, /unknown color role/],
		[{ colors: { input: "" } }, /expected a theme token/],
		[{ colors: { input: "not-a-color" } }, /invalid color/],
		[{ colors: { input: 1.5 } }, /ANSI index/],
		[{ colors: { input: 256 } }, /ANSI index/],
		[{ colors: { input: -1 } }, /ANSI index/],
	];
	for (const [value, pattern] of invalid) {
		assert.throws(() => parseFooterColorConfig(value), pattern, JSON.stringify(value));
	}
});

test("invalid file makes loadFooterConfig throw", (t) => {
	const agentDir = mkdtempSync(join(tmpdir(), "pi-footer-config-"));
	t.after(() => rmSync(agentDir, { recursive: true, force: true }));
	const path = footerConfigPath(agentDir);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, "{ broken json");
	assert.throws(() => loadFooterConfig(agentDir));
});

test("paintFooter: token uses theme.fg, concrete color uses theme.style, missing falls back", () => {
	const theme = fakeTheme();
	const tokenValue = parseFooterColorConfig({ colors: { input: "success" } }).colors.input;
	const colorValue = parseFooterColorConfig({ colors: { input: "#4ec9b0" } }).colors.input;
	const fallbackValue = parseFooterColorConfig({ colors: {} }).colors.input;

	assert.equal(paintFooter(theme as never, tokenValue, "dim", "x"), "<success>x</>");
	assert.equal(paintFooter(theme as never, colorValue, "dim", "x"), "<color>x</>");
	assert.equal(paintFooter(theme as never, fallbackValue, "dim", "x"), "<dim>x</>");

	assert.deepEqual(theme.fgCalls, [
		["success", "x"],
		["dim", "x"],
	]);
	assert.equal(theme.styleCalls.length, 1);
});

test("concrete ANSI value produces a Color object", () => {
	const colors: FooterColorConfig = parseFooterColorConfig({ colors: { input: 39 } }).colors;
	const value = colors.input;
	assert.equal(value?.kind, "color");
	if (value?.kind === "color") assert.equal(value.color.kind, "indexed");
});
