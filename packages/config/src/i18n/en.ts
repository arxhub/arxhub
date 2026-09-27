export const en = {
  field: {
    unavailable: 'Unavailable',
    required: 'Required',
    deviceLocal: 'Only on this device',
    // The signature line under a control says where the value is kept in words, beside the mono token.
    deviceOnly: 'this device only',
    range: 'From {min} to {max}',
    atLeast: 'At least {min}',
    upTo: 'Up to {max}',
    availableOnce: 'Available once “{name}” is on.',
    copy: 'Copy',
    copied: '{name} copied',
    copyFailed: 'Could not copy',
    show: 'Show',
    hide: 'Hide',
  },
  form: {
    technical: 'Technical details',
    hideTechnical: 'Hide technical details',
  },
  validation: {
    required: '{name} is required.',
    notANumber: 'Not a number.',
    min: 'Must be {min} or more.',
    max: 'Must be {max} or less.',
    maxLength: 'At most {max} characters.',
    pattern: 'Does not match the format this field expects.',
  },
} as const
