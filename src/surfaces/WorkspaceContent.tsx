import { Match, Switch } from "solid-js"
import type { ScrollBoxRenderable, DiffRenderable } from "@opentui/core"
import type { MutableRefObject } from "../solid-hooks.js"
import type { DiffCommentSide, IssueItem, PullRequestComment, PullRequestItem, PullRequestReviewComment, RepositoryDetails } from "../domain.js"
import type { ThemeId } from "../ui/colors.js"
import type { DetailCommentsStatus, DetailPlaceholderContent } from "../ui/DetailsPane.js"
import type { DiffFilePatch, DiffView, DiffWhitespaceMode, DiffWrapMode, PullRequestDiffState, StackedDiffCommentAnchor, StackedDiffFilePatch } from "../ui/diff.js"
import type { ChangedFileSearchResult } from "../ui/modals/shared.js"
import type { OrderedComment } from "../ui/CommentsPane.js"
import type { CommentLoadState } from "../ui/comments/loadState.js"
import type { RepositoryListItem } from "../ui/RepoList.js"
import type { WorkspaceSurface } from "../workspaceSurfaces.js"
import type { WorkspaceLayout } from "../workspace/layout.js"
import type { WorkspaceDerivations } from "../workspace/derivations.js"
import { IssueSurface } from "./IssueSurface.js"
import { PullRequestSurface } from "./PullRequestSurface.js"
import type { RunsViewModel } from "../hooks/useRunsView.js"
import { RepoSurface } from "./RepoSurface.js"
import { ActionsSurface } from "./ActionsSurface.js"
import { ProjectsView } from "../projects/ProjectsView.js"
import { NotificationsView } from "../notifications/NotificationsView.js"
import { StarsView } from "../stars/StarsView.js"

export interface WorkspaceContentProps {
	readonly showScrollbars: boolean
	readonly activeWorkspaceSurface: WorkspaceSurface
	readonly commentsViewActive: boolean
	readonly diffFullView: boolean
	readonly runsView: RunsViewModel
	readonly actionsRunsView: RunsViewModel
	readonly selectedRepository: string | null
	readonly detailFullView: boolean
	readonly layout: WorkspaceLayout
	readonly derivations: WorkspaceDerivations
	readonly issueActiveFilterLabel: string | null
	readonly pullRequestActiveFilterLabel: string | null
	readonly selectedRepositoryItem: RepositoryListItem | null
	readonly selectedRepositoryDetails: RepositoryDetails | null
	readonly selectedIssue: IssueItem | null
	readonly selectedPullRequest: PullRequestItem | null
	readonly selectedComments: readonly PullRequestComment[]
	readonly selectedCommentsStatus: DetailCommentsStatus
	readonly selectedCommentsLoadState: CommentLoadState
	readonly detailPlaceholderContent: DetailPlaceholderContent
	readonly isSelectedPullRequestDetailLoading: boolean
	readonly isSelectedPullRequestDetailError: boolean
	readonly selectedPullRequestDetailError: string | null
	readonly commentsViewSelection: number
	readonly orderedComments: readonly OrderedComment[]
	readonly selectedCommentSubject: IssueItem | PullRequestItem | null
	readonly displayedDiffState: PullRequestDiffState | undefined
	readonly stackedDiffFiles: readonly StackedDiffFilePatch[]
	readonly diffScrollTop: number
	readonly effectiveDiffRenderView: DiffView
	readonly diffWhitespaceMode: DiffWhitespaceMode
	readonly diffWrapMode: DiffWrapMode
	readonly selectedDiffCommentAnchor: StackedDiffCommentAnchor | null
	readonly selectedDiffCommentLabel: string | null
	readonly selectedDiffCommentThread: readonly PullRequestReviewComment[]
	readonly selectDiffCommentLine: (renderLine: number, side: DiffCommentSide | null) => void
	readonly setDiffRenderableRef: (index: number, diff: DiffRenderable | null) => void
	readonly loadingIndicator: string
	readonly themeId: ThemeId
	readonly systemThemeGeneration: number
	readonly scrollRefs: {
		readonly prListScrollRef: MutableRefObject<ScrollBoxRenderable | null>
		readonly detailScrollRef: MutableRefObject<ScrollBoxRenderable | null>
		readonly detailPreviewScrollRef: MutableRefObject<ScrollBoxRenderable | null>
		readonly diffScrollRef: MutableRefObject<ScrollBoxRenderable | null>
		readonly issueListScrollRef: MutableRefObject<ScrollBoxRenderable | null>
	}
	readonly openInlineLink: (url: string) => void
	readonly showNotice: (message: string) => void
	readonly diffFilePanel: DiffFilePanelBundle
}

