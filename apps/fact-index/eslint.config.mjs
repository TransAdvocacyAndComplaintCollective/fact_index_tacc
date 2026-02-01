// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import baseConfig from '../../eslint.config.mjs';

export default [...baseConfig, ...storybook.configs["flat/recommended"]];
