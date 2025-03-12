import { defineConfig } from 'vite'
import { defineNodeConfig } from './src'

const config = defineConfig(async (env) => {
    const a = await defineNodeConfig(__dirname, env)
    console.log(a.plugins)
    return a
})


export default config
