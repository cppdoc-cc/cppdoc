// @ts-check
import { pluginCxxMark } from "./src/plugins/expressive-code/cxx-mark.ts";

/** @type {import('@astrojs/starlight/expressive-code').StarlightExpressiveCodeOptions} */
export default {
  plugins: [pluginCxxMark()],
};
