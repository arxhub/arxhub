export {
	VirtualFileSystemExtension as VirtualFileSystemClientExtension,
	VirtualFileSystemExtension as VirtualFileSystemServerExtension
} from './shared/extension'
export {
	VirtualFileSystemPlugin as VirtualFileSystemClientPlugin,
	VirtualFileSystemPlugin as VirtualFileSystemServerPlugin
} from './shared/plugin'

export * from './shared/errors/file-not-found'
export * from './shared/errors/mount-not-found'

export * from './shared/file'
export * from './shared/generic-file'
export * from './shared/local-system'
export * from './shared/mountable-system'
export * from './shared/proxy-file'
export * from './shared/searchable-system'
export * from './shared/system'

