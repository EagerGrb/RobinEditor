import type { ICommand } from "./ICommand.js";

export class HistoryManager {
  private undoStack: ICommand[] = [];
  private redoStack: ICommand[] = [];

  constructor(private options: { maxStackSize: number }) {}

  pushExecuted(cmd: ICommand) {
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.options.maxStackSize) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  undo() {
    const cmd = this.undoStack.pop();
    if (cmd) {
      cmd.undo();
      this.redoStack.push(cmd);
    }
  }

  redo() {
    const cmd = this.redoStack.pop();
    if (cmd) {
      cmd.execute();
      this.undoStack.push(cmd);
    }
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  reset() {
    this.undoStack = [];
    this.redoStack = [];
  }
}
