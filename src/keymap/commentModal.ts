import { context } from "@phui/keymap"

export interface CommentModalCtx {
	readonly closeModal: () => void
	readonly queueComment: () => void
}

const Comment = context<CommentModalCtx>()

export const commentModalKeymap = Comment(
	{ id: "comment.escape", title: "Cancel", keys: ["escape"], run: (s) => s.closeModal() },
	{ id: "comment.queue", title: "Add to pending review", keys: ["ctrl+return"], run: (s) => s.queueComment() },
)
