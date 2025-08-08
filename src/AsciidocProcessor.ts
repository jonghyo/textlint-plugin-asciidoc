// LICENSE : MIT

import type { TextlintMessage, TextlintPluginOptions } from '@textlint/types'
import { parse } from './asciidoc-to-ast'

export class AsciidocProcessor {
	config: TextlintPluginOptions
	extensions: Array<string>

	constructor(config: TextlintPluginOptions = {}) {
		this.config = config
		this.extensions = (config.extensions as string[] | undefined) ?? []
	}

	availableExtensions() {
		return ['.adoc', '.asciidoc', '.asc'].concat(this.extensions)
	}

	processor(_ext: string) {
		return {
			preProcess(text: string, _filePath?: string) {
				return parse(text)
			},
			postProcess(messages: TextlintMessage[], filePath?: string) {
				return {
					messages,
					filePath: filePath ? filePath : '<asciidoc>',
				}
			},
		}
	}
}
