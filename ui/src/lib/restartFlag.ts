// Tiny external store: set when a saved config section requires a
// restart; the AdminLayout banner subscribes and offers the restart.

let required = false
const subscribers = new Set<() => void>()

export const restartFlag = {
  get: () => required,
  set(value: boolean) {
    required = value
    subscribers.forEach((fn) => fn())
  },
  subscribe(fn: () => void) {
    subscribers.add(fn)
    return () => {
      subscribers.delete(fn)
    }
  },
}
