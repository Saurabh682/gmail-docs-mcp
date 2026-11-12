import { describe, it, expect } from 'vitest';
import { buildAppendPlan } from '../../src/docs/appendPlan.js';

describe('buildAppendPlan', () => {
  it('builds insertText request with default blank_line separator at endIndex - 1', () => {
    const content = 'Appended paragraph.';
    const endIndex = 50; // Existing document ends at index 50
    const plan = buildAppendPlan(content, {}, endIndex);

    expect(plan.charCount).toBe(content.length);
    expect(plan.requests.length).toBe(1);

    const insertReq = plan.requests[0].insertText;
    expect(insertReq.location.index).toBe(49); // 50 - 1
    expect(insertReq.text).toBe('\n\nAppended paragraph.\n');
  });

  it('handles empty document with endIndex = 2', () => {
    const content = 'First content.';
    const plan = buildAppendPlan(content, { separator: 'none' }, 2);

    expect(plan.requests[0].insertText.location.index).toBe(1); // 2 - 1
    expect(plan.requests[0].insertText.text).toBe('First content.\n');
  });

  it('supports horizontal_rule separator', () => {
    const content = 'Section content.';
    const plan = buildAppendPlan(content, { separator: 'horizontal_rule' }, 100);

    expect(plan.requests[0].insertText.text).toBe('\n\n---\n\nSection content.\n');
  });

  it('creates heading styling request with HEADING_2 when heading is provided', () => {
    const heading = 'Weekly Review';
    const content = 'Summary details.';
    const plan = buildAppendPlan(content, { heading, separator: 'blank_line' }, 10);

    expect(plan.requests.length).toBe(2);

    const headingReq = plan.requests[1].updateParagraphStyle;
    expect(headingReq).toBeDefined();
    expect(headingReq.paragraphStyle.namedStyleType).toBe('HEADING_2');

    // insertIndex = 9. separator = '\n\n' (len 2). headingStart = 11. headingEnd = 11 + 13 = 24.
    expect(headingReq.range.startIndex).toBe(11);
    expect(headingReq.range.endIndex).toBe(11 + heading.length);
  });

  it('accurately counts UTF-16 characters and astral symbols', () => {
    const content = '₹5,000 ★ 😀 नमस्ते दुनिया';
    const plan = buildAppendPlan(content, {}, 10);

    expect(plan.charCount).toBe(content.length);
    // Emoji 😀 is 2 UTF-16 code units
    expect(content.includes('😀')).toBe(true);
  });
});
