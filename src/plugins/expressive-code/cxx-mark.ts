import { definePlugin, InlineStyleAnnotation, type ExpressiveCodePlugin } from "@astrojs/starlight/expressive-code";

export function pluginCxxMark(): ExpressiveCodePlugin {
  return definePlugin({
    name: "CXX mark",
    hooks: {
      postprocessAnalyzedCode: (context) => {
        context.codeBlock.getLines().forEach((line) => {
          if (context.codeBlock.meta.includes("cxx-mark")) {
            const matches = [...line.text.matchAll(/\/\*\$(((?<syntax>s)|(?<exposition>expos)):[^\*]+|(?<optional>opt))\*\//g)].reverse()
            matches.forEach((match) => {
              const begin = match.index
              const end = begin + match[0].length
              if (match.groups?.syntax != undefined) {
                line.addAnnotation(
                  new InlineStyleAnnotation({
                    inlineRange: {
                      columnStart: begin,
                      columnEnd: end
                    },
                    // color of syntax notation should be same with comments
                    italic: true
                  })
                )
                line.editText(begin, end, match[0].slice(5, -2))
              } else if (match.groups?.exposition != undefined) {
                line.addAnnotation(
                  new InlineStyleAnnotation({
                    inlineRange: {
                      columnStart: begin,
                      columnEnd: end
                    },
                    color: "var(--cppdoc-color-cxx-mark-exposition)",
                    italic: true
                  })

                )
                line.editText(begin + 2, begin + 9, "")
              } else if (match.groups?.optional != undefined) {
                const new_str = "(optional)"
                line.editText(begin, end, new_str)
                line.addAnnotation(
                  new InlineStyleAnnotation({
                    inlineRange: {
                      columnStart: begin,
                      columnEnd: begin + new_str.length
                    },
                    color: "var(--cppdoc-color-cxx-mark-optional)"
                  })
                )
              }
            })
          }
        })
      }
    }
  })
}