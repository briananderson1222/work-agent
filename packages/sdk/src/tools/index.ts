import type { Tool } from '../types';

export class ToolsAPI {
  constructor(private apiBase: string, private authToken?: string) {}

  async list(): Promise<Tool[]> {
    const res = await fetch(`${this.apiBase}/tools`, {
      headers: this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}
    });
    if (!res.ok) throw new Error(`Failed to list tools: ${res.statusText}`);
    return res.json();
  }

  async get(id: string): Promise<Tool> {
    const res = await fetch(`${this.apiBase}/tools/${id}`, {
      headers: this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}
    });
    if (!res.ok) throw new Error(`Failed to get tool: ${res.statusText}`);
    return res.json();
  }

  async invoke(id: string, input: any): Promise<any> {
    const res = await fetch(`${this.apiBase}/tools/${id}/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {})
      },
      body: JSON.stringify({ input })
    });
    if (!res.ok) throw new Error(`Failed to invoke tool: ${res.statusText}`);
    return res.json();
  }

  async getSchema(id: string): Promise<any> {
    const res = await fetch(`${this.apiBase}/tools/${id}/schema`, {
      headers: this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}
    });
    if (!res.ok) throw new Error(`Failed to get tool schema: ${res.statusText}`);
    return res.json();
  }
}
