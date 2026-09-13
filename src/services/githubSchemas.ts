// Schemas + GraphQL document strings for the GitHub seam.
//
// Kept separate from the service so the service file is implementation, not
// data declarations. Every `Schema.Struct` and every GraphQL query/fragment
// the service uses lives here, plus the derived type aliases callers may need.

import { Schema } from "effect"
import { DiffCommentSide } from "../domain.js"

// ---------------------------------------------------------------------------
// Field-level building blocks
// ---------------------------------------------------------------------------

const NullableString = Schema.NullOr(Schema.String)
const OptionalNullableString = Schema.optionalKey(NullableString)
const OptionalNullableNumber = Schema.optionalKey(Schema.NullOr(Schema.Number))

export const RawCheckContextSchema = Schema.Union([
	Schema.Struct({
		__typename: Schema.tag("CheckRun"),
		name: OptionalNullableString,
		status: OptionalNullableString,
		conclusion: OptionalNullableString,
	}),
	Schema.Struct({
		__typename: Schema.tag("StatusContext"),
		context: OptionalNullableString,
		state: OptionalNullableString,
	}),
]).pipe(Schema.toTaggedUnion("__typename"))

const RawAuthorSchema = Schema.NullOr(Schema.Struct({ login: Schema.String }))
const RawRepositorySchema = Schema.Struct({
	nameWithOwner: Schema.String,
	defaultBranchRef: Schema.optionalKey(Schema.NullOr(Schema.Struct({ name: Schema.String }))),
})
const RawLabelSchema = Schema.Struct({
	name: Schema.String,
	color: OptionalNullableString,
})

// Fields every GraphQL search-node ("... on PullRequest", "... on Issue") shares.
const RawItemSearchCommonFields = {
	number: Schema.Number,
	title: Schema.String,
	state: Schema.String,
	createdAt: Schema.String,
	closedAt: OptionalNullableString,
	url: Schema.String,
	author: RawAuthorSchema,
	repository: RawRepositorySchema,
} as const

export const RawIssueSearchNodeSchema = Schema.Struct({
	...RawItemSearchCommonFields,
	updatedAt: Schema.String,
	body: Schema.optionalKey(Schema.String),
	labels: Schema.Struct({ nodes: Schema.Array(RawLabelSchema) }),
	comments: Schema.Struct({ totalCount: Schema.Number }),
})

const RawStatusCheckRollupSchema = Schema.Struct({
	contexts: Schema.Struct({ nodes: Schema.Array(RawCheckContextSchema) }),
})

const RawPullRequestSummaryFields = {
	...RawItemSearchCommonFields,
	updatedAt: Schema.String,
	isDraft: Schema.Boolean,
	reviewDecision: NullableString,
	autoMergeRequest: Schema.NullOr(Schema.Unknown),
	merged: Schema.Boolean,
	headRefOid: Schema.String,
	headRefName: Schema.String,
	baseRefName: Schema.String,
} as const

export const RawPullRequestSummaryNodeSchema = Schema.Struct({
	...RawPullRequestSummaryFields,
	statusCheckRollup: Schema.optionalKey(Schema.NullOr(RawStatusCheckRollupSchema)),
})

export const RawPullRequestNodeSchema = Schema.Struct({
	...RawPullRequestSummaryFields,
	body: Schema.String,
	labels: Schema.Struct({ nodes: Schema.Array(RawLabelSchema) }),
	additions: Schema.Number,
	deletions: Schema.Number,
	changedFiles: Schema.Number,
	statusCheckRollup: Schema.optionalKey(Schema.NullOr(RawStatusCheckRollupSchema)),
})

// ---------------------------------------------------------------------------
// GraphQL response wrappers
// ---------------------------------------------------------------------------

const PageInfoSchema = Schema.Struct({
	hasNextPage: Schema.Boolean,
	endCursor: NullableString,
})

export const PullRequestDetailResponseSchema = Schema.Struct({
	data: Schema.Struct({
		repository: Schema.NullOr(
			Schema.Struct({
				pullRequest: Schema.NullOr(RawPullRequestNodeSchema),
			}),
		),
	}),
})

