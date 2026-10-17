import * as Atom from "effect/reactivity/Atom"

export const noticeAtom = Atom.make<string | null>(null)
