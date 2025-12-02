import { JSDOM } from "jsdom"

interface GetTextOptions {
    treatBlockAsNewline?: boolean;
    collapseSpaces?: boolean;
    trimResult?: boolean;
}

const BLOCK_ELEMENTS = [
    'div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'table', 'tr', 'td', 'th',
    'section', 'article', 'header', 'footer', 'nav',
    'aside', 'main', 'figure', 'figcaption', 'blockquote',
    'pre', 'form', 'fieldset', 'legend', 'dl', 'dt', 'dd',
    'hr', 'br'
];

const Node = new JSDOM('').window.Node;
function isBlockElement(node: Node): boolean {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const element = node as HTMLElement;

    if (BLOCK_ELEMENTS.includes(element.tagName.toLowerCase())) {
        return true;
    }

    const style = window.getComputedStyle(element);
    return style.display === 'block' ||
        style.display === 'flex' ||
        style.display === 'grid' ||
        style.display.startsWith('table');
}

function isElementVisible(element: HTMLElement): boolean {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0';
}

export function getTextFromDOM(
    node: Node,
    options: GetTextOptions = {}
): string {
    const {
        treatBlockAsNewline = true,
        collapseSpaces = true,
        trimResult = true
    } = options;

    let result = '';
    let lastChar = '';

    function processNode(currentNode: Node, isBlockContext: boolean) {
        if (!currentNode) return;
        if (currentNode.nodeType === Node.ELEMENT_NODE) {
            const element = currentNode as HTMLElement;
            if (!isElementVisible(element)) return;

            const isBlock = isBlockElement(currentNode);
            const tagName = element.tagName.toLowerCase();

            if (tagName === 'br') {
                result += '\n';
                lastChar = '\n';
                return;
            }

            if (tagName === 'hr') {
                result += '\n---\n';
                lastChar = '\n';
                return;
            }


            if (tagName === 'pre') {
                const text = element.textContent || '';
                if (text) {
                    result += text;
                    lastChar = text[text.length - 1] || '';
                }
                return;
            }

            const shouldAddNewline = treatBlockAsNewline && isBlock;
            const separator = shouldAddNewline ? '\n' : ' ';

            if (isBlock && result.length > 0 && lastChar !== '\n') {
                result += separator;
                lastChar = separator;
            }

            const currentIsBlockContext = isBlock || isBlockContext;
            for (const childNode of Array.from(element.childNodes)) {
                processNode(childNode, currentIsBlockContext);
            }

            if (isBlock && result.length > 0 && lastChar !== '\n') {
                result += separator;
                lastChar = separator;
            }
        } else if (currentNode.nodeType === Node.TEXT_NODE) {
            let text = currentNode.textContent || '';
            if (text.trim() === '') return;
            text = text.replace(/\s+/g, ' ');
            if (text.startsWith(' ')) {
                if (result.length > 0 && lastChar !== ' ' && lastChar !== '\n') {
                    result += ' ';
                    lastChar = ' ';
                }
                text = text.substring(1);
            }

            if (text) {
                const endsWithSpace = text.endsWith(' ');
                const cleanText = endsWithSpace ? text.slice(0, -1) : text;
                result += cleanText;
                lastChar = cleanText[cleanText.length - 1] || '';
                if (endsWithSpace && lastChar !== ' ' && lastChar !== '\n') {
                    result += ' ';
                    lastChar = ' ';
                }
            }
        } else {
            return;
        }
    }


    const initialIsBlock = isBlockElement(node);
    processNode(node, initialIsBlock);

    if (collapseSpaces) {
        result = result.replace(/[ \t]+/g, ' ');
        result = result.replace(/\n{3,}/g, '\n\n');
    }

    if (trimResult) {
        result = result.trim();
    }

    return result;
}
