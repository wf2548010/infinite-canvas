"use client";

import { CheckCircleOutlined, CodeOutlined, DeleteOutlined, FormatPainterOutlined, PlusOutlined, ReloadOutlined, SaveOutlined } from "@ant-design/icons";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { json } from "@codemirror/lang-json";
import { tags } from "@lezer/highlight";
import { App, Button, Card, Col, Flex, Form, Input, Row, Segmented, Select, Space, Switch, Tag, Typography } from "antd";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { EditorView } from "@uiw/react-codemirror";

import { fetchAdminSettings, saveAdminSettings, type AdminSettings } from "@/services/api/admin";
import { useUserStore } from "@/stores/use-user-store";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), { ssr: false });
const jsonEditorTheme = EditorView.theme({
  "&": { backgroundColor: "var(--card)", color: "var(--foreground)" },
  ".cm-content": { caretColor: "var(--foreground)", padding: "12px 0" },
  ".cm-line": { padding: "0 18px" },
  ".cm-gutters": { backgroundColor: "color-mix(in srgb, var(--card) 94%, var(--foreground))", borderRight: "1px solid var(--border)", color: "var(--muted-foreground)" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--primary) 9%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "color-mix(in srgb, var(--primary) 10%, transparent)", color: "var(--foreground)" },
  ".cm-cursor": { borderLeftColor: "var(--foreground)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: "color-mix(in srgb, var(--primary) 25%, transparent)" },
  ".cm-foldPlaceholder": { backgroundColor: "var(--muted)", border: "1px solid var(--border)", color: "var(--muted-foreground)" },
  "&.cm-focused": { outline: "none" },
}, { dark: true });
const jsonHighlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: "#f2a7a7" },
  { tag: tags.string, color: "#d6c6a8" },
  { tag: tags.number, color: "#ddb27d" },
  { tag: tags.bool, color: "#c5b3ff" },
  { tag: tags.null, color: "#c5b3ff" },
  { tag: tags.punctuation, color: "rgba(250, 250, 249, 0.62)" },
  { tag: tags.squareBracket, color: "rgba(250, 250, 249, 0.62)" },
  { tag: tags.brace, color: "rgba(250, 250, 249, 0.62)" },
]);

const emptySettings: AdminSettings = {
  public: {
    availableModels: [],
    defaultModel: "",
    defaultImageModel: "",
    defaultTextModel: "",
    systemPrompt: "",
    allowCustomModel: false,
  },
  private: { channels: [] },
};

