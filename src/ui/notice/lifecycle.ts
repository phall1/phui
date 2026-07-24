export const NOTICE_TIMEOUT_MS = 2500

export const visibleNoticeAfterInitialLoading = (notice: string | null, isInitialLoading: boolean): string | null => (isInitialLoading ? null : notice)

export const expireNotice = (current: string | null, expected: string): string | null => (current === expected ? null : current)
