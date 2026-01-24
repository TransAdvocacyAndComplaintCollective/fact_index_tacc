import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const config = require('./webpack.config.cjs');
export default config;
