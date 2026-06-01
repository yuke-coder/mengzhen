// 脑图数据结构类型定义

export type MindMapTemplate =
  | 'radial'       // 经典放射图
  | 'circle'       // 圆圈图
  | 'bubble'       // 气泡图
  | 'double-bubble'// 双重气泡图
  | 'tree'         // 树状图
  | 'bracket'      // 括号图
  | 'flowchart'    // 流程图
  | 'multi-flow'   // 多重流程图
  | 'bridge'       // 桥状图
  | 'venn'         // 韦恩图（文氏图）
  | 'fishbone'     // 鱼骨图（因果图）
  | 'timeline'     // 时间线图（时间轴）
  | 'org-chart'    // 组织结构图
  | 'concept';     // 概念图

// 基础节点
export interface MindMapNode {
  id: string;
  text: string;
  children?: MindMapNode[];
  x?: number;
  y?: number;
  color?: string;
  fontSize?: number;
  collapsed?: boolean;
}

// 经典放射图结构
export interface RadialStructure {
  template: 'radial';
  root: MindMapNode;
}

// 圆圈图结构
export interface CircleStructure {
  template: 'circle';
  center: { id: string; text: string };
  rings: Array<{ ring: number; nodes: string[] }>;
}

// 气泡图结构
export interface BubbleStructure {
  template: 'bubble';
  center: { id: string; text: string; importance?: 'high' | 'medium' | 'low' };
  features: Array<{ text: string; importance: 'high' | 'medium' | 'low' }>;
}

// 树状图结构
export interface TreeStructure {
  template: 'tree';
  root: MindMapNode;
}

// 括号图结构
export interface BracketStructure {
  template: 'bracket';
  root: {
    id: string;
    text: string;
    parts: Array<{
      id: string;
      text: string;
      children?: string[];
    }>;
  };
}

// 组织结构图结构
export interface OrgChartStructure {
  template: 'org-chart';
  root: MindMapNode;
}

// 流程图结构
export interface FlowchartStep {
  id: string;
  text: string;
  type: 'terminal' | 'process' | 'decision';
  branches?: { yes?: string; no?: string };
  // 直接属性（与 API 返回一致）
  yes?: string;
  no?: string;
}

export interface FlowchartStructure {
  template: 'flowchart';
  steps: FlowchartStep[];
}

// 多重流程图结构
export interface MultiFlowStructure {
  template: 'multi-flow';
  center: { id: string; text: string };
  causes: Array<{
    id: string;
    text: string;
    children: Array<{ text: string }>;
  }>;
  effects: Array<{
    id: string;
    text: string;
    children: Array<{ text: string }>;
  }>;
}

// 时间线图结构
export interface TimelineEvent {
  id: string;
  text: string;
  description?: string;
  year?: string;
  importance?: 'high' | 'medium' | 'low';
}

export interface TimelineStructure {
  template: 'timeline';
  axis: { orientation: 'horizontal' | 'vertical'; start?: string; end?: string };
  events: TimelineEvent[];
}

// 双重气泡图结构
export interface DoubleBubbleStructure {
  template: 'double-bubble';
  left: { id: string; text: string; features: Array<string | { text: string }> };
  right: { id: string; text: string; features: Array<string | { text: string }> };
  similarities: Array<string | { text: string }>;
}

// 韦恩图结构
export interface VennSet {
  id: string;
  text: string;
  color: string;
  features: string[];
}

export interface VennIntersection {
  id: string;
  text: string;
  features: string[];
}

export interface VennStructure {
  template: 'venn';
  sets: VennSet[];
  intersections: VennIntersection[];
}

// 桥状图结构
export interface BridgeStructure {
  template: 'bridge';
  bridge: { id: string; text: string };
  left: Array<{ id: string; text: string }>;
  right: Array<{ id: string; text: string }>;
}

// 鱼骨图结构
export interface FishboneCause {
  id: string;
  text: string;
  children: Array<{ text: string }>;
}

