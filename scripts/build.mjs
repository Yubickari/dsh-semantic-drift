/**
 * Build script.
 *
 * Two artifacts, no framework:
 * - `lib/index.js` — the host half, ESM for Node. DSH packages, `yaml` and
 *   schemastery stay external: the host resolves them from its own installation.
 * - `lib/client.js` — the browser half. DSH's web shell evaluates a client
 *   module as `window.__ModuleLoader__.load({ id, factory })`, where `require`
 *   resolves React and any declared externals. The bundle is therefore emitted
 *   as CommonJS and wrapped in exactly that call, with React left external.
 *
 * `react` is the only browser-side dependency; everything else in the client
 * half is plain React plus `fetch`.
 */
import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const outDir = join(root, 'lib')
await mkdir(outDir, { recursive: true })

const shared = {
  bundle: true,
  logLevel: 'warning',
  legalComments: 'none',
  sourcemap: false,
  target: 'es2022',
}

await build({
  ...shared,
  entryPoints: [join(root, 'src/index.ts')],
  outfile: join(outDir, 'index.js'),
  platform: 'node',
  format: 'esm',
  external: ['@deepseek-ai/*', 'yaml'],
  banner: { js: `// ${manifest.name} ${manifest.version} — host half (generated, do not edit)` },
})

const client = await build({
  ...shared,
  entryPoints: [join(root, 'src/client/index.ts')],
  platform: 'browser',
  format: 'cjs',
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  define: { 'process.env.NODE_ENV': '"production"' },
  write: false,
  outfile: join(outDir, 'client.js'),
})

const body = client.outputFiles[0].text.trim()
const wrapped = `// ${manifest.name} ${manifest.version} — browser half (generated, do not edit)
window.__ModuleLoader__.load({
  id: ${JSON.stringify(manifest.name)},
  factory: (require) => {
    var module = { exports: {} };
    ${body}
    return module.exports;
  },
});
`
await writeFile(join(outDir, 'client.js'), wrapped, 'utf8')
process.stdout.write(`built ${manifest.name}@${manifest.version}: lib/index.js, lib/client.js\n`)
