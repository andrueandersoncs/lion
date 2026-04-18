import { useCallback, useRef, useState } from "react";

interface UINode {
	readonly $ui: string;
	readonly props: Record<string, unknown>;
	readonly children: readonly (UINode | string | number | boolean)[];
}

export interface UIStreamMessage {
	readonly op: "replace" | "append" | "update" | "clear";
	readonly path?: string;
	readonly value: UINode | string | number | boolean | null;
	readonly timestamp: number;
}

// Navigate a UINode tree by slash-separated path (e.g., "children/2/children/0")
function navigatePath(
	root: Record<string, unknown>,
	path: string,
): Record<string, unknown> | null {
	const segments = path.split("/").filter(Boolean);
	let current: unknown = root;

	for (const segment of segments) {
		if (current === null || typeof current !== "object") return null;

		if (Array.isArray(current)) {
			const index = Number.parseInt(segment, 10);
			if (Number.isNaN(index)) return null;
			current = current[index];
		} else {
			current = (current as Record<string, unknown>)[segment];
		}
	}

	return current as Record<string, unknown> | null;
}

export function useUIStream() {
	const [ui, setUI] = useState<UINode | null>(null);
	const [isStreaming, setIsStreaming] = useState(false);
	const [messages, setMessages] = useState<UIStreamMessage[]>([]);
	const eventSourceRef = useRef<EventSource | null>(null);

	const applyMessage = useCallback((msg: UIStreamMessage) => {
		setMessages((prev) => [...prev, msg]);

		switch (msg.op) {
			case "replace":
				setUI(msg.value as UINode);
				break;

			case "append":
				setUI((prev) => {
					if (!prev) return msg.value as UINode;
					// Deep clone so React sees a new reference
					const next = JSON.parse(JSON.stringify(prev));

					if (msg.path) {
						const target = navigatePath(next, msg.path);
						if (target) {
							if (Array.isArray(target.children)) {
								target.children.push(msg.value);
							} else {
								target.children = [msg.value];
							}
						}
					} else {
						// Append to root children
						if (Array.isArray(next.children)) {
							next.children.push(msg.value);
						} else {
							next.children = [msg.value];
						}
					}
					return next;
				});
				break;

			case "update":
				setUI((prev) => {
					if (!prev) return prev;
					const next = JSON.parse(JSON.stringify(prev));
					if (msg.path) {
						const target = navigatePath(next, msg.path);
						if (
							target &&
							typeof msg.value === "object" &&
							msg.value !== null
						) {
							target.props = {
								...((target.props as Record<string, unknown>) ?? {}),
								...((msg.value as Record<string, unknown>).props ?? {}),
							};
						}
					}
					return next;
				});
				break;

			case "clear":
				setUI(null);
				break;
		}
	}, []);

	// Connect to an SSE endpoint
	const connectSSE = useCallback(
		(url: string) => {
			eventSourceRef.current?.close();
			setIsStreaming(true);
			setMessages([]);

			const es = new EventSource(url);
			eventSourceRef.current = es;

			es.onmessage = (event) => {
				try {
					const msg = JSON.parse(event.data) as UIStreamMessage;
					applyMessage(msg);
				} catch {
					// ignore parse errors
				}
			};

			es.onerror = () => {
				setIsStreaming(false);
				es.close();
			};

			es.addEventListener("done", () => {
				setIsStreaming(false);
				es.close();
			});
		},
		[applyMessage],
	);

	// Push a message directly (for local simulation)
	const pushMessage = useCallback(
		(msg: UIStreamMessage) => {
			applyMessage(msg);
		},
		[applyMessage],
	);

	const disconnect = useCallback(() => {
		eventSourceRef.current?.close();
		setIsStreaming(false);
	}, []);

	const reset = useCallback(() => {
		disconnect();
		setUI(null);
		setMessages([]);
	}, [disconnect]);

	return {
		ui,
		isStreaming,
		messages,
		setIsStreaming,
		connectSSE,
		pushMessage,
		disconnect,
		reset,
	};
}