export interface FishboneStructure {
  template: 'fishbone';
  spine: { id: string; text: string };
  causes: FishboneCause[];
}

// 概念图结构
export interface ConceptNode {
  id: string;
  text: string;
  x?: number;
  y?: number;
}

export interface ConceptLink {
  from: string;
  to: string;
  relation: string;
}

export interface ConceptStructure {
  template: 'concept';
  nodes: ConceptNode[];
  links: ConceptLink[];
}

// 联合类型：所有差异化结构
export type MindMapStructure =
  | RadialStructure
  | CircleStructure
  | BubbleStructure
  | TreeStructure
  | BracketStructure
  | OrgChartStructure
  | FlowchartStructure
  | MultiFlowStructure
  | TimelineStructure
  | DoubleBubbleStructure
  | VennStructure
  | BridgeStructure
  | FishboneStructure
  | ConceptStructure;

// 统一的脑图数据格式
export interface MindMapData {
  template: MindMapTemplate;
  structure: unknown;
  title: string;
  raw?: unknown;
  root?: MindMapNode;
}

export interface GenerationRequest {
  content: string;
  templates: MindMapTemplate[];
  title?: string;
}

export interface GenerationResponse {
  success: boolean;
  mindmaps: MindMapData[];
  error?: string;
}

// 模板配置
export const TEMPLATE_CONFIG: Record<MindMapTemplate, { name: string; description: string; category: string; icon: string }> = {
  radial: {
    name: '经典放射图',
    description: '中心向四周发散，适合创意联想',
    category: '发散型',
    icon: '○'
  },
  circle: {
    name: '圆圈图',
    description: '中心圆+同心圆环，展示循环关系',
    category: '发散型',
    icon: '◎'
  },
  bubble: {
    name: '气泡图',
    description: '气泡大小表示重要性，适合特征描述',
    category: '发散型',
    icon: '◯'
  },
  'double-bubble': {
    name: '双重气泡图',
    description: '双中心+交集，适合对比分析',
    category: '比较型',
    icon: '◉'
  },
  tree: {
    name: '树状图',
    description: '自上而下层级，适合分类体系',
    category: '层级型',
    icon: '⎿'
  },
  bracket: {
    name: '括号图',
    description: '整体→部分分解，展示包含关系',
    category: '层级型',
    icon: '{ }'
  },
  flowchart: {
    name: '流程图',
    description: '线性步骤流程，适合过程展示',
    category: '顺序型',
    icon: '→'
  },
  'multi-flow': {
    name: '多重流程图',
    description: '因果链条+分支，适合因果分析',
    category: '顺序型',
    icon: '⇄'
  },
  bridge: {
    name: '桥状图',
    description: '横向类比桥，适合相似性分析',
    category: '比较型',
    icon: '═'
  },
  venn: {
    name: '韦恩图',
    description: '集合交集，适合集合关系展示',
    category: '比较型',
    icon: '∩'
  },
  fishbone: {
    name: '鱼骨图',
    description: '主骨+分骨因果，适合问题分析',
    category: '分析型',
    icon: 'ζ'
  },
  timeline: {
    name: '时间线图',
    description: '横向时间序列，适合历程展示',
    category: '顺序型',
    icon: '━'
  },
  'org-chart': {
    name: '组织结构图',
    description: '层级隶属关系，适合架构展示',
    category: '层级型',
    icon: '⊥'
  },
  concept: {
    name: '概念图',
    description: '网状关系，适合知识网络展示',
    category: '分析型',
    icon: '◎'
  }
};

// 分类信息
export const TEMPLATE_CATEGORIES = {
  '发散型': ['radial', 'circle', 'bubble'],
  '层级型': ['tree', 'bracket', 'org-chart'],
  '顺序型': ['flowchart', 'multi-flow', 'timeline'],
  '比较型': ['double-bubble', 'venn', 'bridge'],
  '分析型': ['fishbone', 'concept']
};
