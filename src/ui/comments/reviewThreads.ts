import type { ReviewThread } from "../../domain.js"

/** Root of a displayed diff thread: first unreplied comment, else the first row. */
export const threadRootCommentId = (comments: readonly { readonly id: string; readonly inReplyTo: string | null }[]): string | null =>
	comments.find((comment) => comment.inReplyTo === null)?.id ?? comments[0]?.id ?? null

/** Match a GraphQL review thread to one of the comment REST ids currently in view. */
export const matchReviewThread = (threads: readonly ReviewThread[], commentIds: readonly string[]): ReviewThread | null => {
	const ids = new Set(commentIds.filter((id) => id.length > 0))
	if (ids.size === 0) return null
	return threads.find((thread) => thread.rootCommentId !== null && ids.has(thread.rootCommentId)) ?? null
}

export const resolveTargetCommentIds = (options: { readonly threadModalRootId: string | null; readonly selectedOrderedCommentId: string | null }): readonly string[] => {
	if (options.threadModalRootId) return [options.threadModalRootId]
	if (options.selectedOrderedCommentId) return [options.selectedOrderedCommentId]
	return []
}
