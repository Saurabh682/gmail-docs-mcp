export type SeparatorType = 'none' | 'newline' | 'blank_line' | 'horizontal_rule';

export interface AppendPlanOptions {
  separator?: SeparatorType;
  heading?: string;
  format?: 'plain' | 'markdown_basic';
}

export interface AppendPlanResult {
  requests: any[];
  charCount: number;
}

export function buildAppendPlan(
  content: string,
  options: AppendPlanOptions,
  endIndex: number
): AppendPlanResult {
  const separatorType = options.separator ?? 'blank_line';

  // Compute separator string
  let separatorPrefix = '';
  switch (separatorType) {
    case 'newline':
      separatorPrefix = '\n';
      break;
    case 'blank_line':
      separatorPrefix = '\n\n';
      break;
    case 'horizontal_rule':
      separatorPrefix = '\n\n---\n\n';
      break;
    case 'none':
    default:
      separatorPrefix = '';
      break;
  }

  // Target insertion index in Google Docs is endIndex - 1 (before trailing document newline)
  const insertIndex = Math.max(1, endIndex - 1);

  let fullBlock = '';
  let headingRange: { startIndex: number; endIndex: number } | null = null;

  if (options.heading && options.heading.trim()) {
    const headingText = options.heading.trim();
    const headingStart = insertIndex + separatorPrefix.length;
    const headingEnd = headingStart + headingText.length;

    headingRange = {
      startIndex: headingStart,
      endIndex: headingEnd,
    };

    fullBlock = `${separatorPrefix}${headingText}\n\n${content}`;
  } else {
    fullBlock = `${separatorPrefix}${content}`;
  }

  // Ensure append block ends with a clean newline if not already present
  if (!fullBlock.endsWith('\n')) {
    fullBlock += '\n';
  }

  const requests: any[] = [
    {
      insertText: {
        location: {
          index: insertIndex,
        },
        text: fullBlock,
      },
    },
  ];

  if (headingRange) {
    requests.push({
      updateParagraphStyle: {
        range: {
          startIndex: headingRange.startIndex,
          endIndex: headingRange.endIndex,
        },
        paragraphStyle: {
          namedStyleType: 'HEADING_2',
        },
        fields: 'namedStyleType',
      },
    });
  }

  return {
    requests,
    charCount: content.length,
  };
}
