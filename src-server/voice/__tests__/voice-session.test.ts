import { EventEmitter } from 'events';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { VoiceSessionService } from '../voice-session.js';
import type { IS2SProvider, S2SAudioFormat, S2SSessionConfig } from '../s2s-types.js';

const INPUT_FORMAT: S2SAudioFormat = {
  mediaType: 'audio/pcm',
  sampleRateHertz: 16000,
  sampleSizeBits: 16,
  channelCount: 1,
  encoding: 'base64',
};

const OUTPUT_FORMAT: S2SAudioFormat = {
  mediaType: 'audio/pcm',
  sampleRateHertz: 24000,
  sampleSizeBits: 16,
  channelCount: 1,
  encoding: 'base64',
};

class MockS2SProvider extends EventEmitter implements IS2SProvider {
  private _state: IS2SProvider['state'] = 'disconnected';
  readonly outputAudioFormat = OUTPUT_FORMAT;
  sendAudioCalls: Buffer[] = [];
  sendToolResultCalls: Array<{ toolUseId: string; result: string }> = [];

  async connect(_config: S2SSessionConfig): Promise<S2SAudioFormat> {
    this._state = 'listening';
    return INPUT_FORMAT;
  }
  sendAudio(chunk: Buffer): void { this.sendAudioCalls.push(chunk); }
  sendToolResult(toolUseId: string, result: string): void { this.sendToolResultCalls.push({ toolUseId, result }); }
  async disconnect(): Promise<void> { this._state = 'disconnected'; }
  get state() { return this._state; }
}

class MockWebSocket {
  readyState = 1;
  OPEN = 1;
  sentMessages: object[] = [];
  private handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  send(data: string): void { this.sentMessages.push(JSON.parse(data)); }
  on(event: string, handler: (...args: unknown[]) => void): void { (this.handlers[event] ??= []).push(handler); }
  close(): void { this.readyState = 3; }
  trigger(event: string, ...args: unknown[]): void { this.handlers[event]?.forEach((h) => h(...args)); }
}

const tick = () => new Promise((r) => setTimeout(r, 10));

function makeService(toolExecutor?: ReturnType<typeof vi.fn>) {
  let provider: MockS2SProvider;
  const factory = () => { provider = new MockS2SProvider(); return provider as unknown as IS2SProvider; };
  const service = new VoiceSessionService({ providerFactory: factory, toolExecutor });
  return { service, getProvider: () => provider! };
}

describe('VoiceSessionService', () => {
  test('createSession returns a session ID and sends session_ready', async () => {
    const { service } = makeService();
    const ws = new MockWebSocket();
    const id = service.createSession(ws as any);
    expect(typeof id).toBe('string');
    await tick();
    expect(ws.sentMessages).toContainEqual({
      type: 'session_ready',
      inputAudioFormat: INPUT_FORMAT,
      outputAudioFormat: OUTPUT_FORMAT,
    });
  });

  test('destroySession calls provider.disconnect', async () => {
    const { service, getProvider } = makeService();
    const ws = new MockWebSocket();
    const id = service.createSession(ws as any);
    await tick();
    const spy = vi.spyOn(getProvider(), 'disconnect');
    service.destroySession(id);
    expect(spy).toHaveBeenCalled();
  });

  test('getActiveCount tracks sessions', async () => {
    const { service } = makeService();
    const ws1 = new MockWebSocket();
    const ws2 = new MockWebSocket();
    const id1 = service.createSession(ws1 as any);
    service.createSession(ws2 as any);
    expect(service.getActiveCount()).toBe(2);
    service.destroySession(id1);
    expect(service.getActiveCount()).toBe(1);
  });
});

describe('VoiceSession wiring', () => {
  let ws: MockWebSocket;
  let provider: MockS2SProvider;

  beforeEach(async () => {
    ws = new MockWebSocket();
    const built = makeService();
    built.service.createSession(ws as any);
    await tick();
    provider = built.getProvider();
  });

  test('audio_in from WebSocket is forwarded to provider.sendAudio', () => {
    const buf = Buffer.from('hello');
    ws.trigger('message', JSON.stringify({ type: 'audio_in', data: buf.toString('base64') }));
    expect(provider.sendAudioCalls).toHaveLength(1);
    expect(provider.sendAudioCalls[0]).toEqual(buf);
  });

  test('provider audio event is forwarded as audio_out to WebSocket', () => {
    const chunk = Buffer.from([1, 2, 3]);
    provider.emit('audio', chunk);
    expect(ws.sentMessages).toContainEqual({ type: 'audio_out', data: chunk.toString('base64') });
  });

  test('provider transcript event is forwarded to WebSocket', () => {
    provider.emit('transcript', { text: 'hello', role: 'user', stage: 'final' });
    expect(ws.sentMessages).toContainEqual({ type: 'transcript', text: 'hello', role: 'user', stage: 'final' });
  });

  test('provider stateChange event is forwarded to WebSocket', () => {
    provider.emit('stateChange', 'speaking');
    expect(ws.sentMessages).toContainEqual({ type: 'state', state: 'speaking' });
  });

  test('provider error event is forwarded to WebSocket', () => {
    provider.emit('error', new Error('boom'));
    expect(ws.sentMessages).toContainEqual({ type: 'error', message: 'boom' });
  });

  test('full tool use cycle: toolUse → toolExecutor → sendToolResult', async () => {
    const executor = vi.fn().mockResolvedValue('calendar result');
    const ws2 = new MockWebSocket();
    const built2 = makeService(executor);
    built2.service.createSession(ws2 as any);
    await tick();
    const p2 = built2.getProvider();

    p2.emit('toolUse', { toolName: 'get_calendar_events', toolUseId: 'tu-1', parameters: { date: 'today' } });
    await tick();

    expect(executor).toHaveBeenCalledWith('get_calendar_events', { date: 'today' });
    expect(p2.sendToolResultCalls).toHaveLength(1);
    expect(p2.sendToolResultCalls[0]).toEqual({ toolUseId: 'tu-1', result: 'calendar result' });
  });

  test('toolUse without executor returns fallback message', async () => {
    provider.emit('toolUse', { toolName: 'some_tool', toolUseId: 'tu-2', parameters: {} });
    await tick();
    expect(provider.sendToolResultCalls).toHaveLength(1);
    expect(provider.sendToolResultCalls[0].result).toContain('No tool executor');
  });

  test('WebSocket close triggers session cleanup', async () => {
    const spy = vi.spyOn(provider, 'disconnect');
    ws.trigger('close');
    await tick();
    expect(spy).toHaveBeenCalled();
  });

  test('provider connect failure sends error to WebSocket and cleans up', async () => {
    const failFactory = () => {
      const p = new MockS2SProvider();
      vi.spyOn(p, 'connect').mockRejectedValue(new Error('connect failed'));
      return p as unknown as IS2SProvider;
    };
    const failService = new VoiceSessionService({ providerFactory: failFactory });
    const ws3 = new MockWebSocket();
    failService.createSession(ws3 as any);
    await tick();
    expect(ws3.sentMessages).toContainEqual({ type: 'error', message: 'connect failed' });
    expect(failService.getActiveCount()).toBe(0);
  });
});
