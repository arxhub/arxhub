import { type FunctionalComponent, h } from 'vue'

// One wording for every kind of object. A per-type one would be more precise for a note, but it falls
// through the cracks between rounds: types added later simply will not write one, and the rule "a tab
// does not disappear silently" would stop applying exactly where it is needed most.
export const OBJECT_GONE_TITLE = 'This object is gone'
export const OBJECT_GONE_MESSAGE = 'It may have been renamed or deleted on another device. The tab stayed so the loss is visible.'

export interface ObjectGoneProps {
  title?: string
  typeId?: string
  objectKey?: string
  // How to close this tab. Arrives as a prop from `Workspace` rather than through injection: this
  // module has to stay free of dependencies — it is built and checked where there is neither a
  // component tree nor an application around it.
  onClose?: () => void
}

// The content of a marked tab. Deliberately a functional component on `h` rather than a single-file
// one: the core of navigation has to build and be checked where there is nothing to compile an SFC
// with. The shell is free to substitute its own — `Workspace` takes it as an option.
//
// The button is here because text with no way out is not a message, it is a dead end: closing would
// otherwise have to be found in the search sheet or the type's second level, two screens away from
// the thing that broke.
export const ObjectGoneView: FunctionalComponent<ObjectGoneProps> = (props) => {
  return h('div', { class: 'object-gone' }, [
    h('p', { class: 'object-gone-title' }, OBJECT_GONE_TITLE),
    ...(props.title == null ? [] : [h('p', { class: 'object-gone-name' }, props.title)]),
    h('p', { class: 'object-gone-message' }, OBJECT_GONE_MESSAGE),
    ...(props.onClose == null
      ? []
      : [
          h(
            'button',
            {
              type: 'button',
              class: 'object-gone-close',
              'data-testid': 'object-gone-close',
              // The object may come back on its own — sync brings it — and the tab revives on the next
              // open from the sheet; closing here is only about removing the reminder.
              onClick: () => props.onClose?.(),
            },
            'Close tab',
          ),
        ]),
  ])
}

ObjectGoneView.props = ['title', 'typeId', 'objectKey', 'onClose']
ObjectGoneView.displayName = 'ObjectGoneView'
