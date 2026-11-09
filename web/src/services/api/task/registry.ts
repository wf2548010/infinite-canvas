import type { TaskLifecycleDriver } from "./types";
import { comfyuiTaskDriver } from "./drivers/comfyui-driver";

const driverRegistry = new Map<string, TaskLifecycleDriver>();

// 默认注册官方 ComfyUI 驱动
driverRegistry.set("comfyui", comfyuiTaskDriver);

export function registerTaskDriver(protocol: string, driver: TaskLifecycleDriver): void {
    driverRegistry.set(protocol.toLowerCase(), driver);
}

export function getTaskDriver(protocol?: string): TaskLifecycleDriver {
    const key = (protocol || "comfyui").toLowerCase();
    const driver = driverRegistry.get(key);
    if (!driver) throw new Error(`不支持的任务协议：${key}`);
    return driver;
}

export function resetTaskDrivers(): void {
    driverRegistry.clear();
    driverRegistry.set("comfyui", comfyuiTaskDriver);
}
