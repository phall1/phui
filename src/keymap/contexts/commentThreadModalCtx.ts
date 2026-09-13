import type { CommentThreadModalCtx } from "../commentThreadModal.ts"

export interface BuildCommentThreadModalCtxInput {
	readonly halfPage: number
	readonly closeActiveModal: () => void
	readonly openDiffCommentModal: () => void
	readonly scrollCommentThread: (delta: number) => void
	readonly toggleResolve: () => void
}

export const buildCommentThreadModalCtx = ({
	halfPage,
	closeActiveModal,
	openDiffCommentModal,
	scrollCommentThread,
	toggleResolve,
}: BuildCommentThreadModalCtxInput): CommentThreadModalCtx => ({
	halfPage,
	closeModal: closeActiveModal,
	openInlineComment: openDiffCommentModal,
	scrollBy: scrollCommentThread,
	toggleResolve,
})
