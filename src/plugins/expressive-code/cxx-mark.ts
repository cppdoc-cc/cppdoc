import {
  definePlugin,
  InlineStyleAnnotation,
  type ExpressiveCodePlugin,
} from "@astrojs/starlight/expressive-code";

export function pluginCxxMark(): ExpressiveCodePlugin {
  return definePlugin({
    name: "CXX mark",
    hooks: {
      postprocessAnalyzedCode: (context) => {
        context.codeBlock.getLines().forEach((line) => {
          if (context.codeBlock.meta.includes("cxx-mark")) {
            const matches = [
              ...line.text.matchAll(/\/\*\$(.+?)\*\//g),
            ].reverse();
            matches.forEach((match) => {
              const begin = match.index;
              const end = begin + match[0].length;
              if (match[1].startsWith("s:")) {
                line.addAnnotation(
                  new InlineStyleAnnotation({
                    inlineRange: {
                      columnStart: begin,
                      columnEnd: end,
                    },
                    // color of syntax notation should be same with comments
                    italic: true,
                  })
                );
                line.editText(begin, end, match[0].slice(5, -2));
              } else if (match[1].startsWith("e:")) {
                line.addAnnotation(
                  new InlineStyleAnnotation({
                    inlineRange: {
                      columnStart: begin,
                      columnEnd: end,
                    },
                    color: "var(--cppdoc-color-cxx-mark-exposition)",
                    italic: true,
                  })
                );
                line.editText(begin + 2, begin + 5, "");
              } else if (match[1] == "opt") {
                const newStr = "(optional)";
                line.editText(begin, end, newStr);
                line.addAnnotation(
                  new InlineStyleAnnotation({
                    inlineRange: {
                      columnStart: begin,
                      columnEnd: begin + newStr.length,
                    },
                    color: "var(--cppdoc-color-cxx-mark-optional)",
                  })
                );
              }
            });
          }
        });
      },
    },
  });
}
