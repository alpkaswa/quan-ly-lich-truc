import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({build:{target:'es2022',outDir:'worker-build',emptyOutDir:true,minify:false,lib:{entry:fileURLToPath(new URL('./index.mjs',import.meta.url)),formats:['es'],fileName:()=> 'index.mjs'},rolldownOptions:{external:['cloudflare:workers','node:crypto','node:buffer']}}});
