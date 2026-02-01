import { ReactNode } from "react";
import "../styles.css";

export type EditorShellProps = {
  top: ReactNode;
  left: ReactNode;
  right: ReactNode;
  bottom: ReactNode;
  status: ReactNode;
  canvas: ReactNode;
};

export function EditorShell({ top, left, right, bottom, status, canvas }: EditorShellProps) {
  return (
    <div className="uiShellRoot">
      <div className="uiShellTop">{top}</div>
      <div className="uiShellLeft">{left}</div>
      <div className="uiShellCanvas">{canvas}</div>
      <div className="uiShellRight">{right}</div>
      <div className="uiShellBottom">
        {bottom}
        {status}
      </div>
    </div>
  );
}
