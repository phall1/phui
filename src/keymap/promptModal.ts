import { context } from "@phui/keymap"
import { confirmModalBindings } from "./helpers.js"

export interface PromptModalCtx {
	readonly closeModal: () => void
	readonly confirmPrompt: () => void
}

const Prompt = context<PromptModalCtx>()

export const promptModalKeymap = Prompt(
	...confirmModalBindings<PromptModalCtx>({
		id: "prompt",
		close: (s) => s.closeModal(),
		confirm: { title: "Confirm", run: (s) => s.confirmPrompt() },
	}),
)
