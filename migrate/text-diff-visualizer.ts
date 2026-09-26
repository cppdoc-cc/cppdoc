import { createCanvas } from "@napi-rs/canvas";

interface WordToken {
  display: string;
  key: string;
}

interface LineData {
  tokens: WordToken[];
}

interface RenderConfig {
  width: number;
  padding: number;
  lineHeight: number;
  fontSize: number;
  fontFamily: string;
  colGap: number;
}

const COLORS = {
  bg: "#121212",
  textDim: "#555555",
  lineNum: "#444444",
  divider: "#333333",

  redBase: { r: 255, g: 180, b: 171 },

  greenBase: { r: 183, g: 240, b: 217 },

  bgRed: "rgba(65, 14, 11, 0.5)",
  bgGreen: "rgba(0, 55, 30, 0.5)",
};

function parseText(text: string): LineData[] {
  return text.split("\n").map((line) => {
    const parts = line
      .trimEnd()
      .replace(/[,，。""''"".]/gu, " ")
      .split(/\s+/)
      .filter((p) => p.length > 0);
    const tokens = parts
      .map((part) => {
        if (!part) return null;
        const cleanKey = part.toLowerCase();
        return {
          display: part,
          key: cleanKey,
        };
      })
      .filter((t): t is WordToken => t !== null);

    return { tokens };
  });
}

function getIntensity(diff: number): number {
  return 0.4 + 0.6 * (1 - 1 / (1 + 0.2 * Math.abs(diff)));
}

