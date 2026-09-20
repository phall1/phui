import type { ScrollBoxRenderable } from "@opentui/core"
import type { ComponentProps, MutableRefObject } from "../solid-hooks.js"
import type { RepositoryDetails } from "../domain.js"
import { DETAIL_BODY_SCROLL_LIMIT } from "../ui/DetailsPane.js"
import { SplitPane } from "../ui/paneLayout.js"
import { Divider } from "../ui/primitives.js"
import { getRepoDetailJunctionRows, RepoDetailPane, RepoList, type RepositoryListItem } from "../ui/RepoList.js"
import { shouldShowNarrowDetailPreview } from "../workspace/layout.js"

export interface RepoSurfaceProps {
	readonly showScrollbars: boolean
	readonly isWideLayout: boolean
	readonly wideBodyHeight: number
	readonly contentWidth: number
	readonly leftPaneWidth: number
	readonly rightPaneWidth: number
	readonly leftContentWidth: number
	readonly fullscreenContentWidth: number
	readonly sectionPadding: number
	readonly narrowRepoListHeight: number
	readonly narrowRepoDetailHeight: number
	readonly repoListNeedsScroll: boolean
	readonly narrowRepoListNeedsScroll: boolean
	readonly repoListProps: Omit<ComponentProps<typeof RepoList>, "contentWidth">
	readonly selectedRepositoryItem: RepositoryListItem | null
	readonly selectedRepositoryDetails: RepositoryDetails | null
	readonly detailPreviewScrollRef: MutableRefObject<ScrollBoxRenderable | null>
}

export const RepoSurface = ({
	showScrollbars,
	isWideLayout,
	wideBodyHeight,
	contentWidth,
	leftPaneWidth,
	rightPaneWidth,
	leftContentWidth,
	fullscreenContentWidth,
	sectionPadding,
	narrowRepoListHeight,
	narrowRepoDetailHeight,
	repoListNeedsScroll,
	narrowRepoListNeedsScroll,
	repoListProps,
	selectedRepositoryItem,
	selectedRepositoryDetails,
	detailPreviewScrollRef,
}: RepoSurfaceProps) => {
	if (isWideLayout) {
		return (
			<SplitPane
				key="wide-repos"
				height={wideBodyHeight}
				leftWidth={leftPaneWidth}
				rightWidth={rightPaneWidth}
				junctionRows={getRepoDetailJunctionRows(selectedRepositoryItem, selectedRepositoryDetails)}
				left={
					repoListNeedsScroll ? (
						<scrollbox focusable={false} height={wideBodyHeight} flexGrow={0} verticalScrollbarOptions={{ visible: showScrollbars }}>
							<box flexDirection="column" paddingLeft={sectionPadding}>
								<RepoList {...repoListProps} contentWidth={leftContentWidth} />
							</box>
						</scrollbox>
					) : (
						<box height={wideBodyHeight} flexDirection="column" paddingLeft={sectionPadding}>
							<RepoList {...repoListProps} contentWidth={leftContentWidth} />
						</box>
					)
				}
				right={
					<RepoDetailPane repository={selectedRepositoryItem} details={selectedRepositoryDetails} width={rightPaneWidth} height={wideBodyHeight} showScrollbar={showScrollbars} />
				}
			/>
		)
	}

	const showPreview = shouldShowNarrowDetailPreview(narrowRepoDetailHeight)
	const repoListHeight = showPreview ? narrowRepoListHeight : wideBodyHeight
	const repoListPane =
		narrowRepoListNeedsScroll || !showPreview ? (
			<scrollbox focusable={false} height={repoListHeight} flexGrow={0} verticalScrollbarOptions={{ visible: showScrollbars }}>
				<box flexDirection="column" paddingLeft={sectionPadding} paddingRight={sectionPadding}>
					<RepoList {...repoListProps} contentWidth={fullscreenContentWidth} />
				</box>
			</scrollbox>
		) : (
			<box height={repoListHeight} flexDirection="column" paddingLeft={sectionPadding} paddingRight={sectionPadding}>
				<RepoList {...repoListProps} contentWidth={fullscreenContentWidth} />
			</box>
		)
	if (!showPreview) {
		return (
			<box key="narrow-repos" height={wideBodyHeight} flexDirection="column">
				{repoListPane}
			</box>
		)
	}

	return (
		<box key="narrow-repos" height={wideBodyHeight} flexDirection="column">
			{repoListPane}
			<Divider width={contentWidth} />
			<RepoDetailPane
				repository={selectedRepositoryItem}
				details={selectedRepositoryDetails}
				width={contentWidth}
				height={narrowRepoDetailHeight}
				descriptionLineLimit={DETAIL_BODY_SCROLL_LIMIT}
				descriptionScrollRef={detailPreviewScrollRef}
				showScrollbar={showScrollbars}
			/>
		</box>
	)
}
