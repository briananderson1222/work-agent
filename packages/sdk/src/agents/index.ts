import type { Agent, InvokeOptions, InvokeResult } from '../types';

export class AgentsAPI {
  constructor(private apiBase: string, private authToken?: string) {}

  async list(): Promise<Agent[]> {
    const res = await fetch(`${this.apiBase}/agents`, {
      headers: this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}
    });
    if (!res.ok) throw new Error(`Failed to list agents: ${res.statusText}`);
    return res.json();
  }

  async get(slug: string): Promise<Agent> {
    const res = await fetch(`${this.apiBase}/agents/${slug}`, {
      headers: this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}
    });
    if (!res.ok) throw new Error(`Failed to get agent: ${res.statusText}`);
    return res.json();
  }

  async invoke(slug: string, prompt: string, options: InvokeOptions = {}): Promise<InvokeResult> {
    const res = await fetch(`${this.apiBase}/agents/${slug}/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {})
      },
      body: JSON.stringify({ 
        prompt,
        silent: true,
        tools: options.tools,
        maxSteps: options.maxSteps ?? 10
      }),
      signal: options.signal
    });
    if (!res.ok) throw new Error(`Failed to invoke agent: ${res.statusText}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Request failed');
    return { output: data.response, toolCalls: data.toolCalls };
  }

  async *streamInvoke(slug: string, prompt: string, options: InvokeOptions = {}): AsyncGenerator<string> {
    const res = await fetch(`${this.apiBase}/agents/${slug}/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {})
      },
      body: JSON.stringify({ prompt, ...options }),
      signal: options.signal
    });
    if (!res.ok) throw new Error(`Failed to stream invoke: ${res.statusText}`);
    
    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');
    
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield decoder.decode(value);
    }
  }

  async sendToChat(slug: string, message: string): Promise<void> {
    await fetch(`${this.apiBase}/agents/${slug}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {})
      },
      body: JSON.stringify({ message })
    });
  }

  cancel(slug: string): void {
    // Cancellation handled via AbortController signal
  }
}
