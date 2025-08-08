import path from 'node:path'

import { defineConfig, type UserConfig } from 'vite'
import type { InlineConfig } from 'vitest/node'

type ViteConfig = UserConfig & { test: InlineConfig }

const config = {
	test: {
		globals: true,
		clearMocks: true,
		passWithNoTests: true,
		watch: false,
		include: ['test/**/*.test.ts'],
		exclude: ['node_modules', 'lib', 'module'],
		reporters: ['html', 'junit', 'default'],
		outputFile: {
			html: './reports/vitest-report.html',
			junit: './reports/vitest-report.xml',
		},
		coverage: {
			provider: 'v8',
			reporter: [
				'cobertura',
				'lcov',
				'json',
				'html',
				'text',
				'text-summary',
				'json-summary',
			],
			reportsDirectory: 'coverage',
			exclude: ['node_modules', 'lib', 'module'],
			reportOnFailure: true,
			watermarks: {
				lines: [50, 80],
				functions: [50, 80],
				branches: [50, 80],
				statements: [50, 80],
			},
			all: true,
		},
	},
	resolve: {
		alias: [{ find: '@', replacement: path.resolve(__dirname, './src') }],
	},
} satisfies ViteConfig

export default defineConfig(config)
