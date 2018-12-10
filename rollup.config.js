import resolve from 'rollup-plugin-node-resolve';
import babel from 'rollup-plugin-babel';
import bundleSize from 'rollup-plugin-bundle-size';
import { uglify } from 'rollup-plugin-uglify';

import pkg from './package.json';

const input = 'src/index.ts';

const extensions = ['.js', '.ts'];

const banner = `
/**
 * @preserve
 * Guidewire Payments SDK
 * v${pkg.version}
 * Built ${new Date()}
 * Hash ${process.env.HASH}
 */
`;

const devPlugins = [
  resolve({
    extensions,
  }),
  babel({
    extensions,
  }),
];

const prodPlugins = [
  ...devPlugins,
  uglify({
    output: {
      comments: function(node, comment) {
        if (comment.type === 'comment2') {
          // apparently 'comment2' means multiline
          //  see: https://www.npmjs.com/package/rollup-plugin-uglify#comments
          return /@preserve|@license/i.test(comment.value);
        }
        return false;
      },
    },
  }),
  bundleSize(),
];

export default [
  {
    input,
    output: {
      banner,
      sourcemap: true,
      dir: 'dist/es',
      format: 'esm',
    },
    plugins: devPlugins,
  },

  // CommonJS builds (use dist/index.js to pick based on process.env.NODE_ENV)
  {
    input,
    output: {
      banner,
      sourcemap: true,
      file: 'dist/cjs/gw-payments-sdk.development.js',
      format: 'cjs',
    },
    plugins: devPlugins,
  },
  {
    input,
    output: {
      banner,
      sourcemap: true,
      file: 'dist/cjs/gw-payments-sdk.production.min.js',
      format: 'cjs',
    },
    plugins: prodPlugins,
  },
];
