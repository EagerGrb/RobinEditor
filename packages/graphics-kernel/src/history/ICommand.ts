export interface ICommand {
  readonly id: string;
  readonly label: string;
  execute(): void;
  undo(): void;
}
