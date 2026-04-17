import path from "node:path";
import { defineConfig } from "vitest/config";

const coreSrc = path.resolve(import.meta.dirname, "../core/src");

export default defineConfig({
	resolve: {
		alias: [
			{ find: "@", replacement: path.resolve(import.meta.dirname, "src") },
			{
				find: /^@lionlang\/core\/(.*)$/,
				replacement: `${coreSrc}/$1`,
			},
		],
	},
	test: {
		include: ["src/**/*.test.ts"],
	},
});
