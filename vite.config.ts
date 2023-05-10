import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'raft-sdk',
      fileName: 'raft-sdk',
    },
    rollupOptions: {
      external: ['ethers', '@tempusfinance/decimal'],
      output: {
        globals: {
          ethers: 'ethers',
          '@tempusfinance/decimal': 'Decimal',
        },
      },
    },
  },
  plugins: [dts()],
});
