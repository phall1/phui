import { colors } from "./colors.js"

export const SubjectMetaLine = (props: {
	readonly number: number
	readonly author: string
	readonly dateText: string
	readonly commentsText?: string | null
	readonly contentWidth: number
}) => {
	const leftText = `#${props.number} by ${props.author} ${props.dateText}`
	const commentsGap = props.commentsText ? Math.max(2, props.contentWidth - leftText.length - props.commentsText.length) : 0
	return (
		<>
			<span fg={colors.count}>#{props.number}</span>
			<span fg={colors.muted}> by </span>
			<span fg={colors.count}>{props.author}</span>
			<span fg={colors.muted}> {props.dateText}</span>
			{props.commentsText ? <span fg={colors.muted}>{" ".repeat(commentsGap)}</span> : null}
			{props.commentsText ? <span fg={colors.muted}>{props.commentsText}</span> : null}
		</>
	)
}
