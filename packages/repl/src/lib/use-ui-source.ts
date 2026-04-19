/**
 * Source-as-state UI streaming.
 *
 * The client holds two documents:
 *   - `source`: a Lion expression tree (the program that renders the UI).
 *   - `bindings`: a flat record of live values referenced from `source`.
 *
 * Updates arrive as `Message` values; JSON-Patch ops mutate either document.
 * A `useMemo` re-evaluates source against (baseEnv ∪ bindings) and produces
 * a React element tree directly — no $ui intermediate, no custom renderer.
 */

import { Effect } from "effect";
import jsonPatch, { type Operation } from "fast-json-patch";

const { applyPatch, deepClone } = jsonPatch;
import {
	type ReactNode,
	isValidElement,
	useCallback,
	useMemo,
	useReducer,
	useRef,
} from "react";
import { run } from "@lionlang/core/evaluation/evaluate";

export type Message =
	| { kind: "reset"; source: unknown; bindings?: Record<string, unknown> }
	| { kind: "source-patch"; ops: Operation[] }
	| { kind: "bindings-patch"; ops: Operation[] }
	| { kind: "clear" };

export interface SourceState {
	source: unknown | null;
	bindings: Record<string, unknown>;
	messages: Message[];
}

const initialState: SourceState = {
	source: null,
	bindings: {},
	messages: [],
};

const reducer = (state: SourceState, msg: Message): SourceState => {
	const messages = [...state.messages, msg];
	switch (msg.kind) {
		case "reset":
			return {
				source: msg.source,
				bindings: msg.bindings ?? {},
				messages,
			};
		case "source-patch": {
			if (state.source === null) return { ...state, messages };
			const cloned = deepClone(state.source);
			const result = applyPatch(cloned, msg.ops, false, false);
			return { ...state, source: result.newDocument, messages };
		}
		case "bindings-patch": {
			const cloned = deepClone(state.bindings);
			const result = applyPatch(cloned, msg.ops, false, false);
			return {
				...state,
				bindings: result.newDocument as Record<string, unknown>,
				messages,
			};
		}
		case "clear":
			return { ...initialState, messages };
	}
};

export interface UiSource {
	rendered: ReactNode;
	error: string | null;
	source: unknown | null;
	bindings: Record<string, unknown>;
	messages: Message[];
	dispatch: (msg: Message) => void;
	clear: () => void;
}

const toRenderable = (value: unknown): ReactNode => {
	if (value === null || value === undefined) return null;
	if (typeof value === "boolean") return null;
	if (typeof value === "string" || typeof value === "number") return value;
	if (isValidElement(value)) return value;
	if (Array.isArray(value)) return value.map((v) => toRenderable(v));
	return JSON.stringify(value);
};

export const useUiSource = (baseEnv: Record<string, unknown>): UiSource => {
	const [state, dispatch] = useReducer(reducer, initialState);

	// Keep a stable ref to baseEnv so callers can construct it inline.
	const baseEnvRef = useRef(baseEnv);
	baseEnvRef.current = baseEnv;

	const { rendered, error } = useMemo(() => {
		if (state.source === null) {
			return { rendered: null, error: null };
		}
		try {
			const env = { ...baseEnvRef.current, ...state.bindings };
			const value = Effect.runSync(run(state.source, env));
			return { rendered: toRenderable(value), error: null };
		} catch (e) {
			return {
				rendered: null,
				error: e instanceof Error ? e.message : String(e),
			};
		}
	}, [state.source, state.bindings]);

	const clear = useCallback(() => dispatch({ kind: "clear" }), []);

	return {
		rendered,
		error,
		source: state.source,
		bindings: state.bindings,
		messages: state.messages,
		dispatch,
		clear,
	};
};
