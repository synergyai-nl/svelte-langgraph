import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createBottomScroller } from './scrollControls';

/**
 * `requestAnimationFrame` doesn't exist in the node test environment, so we stub it
 * with a queue we can flush manually — mirroring a single browser frame per flush.
 */
function stubRequestAnimationFrame() {
	const callbacks: FrameRequestCallback[] = [];

	vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
		callbacks.push(cb);
		return callbacks.length;
	});

	function flush() {
		const pending = callbacks.splice(0, callbacks.length);
		pending.forEach((cb) => cb(0));
	}

	return { flush };
}

describe('createBottomScroller', () => {
	let raf: ReturnType<typeof stubRequestAnimationFrame>;

	beforeEach(() => {
		raf = stubRequestAnimationFrame();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('coalesces multiple requests within a frame into a single scrollTo call', () => {
		const scrollTo = vi.fn();
		const container = { scrollHeight: 1234, scrollTo } as unknown as HTMLElement;
		const scroller = createBottomScroller(() => container);

		scroller.request();
		scroller.request();
		scroller.request();

		expect(scrollTo).not.toHaveBeenCalled();

		raf.flush();

		expect(scrollTo).toHaveBeenCalledTimes(1);
		expect(scrollTo).toHaveBeenCalledWith({ top: 1234, behavior: 'smooth' });
	});

	it('resolves an "instant" request within the batch even if requested after smooth ones', () => {
		const scrollTo = vi.fn();
		const container = { scrollHeight: 1234, scrollTo } as unknown as HTMLElement;
		const scroller = createBottomScroller(() => container);

		scroller.request('smooth');
		scroller.request('smooth');
		scroller.request('instant');

		raf.flush();

		expect(scrollTo).toHaveBeenCalledTimes(1);
		expect(scrollTo).toHaveBeenCalledWith({ top: 1234, behavior: 'instant' });
	});

	it('resolves an "instant" request within the batch even if requested before smooth ones', () => {
		const scrollTo = vi.fn();
		const container = { scrollHeight: 1234, scrollTo } as unknown as HTMLElement;
		const scroller = createBottomScroller(() => container);

		scroller.request('instant');
		scroller.request('smooth');

		raf.flush();

		expect(scrollTo).toHaveBeenCalledTimes(1);
		expect(scrollTo).toHaveBeenCalledWith({ top: 1234, behavior: 'instant' });
	});

	it('resets to "smooth" for the next frame after an "instant" batch resolves', () => {
		const scrollTo = vi.fn();
		const container = { scrollHeight: 1234, scrollTo } as unknown as HTMLElement;
		const scroller = createBottomScroller(() => container);

		scroller.request('instant');
		raf.flush();

		scroller.request();
		raf.flush();

		expect(scrollTo).toHaveBeenNthCalledWith(1, { top: 1234, behavior: 'instant' });
		expect(scrollTo).toHaveBeenNthCalledWith(2, { top: 1234, behavior: 'smooth' });
	});

	it('does not throw and does not call scrollTo when the container is null', () => {
		const scroller = createBottomScroller(() => null);

		expect(() => {
			scroller.request();
			raf.flush();
		}).not.toThrow();
	});

	it('schedules a new frame for requests made after the previous frame resolved', () => {
		const scrollTo = vi.fn();
		const container = { scrollHeight: 1234, scrollTo } as unknown as HTMLElement;
		const scroller = createBottomScroller(() => container);

		scroller.request();
		raf.flush();
		scroller.request();
		raf.flush();

		expect(scrollTo).toHaveBeenCalledTimes(2);
	});
});