export default function AdminSettingsPage() {
  const token = useUserStore((state) => state.token);
  const { message } = App.useApp();
  const [form] = Form.useForm<AdminSettings>();
  const [mode, setMode] = useState<"visual" | "json">("visual");
  const [jsonText, setJsonText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const models = Form.useWatch(["public", "availableModels"], form) || [];
  const jsonError = mode === "json" ? getJsonError(jsonText) : "";

  const loadSettings = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const data = normalizeSettings(await fetchAdminSettings(token));
      form.setFieldsValue(data);
      setJsonText(JSON.stringify(data, null, 2));
    } catch (error) {
      message.error(error instanceof Error ? error.message : "读取设置失败");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, [token]);

  const changeMode = (nextMode: "visual" | "json") => {
    if (nextMode === "json") {
      const values = normalizeSettings(form.getFieldsValue(true) as AdminSettings);
      setJsonText(JSON.stringify(values, null, 2));
    } else {
      const parsed = parseJsonSettings(jsonText);
      if (!parsed) {
        message.error("JSON 格式不正确");
        return;
      }
      form.setFieldsValue(parsed);
    }
    setMode(nextMode);
  };

  const saveSettings = async () => {
    if (!token) return;
    const values = mode === "json" ? parseJsonSettings(jsonText) : normalizeSettings(await form.validateFields());
    if (!values) {
      message.error("JSON 格式不正确");
      return;
    }
    setIsSaving(true);
    try {
      const saved = normalizeSettings(await saveAdminSettings(token, values));
      form.setFieldsValue(saved);
      setJsonText(JSON.stringify(saved, null, 2));
      message.success("已保存");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setIsSaving(false);
    }
  };

  const formatJson = () => {
    const parsed = parseJsonSettings(jsonText);
    if (!parsed) {
      message.error("JSON 格式不正确");
      return;
    }
    setJsonText(JSON.stringify(parsed, null, 2));
  };

  return (
    <main style={{ padding: 24 }}>
      <Flex vertical gap={16}>
        <Card variant="borderless">
          <Flex justify="space-between" align="center" gap={16} wrap>
            <Space>
              <Segmented value={mode} onChange={(value) => changeMode(value as "visual" | "json")} options={[{ label: "可视化编辑", value: "visual" }, { label: "手动编辑 JSON", value: "json" }]} />
              <Button icon={<ReloadOutlined />} loading={isLoading} onClick={() => void loadSettings()}>刷新</Button>
            </Space>
            <Button type="primary" icon={<SaveOutlined />} loading={isSaving} onClick={() => void saveSettings()}>保存设置</Button>
          </Flex>
        </Card>

        {mode === "visual" ? (
          <Form form={form} layout="vertical" initialValues={emptySettings} requiredMark={false}>
            <Card title="公开配置" variant="borderless" style={{ marginBottom: 16 }}>
              <Row gutter={16}>
                <Col span={24}><Form.Item name={["public", "availableModels"]} label="系统可用模型"><Select mode="tags" tokenSeparators={[",", "\n"]} options={models.map((item) => ({ label: item, value: item }))} /></Form.Item></Col>
                <Col xs={24} md={8}><Form.Item name={["public", "defaultModel"]} label="默认模型"><Select showSearch allowClear options={models.map((item) => ({ label: item, value: item }))} /></Form.Item></Col>
                <Col xs={24} md={8}><Form.Item name={["public", "defaultImageModel"]} label="默认图片模型"><Select showSearch allowClear options={models.map((item) => ({ label: item, value: item }))} /></Form.Item></Col>
                <Col xs={24} md={8}><Form.Item name={["public", "defaultTextModel"]} label="默认文本模型"><Select showSearch allowClear options={models.map((item) => ({ label: item, value: item }))} /></Form.Item></Col>
                <Col span={24}><Form.Item name={["public", "systemPrompt"]} label="系统提示词"><Input.TextArea rows={4} /></Form.Item></Col>
                <Col span={24}><Form.Item name={["public", "allowCustomModel"]} label="允许用户自定义模型" valuePropName="checked"><Switch /></Form.Item></Col>
              </Row>
            </Card>

            <Card title="模型渠道" variant="borderless">
              <Form.List name={["private", "channels"]}>
                {(fields, { add, remove }) => (
                  <Flex vertical gap={12}>
                    {fields.map((field) => (
                      <div key={field.key} style={{ border: "1px solid var(--ant-color-border)", borderRadius: 6, padding: 16 }}>
                        <Flex justify="space-between" align="center" style={{ marginBottom: 12 }}>
                          <Typography.Text strong>{`渠道 ${field.name + 1}`}</Typography.Text>
                          <Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                        </Flex>
                        <Row gutter={16}>
                          <Col xs={24} md={8}><Form.Item name={[field.name, "key"]} label="渠道标识"><Input /></Form.Item></Col>
                          <Col xs={24} md={8}><Form.Item name={[field.name, "name"]} label="渠道名称"><Input /></Form.Item></Col>
                          <Col xs={24} md={8}><Form.Item name={[field.name, "enabled"]} label="启用" valuePropName="checked"><Switch /></Form.Item></Col>
                          <Col xs={24} md={12}><Form.Item name={[field.name, "baseUrl"]} label="接口地址"><Input /></Form.Item></Col>
                          <Col xs={24} md={12}><Form.Item name={[field.name, "apiKey"]} label="API Key"><Input.Password /></Form.Item></Col>
                          <Col span={24}><Form.Item name={[field.name, "models"]} label="渠道可用模型"><Select mode="tags" tokenSeparators={[",", "\n"]} /></Form.Item></Col>
                          <Col span={24}><Form.Item name={[field.name, "remark"]} label="备注"><Input.TextArea rows={2} /></Form.Item></Col>
                        </Row>
                      </div>
                    ))}
                    <Button icon={<PlusOutlined />} onClick={() => add({ key: "", name: "", baseUrl: "", apiKey: "", models: [], enabled: true, remark: "" })}>新增渠道</Button>
                  </Flex>
                )}
              </Form.List>
            </Card>
          </Form>
        ) : (
          <Card variant="borderless">
            <Flex justify="space-between" align="center" gap={12} wrap style={{ marginBottom: 12 }}>
              <Space>
                <CodeOutlined />
                <Typography.Text strong>完整配置 JSON</Typography.Text>
                {jsonError ? <Tag color="error">{jsonError}</Tag> : <Tag color="success" icon={<CheckCircleOutlined />}>JSON 格式正确</Tag>}
              </Space>
              <Button icon={<FormatPainterOutlined />} onClick={formatJson}>格式化</Button>
            </Flex>
            <div style={{ overflow: "hidden", border: "1px solid var(--ant-color-border)", borderRadius: 6 }}>
              <CodeMirror
                value={jsonText}
                height="560px"
                extensions={[json(), jsonEditorTheme, syntaxHighlighting(jsonHighlightStyle)]}
                basicSetup={{ foldGutter: true, lineNumbers: true, highlightActiveLine: true, highlightActiveLineGutter: true }}
                theme="none"
                onChange={setJsonText}
                className="admin-json-editor"
                style={{ fontSize: 13 }}
              />
            </div>
          </Card>
        )}
      </Flex>
    </main>
  );
}

function normalizeSettings(settings: Partial<AdminSettings> = {}): AdminSettings {
  return {
    public: {
      ...emptySettings.public,
      ...(settings.public || {}),
      availableModels: settings.public?.availableModels || [],
    },
    private: {
      channels: (settings.private?.channels || []).map((item) => ({
        key: item.key || "",
        name: item.name || "",
        baseUrl: item.baseUrl || "",
        apiKey: item.apiKey || "",
        models: item.models || [],
        enabled: Boolean(item.enabled),
        remark: item.remark || "",
      })),
    },
  };
}

function parseJsonSettings(value: string) {
  try {
    return normalizeSettings(JSON.parse(value) as AdminSettings);
  } catch {
    return null;
  }
}

function getJsonError(value: string) {
  try {
    JSON.parse(value);
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : "JSON 格式不正确";
  }
}
