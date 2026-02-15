import { ReactNode } from "react";
import "../styles.css";

export type EditorShellProps = {
  top: ReactNode;
  toolbar?: ReactNode;
  left: ReactNode;
  right: ReactNode;
  bottom: ReactNode;
  status: ReactNode;
  canvas: ReactNode;
};

export function EditorShell({ top, toolbar, left, right, bottom, status, canvas }: EditorShellProps) {
  return (
    <div className="uiShellRoot">
      <div className="uiShellTop">
        {top}
        {toolbar}
      </div>
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
