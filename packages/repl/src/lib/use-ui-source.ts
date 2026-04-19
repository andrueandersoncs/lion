/**
 * Source-as-state UI streaming.
 *
 * The client holds one document: `source`, a Lion expression tree.
 * Updates arrive as `Message` values; JSON-Patch ops mutate the tree.
 * A `useMemo` re-evaluates source against baseEnv and produces a React
 * element tree directly — no bindings indirection, no $ui intermediate.
 *
 * Live values live at specific paths inside the source and update in place.
 * To change a price, patch the leaf where the price sits.
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
	| { kind: "reset"; source: unknown }
	| { kind: "patch"; ops: Operation[] }
	| { kind: "clear" };

export interface SourceState {
	source: unknown | null;
	messages: Message[];
}

const initialState: SourceState = {
	source: null,
	messages: [],
};

const reducer = (state: SourceState, msg: Message): SourceState => {
	const messages = [...state.messages, msg];
	switch (msg.kind) {
		case "reset":
			return { source: msg.source, messages };
		case "patch": {
			if (state.source === null) return { ...state, messages };
			const cloned = deepClone(state.source);
			const result = applyPatch(cloned, msg.ops, false, false);
			return { ...state, source: result.newDocument, messages };
		}
		case "clear":
			return { ...initialState, messages };
	}
};

export interface UiSource {
	rendered: ReactNode;
	error: string | null;
	source: unknown | null;
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

	const baseEnvRef = useRef(baseEnv);
	baseEnvRef.current = baseEnv;

	const { rendered, error } = useMemo(() => {
		if (state.source === null) {
			return { rendered: null, error: null };
		}
		try {
			const value = Effect.runSync(run(state.source, baseEnvRef.current));
			return { rendered: toRenderable(value), error: null };
		} catch (e) {
			return {
				rendered: null,
				error: e instanceof Error ? e.message : String(e),
			};
		}
	}, [state.source]);

	const clear = useCallback(() => dispatch({ kind: "clear" }), []);

	return {
		rendered,
		error,
		source: state.source,
		messages: state.messages,
		dispatch,
		clear,
	};
};