export const SearchResponseSchema = <Item extends Schema.Top>(item: Item) =>
	Schema.Struct({
		data: Schema.Struct({
			search: Schema.Struct({
				nodes: Schema.Array(Schema.NullOr(item)),
				pageInfo: PageInfoSchema,
			}),
		}),
	})

export const RepositoryPullRequestsResponseSchema = Schema.Struct({
	data: Schema.Struct({
		repository: Schema.NullOr(
			Schema.Struct({
				pullRequests: Schema.Struct({
					nodes: Schema.Array(Schema.NullOr(RawPullRequestSummaryNodeSchema)),
					pageInfo: PageInfoSchema,
				}),
			}),
		),
	}),
})

export const ViewerSchema = Schema.Struct({ login: Schema.String })

export const RepositoryMergeMethodsResponseSchema = Schema.Struct({
	squashMergeAllowed: Schema.Boolean,
	mergeCommitAllowed: Schema.Boolean,
	rebaseMergeAllowed: Schema.Boolean,
})

export const MergeInfoResponseSchema = Schema.Struct({
	number: Schema.Number,
	title: Schema.String,
	state: Schema.String,
	isDraft: Schema.Boolean,
	mergeable: Schema.String,
	reviewDecision: NullableString,
	autoMergeRequest: Schema.NullOr(Schema.Unknown),
	statusCheckRollup: Schema.Array(RawCheckContextSchema),
})

export const PullRequestAdminMergeResponseSchema = Schema.Struct({
	data: Schema.Struct({
		repository: Schema.Struct({
			pullRequest: Schema.NullOr(Schema.Struct({ viewerCanMergeAsAdmin: Schema.Boolean })),
		}),
	}),
})

export const RepositoryDetailsResponseSchema = Schema.Struct({
	data: Schema.Struct({
		repository: Schema.NullOr(
			Schema.Struct({
				description: NullableString,
				url: Schema.String,
				stargazerCount: Schema.Number,
				forkCount: Schema.Number,
				isArchived: Schema.Boolean,
				isPrivate: Schema.Boolean,
				pushedAt: NullableString,
				defaultBranchRef: Schema.NullOr(Schema.Struct({ name: Schema.String })),
				openIssues: Schema.Struct({ totalCount: Schema.Number }),
				openPRs: Schema.Struct({ totalCount: Schema.Number }),
			}),
		),
	}),
})

// ---------------------------------------------------------------------------
// Workflow run schemas (`gh run list` / `gh run view --json jobs`)
// ---------------------------------------------------------------------------

export const RawRunStepSchema = Schema.Struct({
	number: Schema.Number,
	name: Schema.String,
	status: Schema.String,
	conclusion: NullableString,
	startedAt: OptionalNullableString,
	completedAt: OptionalNullableString,
})

export const RawRunJobSchema = Schema.Struct({
	databaseId: Schema.Number,
	name: Schema.String,
	status: Schema.String,
	conclusion: NullableString,
	startedAt: OptionalNullableString,
	completedAt: OptionalNullableString,
	url: OptionalNullableString,
	steps: Schema.optionalKey(Schema.NullOr(Schema.Array(RawRunStepSchema))),
})

export const RawWorkflowRunSchema = Schema.Struct({
	databaseId: Schema.Number,
	number: Schema.Number,
	attempt: OptionalNullableNumber,
	workflowName: OptionalNullableString,
	name: OptionalNullableString,
	displayTitle: OptionalNullableString,
	event: OptionalNullableString,
	headBranch: OptionalNullableString,
	headSha: OptionalNullableString,
	status: Schema.String,
	conclusion: NullableString,
	url: OptionalNullableString,
	createdAt: Schema.String,
	startedAt: OptionalNullableString,
	updatedAt: OptionalNullableString,
})

export const WorkflowRunListSchema = Schema.Array(RawWorkflowRunSchema)

export const WorkflowRunDetailsSchema = Schema.Struct({
	...RawWorkflowRunSchema.fields,
	jobs: Schema.optionalKey(Schema.NullOr(Schema.Array(RawRunJobSchema))),
})

