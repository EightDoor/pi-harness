import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	loadTaskModelsConfig,
	resolveConfiguredTaskRoutes,
	type ModelTask,
	type ResolvedTaskRoute,
	type TaskRouteError,
} from "@henryqw/pi-task-models";

// Pi reloads extensions without a module cache, so process state keeps the warning once per session.
const WARNED_SESSION = Symbol.for("pi-herdr-tools/task-models-warned-session");

/** Resolve routes for `task`; profile errors name the feature, config errors keep pi-task-models' message. */
export function configuredTaskRoutes(ctx: ExtensionContext, task: ModelTask, label: string): ResolvedTaskRoute[] {
	try {
		return resolveConfiguredTaskRoutes(ctx, task);
	} catch (error) {
		const { taskRouteCode, profileName } = error as TaskRouteError;
		if (taskRouteCode === "profile-missing") throw new Error(`${label} task profile ${profileName} is not configured. Run /task-models.`);
		if (taskRouteCode === "no-route") throw new Error(`${label} task profile ${profileName} has no available route. Run /task-models.`);
		throw error;
	}
}

/** Warn at most once per session when the shared config cannot route `tasks`. */
export function registerTaskModelsWarning(pi: ExtensionAPI, tasks: readonly ModelTask[]): void {
	pi.on("session_start", (_event, ctx) => {
		const state = globalThis as { [WARNED_SESSION]?: string };
		const sessionId = ctx.sessionManager.getSessionId();
		if (state[WARNED_SESSION] === sessionId) return;
		let message: string | undefined;
		try {
			const config = loadTaskModelsConfig();
			if (config.source === "missing") {
				message = "Task model config is missing. Run /task-models to configure task routes.";
			} else {
				const missing = [...new Set(tasks.map((task) => config.value.tasks[task.id] ?? task.defaultProfile))]
					.filter((profile) => !config.value.profiles[profile]);
				if (missing.length) message = `Task model profile ${missing.join(", ")} is not configured. Run /task-models.`;
			}
		} catch {
			message = "Couldn't read task model config. Run /task-models.";
		}
		if (!message) return;
		state[WARNED_SESSION] = sessionId;
		ctx.ui.notify(message, "warning");
	});
}