export function visualizeTextDiff(textA: string, textB: string) {
  const linesA = parseText(textA);
  const linesB = parseText(textB);

  for (const lineRowA of linesA) {
    for (const lineRowB of linesB) {
      if (lineRowA.tokens.length === 0 || lineRowB.tokens.length === 0)
        continue;
      if (lineRowA.tokens.length !== lineRowB.tokens.length) continue;
      let allMatch = true;
      for (let i = 0; i < lineRowA.tokens.length; i++) {
        if (lineRowA.tokens[i].key !== lineRowB.tokens[i].key) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) {
        lineRowA.tokens = [];
        lineRowB.tokens = [];
      }
    }
  }

  const freqA = new Map<string, number>();
  const freqB = new Map<string, number>();
  const allKeys = new Set<string>();

  [linesA, linesB].forEach((lines, idx) => {
    const map = idx === 0 ? freqA : freqB;
    lines.forEach((line) => {
      line.tokens.forEach((token) => {
        if (!token.key) return;
        map.set(token.key, (map.get(token.key) || 0) + 1);
        allKeys.add(token.key);
      });
    });
  });

  const maxLines = Math.max(linesA.length, linesB.length);
  const linesToRender: number[] = [];

  for (let i = 0; i < maxLines; i++) {
    const lineRowA = linesA[i];
    const lineRowB = linesB[i];

    let hasDifference = false;

    const checkTokens = (tokens: WordToken[] | undefined, isRowA: boolean) => {
      if (!tokens) return false;
      for (const t of tokens) {
        if (!t.key) continue;
        const countA = freqA.get(t.key) || 0;
        const countB = freqB.get(t.key) || 0;
        if (isRowA ? countA > countB : countB > countA) {
          return true;
        }
      }
      return false;
    };

    const diffA = checkTokens(lineRowA?.tokens, true);
    const diffB = checkTokens(lineRowB?.tokens, false);

    const emptyA = !lineRowA || lineRowA.tokens.length === 0;
    const emptyB = !lineRowB || lineRowB.tokens.length === 0;

    if (diffA || diffB) {
      hasDifference = true;
    } else if (emptyA !== emptyB) {
      hasDifference = true;
    }

    if (hasDifference) {
      linesToRender.push(i);
    }
  }

  if (linesToRender.length === 0) {
    console.log("文本完全一致（或无有效词汇），无输出。");
    return;
  }

  const config: RenderConfig = {
    width: 1200,
    padding: 40,
    fontSize: 14,
    lineHeight: 24,
    fontFamily: 'Consolas, "Courier New", monospace',
    colGap: 20,
  };

  const colWidth = (config.width - config.padding * 2 - config.colGap) / 2;

  const dummyCanvas = createCanvas(100, 100);
  const ctxTest = dummyCanvas.getContext("2d");
  ctxTest.font = `${config.fontSize}px ${config.fontFamily}`;

  let totalY = config.padding;
  const lineRenderMap = new Map<
    number,
    {
      yValues: { start: number; height: number };
      wrapA: string[][];
      wrapB: string[][];
    }
  >();

  const wrapText = (tokens: WordToken[]) => {
    const lines: string[][] = [];
    if (!tokens || tokens.length === 0) return lines;

    let currentLine: string[] = [];
    let currentWidth = 0;

    tokens.forEach((token) => {
      const width = ctxTest.measureText(token.display + " ").width;
      if (currentWidth + width > colWidth - 40) {
        lines.push(currentLine);
        currentLine = [token.display];
        currentWidth = width;
      } else {
        currentLine.push(token.display);
        currentWidth += width;
      }
    });
    if (currentLine.length > 0) lines.push(currentLine);
    return lines;
  };

  let prevLineIdx = -1;

  linesToRender.forEach((lineIdx) => {
    if (lineIdx > prevLineIdx + 1) {
      totalY += config.lineHeight;
    }

    const rowA = linesA[lineIdx]?.tokens || [];
    const rowB = linesB[lineIdx]?.tokens || [];

    const wrapA = wrapText(rowA);
    const wrapB = wrapText(rowB);

    const lineCount = Math.max(wrapA.length, wrapB.length, 1);
    const height = lineCount * config.lineHeight;

    lineRenderMap.set(lineIdx, {
      yValues: { start: totalY, height },
      wrapA,
      wrapB,
    });

    totalY += height + 10;
    prevLineIdx = lineIdx;
  });

  totalY += config.padding;

  const canvas = createCanvas(config.width, totalY);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, config.width, totalY);

  ctx.font = `${config.fontSize}px ${config.fontFamily}`;
  ctx.textBaseline = "top";

  ctx.beginPath();
  ctx.strokeStyle = COLORS.divider;
  ctx.lineWidth = 2;
  ctx.moveTo(config.width / 2, 0);
  ctx.lineTo(config.width / 2, totalY);
  ctx.stroke();

  prevLineIdx = -1;

  linesToRender.forEach((lineIdx) => {
    const renderInfo = lineRenderMap.get(lineIdx)!;
    const { yValues, wrapA, wrapB } = renderInfo;
    const currentY = yValues.start;

    if (lineIdx > prevLineIdx + 1) {
      ctx.fillStyle = COLORS.textDim;
      ctx.textAlign = "center";
      ctx.fillText("...", config.width / 2, currentY - config.lineHeight);
    }

    let redWeight = 0;
    let greenWeight = 0;

    const analyzeLineColors = (tokens: WordToken[], isLeft: boolean) => {
      let weight = 0;
      if (!tokens) return 0;
      tokens.forEach((t) => {
        if (!t.key) return;
        const cA = freqA.get(t.key) || 0;
        const cB = freqB.get(t.key) || 0;
        if (isLeft && cA > cB) weight += cA - cB;
        if (!isLeft && cB > cA) weight += cB - cA;
      });
      return weight;
    };

    redWeight = analyzeLineColors(linesA[lineIdx]?.tokens, true);
    greenWeight = analyzeLineColors(linesB[lineIdx]?.tokens, false);

    if (redWeight > 0) {
      ctx.fillStyle = COLORS.bgRed;

      ctx.fillRect(0, currentY, config.width / 2, yValues.height);
    }
    if (greenWeight > 0) {
      ctx.fillStyle = COLORS.bgGreen;

      ctx.fillRect(
        config.width / 2,
        currentY,
        config.width / 2,
        yValues.height
      );
    }

    const drawColumn = (
      tokens: WordToken[],
      wrappedLines: string[][],
      offsetX: number,
      isLeft: boolean
    ) => {
      ctx.fillStyle = COLORS.lineNum;
      ctx.textAlign = "right";
      ctx.fillText((lineIdx + 1).toString(), offsetX + 30, currentY + 5);

      let lineOffsetY = 5;
      let tokenIndex = 0;

      wrappedLines.forEach((lineStrArr) => {
        let currX = offsetX + 40;

        lineStrArr.forEach((wordStr) => {
          const token = tokens[tokenIndex];
          tokenIndex++;

          if (!token) return;

          const key = token.key;
          const countA = freqA.get(key) || 0;
          const countB = freqB.get(key) || 0;

          let fillStyle = COLORS.textDim;

          if (isLeft) {
            if (countA > countB) {
              const diff = countA - countB;
              const alpha = getIntensity(diff);
              fillStyle = `rgba(${COLORS.redBase.r}, ${COLORS.redBase.g}, ${COLORS.redBase.b}, ${alpha})`;
            }
          } else {
            if (countB > countA) {
              const diff = countB - countA;
              const alpha = getIntensity(diff);
              fillStyle = `rgba(${COLORS.greenBase.r}, ${COLORS.greenBase.g}, ${COLORS.greenBase.b}, ${alpha})`;
            }
          }

          ctx.fillStyle = fillStyle;
          ctx.textAlign = "left";
          ctx.fillText(wordStr, currX, currentY + lineOffsetY);

          currX += ctx.measureText(wordStr + " ").width;
        });
        lineOffsetY += config.lineHeight;
      });
    };

    if (linesA[lineIdx]) drawColumn(linesA[lineIdx].tokens, wrapA, 0, true);
    if (linesB[lineIdx])
      drawColumn(linesB[lineIdx].tokens, wrapB, config.width / 2, false);

    prevLineIdx = lineIdx;
  });

  const buffer = canvas.toBuffer("image/webp");
  return buffer;
}