export type RawWorkflowRun = typeof RawWorkflowRunSchema.Type
export type RawRunStep = typeof RawRunStepSchema.Type
export type RawRunJob = typeof RawRunJobSchema.Type
export type RawWorkflowRunDetails = typeof WorkflowRunDetailsSchema.Type

// ---------------------------------------------------------------------------
// Comment / file schemas (REST shapes)
// ---------------------------------------------------------------------------

export const PullRequestCommentSchema = Schema.Struct({
	id: Schema.optionalKey(Schema.NullOr(Schema.Union([Schema.Number, Schema.String]))),
	node_id: OptionalNullableString,
	body: OptionalNullableString,
	html_url: OptionalNullableString,
	url: OptionalNullableString,
	created_at: OptionalNullableString,
	user: Schema.optionalKey(
		Schema.NullOr(
			Schema.Struct({
				login: OptionalNullableString,
			}),
		),
	),
	path: OptionalNullableString,
	line: OptionalNullableNumber,
	original_line: OptionalNullableNumber,
	side: Schema.optionalKey(Schema.NullOr(DiffCommentSide)),
	in_reply_to_id: Schema.optionalKey(Schema.NullOr(Schema.Union([Schema.Number, Schema.String]))),
})

export const PullRequestFileSchema = Schema.Struct({
	filename: Schema.String,
	previous_filename: OptionalNullableString,
	status: OptionalNullableString,
	patch: OptionalNullableString,
})

export const CommentsResponseSchema = Schema.Union([Schema.Array(PullRequestCommentSchema), Schema.Array(Schema.Array(PullRequestCommentSchema))])

export const PullRequestFilesResponseSchema = Schema.Union([Schema.Array(PullRequestFileSchema), Schema.Array(Schema.Array(PullRequestFileSchema))])

export const RepoLabelsResponseSchema = Schema.Array(
	Schema.Struct({
		name: Schema.String,
		color: Schema.String,
	}),
)

// ---------------------------------------------------------------------------
// Derived type aliases
// ---------------------------------------------------------------------------

export type RawPullRequestSummaryNode = Schema.Schema.Type<typeof RawPullRequestSummaryNodeSchema>
export type RawPullRequestNode = Schema.Schema.Type<typeof RawPullRequestNodeSchema>
export type RawCheckContext = Schema.Schema.Type<typeof RawCheckContextSchema>
export type RawPullRequestComment = Schema.Schema.Type<typeof PullRequestCommentSchema>
export type RawPullRequestFile = Schema.Schema.Type<typeof PullRequestFileSchema>
export type RawIssueSearchNode = Schema.Schema.Type<typeof RawIssueSearchNodeSchema>

export type SearchResponse<Item> = {
	readonly data: {
		readonly search: {
			readonly nodes: readonly (Item | null)[]
			readonly pageInfo: {
				readonly hasNextPage: boolean
				readonly endCursor: string | null
			}
		}
	}
}

export type PullRequestConnection<Item> = {
	readonly nodes: readonly (Item | null)[]
	readonly pageInfo: {
		readonly hasNextPage: boolean
		readonly endCursor: string | null
	}
}

// ---------------------------------------------------------------------------
// GraphQL fragments + documents
// ---------------------------------------------------------------------------

const STATUS_CHECK_FRAGMENT = `
        statusCheckRollup {
          contexts(first: 100) {
            nodes {
              __typename
              ... on CheckRun { name status conclusion }
              ... on StatusContext { context state }
            }
          }
        }`

const SUMMARY_FIELDS_FRAGMENT = `
        number
        title
        isDraft
        reviewDecision
        autoMergeRequest { enabledAt }
        state
        merged
        createdAt
        updatedAt
        closedAt
        url
        author { login }
        headRefOid
        headRefName
        baseRefName
		repository { nameWithOwner defaultBranchRef { name } }`

// Compose detail from summary — keeps the two in lock-step on field renames.
const DETAIL_FIELDS_FRAGMENT = `${SUMMARY_FIELDS_FRAGMENT}
		body
		additions
		deletions
		changedFiles
		labels(first: 20) { nodes { name color } }${STATUS_CHECK_FRAGMENT}`

export const pullRequestDetailQuery = `
query PullRequest($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {${DETAIL_FIELDS_FRAGMENT}
    }
  }
}
`