export interface DiffFilePanelBundle {
	readonly visible: boolean
	readonly width: number
	readonly diffPaneWidth: number
	readonly files: readonly DiffFilePatch[]
	readonly currentFileIndex: number
	readonly pickerActive: boolean
	readonly pickerQuery: string
	readonly pickerSelectedIndex: number
	readonly pickerResults: readonly ChangedFileSearchResult[]
	readonly onSelectFile: (index: number) => void
}

export const WorkspaceContent = (props: WorkspaceContentProps) => (
	<Switch>
		<Match when={props.activeWorkspaceSurface === "repos" && !props.commentsViewActive && !props.diffFullView && !props.detailFullView}>
			<RepoSurface
				showScrollbars={props.showScrollbars}
				isWideLayout={props.layout.isWideLayout}
				wideBodyHeight={props.layout.wideBodyHeight}
				contentWidth={props.layout.contentWidth}
				leftPaneWidth={props.layout.leftPaneWidth}
				rightPaneWidth={props.layout.rightPaneWidth}
				leftContentWidth={props.layout.leftContentWidth}
				fullscreenContentWidth={props.layout.fullscreenContentWidth}
				sectionPadding={props.layout.sectionPadding}
				narrowRepoListHeight={props.derivations.narrowRepoListHeight}
				narrowRepoDetailHeight={props.derivations.narrowRepoDetailHeight}
				repoListNeedsScroll={props.derivations.repoListNeedsScroll}
				narrowRepoListNeedsScroll={props.derivations.narrowRepoListNeedsScroll}
				repoListProps={props.derivations.repoListProps}
				selectedRepositoryItem={props.selectedRepositoryItem}
				selectedRepositoryDetails={props.selectedRepositoryDetails}
				detailPreviewScrollRef={props.scrollRefs.detailPreviewScrollRef}
			/>
		</Match>
		<Match when={props.activeWorkspaceSurface === "issues" && !props.commentsViewActive && !props.diffFullView}>
			<IssueSurface
				showScrollbars={props.showScrollbars}
				isWideLayout={props.layout.isWideLayout}
				wideBodyHeight={props.layout.wideBodyHeight}
				contentWidth={props.layout.contentWidth}
				leftPaneWidth={props.layout.leftPaneWidth}
				rightPaneWidth={props.layout.rightPaneWidth}
				leftContentWidth={props.layout.leftContentWidth}
				fullscreenContentWidth={props.layout.fullscreenContentWidth}
				sectionPadding={props.layout.sectionPadding}
				narrowIssueListHeight={props.derivations.narrowIssueListHeight}
				narrowIssueDetailHeight={props.derivations.narrowIssueDetailHeight}
				issueListNeedsScroll={props.derivations.issueListNeedsScroll}
				narrowIssueListNeedsScroll={props.derivations.narrowIssueListNeedsScroll}
				activeFilterLabel={props.issueActiveFilterLabel}
				issueJunctions={props.derivations.issueJunctions}
				issueListProps={props.derivations.issueListProps}
				selectedIssue={props.selectedIssue}
				issueListScrollRef={props.scrollRefs.issueListScrollRef}
				detailScrollRef={props.scrollRefs.detailScrollRef}
				detailPreviewScrollRef={props.scrollRefs.detailPreviewScrollRef}
				detailFullView={props.detailFullView}
				onLinkOpen={props.openInlineLink}
			/>
		</Match>
		<Match when={props.activeWorkspaceSurface === "projects"}>
			<ProjectsView
				contentWidth={props.layout.fullscreenContentWidth}
				height={props.layout.wideBodyHeight}
				loadingIndicator={props.loadingIndicator}
				showScrollbar={props.showScrollbars}
			/>
		</Match>
		<Match when={props.activeWorkspaceSurface === "notifications"}>
			<NotificationsView
				contentWidth={props.layout.fullscreenContentWidth}
				height={props.layout.wideBodyHeight}
				loadingIndicator={props.loadingIndicator}
				showScrollbar={props.showScrollbars}
				onNotice={props.showNotice}
			/>
		</Match>
		<Match when={props.activeWorkspaceSurface === "stars"}>
			<StarsView
				contentWidth={props.layout.fullscreenContentWidth}
				height={props.layout.wideBodyHeight}
				loadingIndicator={props.loadingIndicator}
				showScrollbar={props.showScrollbars}
				onNotice={props.showNotice}
			/>
		</Match>
		<Match when={props.activeWorkspaceSurface === "actions" && props.selectedRepository}>
			<ActionsSurface
				repository={props.selectedRepository ?? ""}
				runsView={props.actionsRunsView}
				contentWidth={props.layout.fullscreenContentWidth}
				height={props.layout.wideBodyHeight}
				loadingIndicator={props.loadingIndicator}
				showScrollbar={props.showScrollbars}
			/>
		</Match>
		<Match when={true}>
			<PullRequestSurface
				showScrollbars={props.showScrollbars}
				isWideLayout={props.layout.isWideLayout}
				contentWidth={props.layout.contentWidth}
				leftPaneWidth={props.layout.leftPaneWidth}
				rightPaneWidth={props.layout.rightPaneWidth}
				leftContentWidth={props.layout.leftContentWidth}
				rightContentWidth={props.layout.rightContentWidth}
				fullscreenContentWidth={props.layout.fullscreenContentWidth}
				sectionPadding={props.layout.sectionPadding}
				wideBodyHeight={props.layout.wideBodyHeight}
				wideDetailHeaderHeight={props.derivations.wideDetailHeaderHeight}
				wideDetailBodyScrollable={props.derivations.wideDetailBodyScrollable}
				wideDetailLines={props.layout.wideDetailLines}
				fullscreenDetailHeaderHeight={props.derivations.fullscreenDetailHeaderHeight}
				fullscreenDetailBodyScrollable={props.derivations.fullscreenDetailBodyScrollable}
				fullscreenBodyLines={props.layout.fullscreenBodyLines}
				widePullRequestListHeight={props.derivations.widePullRequestListHeight}
				widePullRequestListNeedsScroll={props.derivations.widePullRequestListNeedsScroll}
				narrowPullRequestListHeight={props.derivations.narrowPullRequestListHeight}
				narrowPullRequestRowsHeight={props.derivations.narrowPullRequestRowsHeight}
				narrowPullRequestListNeedsScroll={props.derivations.narrowPullRequestListNeedsScroll}
				narrowDetailsPaneHeight={props.derivations.narrowDetailsPaneHeight}
				narrowPreviewBodyHeight={props.derivations.narrowPreviewBodyHeight}
				narrowPreviewBodyScrollable={props.derivations.narrowPreviewBodyScrollable}
				activeFilterLabel={props.pullRequestActiveFilterLabel}
				detailJunctions={props.derivations.detailJunctions}
				prListProps={props.derivations.prListProps}
				selectedPullRequest={props.selectedPullRequest}
				selectedComments={props.selectedComments}
				selectedCommentsStatus={props.selectedCommentsStatus}
				selectedCommentsLoadState={props.selectedCommentsLoadState}
				detailPlaceholderContent={props.detailPlaceholderContent}
				isSelectedPullRequestDetailLoading={props.isSelectedPullRequestDetailLoading}
				isSelectedPullRequestDetailError={props.isSelectedPullRequestDetailError}
				selectedPullRequestDetailError={props.selectedPullRequestDetailError}
				commentsViewActive={props.commentsViewActive}
				commentsViewSelection={props.commentsViewSelection}
				orderedComments={props.orderedComments}
				commentSubject={props.selectedCommentSubject}
				diffFullView={props.diffFullView}
				runsView={props.runsView}
				displayedDiffState={props.displayedDiffState}
				stackedDiffFiles={props.stackedDiffFiles}
				diffScrollTop={props.diffScrollTop}
				effectiveDiffRenderView={props.effectiveDiffRenderView}
				diffWhitespaceMode={props.diffWhitespaceMode}
				diffWrapMode={props.diffWrapMode}
				selectedDiffCommentAnchor={props.selectedDiffCommentAnchor}
				selectedDiffCommentLabel={props.selectedDiffCommentLabel}
				selectedDiffCommentThread={props.selectedDiffCommentThread}
				selectDiffCommentLine={props.selectDiffCommentLine}
				setDiffRenderableRef={props.setDiffRenderableRef}
				detailFullView={props.detailFullView}
				loadingIndicator={props.loadingIndicator}
				themeId={props.themeId}
				systemThemeGeneration={props.systemThemeGeneration}
				prListScrollRef={props.scrollRefs.prListScrollRef}
				detailScrollRef={props.scrollRefs.detailScrollRef}
				detailPreviewScrollRef={props.scrollRefs.detailPreviewScrollRef}
				diffScrollRef={props.scrollRefs.diffScrollRef}
				onLinkOpen={props.openInlineLink}
				diffFilePanel={props.diffFilePanel}
			/>
		</Match>
	</Switch>
)
