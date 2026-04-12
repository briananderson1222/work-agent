import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { CanonicalRuntimeEvent } from '@stallion-ai/contracts/runtime-events';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

export class AsyncEventQueue implements AsyncIterable<CanonicalRuntimeEvent> {
  private items: CanonicalRuntimeEvent[] = [];
  private waiters: Array<Deferred<IteratorResult<CanonicalRuntimeEvent>>> = [];

  push(event: CanonicalRuntimeEvent): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve({ value: event, done: false });
      return;
    }
    this.items.push(event);
  }

  [Symbol.asyncIterator](): AsyncIterator<CanonicalRuntimeEvent> {
    return {
      next: async () => {
        const queued = this.items.shift();
        if (queued) {
          return { value: queued, done: false };
        }
        const waiter = createDeferred<IteratorResult<CanonicalRuntimeEvent>>();
        this.waiters.push(waiter);
        return waiter.promise;
      },
    };
  }
}

export class AsyncUserMessageQueue implements AsyncIterable<SDKUserMessage> {
  private items: SDKUserMessage[] = [];
  private waiters: Array<Deferred<IteratorResult<SDKUserMessage>>> = [];
  private closed = false;

  push(message: SDKUserMessage): void {
    if (this.closed) {
      return;
    }
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve({ value: message, done: false });
      return;
    }
    this.items.push(message);
  }

  close(): void {
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter.resolve({ value: undefined as never, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: async () => {
        const queued = this.items.shift();
        if (queued) {
          return { value: queued, done: false };
        }
        if (this.closed) {
          return { value: undefined as never, done: true };
        }
        const waiter = createDeferred<IteratorResult<SDKUserMessage>>();
        this.waiters.push(waiter);
        return waiter.promise;
      },
    };
  }
}
