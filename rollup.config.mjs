import typescript from '@rollup/plugin-typescript'
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))
const external = [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.peerDependencies || {}), 'crypto']

/** @type {import('rollup').RollupOptions[]} */
export default [
  {
    input: 'src/index.ts',
    output: {
      file: pkg.module,
      format: 'esm',
      sourcemap: true,
      exports: 'named',
    },
    external,
    plugins: [
      resolve(),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: true,
        declarationDir: './dist',
        module: 'ESNext',
      }),
    ],
  },
  {
    input: 'src/index.ts',
    output: {
      file: pkg.main,
      format: 'cjs',
      sourcemap: true,
      exports: 'named',
      interop: 'auto',
    },
    external,
    plugins: [
      resolve(),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        module: 'ESNext',
      }),
    ],
  },
]
