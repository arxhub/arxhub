/// <reference path="./raw-css.d.ts" />
import theme from '@arxhub/theme?raw'
import amber from '@arxhub/theme-preset/colors/amber?raw'
import cyan from '@arxhub/theme-preset/colors/cyan?raw'
import sand from '@arxhub/theme-preset/colors/sand?raw'
import reset from '@arxhub/theme-preset/reset?raw'
import radii from '@arxhub/theme-preset/styles/radii?raw'
import sizing from '@arxhub/theme-preset/styles/sizing?raw'
import typography from '@arxhub/theme-preset/styles/typography?raw'
import reader from './reader.css?raw'

// The stand loads its server during configureServer, before Vite's CSS transform is initialized.
// Embed leaf styles as text so both that boot and the standalone bundle use the same theme tokens,
// without a runtime stylesheet request or a generated copy of the default palette.
export const readerStyles = [reset, sand, amber, cyan, theme, radii, sizing, typography, reader].join('\n')