export const pullRequestSummarySearchQuery = `
query PullRequests($searchQuery: String!, $first: Int!, $after: String) {
  search(query: $searchQuery, type: ISSUE, first: $first, after: $after) {
    nodes {
      ... on PullRequest {${SUMMARY_FIELDS_FRAGMENT}
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}
`

const ISSUE_FIELDS_FRAGMENT = `
        number
        title
        state
        createdAt
        updatedAt
        closedAt
        url
        author { login }
        repository { nameWithOwner defaultBranchRef { name } }
        labels(first: 20) { nodes { name color } }
        comments(first: 0) { totalCount }`

export const issueSearchQuery = `
query Issues($searchQuery: String!, $first: Int!, $after: String) {
  search(query: $searchQuery, type: ISSUE, first: $first, after: $after) {
    nodes {
      ... on Issue {${ISSUE_FIELDS_FRAGMENT}
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}
`

export const repositoryPullRequestsQuery = `
query RepositoryPullRequests($owner: String!, $name: String!, $first: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: OPEN, first: $first, after: $after, orderBy: { field: UPDATED_AT, direction: DESC }) {
      nodes {${SUMMARY_FIELDS_FRAGMENT}
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}
`

export const repositoryDetailsQuery = `
query RepositoryDetails($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    description
    url
    stargazerCount
    forkCount
    isArchived
    isPrivate
    pushedAt
    defaultBranchRef { name }
    openIssues: issues(states: OPEN) { totalCount }
    openPRs: pullRequests(states: OPEN) { totalCount }
  }
}
`

const TimelineActorSchema = Schema.NullOr(Schema.Struct({ login: Schema.String }))
const TimelineNodeSchema = Schema.Struct({
	__typename: Schema.String,
	id: Schema.optionalKey(Schema.String),
	createdAt: Schema.optionalKey(Schema.String),
	body: Schema.optionalKey(Schema.String),
	state: Schema.optionalKey(Schema.String),
	author: Schema.optionalKey(TimelineActorSchema),
	actor: Schema.optionalKey(TimelineActorSchema),
	label: Schema.optionalKey(Schema.NullOr(Schema.Struct({ name: Schema.String }))),
})

export const PullRequestTimelineResponseSchema = Schema.Struct({
	data: Schema.Struct({
		repository: Schema.NullOr(
			Schema.Struct({
				pullRequest: Schema.NullOr(
					Schema.Struct({
						timelineItems: Schema.Struct({
							nodes: Schema.Array(Schema.NullOr(TimelineNodeSchema)),
						}),
					}),
				),
			}),
		),
	}),
})

export const pullRequestTimelineQuery = `
query PullRequestTimeline($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      timelineItems(first: 40, itemTypes: [PULL_REQUEST_REVIEW, HEAD_REF_FORCE_PUSHED_EVENT, LABELED_EVENT, UNLABELED_EVENT, CONVERT_TO_DRAFT_EVENT, READY_FOR_REVIEW_EVENT, MERGED_EVENT, CLOSED_EVENT, REOPENED_EVENT]) {
        nodes {
          __typename
          ... on PullRequestReview { id author { login } body state createdAt }
          ... on HeadRefForcePushedEvent { id actor { login } createdAt }
          ... on LabeledEvent { id actor { login } createdAt label { name } }
          ... on UnlabeledEvent { id actor { login } createdAt label { name } }
          ... on ConvertToDraftEvent { id actor { login } createdAt }
          ... on ReadyForReviewEvent { id actor { login } createdAt }
          ... on MergedEvent { id actor { login } createdAt }
          ... on ClosedEvent { id actor { login } createdAt }
          ... on ReopenedEvent { id actor { login } createdAt }
        }
      }
    }
  }
}
`

export const ReviewThreadsResponseSchema = Schema.Struct({
	data: Schema.Struct({
		repository: Schema.NullOr(
			Schema.Struct({
				pullRequest: Schema.NullOr(
					Schema.Struct({
						reviewThreads: Schema.Struct({
							nodes: Schema.Array(
								Schema.NullOr(
									Schema.Struct({
										id: Schema.String,
										isResolved: Schema.Boolean,
										comments: Schema.Struct({
											nodes: Schema.Array(Schema.NullOr(Schema.Struct({ databaseId: Schema.NullOr(Schema.Number) }))),
										}),
									}),
								),
							),
						}),
					}),
				),
			}),
		),
	}),
})

