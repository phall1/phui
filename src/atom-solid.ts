import {
	RegistryContext,
	RegistryProvider,
	useAtom as useAtomSolid,
	useAtomRefresh as useAtomRefreshSolid,
	useAtomSet as useAtomSetSolid,
	useAtomValue as useAtomValueSolid,
} from "@effect/atom-solid"
import type * as Atom from "effect/unstable/reactivity/Atom"
import { useHookSlot } from "./solid-hooks.js"

export { RegistryContext, RegistryProvider }

type AtomSetMode = "value" | "promise" | "promiseExit"

/**
 * React-shaped wrappers over official `@effect/atom-solid` hooks.
 * Official hooks take `() => atom` factories and return Solid accessors;
 * existing call sites pass the atom value and read `A` directly.
 */
export const useAtomValue = <A>(atom: Atom.Atom<A>): A => useHookSlot(() => useAtomValueSolid(() => atom))()

export const useAtomSet = <R, W, Mode extends AtomSetMode = never>(atom: Atom.Writable<R, W>, options?: { readonly mode?: Mode }): ReturnType<typeof useAtomSetSolid<R, W, Mode>> =>
	useHookSlot(() => useAtomSetSolid(() => atom, options as never))

export const useAtom = <R, W, Mode extends AtomSetMode = never>(
	atom: Atom.Writable<R, W>,
	options?: { readonly mode?: Mode },
): readonly [R, (value: W | ((value: R) => W)) => unknown] => {
	const [value, set] = useHookSlot(() => useAtomSolid(() => atom, options as never))
	return [value(), set as (value: W | ((value: R) => W)) => unknown]
}

export const useAtomRefresh = <A>(atom: Atom.Atom<A>): (() => void) => useHookSlot(() => useAtomRefreshSolid(() => atom))
