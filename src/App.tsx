import { Show } from "solid-js"
import { useAtomValue as useAtomValueSolid } from "@effect/atom-solid"
import { useTerminalDimensions } from "@opentui/solid"
import type { PhuiLaunchIntent } from "./launchIntent.js"
import { colors } from "./ui/colors.js"
import { centerCell, Divider, TextLine } from "./ui/primitives.js"
import { WorkspaceTabs } from "./ui/WorkspaceTabs.js"
import { WorkspaceContent } from "./surfaces/WorkspaceContent.js"
import { WorkspaceFooter } from "./surfaces/WorkspaceFooter.js"
import { WorkspaceHeader } from "./surfaces/WorkspaceHeader.js"
import { WorkspaceModals } from "./surfaces/WorkspaceModals.js"
import { useAppShell } from "./hooks/useAppShell.js"
import { isTerminalTooSmall } from "./workspace/layout.js"
import { commentsViewActiveAtom, selectedCommentsAtom, selectedCommentsStatusAtom } from "./ui/comments/atoms.js"
import { detailFullViewAtom } from "./ui/detail/atoms.js"
import { diffFullViewAtom, readyDiffFilesAtom, selectedDiffStateAtom } from "./ui/diff/atoms.js"
import { buildStackedDiffFiles, PullRequestDiffState } from "./ui/diff.js"
import { filterDraftAtom, filterModeAtom, filterQueryAtom } from "./ui/filter/atoms.js"
import { activeModalAtom } from "./ui/modals/atoms.js"
import { selectedPullRequestAtom, visibleGroupsAtom } from "./ui/pullRequests/atoms.js"
import { runsFullViewAtom } from "./ui/runs/atoms.js"
import { selectedRepositoryAtom, workspaceSurfaceAtom, workspaceTabSurfacesAtom } from "./workspace/atoms.js"

const defaultLaunchIntent: PhuiLaunchIntent = { _tag: "Default" }

interface AppProps {
	readonly systemThemeGeneration?: number
	readonly launchIntent?: PhuiLaunchIntent
}

/**
 * Top-level render manifest. All state, hooks, derivations, atom
 * subscriptions, keymap wiring, and side-effects live inside
 * `useAppShell`; this component is purely the JSX layout that consumes the
 * shell bundle. `shell` is a Solid accessor over a memo, so its values (and
 * the terminal size they are derived from) stay live.
 */
