import { ConfigProvider, theme } from "antd";
import { EditorLayout } from "./components/EditorLayout";
import { bus } from "./bus";

export default function App() {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#2F6BFF",
          fontSize: 13
        }
      }}
    >
      <EditorLayout bus={bus} />
    </ConfigProvider>
  );
}

