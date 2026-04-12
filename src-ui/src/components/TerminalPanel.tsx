import { executeCodingCommand, fetchTerminalPort } from '@stallion-ai/sdk';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { useEffect, useRef, useState } from 'react';
import '@xterm/xterm/css/xterm.css';
import { useApiBase } from '../contexts/ApiBaseContext';

export function TerminalPanel({
  projectSlug,
  workingDir,
  terminalId = 'default',
  shell,
  shellArgs,
}: {
  projectSlug: string;
  workingDir: string;
  terminalId?: string;
  shell?: string;
  shellArgs?: string[];
}) {
  const { apiBase } = useApiBase();
  const containerRef = useRef<HTMLDivElement>(null);
  const [wsError, setWsError] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontSize: 12,
      fontFamily:
        "'MesloLGS NF', 'MesloLGM Nerd Font', 'Hack Nerd Font', 'FiraCode Nerd Font', 'JetBrainsMono Nerd Font', Menlo, courier-new, courier, monospace",
      theme: {
        background: '#1a1a2e',
        foreground: '#e0e0e0',
        cursor: '#7ec8e3',
        selectionBackground: '#3a3a5e',
        black: '#1a1a2e',
        brightBlack: '#4a4a6e',
        red: '#f44336',
        brightRed: '#ef5350',
        green: '#4caf50',
        brightGreen: '#66bb6a',
        yellow: '#ffeb3b',
        brightYellow: '#fff176',
        blue: '#2196f3',
        brightBlue: '#42a5f5',
        magenta: '#9c27b0',
        brightMagenta: '#ab47bc',
        cyan: '#7ec8e3',
        brightCyan: '#80deea',
        white: '#e0e0e0',
        brightWhite: '#ffffff',
      },
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    fitAddon.fit();

    let ws: WebSocket | null = null;
    let sessionId: string | null = null;
    let disposed = false;

    const connectWs = async () => {
      let port: number;
      try {
        port = await fetchTerminalPort(apiBase);
      } catch {
        if (!disposed) setWsError(true);
        return;
      }

      ws = new WebSocket(`ws://localhost:${port}`);

      ws.onopen = () => {
        ws!.send(
          JSON.stringify({
            type: 'open',
            projectSlug,
            terminalId,
            cwd: workingDir,
            ...(shell && { shell }),
            ...(shellArgs && { shellArgs }),
            cols: terminal.cols,
            rows: terminal.rows,
          }),
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.type === 'snapshot') {
            sessionId = msg.sessionId;
            if (msg.history) terminal.write(msg.history);
          } else if (msg.type === 'data') {
            terminal.write(msg.data);
          } else if (msg.type === 'exited') {
            terminal.write('\r\n[terminal exited]\r\n');
          }
        } catch {
          /* ignore malformed */
        }
      };

      ws.onerror = () => {
        if (!disposed) setWsError(true);
      };
    };

    connectWs();

    const dataDispose = terminal.onData((data) => {
      if (ws?.readyState === WebSocket.OPEN && sessionId) {
        ws.send(JSON.stringify({ type: 'data', sessionId, data }));
      }
    });

    const observer = new ResizeObserver(() => {
      fitAddon.fit();
      if (ws?.readyState === WebSocket.OPEN && sessionId) {
        ws.send(
          JSON.stringify({
            type: 'resize',
            sessionId,
            cols: terminal.cols,
            rows: terminal.rows,
          }),
        );
      }
    });
    if (containerRef.current) observer.observe(containerRef.current);

    return () => {
      disposed = true;
      dataDispose.dispose();
      observer.disconnect();
      // Tell server to close the PTY session
      if (ws?.readyState === WebSocket.OPEN && sessionId) {
        ws.send(JSON.stringify({ type: 'close', sessionId }));
      }
      terminal.dispose();
      ws?.close();
    };
  }, [apiBase, projectSlug, workingDir, terminalId, shell, shellArgs]);

  if (wsError) {
    return <CommandExecutor workingDir={workingDir} />;
  }

  return (
    <div
      ref={containerRef}
      style={{ height: '100%', width: '100%', background: '#1a1a2e' }}
    />
  );
}

// ─── Fallback: REST-based command executor ────────────────────────────────────

function CommandExecutor({ workingDir }: { workingDir: string }) {
  const { apiBase } = useApiBase();
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [lines, setLines] = useState<
    { text: string; type: 'cmd' | 'out' | 'err' }[]
  >([]);
  const [running, setRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, []);

  const run = async () => {
    const cmd = input.trim();
    if (!cmd || !workingDir) return;
    setHistory((h) => [cmd, ...h.slice(0, 49)]);
    setHistIdx(-1);
    setLines((l) => [...l, { text: `$ ${cmd}`, type: 'cmd' }]);
    setInput('');
    setRunning(true);
    try {
      const d = await executeCodingCommand(cmd, workingDir, apiBase);
      if (d.stdout) setLines((l) => [...l, { text: d.stdout, type: 'out' }]);
      if (d.stderr) setLines((l) => [...l, { text: d.stderr, type: 'err' }]);
    } catch (e: any) {
      setLines((l) => [...l, { text: e.message, type: 'err' }]);
    }
    setRunning(false);
  };

  useEffect(() => {
    if (!running) inputRef.current?.focus();
  }, [running]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      run();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(histIdx + 1, history.length - 1);
      setHistIdx(next);
      if (history[next]) setInput(history[next]);
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = histIdx - 1;
      setHistIdx(next);
      setInput(next < 0 ? '' : (history[next] ?? ''));
    }
    if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setLines([]);
    }
  };

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#1a1a2e',
        fontFamily: 'monospace',
        fontSize: '12px',
      }}
      onClick={() => inputRef.current?.focus()}
    >
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 12px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {lines.map((l, i) => (
          <div
            key={i}
            style={{
              color:
                l.type === 'cmd'
                  ? '#7ec8e3'
                  : l.type === 'err'
                    ? '#f44336'
                    : '#b0b0b0',
              lineHeight: '1.5',
            }}
          >
            {l.text}
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '4px 12px 8px',
          gap: '6px',
          flexShrink: 0,
        }}
      >
        <span style={{ color: '#7ec8e3' }}>$</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder={
            workingDir
              ? running
                ? 'Running...'
                : 'Type a command...'
              : 'No working directory'
          }
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#e0e0e0',
            fontFamily: 'inherit',
            fontSize: 'inherit',
          }}
        />
      </div>
    </div>
  );
}
