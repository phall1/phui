import type { CommentModalCtx } from "../commentModal.ts"

export interface BuildCommentModalCtxInput {
	readonly closeActiveModal: () => void
	readonly queueComment: () => void
}

export const buildCommentModalCtx = ({ closeActiveModal, queueComment }: BuildCommentModalCtxInput): CommentModalCtx => ({
	closeModal: closeActiveModal,
	queueComment,
})
