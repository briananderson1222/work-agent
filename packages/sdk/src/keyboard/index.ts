import type { KeyboardCommand } from '../types';

export class KeyboardAPI {
  private commands = new Map<string, KeyboardCommand>();

  registerCommand(command: KeyboardCommand): void {
    const key = this.getCommandKey(command);
    if (this.commands.has(key)) {
      throw new Error(`Keyboard command conflict: ${key} already registered`);
    }
    this.commands.set(key, command);
    this.bindCommand(command);
  }

  private getCommandKey(command: KeyboardCommand): string {
    const mods = command.modifiers?.sort().join('+') || '';
    return mods ? `${mods}+${command.key}` : command.key;
  }

  private bindCommand(command: KeyboardCommand): void {
    const handler = (e: KeyboardEvent) => {
      const matches =
        e.key.toLowerCase() === command.key.toLowerCase() &&
        (!command.modifiers ||
          (command.modifiers.includes('ctrl') === e.ctrlKey &&
            command.modifiers.includes('shift') === e.shiftKey &&
            command.modifiers.includes('alt') === e.altKey &&
            command.modifiers.includes('meta') === e.metaKey));

      if (matches) {
        e.preventDefault();
        command.handler();
      }
    };
    window.addEventListener('keydown', handler);
  }
}