export const reviewThreadsQuery = `
query ReviewThreads($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        nodes { id isResolved comments(first: 1) { nodes { databaseId } } }
      }
    }
  }
}
`

export const ResolveThreadResponseSchema = Schema.Struct({
	data: Schema.Struct({
		resolveReviewThread: Schema.optionalKey(Schema.NullOr(Schema.Struct({ thread: Schema.NullOr(Schema.Struct({ id: Schema.String, isResolved: Schema.Boolean })) }))),
		unresolveReviewThread: Schema.optionalKey(Schema.NullOr(Schema.Struct({ thread: Schema.NullOr(Schema.Struct({ id: Schema.String, isResolved: Schema.Boolean })) }))),
	}),
})

export const resolveReviewThreadMutation = `
mutation ResolveThread($id: ID!) {
  resolveReviewThread(input: {threadId: $id}) { thread { id isResolved } }
}
`

export const unresolveReviewThreadMutation = `
mutation UnresolveThread($id: ID!) {
  unresolveReviewThread(input: {threadId: $id}) { thread { id isResolved } }
}
`

export const PendingReviewSchema = Schema.Struct({
	id: Schema.Union([Schema.Number, Schema.String]),
	node_id: Schema.optionalKey(Schema.String),
	state: Schema.optionalKey(Schema.String),
	commit_id: Schema.optionalKey(Schema.NullOr(Schema.String)),
	body: Schema.optionalKey(Schema.NullOr(Schema.String)),
})

export const PendingReviewsResponseSchema = Schema.Union([Schema.Array(PendingReviewSchema), Schema.Array(Schema.Array(PendingReviewSchema))])

export const CreatedPullRequestSchema = Schema.Struct({
	number: Schema.Number,
	url: Schema.String,
	title: Schema.String,
})

export const PullRequestCollaboratorsSchema = Schema.Struct({
	reviewRequests: Schema.optionalKey(
		Schema.Array(
			Schema.Struct({
				login: Schema.optionalKey(Schema.String),
				name: Schema.optionalKey(Schema.String),
				slug: Schema.optionalKey(Schema.String),
			}),
		),
	),
	assignees: Schema.optionalKey(Schema.Array(Schema.Struct({ login: Schema.String }))),
})

export const UpdateBranchResponseSchema = Schema.Struct({
	message: Schema.optionalKey(Schema.String),
	url: Schema.optionalKey(Schema.String),
})

const GraphQLActorSchema = Schema.NullOr(Schema.Struct({ login: Schema.String }))

export const AddPullRequestReviewThreadResponseSchema = Schema.Struct({
	data: Schema.Struct({
		addPullRequestReviewThread: Schema.NullOr(
			Schema.Struct({
				thread: Schema.NullOr(
					Schema.Struct({
						comments: Schema.Struct({
							nodes: Schema.Array(
								Schema.NullOr(
									Schema.Struct({
										databaseId: Schema.NullOr(Schema.Number),
										body: Schema.optionalKey(Schema.String),
										createdAt: Schema.optionalKey(Schema.String),
										author: Schema.optionalKey(GraphQLActorSchema),
										path: Schema.optionalKey(Schema.String),
										line: Schema.optionalKey(Schema.NullOr(Schema.Number)),
										diffSide: Schema.optionalKey(Schema.String),
									}),
								),
							),
						}),
					}),
				),
			}),
		),
	}),
})

export const addPullRequestReviewThreadMutation = `
mutation AddPendingReviewThread($reviewId: ID!, $path: String!, $body: String!, $line: Int!, $side: DiffSide!, $startLine: Int, $startSide: DiffSide) {
  addPullRequestReviewThread(input: { pullRequestReviewId: $reviewId, path: $path, body: $body, line: $line, side: $side, startLine: $startLine, startSide: $startSide }) {
    thread {
      comments(first: 1) {
        nodes { databaseId body createdAt author { login } path line diffSide }
      }
    }
  }
}
`
