import { z } from 'zod';
import type { DocService } from '../services/DocService.js';
import { formatSuccessResult, formatErrorResult } from './result.js';

export const AppendToDocInputShape = {
  document_id: z
    .string()
    .min(1)
    .describe('The Google Doc ID or full Google Docs URL (e.g., https://docs.google.com/document/d/<id>/edit).'),
  content: z
    .string()
    .min(1)
    .max(100000)
    .describe('The text content to append to the end of the document (1-100,000 characters).'),
  format: z
    .enum(['plain', 'markdown_basic'])
    .optional()
    .default('plain')
    .describe('Formatting mode: "plain" (default) or "markdown_basic".'),
  separator: z
    .enum(['none', 'newline', 'blank_line', 'horizontal_rule'])
    .optional()
    .default('blank_line')
    .describe('Separator inserted before content: "blank_line" (default), "newline", "horizontal_rule", or "none".'),
  heading: z
    .string()
    .optional()
    .describe('Optional Heading 2 title placed immediately before the appended content.'),
  dry_run: z
    .boolean()
    .optional()
    .describe('When true, verifies document access and calculates the update without writing to the document.'),
};

export function createAppendToDocHandler(docService: DocService) {
  return async (args: {
    document_id: string;
    content: string;
    format?: 'plain' | 'markdown_basic';
    separator?: 'none' | 'newline' | 'blank_line' | 'horizontal_rule';
    heading?: string;
    dry_run?: boolean;
  }) => {
    try {
      const result = await docService.append(args);
      return formatSuccessResult(result);
    } catch (error) {
      return formatErrorResult(error);
    }
  };
}
