// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightAutoSidebar from "starlight-auto-sidebar";

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: "cppdoc",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/cppdoc-cc/cppdoc",
        },
      ],
      sidebar: [
        {
          label: "C++ Language Reference",
          autogenerate: { directory: "cpp/language" },
        },
        {
          label: "C++ Library Reference",
          autogenerate: { directory: "cpp/library" },
        },
        {
          label: "C Language Reference",
          autogenerate: { directory: "c/language" },
        },
        {
          label: "C Library Reference",
          autogenerate: { directory: "c/library" },
        },
      ],
      plugins: [starlightAutoSidebar()],
      customCss: ["./src/styles/custom.css"],
    }),
  ],
});
