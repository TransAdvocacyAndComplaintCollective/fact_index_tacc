import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const cfg = require('./jest.config.cjs');
export default cfg;
