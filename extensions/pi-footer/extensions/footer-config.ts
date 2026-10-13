import { extensionConfigPath, createConfigStore } from "@henryqw/pi-config-store";
import { parseColor, type Color } from "@earendil-works/pi-tui";
import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";

/** Color roles for footer-owned content; external extension statuses and the thinking gradient are not covered. */
export const FOOTER_COLOR_ROLES = [
	"repository",
	"branch",
	"gitStatus",
	"input",
	"output",
	"cache",
	"throughput",
	"cost",
	"context",
	"model",
	"runtime",
	"codegraphActive",
	"separator",
] as const;

export type FooterColorRole = (typeof FOOTER_COLOR_ROLES)[number];

/** Theme foreground tokens accepted as config values. */
const THEME_TOKENS: ReadonlySet<ThemeColor> = new Set<ThemeColor>([
	"accent",
	"dim",
	"muted",
	"text",
	"success",
	"warning",
	"error",
	"thinkingText",
]);

export type FooterColorValue = { kind: "token"; token: ThemeColor } | { kind: "color"; color: Color };

export type FooterColorConfig = Partial<Record<FooterColorRole, FooterColorValue>>;

function parseColorValue(role: string, raw: unknown): FooterColorValue {
	if (typeof raw === "number") {
		if (!Number.isInteger(raw) || raw < 0 || raw > 255) {
			throw new Error(`colors.${role}: ANSI index must be an integer from 0 to 255`);
		}
		return { kind: "color", color: parseColor(raw) };
	}
	if (typeof raw !== "string" || !raw.trim()) {
		throw new Error(`colors.${role}: expected a theme token or a color value`);
	}
	if (THEME_TOKENS.has(raw as ThemeColor)) return { kind: "token", token: raw as ThemeColor };
	try {
		return { kind: "color", color: parseColor(raw) };
	} catch {
		throw new Error(`colors.${role}: invalid color "${raw}"`);
	}
}

/** Validates and converts the config file; throws on a present-but-invalid file so the caller decides the fallback. */
export function parseFooterColorConfig(value: unknown): { colors: FooterColorConfig } {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("config must be a JSON object");
	}
	const root = value as Record<string, unknown>;
	const unknown = Object.keys(root).filter((key) => key !== "colors");
	if (unknown.length > 0) throw new Error(`unknown field(s): ${unknown.join(", ")}`);
	if (!("colors" in root)) throw new Error('missing "colors" field');
	if (!root.colors || typeof root.colors !== "object" || Array.isArray(root.colors)) {
		throw new Error('"colors" must be an object');
	}
	const colors: FooterColorConfig = {};
	for (const [role, raw] of Object.entries(root.colors as Record<string, unknown>)) {
		if (!FOOTER_COLOR_ROLES.includes(role as FooterColorRole)) {
			throw new Error(`unknown color role "${role}"`);
		}
		colors[role as FooterColorRole] = parseColorValue(role, raw);
	}
	return { colors };
}

function createFooterConfigStore(agentDir?: string) {
	return createConfigStore<{ colors: FooterColorConfig }>({
		extensionId: "pi-footer",
		agentDir,
		defaults: () => ({ colors: {} }),
		parse: parseFooterColorConfig,
	});
}

/** Reads the color config; a missing file yields empty colors (built-in colors), an invalid file throws. */
export function loadFooterConfig(agentDir?: string): FooterColorConfig {
	return createFooterConfigStore(agentDir).loadSync().value.colors;
}

/** Config file path, used in error notifications. */
export function footerConfigPath(agentDir?: string): string {
	return extensionConfigPath("pi-footer", agentDir);
}

/** An explicit config wins; otherwise fall back to the caller's semantic token. */
export function paintFooter(theme: Theme, value: FooterColorValue | undefined, fallback: ThemeColor, text: string): string {
	if (value === undefined) return theme.fg(fallback, text);
	return value.kind === "token" ? theme.fg(value.token, text) : theme.style(text, { fg: value.color });
}
