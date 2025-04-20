// import type { Logger } from '@arxhub/core'
// import type { VirtualFileSystem } from '@arxhub/plugin-vfs/api'
// import { Parcel } from '@parcel/core'
// import type { Context } from 'hono'; // Assuming Hono context type
// import { Hono } from 'hono'
// import { createHash } from 'node:crypto'
// import fs from 'node:fs/promises'
// import path from 'node:path'

// // Cache variables specific to this route module (server-side)
// let lastBundledContent: string | null = null
// let lastEtag: string | null = null

// // Helper function to create the Hono router for web components
// export function createWebComponentsRouter(vfs: VirtualFileSystem, logger: Logger): Hono {
//   const app = new Hono()

//   app.get('/web-components.js', async (ctx: Context) => {
//     logger.info('Request received for /web-components.js')

//     // Check browser cache using ETag
//     const ifNoneMatch = ctx.req.header('if-none-match')
//     if (lastEtag && ifNoneMatch === lastEtag) {
//       logger.info('ETag match found, returning 304 Not Modified.')
//       ctx.status(304)
//       return ctx.body(null) // Hono requires returning the context or a Response
//     }

//     try {
//       // Scan VFS for web components
//       logger.info('Scanning VFS for web components...')
//       const componentEntryPoints: string[] = []
//       for await (const file of vfs.listFiles()) {
//          // Ensure file.kind and file.type exist before accessing
//          if (file.kind === 'arxhub/web-component' && file.type?.startsWith('text/')) {
//             logger.info(`Found web component: ${file.pathname}`) // Changed debug to info
//             componentEntryPoints.push(file.pathname)
//          }
//        }


//       if (componentEntryPoints.length === 0) {
//         logger.info('No web components found.')
//         const emptyContent = '// No web components found.'
//         const currentEtag = `"${createHash('md5').update(emptyContent).digest('hex')}"`

//         if (ifNoneMatch === currentEtag) {
//            logger.info('ETag match for "no components" state, returning 304.')
//            ctx.status(304)
//            return ctx.body(null)
//         }

//         // Update cache for "no components" state
//         lastBundledContent = emptyContent
//         lastEtag = currentEtag
//         ctx.header('Content-Type', 'text/javascript')
//         ctx.header('ETag', lastEtag)
//         ctx.header('Cache-Control', 'public, max-age=0, must-revalidate')
//         return ctx.body(lastBundledContent)
//       }

//       logger.info(`Found ${componentEntryPoints.length} component(s): ${componentEntryPoints.join(', ')}`)

//       // Define temporary directory for Parcel
//       // Use a more robust way to get __dirname if possible, or define relative to project root
//        const tempDir = path.resolve(process.cwd(), 'plugins/web-app/.parcel-cache', 'web-components') // Relative to CWD
//        await fs.mkdir(tempDir, { recursive: true })
//        logger.info(`Using Parcel cache/dist directory: ${tempDir}`) // Changed debug to info

//        // Configure and run Parcel
//       const bundler = new Parcel({
//         entries: componentEntryPoints,
//         defaultConfig: '@parcel/config-default',
//         mode: 'production', // Or process.env.NODE_ENV?
//         cacheDir: tempDir,
//         targets: {
//           default: {
//             distDir: tempDir,
//             publicUrl: '/',
//             outputFormat: 'global',
//             context: 'browser',
//             isLibrary: false,
//             // externals: ['vue', 'preact'], // Add if needed
//           },
//         },
//         defaultTargetOptions: {
//           sourceMaps: false,
//         },
//       })

//       logger.info('Starting Parcel bundling...')
//       const { bundleGraph } = await bundler.run()
//       logger.info('Parcel bundling finished.')

//       // Find the main JS bundle
//       let bundleFilePath: string | undefined
//       const bundles = bundleGraph.getBundles()
//       for (const bundle of bundles) {
//          if (bundle.type === 'js' && bundle.isEntry) {
//              bundleFilePath = bundle.filePath
//              break;
//          }
//       }
//       // Fallback if no entry marked
//       if (!bundleFilePath) {
//          let largestSize = -1;
//          for (const bundle of bundles) {
//             if (bundle.type === 'js' && bundle.stats.size > largestSize) {
//                largestSize = bundle.stats.size;
//                bundleFilePath = bundle.filePath;
//             }
//          }
//       }

//       if (!bundleFilePath) {
//         logger.error('Could not find the main JavaScript bundle output by Parcel.')
//          throw new Error('Parcel did not produce a JS bundle.')
//        }
//        logger.info(`Main bundle file path: ${bundleFilePath}`) // Changed debug to info

//        // Read bundled content
//       const currentBundledContent = await fs.readFile(bundleFilePath, 'utf-8')
//       const currentEtag = `"${createHash('md5').update(currentBundledContent).digest('hex')}"`

//       // Check ETag again against the newly generated content
//       if (ifNoneMatch === currentEtag) {
//         logger.info('ETag match found for newly generated content, returning 304.')
//         // Update server cache even if sending 304
//         lastBundledContent = currentBundledContent
//         lastEtag = currentEtag
//         ctx.status(304)
//         return ctx.body(null)
//       }

//       // Update server cache
//       logger.info('Updating server cache with new bundle.')
//       lastBundledContent = currentBundledContent
//       lastEtag = currentEtag

//       // Set headers and return content
//       ctx.header('Content-Type', 'text/javascript')
//       ctx.header('ETag', lastEtag)
//       ctx.header('Cache-Control', 'public, max-age=0, must-revalidate')
//       return ctx.body(lastBundledContent)

//     } catch (error) {
//       logger.error('Error bundling web components:', error)
//       // Clear potentially stale cache on error
//       lastBundledContent = null
//       lastEtag = null
//       ctx.status(500)
//       return ctx.text('// Error bundling web components.')
//     }
//   })

//   return app
// }


//     // --- Add Web Components Router ---
//     try {
//       const { vfs } = target.extensions.get(VirtualFileSystemExtension)
//       const webComponentsApp = createWebComponentsRouter(vfs, this.logger)
//       gateway.route('/', webComponentsApp) // Mount the router
//       this.logger.info('Mounted /web-components.js route.')
//     } catch (error) {
//       this.logger.error('Failed to get VFS extension or mount web components router:', error)
//     }
//     // --- End Web Components Router ---