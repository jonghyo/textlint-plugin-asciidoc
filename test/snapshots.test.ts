import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { parse } from '../src/asciidoc-to-ast'

const fixturesDir = path.join(__dirname, 'snapshot_fixtures')

describe('Snapshot testing', () => {
	fs.readdirSync(fixturesDir).map((caseName: string) => {
		const normalizedTestName = caseName.replace(/-/g, ' ')
		test(`Test Snapshot:${normalizedTestName}`, () => {
			const fixtureFileName = path.join(fixturesDir, caseName)
			const actualContent = fs.readFileSync(fixtureFileName, 'utf-8')
			const actual = parse(actualContent)
			expect(actual).toMatchSnapshot()
		})
	})
})
