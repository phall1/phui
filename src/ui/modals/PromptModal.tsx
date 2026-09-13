import { colors } from "../colors.js"
import { fitCell, HintRow, PlainLine, standardModalDims, StandardModal, TextLine } from "../primitives.js"
import type { PromptModalState } from "./types.js"

const titles: Record<PromptModalState["kind"], string> = {
	reviewers: "Request reviewer",
	assignees: "Add assignee",
	"edit-pr": "Edit pull request",
	"create-pr": "Create pull request",
}

const hints: Record<PromptModalState["kind"], string> = {
	reviewers: "Username or org/team. Prefix with - to unrequest.",
	assignees: "GitHub login. Prefix with - to unassign.",
	"edit-pr": "Title in the prompt. Body is kept unless you type a replacement after |",
	"create-pr": "title | head | base  —  prefix with draft: to open as draft",
}

export const PromptModal = ({
	state,
	modalWidth,
	modalHeight,
	offsetLeft,
	offsetTop,
}: {
	state: PromptModalState
	modalWidth: number
	modalHeight: number
	offsetLeft: number
	offsetTop: number
}) => {
	const { contentWidth } = standardModalDims(modalWidth, modalHeight)
	const inputText = state.query.length > 0 ? state.query : hints[state.kind]
	return (
		<StandardModal
			left={offsetLeft}
			top={offsetTop}
			width={modalWidth}
			height={modalHeight}
			title={titles[state.kind]}
			headerRight={{ text: state.running ? "…" : "enter" }}
			subtitle={
				<TextLine>
					<span fg={colors.count}>› </span>
					<span fg={state.query.length > 0 ? colors.text : colors.muted}>{fitCell(inputText, Math.max(1, contentWidth - 2))}</span>
				</TextLine>
			}
			bodyPadding={1}
			footer={
				<HintRow
					items={[
						{ key: "enter", label: "submit" },
						{ key: "esc", label: "cancel" },
					]}
				/>
			}
		>
			{state.error ? <PlainLine text={fitCell(state.error, contentWidth)} fg={colors.error} /> : <PlainLine text={fitCell(hints[state.kind], contentWidth)} fg={colors.muted} />}
		</StandardModal>
	)
}
