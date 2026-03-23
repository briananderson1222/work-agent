import { describe, expect, test, vi } from 'vitest';
import { EventBus } from '../event-bus.js';

describe('EventBus', () => {
  test('subscribe receives emitted events', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.subscribe(fn);
    bus.emit('test', { key: 'val' });
    expect(fn).toHaveBeenCalledWith({ event: 'test', data: { key: 'val' } });
  });

  test('unsubscribe stops delivery', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    const unsub = bus.subscribe(fn);
    unsub();
    bus.emit('test');
    expect(fn).not.toHaveBeenCalled();
  });

  test('multiple listeners all receive events', () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe(a);
    bus.subscribe(b);
    bus.emit('ping');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  test('emit without data sends undefined data', () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.subscribe(fn);
    bus.emit('bare');
    expect(fn).toHaveBeenCalledWith({ event: 'bare', data: undefined });
  });

  test('throwing listener is removed silently', () => {
    const bus = new EventBus();
    const bad = vi.fn(() => { throw new Error('boom'); });
    const good = vi.fn();
    bus.subscribe(bad);
    bus.subscribe(good);
    bus.emit('test');
    expect(good).toHaveBeenCalledTimes(1);
    // bad was removed, second emit should not call it
    bus.emit('test');
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(2);
  });
});
