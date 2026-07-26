import { ref } from 'vue'

// The key that lists the open documents lives in the frame's bottom bar, and the list it opens lives
// in the panel layout — two components that never meet. This flag is what they share. Module scope is
// the honest scope for it: there is exactly one bottom bar in a running app.
export const notesSheetOpen = ref(false)
