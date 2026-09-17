import { createFileRoute } from "@tanstack/react-router";
import { GraphEditor } from "@/editor/editor";

export const Route = createFileRoute("/")({ component: GraphEditor });
