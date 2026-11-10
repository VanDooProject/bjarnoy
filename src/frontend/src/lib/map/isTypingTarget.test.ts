// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isTypingTarget } from './HexMapRenderer';

describe('isTypingTarget', () => {
  it('is true for form fields and dialogs, false for the canvas and non-elements', () => {
    const input = document.createElement('input');
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const inner = document.createElement('button');
    dialog.appendChild(inner);
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(inner)).toBe(true);
    expect(isTypingTarget(document.createElement('canvas'))).toBe(false);
    expect(isTypingTarget(document.body)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
