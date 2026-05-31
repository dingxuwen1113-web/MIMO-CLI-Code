// ── 专家团队 Agent 注册表 ─────────────────────────

export interface ExpertAgent {
  id: string;
  name: string;
  description: string;
  category: string;
  triggers: string[];
  filePath: string;
}

// 所有内置专家 Agent 定义
export const EXPERT_AGENTS: ExpertAgent[] = [
  // ── 桌面平台 ──────────────────────────────────
  {
    id: 'windows-app-expert',
    name: 'Windows 应用开发专家',
    description: 'Win32/WPF/WinUI/MAUI/C#/.NET 桌面应用开发',
    category: 'desktop',
    triggers: ['windows', 'win32', 'wpf', 'winui', 'maui', '.net', 'csharp', 'winforms'],
    filePath: 'agents/desktop/windows-app-expert.md',
  },
  {
    id: 'linux-app-expert',
    name: 'Linux 应用开发专家',
    description: 'GTK/Qt/Tauri/Electron/AppImage/Flatpak Linux 桌面应用',
    category: 'desktop',
    triggers: ['linux', 'gtk', 'qt', 'kde', 'gnome', 'wayland', 'tauri', 'flatpak'],
    filePath: 'agents/desktop/linux-app-expert.md',
  },
  {
    id: 'macos-app-expert',
    name: 'macOS 应用开发专家',
    description: 'SwiftUI/AppKit/Catalyst/Xcode/Notarization macOS 应用',
    category: 'desktop',
    triggers: ['macos', 'mac', 'swift', 'swiftui', 'appkit', 'xcode', 'cocoa'],
    filePath: 'agents/desktop/macos-app-expert.md',
  },

  // ── 移动平台 ──────────────────────────────────
  {
    id: 'android-expert',
    name: 'Android 应用开发专家',
    description: 'Kotlin/Jetpack Compose/Gradle/Play Store Android 应用',
    category: 'mobile',
    triggers: ['android', 'kotlin', 'jetpack', 'compose', 'gradle', 'play store'],
    filePath: 'agents/mobile/android-expert.md',
  },
  {
    id: 'ios-expert',
    name: 'iOS 应用开发专家',
    description: 'SwiftUI/UIKit/Core Data/App Store/TestFlight iOS 应用',
    category: 'mobile',
    triggers: ['ios', 'iphone', 'ipad', 'swift', 'swiftui', 'uikit', 'xcode'],
    filePath: 'agents/mobile/ios-expert.md',
  },
  {
    id: 'harmonyos-expert',
    name: '鸿蒙应用开发专家',
    description: 'ArkTS/ArkUI/Stage模型/AppGallery/元服务 鸿蒙应用',
    category: 'mobile',
    triggers: ['harmonyos', '鸿蒙', 'arkts', 'arkui', '华为', 'huawei', 'appgallery'],
    filePath: 'agents/mobile/harmonyos-expert.md',
  },

  // ── 游戏开发 ──────────────────────────────────
  {
    id: 'aaa-game-expert',
    name: '3A 游戏开发专家',
    description: 'UE5/Unity/C++/渲染管线/开放世界/多人联机 3A 级游戏',
    category: 'gaming',
    triggers: ['3a', 'aaa', 'unreal', 'ue5', 'unity', 'game', '游戏', 'open world', 'multiplayer'],
    filePath: 'agents/gaming/aaa-game-expert.md',
  },
  {
    id: 'indie-game-expert',
    name: '独立游戏开发专家',
    description: 'Godot/Ren\'Py/像素风/Roguelike/叙事/Steam 发布 独立游戏',
    category: 'gaming',
    triggers: ['indie', '独立游戏', 'godot', 'roguelike', 'pixel', 'visual novel', 'steam'],
    filePath: 'agents/gaming/indie-game-expert.md',
  },
  {
    id: 'mobile-game-expert',
    name: '手游开发专家',
    description: 'Unity/Cocos/性能优化/付费设计/渠道接入/热更新 手游',
    category: 'gaming',
    triggers: ['mobile game', '手游', 'cocos', 'hyper casual', 'gacha', 'iap', 'ads'],
    filePath: 'agents/gaming/mobile-game-expert.md',
  },
  {
    id: 'game-engine-expert',
    name: '游戏引擎开发专家',
    description: '自研引擎/ECS/物理/音频/脚本系统/渲染图/跨平台 引擎开发',
    category: 'gaming',
    triggers: ['game engine', '游戏引擎', 'ecs', 'physics engine', 'renderer', 'vulkan', 'directx'],
    filePath: 'agents/gaming/game-engine-expert.md',
  },

  // ── 专业领域 ──────────────────────────────────
  {
    id: 'graphics-programming-expert',
    name: '图形编程专家',
    description: 'Shader/渲染管线/光线追踪/GPGPU/VR-AR 图形编程',
    category: 'specialized',
    triggers: ['shader', 'hlsl', 'glsl', 'vulkan', 'directx', 'raytracing', 'gpu', 'graphics', 'vr', 'ar'],
    filePath: 'agents/specialized/graphics-programming-expert.md',
  },
  {
    id: 'cross-platform-expert',
    name: '跨平台开发专家',
    description: 'Flutter/React Native/MAUI/Tauri/Qt/Electron 跨平台方案',
    category: 'specialized',
    triggers: ['cross-platform', '跨平台', 'flutter', 'react native', 'tauri', 'electron', 'qt'],
    filePath: 'agents/specialized/cross-platform-expert.md',
  },
  {
    id: 'game-devops-expert',
    name: '游戏 DevOps 专家',
    description: '构建自动化/Perforce/多平台发布/专用服务器/性能监控',
    category: 'devops',
    triggers: ['game devops', '游戏运维', 'game ci', 'perforce', 'steam release', '游戏部署'],
    filePath: 'agents/devops/game-devops-expert.md',
  },
];

// 根据用户输入匹配最佳 Agent
export function matchExpertAgent(userInput: string): ExpertAgent | null {
  const lower = userInput.toLowerCase();
  let best: ExpertAgent | null = null;
  let bestScore = 0;

  for (const agent of EXPERT_AGENTS) {
    let score = 0;
    for (const trigger of agent.triggers) {
      if (lower.includes(trigger.toLowerCase())) {
        score += trigger.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = agent;
    }
  }

  return bestScore >= 2 ? best : null;
}

// 按类别列出
export function listExpertAgents(category?: string): ExpertAgent[] {
  if (category) {
    return EXPERT_AGENTS.filter((a) => a.category === category);
  }
  return EXPERT_AGENTS;
}

// 获取所有类别
export function getAgentCategories(): string[] {
  const cats = new Set(EXPERT_AGENTS.map((a) => a.category));
  return Array.from(cats);
}
