import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '../../utils/debounce';

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('invokes the wrapped fn once after the delay with the latest args', () => {
    const fn = vi.fn();
    const d = debounce(fn, 200);

    d('a');
    d('b');
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('b');
  });

  it('cancel() drops a pending invocation', () => {
    const fn = vi.fn();
    const d = debounce(fn, 200);

    d('x');
    d.cancel();
    vi.advanceTimersByTime(500);

    expect(fn).not.toHaveBeenCalled();
  });

  it('cancel() is safe when nothing is pending', () => {
    const fn = vi.fn();
    const d = debounce(fn, 200);
    expect(() => d.cancel()).not.toThrow();
  });
});