export const App = ({ systemThemeGeneration = 0, launchIntent = defaultLaunchIntent }: AppProps) => {
	const dimensions = useTerminalDimensions()
	const shell = useAppShell({ systemThemeGeneration, launchIntent })
	const selectedPullRequest = useAtomValueSolid(() => selectedPullRequestAtom)
	const activeWorkspaceSurface = useAtomValueSolid(() => workspaceSurfaceAtom)
	const selectedRepository = useAtomValueSolid(() => selectedRepositoryAtom)
	const workspaceTabSurfaces = useAtomValueSolid(() => workspaceTabSurfacesAtom)
	const activeModal = useAtomValueSolid(() => activeModalAtom)
	const commentsViewActive = useAtomValueSolid(() => commentsViewActiveAtom)
	const selectedComments = useAtomValueSolid(() => selectedCommentsAtom)
	const selectedCommentsStatus = useAtomValueSolid(() => selectedCommentsStatusAtom)
	const detailFullView = useAtomValueSolid(() => detailFullViewAtom)
	const diffFullView = useAtomValueSolid(() => diffFullViewAtom)
	const runsFullView = useAtomValueSolid(() => runsFullViewAtom)
	const selectedDiffState = useAtomValueSolid(() => selectedDiffStateAtom)
	const readyDiffFiles = useAtomValueSolid(() => readyDiffFilesAtom)
	const visibleGroups = useAtomValueSolid(() => visibleGroupsAtom)
	const filterMode = useAtomValueSolid(() => filterModeAtom)
	const filterQuery = useAtomValueSolid(() => filterQueryAtom)
	const filterDraft = useAtomValueSolid(() => filterDraftAtom)
	const showWorkspaceTabs = () => !detailFullView() && !diffFullView() && !runsFullView() && !commentsViewActive()

	return (
		<Show
			when={!isTerminalTooSmall(dimensions().width, dimensions().height)}
			fallback={
				<box width={dimensions().width} height={dimensions().height} flexDirection="column" justifyContent="center" backgroundColor={colors.background}>
					<TextLine width={dimensions().width}>{centerCell("Terminal too small", dimensions().width)}</TextLine>
					<TextLine width={dimensions().width}>{centerCell(`Need 60x16; current ${dimensions().width}x${dimensions().height}`, dimensions().width)}</TextLine>
					<TextLine width={dimensions().width}>{centerCell("Resize to continue", dimensions().width)}</TextLine>
				</box>
			}
		>
			<box width={dimensions().width} height={dimensions().height} flexDirection="column" backgroundColor={colors.background}>
				<box paddingLeft={1} paddingRight={1} flexDirection="column" backgroundColor={colors.background}>
					<box width={shell().headerFooterWidth} height={1} flexDirection="row">
						<WorkspaceHeader {...shell().headerProps} />
						{shell().headerRight ? (
							<TextLine width={shell().headerRight.length}>
								<span fg={colors.muted}>{shell().headerRight}</span>
							</TextLine>
						) : null}
					</box>
				</box>
				<Divider width={shell().contentWidth} junctions={shell().workspaceTopDividerJunctions} />
				{showWorkspaceTabs() ? (
					<>
						<box paddingRight={1} backgroundColor={colors.background}>
							<WorkspaceTabs
								activeSurface={activeWorkspaceSurface()}
								width={Math.max(24, shell().contentWidth - 1)}
								surfaces={workspaceTabSurfaces()}
								counts={shell().workspaceTabCounts}
								onSelect={shell().switchWorkspaceSurface}
							/>
						</box>
						<Divider width={shell().contentWidth} junctions={shell().workspaceBottomDividerJunctions} />
					</>
				) : null}
				<WorkspaceContent
					{...shell().contentProps}
					activeWorkspaceSurface={activeWorkspaceSurface()}
					selectedRepository={selectedRepository()}
					selectedPullRequest={selectedPullRequest()}
					commentsViewActive={commentsViewActive()}
					diffFullView={diffFullView()}
					detailFullView={detailFullView()}
					selectedComments={selectedComments()}
					selectedCommentsStatus={selectedCommentsStatus()}
					displayedDiffState={
						selectedDiffState()?._tag === "Ready"
							? PullRequestDiffState.Ready({
									patch: readyDiffFiles()
										.map((file) => file.patch)
										.join("\n"),
									files: readyDiffFiles(),
								})
							: selectedDiffState()
					}
					stackedDiffFiles={buildStackedDiffFiles(
						readyDiffFiles(),
						shell().contentProps.effectiveDiffRenderView,
						shell().contentProps.diffWrapMode,
						shell().contentProps.diffFilePanel.visible ? shell().contentProps.diffFilePanel.diffPaneWidth : shell().contentWidth,
					)}
					derivations={{
						...shell().contentProps.derivations,
						prListProps: {
							...shell().contentProps.derivations.prListProps,
							groups: visibleGroups(),
							selectedUrl: selectedPullRequest()?.url ?? shell().contentProps.derivations.prListProps.selectedUrl,
							filterText: filterMode() ? filterDraft() : filterQuery(),
							showRepositoryGroups: selectedRepository() === null,
						},
					}}
				/>
				<Divider width={shell().contentWidth} junctions={shell().preFooterDividerJunctions} />
				<WorkspaceFooter
					{...shell().footerProps}
					filterMode={filterMode()}
					visibleFilterText={filterMode() ? filterDraft() : filterQuery()}
					detailFullView={detailFullView()}
					diffFullView={diffFullView()}
				/>
				<WorkspaceModals {...shell().modalsProps} activeModal={activeModal()} />
			</box>
		</Show>
	)
}
