'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { MindMapData, MindMapNode, MindMapTemplate } from '@/lib/mindmap-types';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, X, Plus, Minus, MousePointer, Edit3, HelpCircle, Loader2, Check, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CustomMindMapViewer } from './custom-mindmap-viewer';
import { useTheme, type Theme } from '@/lib/theme-context';

// 模板名称中文映射
export const TEMPLATE_NAMES: Record<MindMapTemplate, string> = {
  radial: '经典放射图',
  circle: '圆圈图',
  bubble: '气泡图',
  'double-bubble': '双重气泡图',
  tree: '树状图',
  bracket: '括号图',
  flowchart: '流程图',
  'multi-flow': '多重流程图',
  bridge: '桥状图',
  venn: '韦恩图',
  fishbone: '鱼骨图',
  timeline: '时间线图',
  'org-chart': '组织结构图',
  concept: '概念图',
};

// 导出：多模板切换标签组件（用于 Header 导航区域）
interface MindMapTabSwitcherProps {
  mindmaps: MindMapData[];
  selectedTemplates: MindMapTemplate[]; // 用户选择的所有模板
  completedCount: number; // 已完成数量
  currentIndex: number;
  onIndexChange: (index: number) => void;
  isProcessing?: boolean; // 是否正在生成中
}

export function MindMapTabSwitcher({ 
  mindmaps, 
  selectedTemplates, 
  completedCount, 
  currentIndex, 
  onIndexChange,
  isProcessing = false 
}: MindMapTabSwitcherProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const isAllCompleted = mindmaps.length >= selectedTemplates.length;
  
  // 获取当前正在显示的脑图（mindmaps 数组的索引）
  const currentMindMap = mindmaps[currentIndex];
  
  return (
    <div className={cn(
      "flex items-center gap-2 backdrop-blur-xl rounded-2xl px-4 py-2 shadow-xl",
      isDark 
        ? "bg-[#0a0a0a] border border-white/10 shadow-black/40"
        : "bg-white border border-gray-200/50 shadow-gray-400/20"
    )}>
      {/* 生成进度指示器 - 只在生成中时显示 */}
      {!isAllCompleted && isProcessing && (
        <div className={cn(
          "flex items-center gap-2 pr-3",
          isDark ? "border-r border-white/10" : "border-r border-gray-200/50"
        )}>
          <div className="relative w-4 h-4">
            <svg className="w-4 h-4 -rotate-90" viewBox="0 0 20 20">
              <circle cx="10" cy="10" r="8" fill="none" stroke={isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"} strokeWidth="2" />
              <circle 
                cx="10" cy="10" r="8" fill="none" 
                stroke="#00d4aa" strokeWidth="2"
                strokeDasharray={`${(mindmaps.length / selectedTemplates.length) * 50.27} 50.27`}
                className="transition-all duration-500 ease-out"
              />
            </svg>
            <Sparkles className="absolute inset-0 w-3 h-3 m-auto text-[#00d4aa] animate-pulse" />
          </div>
          <span className={cn(
            "text-xs font-medium",
            isDark ? "text-white/70" : "text-gray-600"
          )}>
            {mindmaps.length}/{selectedTemplates.length}
          </span>
        </div>
      )}
      
      {/* 模板标签列表 */}
      <div className="flex items-center gap-1.5">
        {selectedTemplates.map((template, idx) => {
          // 检查该模板是否已完成，并找到在 mindmaps 数组中的索引
          const mindmapIdx = mindmaps.findIndex(m => m.template === template);
          const hasData = mindmapIdx >= 0;
          // 检查是否是当前正在显示的模板（通过脑图的模板类型判断）
          const isCurrent = currentMindMap?.template === template;
          
          return (
            <button
              key={template}
              onClick={() => hasData && onIndexChange(mindmapIdx)}
              disabled={!hasData}
              className={cn(
                'relative px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 transform',
                'whitespace-nowrap overflow-hidden',
                // 基础样式
                hasData
                  ? 'cursor-pointer'
                  : 'cursor-not-allowed opacity-60',
                // 已完成且当前选中状态
                hasData && isCurrent && [
                  'bg-gradient-to-r from-[#00d4aa] to-[#5bb892]',
                  'text-white',
                  'shadow-lg shadow-[#00d4aa]/30',
                  'scale-105',
                ],
                hasData && !isCurrent && isDark && [
                  'bg-white/10',
                  'text-white/70',
                  'hover:bg-white/15',
                  'hover:text-white',
                  'hover:scale-102',
                  'hover:shadow-md',
                ],
                hasData && !isCurrent && !isDark && [
                  'bg-gray-100',
                  'text-gray-600',
                  'hover:bg-gray-200',
                  'hover:text-gray-800',
                  'hover:scale-102',
                  'hover:shadow-md',
                ],
                // 未完成状态
                !hasData && isDark && [
                  'bg-white/10',
                  'text-white/40',
                ],
                !hasData && !isDark && [
                  'bg-gray-100',
                  'text-gray-400',
                ]
              )}
            >
              {/* 内部内容 */}
              <span className="relative z-10 flex items-center gap-1.5">
                {/* 状态图标 - 只在生成中且未完成时显示旋转动画 */}
                {!hasData && isProcessing && (
                  <Loader2 className={cn("w-3 h-3 animate-spin", isDark ? "text-white/50" : "text-gray-400")} />
                )
                }
                {hasData && isCurrent && (
                  <Check className="w-3 h-3 text-white" />
                )}
                {hasData && !isCurrent && (
                  <span className={cn("w-3 h-3 rounded-full", isDark ? "bg-white/30" : "bg-gray-400/50")} />
                )}
                
                {/* 模板名称 */}
                <span>{TEMPLATE_NAMES[template]}</span>
              </span>
              
              {/* 未完成状态的脉冲动画 */}
              {!hasData && (
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 模板方向配置：left/right/both（左侧/右侧/双侧展开）
const TEMPLATE_DIRECTIONS: Record<MindMapTemplate, string> = {
  radial: 'both',        // 经典放射图：中心向两侧发散
  circle: 'both',        // 圆圈图：环形包围
  bubble: 'both',       // 气泡图：中心包围结构
  'double-bubble': 'both', // 双重气泡图：双中心结构
  tree: 'right',        // 树状图：自上而下向右展开
  bracket: 'left',      // 括号图：左侧展开
  flowchart: 'right',    // 流程图：线性向右
  'multi-flow': 'right', // 多重流程图：因果链向右
  bridge: 'both',        // 桥状图：类比对比
  venn: 'both',         // 韦恩图：集合关系
  fishbone: 'left',     // 鱼骨图：原因向左
  timeline: 'right',     // 时间线：时间线向右
  'org-chart': 'right',  // 组织结构图：层级向右
  concept: 'both',      // 概念图：网状结构
};

// 需要使用自定义Canvas渲染的模板类型（非树形结构）
const CUSTOM_RENDER_TEMPLATES: MindMapTemplate[] = [
  // 树状图 - 使用自定义树形布局
  'tree',          
  'flowchart',     // 流程图 - 线性步骤
  'fishbone',      // 鱼骨图 - 鱼骨形状
  'timeline',      // 时间线图 - 水平时间轴
  'venn',          // 韦恩图 - 圆形交集
  'multi-flow',    // 多重流程图 - 中心因果
  'double-bubble', // 双重气泡图 - 圆形对比
  'bridge',        // 桥状图 - 横向对比
  'org-chart',     // 组织结构图 - 层级结构
  'circle',        // 圆圈图 - 同心圆
  'bubble',        // 气泡图 - 中心气泡
  'concept',       // 概念图 - 网状关系
];

// 判断模板是否需要自定义渲染
function needsCustomRender(template: MindMapTemplate): boolean {
  return CUSTOM_RENDER_TEMPLATES.includes(template);
}

interface MindMapViewerProps {
  mindmaps: MindMapData[];
  currentIndex?: number;
  onClose?: () => void;
}

// jsMind 类型声明
declare global {
  interface Window {
    jsMind?: {
      show(options: { container: HTMLElement; theme?: string; [key: string]: unknown }, mind: JsMindData): JsMindInstance;
    };
  }
}

interface JsMindInstance {
  get_data(): JsMindData;
  get_node(nodeid: string): JsMindNode | null;
  enable_edit(): void;
  disable_edit(): void;
  get_selected_node(): JsMindNode | null;
  select_node(nodeid: string): void;
  toggle_node(nodeid: string): void;
  expand_node(nodeid: string): void;
  collapse_node(nodeid: string): void;
  expand_all(): void;
  collapse_all(): void;
  expand_to_depth(depth: number): void;
  resize(): void;
  update_node(nodeid: string, topic: string): void;
  add_node(parent_node: JsMindNode, nodeid: string, topic: string, data?: Record<string, unknown>): JsMindNode;
  delete_node(nodeid: string): void;
  set_node_color(nodeid: string, bgcolor: string, fgcolor?: string): void;
  show(mind: JsMindData): void;
}

interface JsMindData {
  meta?: { name?: string; author?: string; version?: string };
  format?: string;
  data: JsMindNode | JsMindNode[];
}

interface JsMindNode {
  id?: string;
  nodeid?: string;
  topic?: string;
  isroot?: boolean;
  parentid?: string;
  direction?: string;
  expanded?: boolean;
  children?: JsMindNode[];
  data?: Record<string, unknown>;
}

// 为节点添加层级样式 class（用于视觉分层）
// 注意：此函数仅在 DOM 渲染模式下有效，Canvas 模式下不执行任何操作
function applyNodeLevelStyles(container: HTMLElement | null, rootNode: MindMapNode, level: number = 0, template?: MindMapTemplate) {
  // Canvas 模式下跳过 DOM 样式设置
  // jsMind Canvas 模式自动渲染节点，无需额外样式
  return;
  
  if (!container) return;
  
  // 以下代码在 Canvas 模式下不执行
  /*
  // 获取当前模板类型对应的 CSS class 前缀
  const templateClass = template ? `template-${template}` : '';
  
  const applyLevel = (node: MindMapNode, currentLevel: number) => {
    const nodeElement = container.querySelector(`[nodeid="${node.id}"]`) as HTMLElement;
    if (nodeElement) {
      // 添加层级 class，根节点特殊处理
      if (currentLevel === 0) {
        nodeElement.classList.add('root');
      } else {
        nodeElement.classList.add(`level-${Math.min(currentLevel, 5)}`);
      }
      // 添加模板类型 class
      if (templateClass) {
        nodeElement.classList.add(templateClass);
      }
    }
    
    // 递归处理子节点
    if (node.children) {
      node.children.forEach(child => applyLevel(child, currentLevel + 1));
    }
  };
  
  applyLevel(rootNode, level);
  */
}

// 将不同模板的数据结构统一转换为树形结构
function normalizeToTreeData(data: MindMapData): MindMapNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const structure = (data.structure || data.raw || {}) as any;
  
  if (structure.root) {
    return structure.root as MindMapNode;
  }
  
  if (structure.id && structure.text) {
    return structure as unknown as MindMapNode;
  }
  
  if (structure.spine && structure.causes) {
    return {
      id: 'root',
      text: data.title || structure.spine.text || '鱼骨图',
      children: [
        {
          id: 'spine-item',
          text: structure.spine.text,
          children: []
        },
        ...structure.causes.map((cause: any) => ({
          id: cause.id,
          text: cause.text,
          children: (cause.children || []).map((c: any, i: number) => ({
            id: `${cause.id}-${i}`,
            text: c.text || c,
            children: []
          }))
        }))
      ]
    };
  }
  
  // 时间线图：events
  if (structure.events) {
    return {
      id: 'root',
      text: data.title || '时间线',
      children: structure.events.map((event: any, i: number) => ({
        id: event.id || `event-${i}`,
        text: event.year ? `${event.year} ${event.text}` : event.text,
        children: event.description ? [{ id: `${event.id || i}-desc`, text: event.description, children: [] }] : []
      }))
    };
  }
  
  // 韦恩图：sets + intersections
  if (structure.sets && structure.intersections) {
    return {
      id: 'root',
      text: data.title || '韦恩图',
      children: [
        {
          id: 'sets-branch',
          text: '集合',
          children: structure.sets.map((set: any) => ({
            id: set.id,
            text: set.text,
            children: (set.features || []).map((f: string, i: number) => ({
              id: `${set.id}-f-${i}`,
              text: f,
              children: []
            }))
          }))
        },
        {
          id: 'intersections-branch',
          text: '共同特征',
          children: structure.intersections.map((inter: any) => ({
            id: inter.id || inter.text,
            text: inter.text,
            children: (inter.features || []).map((f: string, i: number) => ({
              id: `inter-${i}`,
              text: f,
              children: []
            }))
          }))
        }
      ]
    };
  }
  
  // 圆圈图：center + rings
  if (structure.center && structure.rings) {
    return {
      id: 'root',
      text: data.title || structure.center.text || '圆圈图',
      children: [
        {
          id: 'center-item',
          text: structure.center.text,
          children: []
        },
        ...structure.rings.map((ring: any) => ({
          id: `ring-${ring.ring}`,
          text: `第${ring.ring}层`,
          children: (ring.nodes || []).map((n: any, i: number) => ({
            id: n.id || `ring${ring.ring}-${i}`,
            text: n.text || n,
            children: []
          }))
        }))
      ]
    };
  }
  
  // 气泡图：center + features
  if (structure.center && structure.features) {
    return {
      id: 'root',
      text: data.title || structure.center.text || '气泡图',
      children: [
        {
          id: 'center-item',
          text: structure.center.text,
          children: []
        },
        ...structure.features.map((feature: any, i: number) => ({
          id: feature.id || `feature-${i}`,
          text: feature.text || feature,
          children: []
        }))
      ]
    };
  }
  
  // 概念图：nodes + links
  if (structure.nodes && structure.links) {
    // 将概念图转换为树形结构
    // 找到根节点（被指向最多或第一个节点）
    const nodeMap = new Map<string, any>();
    structure.nodes.forEach((node: any) => nodeMap.set(node.id, { ...node, children: [] }));
    
    // 根据链接关系构建父子关系
    structure.links.forEach((link: any) => {
      const fromNode = nodeMap.get(link.from);
      const toNode = nodeMap.get(link.to);
      if (fromNode && toNode && link.relation) {
        // 添加关系标签作为中间节点
        fromNode.children.push({
          id: `${link.from}-${link.to}`,
          text: link.relation,
          children: [{ id: link.to, text: toNode.text, children: [] }]
        });
      }
    });
    
    // 找到根节点（没有入边的节点）
    const targetIds = new Set(structure.links.map((l: any) => l.to));
    let rootNode = structure.nodes.find((n: any) => !targetIds.has(n.id)) || structure.nodes[0];
    
    return {
      id: rootNode.id,
      text: rootNode.text,
      children: rootNode.children || []
    };
  }
  
  // 多重流程图：center + causes + effects（必须在气泡图之后，因为它们都可能有 center）
  if (structure.center && structure.causes && structure.effects) {
    return {
      id: 'root',
      text: data.title || structure.center.text || '多重流程图',
      children: [
        {
          id: 'causes-branch',
          text: '原因',
          children: (structure.causes || []).map((c: any, i: number) => ({
            id: c.id || `cause-${i}`,
            text: c.text,
            children: (c.children || []).map((cc: any, j: number) => ({
              id: `${c.id || `cause-${i}`}-${j}`,
              text: cc.text || cc,
              children: []
            }))
          }))
        },
        {
          id: 'center-item',
          text: structure.center.text,
          children: []
        },
        {
          id: 'effects-branch',
          text: '结果',
          children: (structure.effects || []).map((e: any, i: number) => ({
            id: e.id || `effect-${i}`,
            text: e.text,
            children: (e.children || []).map((ee: any, j: number) => ({
              id: `${e.id || `effect-${i}`}-${j}`,
              text: ee.text || ee,
              children: []
            }))
          }))
        }
      ]
    };
  }
  
  // 双重气泡图：left + right + similarities
  if (structure.left && structure.right) {
    return {
      id: 'root',
      text: data.title || '双重气泡图',
      children: [
        {
          id: 'similarities-branch',
          text: '共同点',
          children: (structure.similarities || []).map((s: any, i: number) => ({
            id: s.id || `sim-${i}`,
            text: s.text || s,
            children: []
          }))
        },
        {
          id: 'left-branch',
          text: structure.left.text || '主题A',
          children: (structure.left.features || []).map((f: any, i: number) => ({
            id: `left-${i}`,
            text: f.text || f,
            children: []
          }))
        },
        {
          id: 'right-branch',
          text: structure.right.text || '主题B',
          children: (structure.right.features || []).map((f: any, i: number) => ({
            id: `right-${i}`,
            text: f.text || f,
            children: []
          }))
        }
      ]
    };
  }
  
  // 桥状图：bridge + left + right
  if (structure.bridge) {
    return {
      id: 'root',
      text: data.title || structure.bridge.text || '桥状图',
      children: [
        {
          id: 'left-branch',
          text: '左侧',
          children: (structure.left || []).map((l: any, i: number) => ({
            id: l.id || `left-${i}`,
            text: l.text || l,
            children: []
          }))
        },
        {
          id: 'bridge-item',
          text: structure.bridge.text,
          children: []
        },
        {
          id: 'right-branch',
          text: '右侧',
          children: (structure.right || []).map((r: any, i: number) => ({
            id: r.id || `right-${i}`,
            text: r.text || r,
            children: []
          }))
        }
      ]
    };
  }
  
  // 组织结构图：root（如果有的话）
  if (structure.root) {
    return structure.root;
  }
  
  // 默认：尝试使用 title 作为根节点
  return { id: 'root', text: data.title || '思维导图', children: [] };
}

// 转换为 jsMind 格式，并添加层级信息和方向配置
function convertToJsMindFormat(data: MindMapData): JsMindData {
  // 获取当前模板的方向配置
  const direction = TEMPLATE_DIRECTIONS[data.template] || 'both';
  
  // 统一转换为树形结构
  const treeData = normalizeToTreeData(data);
  console.log('[convertToJsMindFormat] template:', data.template, 'hasStructure:', !!data.structure, 'treeDataValid:', !!treeData && !!treeData.text);
  
  // 如果转换后仍没有有效数据，返回空结构
  if (!treeData || !treeData.text) {
    console.log('[convertToJsMindFormat] Using default empty structure');
    return {
      meta: { name: data.title || '思维导图', author: '灵图', version: '1.0' },
      format: 'node_tree',
      data: { id: 'root', topic: data.title || '无标题', isroot: true, expanded: true }
    };
  }
  
  const convertNode = (node: MindMapNode, parentId?: string, level: number = 0): JsMindNode => {
    // 根节点设置方向，子节点继承
    const isRoot = !parentId;
    
    const jsNode: JsMindNode = {
      id: node.id,
      topic: node.text,
      isroot: isRoot,
      parentid: parentId || undefined,
      expanded: true,
      direction: isRoot ? direction : undefined, // 仅根节点设置方向
      data: {
        ...node,
        level: level, // 添加层级信息用于样式区分
        template: data.template, // 保存模板类型用于样式区分
      },
    };

    if (node.children && node.children.length > 0) {
      jsNode.children = node.children.map(child => convertNode(child, node.id, level + 1));
    }

    return jsNode;
  };

  return {
    meta: {
      name: data.title || '思维导图',
      author: '灵图',
      version: '1.0',
    },
    format: 'node_tree',
    data: convertNode(treeData),
  };
}

export function MindMapViewer({ mindmaps, currentIndex: externalIndex, onClose }: MindMapViewerProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [internalIndex, setInternalIndex] = useState(0);
  const [scale, setScale] = useState(1);
  const [selectedNode, setSelectedNode] = useState<{ id: string; topic: string } | null>(null);
  const [editText, setEditText] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const linesCanvasRef = useRef<HTMLCanvasElement>(null);
  const jmInstanceRef = useRef<JsMindInstance | null>(null);
  const scriptLoadedRef = useRef(false);
  
  // 使用外部传入的 currentIndex，如果未传入则使用内部状态
  const currentIndex = externalIndex !== undefined ? externalIndex : internalIndex;
  const setCurrentIndex = externalIndex !== undefined ? () => {} : setInternalIndex;
  
  // 拖拽平移状态
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, translateX: 0, translateY: 0 });
  
  // 内容尺寸引用（用于边界计算）
  const contentSizeRef = useRef({ width: 0, height: 0 });
  
  // 使用 ref 存储当前状态值，避免闭包问题
  const scaleRef = useRef(scale);
  const translateRef = useRef(translate);
  const isDraggingRef = useRef(false);
  const containerRef2 = useRef<HTMLDivElement | null>(null);

  // 节点操作按钮状态
  const [activeNode, setActiveNode] = useState<{ id: string; x: number; y: number; hasChildren: boolean; isExpanded: boolean; topic?: string } | null>(null);

  // jsMind 本地文件路径（优先使用本地，避免 CDN 超时）
  const JSMDIN_JS_URL = '/lib/jsmind/jsmind.js';
  const JSMDIN_CSS_URL = '/lib/jsmind/jsmind.css';
  
  // 更新内容尺寸（供边界计算使用）
  const updateContentSize = useCallback(() => {
    if (containerRef.current) {
      const inner = containerRef.current.querySelector('.jsmind-inner') as HTMLElement;
      if (inner) {
        // 计算实际内容区域（考虑所有子元素）
        let maxX = 0, maxY = 0;
        const jmnodes = inner.querySelectorAll('jmnode');
        jmnodes.forEach((node) => {
          const rect = node.getBoundingClientRect();
          const relativeX = rect.right - containerRef.current!.getBoundingClientRect().left;
          const relativeY = rect.bottom - containerRef.current!.getBoundingClientRect().top;
          maxX = Math.max(maxX, relativeX);
          maxY = Math.max(maxY, relativeY);
        });
        
        // 添加边距
        contentSizeRef.current = {
          width: Math.max(maxX + 100, containerRef.current.offsetWidth),
          height: Math.max(maxY + 100, containerRef.current.offsetHeight),
        };
      }
    }
  }, []);
  
  // 绘制连接线 - 在Canvas上渲染节点间关系线
  const drawConnectionLines = useCallback(() => {
    const canvas = linesCanvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // 设置Canvas尺寸
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    
    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 获取所有节点
    const jmnodes = container.querySelectorAll('jmnode');
    if (jmnodes.length === 0) return;
    
    // 为每个节点绘制从父节点到自身的连接线
    jmnodes.forEach((node) => {
      const nodeid = node.getAttribute('nodeid');
      if (!nodeid || nodeid === 'root') return;
      
      const nodeRect = node.getBoundingClientRect();
      const nodeX = nodeRect.left - rect.left + nodeRect.width / 2;
      const nodeY = nodeRect.top - rect.top;
      
      // 查找父节点
      const jmInstance = jmInstanceRef.current;
      if (!jmInstance) return;
      
      const mindNode = jmInstance.get_node(nodeid);
      if (!mindNode || !mindNode.parentid) return;
      
      const parentNode = node.parentElement?.querySelector(`jmnode[nodeid="${mindNode.parentid}"]`) as HTMLElement;
      if (!parentNode) return;
      
      const parentRect = parentNode.getBoundingClientRect();
      const parentX = parentRect.left - rect.left + parentRect.width / 2;
      const parentY = parentRect.bottom - rect.top;
      
      // 计算节点层级深度
      let level = 0;
      let currentNode: ReturnType<typeof jmInstance.get_node> = mindNode;
      let currentParentId = currentNode?.parentid;
      while (currentParentId && currentParentId !== 'root') {
        level++;
        const parentNodeData = jmInstance.get_node(currentParentId);
        if (!parentNodeData) break;
        currentParentId = parentNodeData.parentid;
      }
      
      // 根据层级设置连接线样式
      const alpha = Math.max(0.2, 0.7 - level * 0.15);
      const lineWidth = Math.max(1, 2.5 - level * 0.3);
      
      // 绘制贝塞尔曲线连接线
      ctx.beginPath();
      ctx.strokeStyle = `rgba(0, 212, 170, ${alpha})`;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      // 从父节点底部中心到子节点顶部中心
      const startX = parentX;
      const startY = parentY;
      const endX = nodeX;
      const endY = nodeY;
      
      // 控制点偏移量（根据连接方向）
      const midY = (startY + endY) / 2;
      const cp1X = startX;
      const cp1Y = midY;
      const cp2X = endX;
      const cp2Y = midY;
      
      ctx.moveTo(startX, startY);
      ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, endX, endY);
      ctx.stroke();
      
      // 添加发光效果
      ctx.shadowColor = 'rgba(0, 212, 170, 0.3)';
      ctx.shadowBlur = 4;
      ctx.stroke();
      ctx.shadowBlur = 0;
    });
  }, []);
  
  // 计算带边界的平移值（使用 refs 避免闭包问题）
  const clampTranslate = useCallback((x: number, y: number): { x: number; y: number } => {
    if (!containerRef.current) return { x, y };
    
    const container = containerRef.current;
    const containerWidth = container.offsetWidth;
    const containerHeight = container.offsetHeight;
    const contentWidth = contentSizeRef.current.width;
    const contentHeight = contentSizeRef.current.height;
    const currentScale = scaleRef.current;
    
    // 应用当前缩放
    const scaledWidth = contentWidth * currentScale;
    const scaledHeight = contentHeight * currentScale;
    
    // 计算允许的偏移范围（刚性边界约束）
    let clampedX = x;
    let clampedY = y;
    
    // 水平边界约束
    if (scaledWidth <= containerWidth) {
      // 内容宽度小于等于容器宽度时，水平居中
      clampedX = (containerWidth - scaledWidth) / 2;
    } else {
      // 内容宽度大于容器宽度时，限制水平偏移范围
      const minX = containerWidth - scaledWidth; // 最左只能到内容右边界接触容器右边界
      const maxX = 0; // 最右只能到内容左边界接触容器左边界
      clampedX = Math.max(minX, Math.min(maxX, x));
    }
    
    // 垂直边界约束
    if (scaledHeight <= containerHeight) {
      // 内容高度小于等于容器高度时，垂直居中
      clampedY = (containerHeight - scaledHeight) / 2;
    } else {
      // 内容高度大于容器高度时，限制垂直偏移范围
      const minY = containerHeight - scaledHeight; // 最上
      const maxY = 0; // 最下
      clampedY = Math.max(minY, Math.min(maxY, y));
    }
    
    return { x: clampedX, y: clampedY };
  }, []);
  
  // 鼠标按下 - 开始拖拽
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // 只响应左键，且不是在可交互元素上
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('jmnode, button, input')) return;
    
    e.preventDefault();
    isDraggingRef.current = true;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      translateX: translateRef.current.x,
      translateY: translateRef.current.y,
    };
  }, []);
  
  // 鼠标移动 - 拖拽平移（带刚性边界约束）
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    
    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;
    
    // 计算新的平移值
    const newX = dragStartRef.current.translateX + deltaX;
    const newY = dragStartRef.current.translateY + deltaY;
    
    // 应用刚性边界约束
    const clamped = clampTranslate(newX, newY);
    
    translateRef.current = clamped;
    setTranslate(clamped);
  }, [clampTranslate]);
  
  // 鼠标释放 - 结束拖拽
  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    setIsDragging(false);
  }, []);
  
  // 鼠标离开 - 结束拖拽
  const handleMouseLeave = useCallback(() => {
    isDraggingRef.current = false;
    setIsDragging(false);
  }, []);
  
  // 重置视图（带边界约束）
  const resetView = useCallback(() => {
    // 重置为居中位置
    const centered = clampTranslate(0, 0);
    scaleRef.current = 1;
    translateRef.current = centered;
    setScale(1);
    setTranslate(centered);
    jmInstanceRef.current?.resize();
    // 更新内容尺寸
    setTimeout(updateContentSize, 100);
  }, [clampTranslate, updateContentSize]);

  // 加载 jsMind 脚本（带超时和备用 CDN）
  const loadJsMind = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      // 检查是否已加载
      if (typeof window !== 'undefined' && typeof (window as unknown as { jsMind?: unknown }).jsMind !== 'undefined') {
        resolve();
        return;
      }

      // SSR 时直接跳过
      if (typeof document === 'undefined') {
        resolve();
        return;
      }

      // 超时处理 - 30秒超时
      const timeoutId = setTimeout(() => {
        console.warn('jsMind loading timeout, trying fallback');
        scriptLoadedRef.current = false;
        resolve(); // 不 reject，让组件继续工作
      }, 30000);

      // 尝试加载
      const tryLoadScript = (urls: string[], index: number = 0) => {
        if (index >= urls.length) {
          clearTimeout(timeoutId);
          console.warn('All jsMind sources failed, using fallback');
          scriptLoadedRef.current = false;
          resolve(); // 不 reject，让组件继续工作
          return;
        }

        // 加载 CSS
        if (!document.querySelector('link[href*="jsmind"]')) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = JSMDIN_CSS_URL;
          document.head.appendChild(link);
        }

        // 加载 JS
        const script = document.createElement('script');
        script.src = urls[index];
        script.onload = () => {
          clearTimeout(timeoutId);
          // 等待一小段时间确保脚本执行完成
          setTimeout(() => {
            if (typeof (window as unknown as { jsMind?: unknown }).jsMind !== 'undefined') {
              resolve();
            } else {
              // 脚本加载了但 jsMind 对象未定义，尝试下一个 URL
              console.warn(`jsMind source ${index + 1} loaded but not initialized, trying next...`);
              tryLoadScript(urls, index + 1);
            }
          }, 100);
        };
        script.onerror = () => {
          console.warn(`jsMind source ${index + 1} failed, trying next...`);
          tryLoadScript(urls, index + 1);
        };
        document.head.appendChild(script);
      };

      // 避免重复加载
      if (scriptLoadedRef.current) {
        const check = setInterval(() => {
          if (typeof (window as unknown as { jsMind?: unknown }).jsMind !== 'undefined') {
            clearInterval(check);
            clearTimeout(timeoutId);
            resolve();
          }
        }, 100);
        return;
      }

      scriptLoadedRef.current = true;
      // 优先使用本地文件，备用 CDN
      const urls = [JSMDIN_JS_URL, '/lib/jsmind/jsmind.js', 'https://cdn.jsdelivr.net/npm/jsmind@0.9.1/es6/jsmind.js'];
      tryLoadScript(urls);
    });
  }, []);

  // ========== 主初始化 useEffect ==========
  useEffect(() => {
    if (!mindmaps || mindmaps.length === 0) return;
    if (!containerRef.current) return;
    
    let isMounted = true;
    
    // 边界检查：确保 currentIndex 在有效范围内
    const safeIndex = Math.min(Math.max(0, currentIndex), mindmaps.length - 1);
    const currentMindmap = mindmaps[safeIndex];
    
    // 防护：确保 currentMindmap 存在
    if (!currentMindmap) return;
    
    // 如果已经初始化了 jsMind，检查是否需要重新初始化
    if (jmInstanceRef.current) {
      // 获取当前显示的脑图数据
      const existingMind = jmInstanceRef.current.get_data();
      const existingData = Array.isArray(existingMind?.data) ? existingMind?.data[0] : existingMind?.data;
      const existingRootId = existingData?.id;
      const existingTopic = existingData?.topic;
      const newRootId = currentMindmap?.root?.id;
      const newTopic = currentMindmap?.root?.text;
      
      // 如果根节点 ID 和标题都相同，跳过重新初始化
      if (existingRootId === newRootId && existingTopic === newTopic) {
        // 只更新样式和尺寸（如果有变化）
        if (containerRef.current && currentMindmap?.root) {
          setTimeout(() => {
            if (isMounted && containerRef.current) {
              updateContentSize();
              drawConnectionLines();
            }
          }, 100);
        }
        return;
      }
      
      // 如果需要重新初始化，先清空容器
      containerRef.current.innerHTML = '';
      jmInstanceRef.current = null;
    }
    
    // 如果使用自定义渲染器，跳过jsMind初始化
    if (needsCustomRender(currentMindmap.template)) {
      containerRef.current.innerHTML = '';
      jmInstanceRef.current = null;
      setScale(1);
      setTranslate({ x: 0, y: 0 });
      setActiveNode(null);
      return;
    }
    
    // 创建事件处理器（使用 ref 存储以便清理）
    
    // 双击检测：使用延迟避免与单击冲突
    let clickTimeout: NodeJS.Timeout | null = null;
    let lastClickTarget: EventTarget | null = null;
    
    // 创建真正的事件处理函数
    const handleClick = (e: MouseEvent) => {
      if (!isMounted || !containerRef.current) return;
      
      // 如果是双击，跳过单击处理
      if (clickTimeout) {
        clearTimeout(clickTimeout);
        clickTimeout = null;
        return;
      }
      
      // 延迟执行单击处理，等待双击检测
      clickTimeout = setTimeout(() => {
        clickTimeout = null;
        if (!isMounted || !containerRef.current) return;
        
        // 单击处理：选中节点
        e.stopPropagation();
        const target = e.target as HTMLElement;
        
        // 检查是否点击在节点上
        const nodeElement = target.closest('jmnode');
        if (nodeElement && jmInstanceRef.current) {
          const nodeid = nodeElement.getAttribute('nodeid');
          if (nodeid) {
            const node = jmInstanceRef.current.get_node(nodeid);
            if (node) {
              const rect = nodeElement.getBoundingClientRect();
              const containerRect = containerRef.current!.getBoundingClientRect();
              setActiveNode({
                id: nodeid,
                x: rect.right - containerRect.left + 8,
                y: rect.top - containerRect.top + rect.height / 2,
                hasChildren: !!(node.children && node.children.length > 0),
                isExpanded: node.expanded !== false,
                topic: node.topic || '',
              });
              jmInstanceRef.current.select_node(nodeid);
            }
          }
        } else {
          setActiveNode(null);
        }
      }, 200);
    };
    
    const handleDoubleClick = (e: MouseEvent) => {
      if (!isMounted || !containerRef.current || !jmInstanceRef.current) return;
      
      // 清除单击处理
      if (clickTimeout) {
        clearTimeout(clickTimeout);
        clickTimeout = null;
      }
      
      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      
      // 直接使用鼠标的屏幕坐标，与 nodeRect 的屏幕坐标在同一坐标系中
      const mouseX = e.clientX;
      const mouseY = e.clientY;
      
      // 获取所有节点
      const nodeElements = container.querySelectorAll('jmnode');
      for (const nodeEl of nodeElements) {
        const nodeRect = nodeEl.getBoundingClientRect();
        
        // 检查点击是否在节点范围内
        if (mouseX >= nodeRect.left && mouseX <= nodeRect.right &&
            mouseY >= nodeRect.top && mouseY <= nodeRect.bottom) {
          const nodeid = nodeEl.getAttribute('nodeid');
          if (nodeid) {
            const node = jmInstanceRef.current.get_node(nodeid);
            if (node) {
              setSelectedNode({ id: nodeid, topic: node.topic || '' });
              setEditText(node.topic || '');
            }
          }
          break;
        }
      }
    };
    
    const clickHandler = (e: Event) => {
      // 双击检测
      if (e.type === 'dblclick') {
        handleDoubleClick(e as MouseEvent);
      } else {
        handleClick(e as MouseEvent);
      }
    };
    
    
    const wheelHandler = (e: WheelEvent) => {
      if (!isMounted || !containerRef.current) return;
      e.preventDefault();
      
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - translate.x) / scale;
      const mouseY = (e.clientY - rect.top - translate.y) / scale;
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      
      // 使用函数式更新避免闭包问题
      setScale(prevScale => {
        const newScale = Math.min(2, Math.max(0.5, prevScale + delta));
        const scaleRatio = newScale / prevScale;
        scaleRef.current = newScale;
        
        setTranslate(prev => {
          const newTranslate = {
            x: mouseX - (mouseX - prev.x) * scaleRatio,
            y: mouseY - (mouseY - prev.y) * scaleRatio,
          };
          // 使用 clampTranslate 限制边界
          const clamped = clampTranslate(newTranslate.x, newTranslate.y);
          translateRef.current = clamped;
          return clamped;
        });
        
        return newScale;
      });
    };
    
    // 加载 jsMind
    loadJsMind().then(() => {
      if (!isMounted || !containerRef.current) {
        console.log('[jsMind] Abort: not mounted or no container');
        return;
      }
      
      const jsMindModule = (window as unknown as { jsMind?: unknown }).jsMind;
      if (!jsMindModule) {
        console.log('[jsMind] Abort: jsMind not loaded');
        return;
      }
      
      // 边界检查：确保 currentIndex 在有效范围内
      if (mindmaps.length === 0) {
        console.log('[jsMind] Abort: mindmaps is empty');
        return;
      }
      const safeIndex = Math.min(Math.max(0, currentIndex), mindmaps.length - 1);
      const currentData = mindmaps[safeIndex];
      console.log('[jsMind] Initializing for template:', currentData?.template, 'at index:', safeIndex, '(currentIndex was:', currentIndex, ')');
      
      // 正确的 jsMind API: new jsMind(options) 然后 .show(mind)
      const JsMindConstructor = jsMindModule as unknown as { new(options: unknown): JsMindInstance };
      const jsMindData = convertToJsMindFormat(currentData);
      console.log('[jsMind] Converted data:', JSON.stringify(jsMindData).substring(0, 200));
      
      try {
        containerRef.current.innerHTML = '';
        
        const options = {
          container: containerRef.current,
          theme: 'greensea',
          editable: true,
          view: { 
            engine: 'canvas',  // jsMind 只支持 Canvas 渲染模式
            linewidth: 2, 
            line_height: 20,
            node_font: '14px PingFang SC, Microsoft YaHei, sans-serif',
            show_icon: false,
            show_remove_icon: false,
          },
          layout: { hspace: 80, vspace: 30, pspace: 20, cousin_space: 0 },
          shortcut: { enable: false }, // 禁用快捷键避免冲突
        };
        
        console.log('[jsMind] Calling jsMind.show for index:', safeIndex);
        const jsMindInstance = new JsMindConstructor(options);
        const showResult = jsMindInstance.show(jsMindData);
        console.log('[jsMind] jsMind.show completed, result:', showResult, ', instance:', !!jsMindInstance);
        jmInstanceRef.current = jsMindInstance;
        
        // 检查初始化是否成功
        if (!jsMindInstance || !jsMindInstance.get_data) {
          console.error('[jsMind] jsMind initialization failed!');
          return;
        }
        
        // DOM 模式下启用编辑
        jsMindInstance.enable_edit();
        
        // 添加事件监听
        containerRef.current.addEventListener('click', clickHandler);
        containerRef.current.addEventListener('dblclick', clickHandler); // 双击编辑
        containerRef.current.addEventListener('wheel', wheelHandler, { passive: false });
        // 拖拽事件
        containerRef.current.addEventListener('mousedown', handleMouseDown as any);
        window.addEventListener('mousemove', handleMouseMove as any);
        window.addEventListener('mouseup', handleMouseUp as any);
        
        // 延迟更新尺寸并设置节点样式
        setTimeout(() => {
          if (!isMounted || !containerRef.current) return;
          
          // 检查 Canvas 渲染结果
          console.log('[jsMind Canvas] Container innerHTML length:', containerRef.current.innerHTML.length);
          const canvasCount = containerRef.current.querySelectorAll('canvas').length;
          console.log('[jsMind Canvas] Found canvas elements:', canvasCount);
          
          // Canvas 模式下无需设置 DOM 节点样式，jsMind 自动渲染
          drawConnectionLines();
          updateContentSize();
        }, 100);
      } catch (error) {
        console.warn('Failed to init jsMind:', error);
      }
    });
    
    // 清理函数 - 组件卸载或重新渲染时执行
    return () => {
      isMounted = false;
      if (containerRef.current) {
        containerRef.current.removeEventListener('mousedown', handleMouseDown as any);
        window.removeEventListener('mousemove', handleMouseMove as any);
        window.removeEventListener('mouseup', handleMouseUp as any);
        containerRef.current.removeEventListener('click', clickHandler);
        containerRef.current.removeEventListener('dblclick', clickHandler);
        containerRef.current.removeEventListener('wheel', wheelHandler);
      }
      jmInstanceRef.current = null;
    };
  }, [currentIndex, mindmaps, loadJsMind, handleMouseDown, handleMouseMove, handleMouseUp, clampTranslate]);
  
  // 重置缩放和平移
  useEffect(() => {
    scaleRef.current = 1;
    translateRef.current = { x: 0, y: 0 };
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, [currentIndex]);
  
  // 同步 state 到 refs（避免闭包问题）
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);
  
  useEffect(() => {
    translateRef.current = translate;
  }, [translate]);

  // 缩放 - 以视口中心为基准
  const handleZoom = useCallback((delta: number) => {
    if (!containerRef.current) return;
    
    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    
    // 以视口中心为缩放基准点
    const centerX = containerRect.width / 2;
    const centerY = containerRect.height / 2;
    
    const currentScale = scaleRef.current;
    const currentTranslate = translateRef.current;
    const newScale = Math.min(3, Math.max(0.2, currentScale + delta));
    
    // 以中心点为基准进行缩放
    const scaleRatio = newScale / currentScale;
    const newTranslateX = centerX - (centerX - currentTranslate.x) * scaleRatio;
    const newTranslateY = centerY - (centerY - currentTranslate.y) * scaleRatio;
    
    // 计算边界限制，防止移出可视区域
    // 缩放后内容的边界
    const contentWidth = containerRect.width * newScale;
    const contentHeight = containerRect.height * newScale;
    
    // 允许的最大偏移量（内容超出视口的距离，加上一些缓冲）
    const maxOffsetX = Math.max(0, (contentWidth - containerRect.width) / 2 + 100);
    const maxOffsetY = Math.max(0, (contentHeight - containerRect.height) / 2 + 100);
    
    // 限制偏移量在边界内
    const clampedX = Math.max(-maxOffsetX, Math.min(maxOffsetX, newTranslateX));
    const clampedY = Math.max(-maxOffsetY, Math.min(maxOffsetY, newTranslateY));
    
    scaleRef.current = newScale;
    translateRef.current = { x: clampedX, y: clampedY };
    setScale(newScale);
    setTranslate({ x: clampedX, y: clampedY });
  }, []);

  // 更新节点文本
  const handleUpdateNode = useCallback(() => {
    if (selectedNode && editText.trim() && jmInstanceRef.current) {
      jmInstanceRef.current.update_node(selectedNode.id, editText.trim());
      setSelectedNode(null);
      setEditText('');
    }
  }, [selectedNode, editText]);

  // 编辑节点
  const handleEditNode = useCallback(() => {
    if (activeNode && jmInstanceRef.current) {
      const node = jmInstanceRef.current.get_node(activeNode.id);
      if (node) {
        setSelectedNode({ id: activeNode.id, topic: node.topic || '' });
        setEditText(node.topic || '');
      }
    }
  }, [activeNode]);


  if (!mindmaps || mindmaps.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        暂无脑图数据
      </div>
    );
  }

  // 边界检查：确保 currentIndex 在有效范围内
  const safeIndex = Math.min(Math.max(0, currentIndex), mindmaps.length - 1);
  
  // 判断当前脑图是否需要自定义渲染
  const currentMindmap = mindmaps[safeIndex];
  
  // 额外防护：确保 currentMindmap 存在
  if (!currentMindmap) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        数据加载中...
      </div>
    );
  }
  
  const useCustomRender = currentMindmap && needsCustomRender(currentMindmap.template);

  return (
    <div className="relative w-full h-full">
      {/* 脑图画布区域 - 全屏显示，支持拖拽平移 */}
      <div
        className={cn(
          "relative w-full h-full overflow-hidden",
          isDragging ? "cursor-grabbing select-none" : "cursor-grab"
        )}
        onMouseDown={useCustomRender ? undefined : handleMouseDown}
        onMouseMove={useCustomRender ? undefined : handleMouseMove}
        onMouseUp={useCustomRender ? undefined : handleMouseUp}
        onMouseLeave={useCustomRender ? undefined : handleMouseLeave}
        onClick={() => setSelectedNode(null)}
      >
        {/* 自定义渲染器（差异化结构模板） */}
        {useCustomRender && currentMindmap && (
          <CustomMindMapViewer mindmap={currentMindmap} className="w-full h-full" />
        )}
        
        {/* jsMind 容器 - 可缩放和平移（经典结构模板） */}
        {!useCustomRender && (
          <>
            <div
              ref={containerRef}
              className="inline-block"
              style={{ 
                // 脑图视图始终使用深色模式，不受页面主题影响
                backgroundColor: '#050510',
                width: '100%',
                minHeight: 'calc(100vh - 160px)',
                transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
                transformOrigin: '0 0',
              }}
            />
            
            {/* 连接线画布 - 渲染节点间关系线 */}
            <canvas
              ref={linesCanvasRef}
              className="absolute inset-0 pointer-events-none"
              style={{ zIndex: 0 }}
            />
          </>
        )}
        
        {/* 节点编辑弹窗 */}
        {/* 脑图视图始终使用深色模式 */}
        {selectedNode && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setSelectedNode(null)}
          >
            <div
              className="bg-[#0a0a14] border border-[#00d4aa]/20 rounded-2xl shadow-2xl shadow-[#00d4aa]/10 p-6 w-full max-w-md mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-white mb-4">编辑节点</h3>
              <input
                type="text"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUpdateNode();
                  if (e.key === 'Escape') setSelectedNode(null);
                }}
                className="w-full px-4 py-3 bg-[#050510] border border-[#00d4aa]/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#00d4aa] focus:border-transparent"
                autoFocus
                placeholder="输入节点内容..."
              />
              <div className="flex justify-end gap-3 mt-4">
                <Button
                  variant="ghost"
                  onClick={() => setSelectedNode(null)}
                  className="text-white/70 hover:text-white hover:bg-white/10"
                >
                  取消
                </Button>
                <Button
                  onClick={handleUpdateNode}
                  className="bg-gradient-to-r from-[#00d4aa] to-[#5bb892] text-white hover:opacity-90"
                >
                  保存
                </Button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ===== 操作提示 - 左上角 ===== */}
      {/* 脑图视图始终使用深色模式 */}
      <div className="fixed top-20 left-4 z-50 group">
        {/* 悬停指示器 - 默认显示 */}
        <div className="bg-black/60 backdrop-blur-sm border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white/70 flex items-center gap-1.5 hover:bg-black/70 hover:text-white transition-all cursor-help shadow-lg shadow-black/20 opacity-100">
          <HelpCircle className="w-3.5 h-3.5" />
          <span>操作提示</span>
        </div>
        {/* 悬停显示详情提示 */}
        <div className="absolute top-full left-0 mt-2 opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:translate-y-0 -translate-y-2 pointer-events-none group-hover:pointer-events-auto">
          <div className="bg-black/90 backdrop-blur-md border border-white/10 rounded-lg px-3 py-2.5 text-xs text-white/70 shadow-xl shadow-black/30 whitespace-nowrap">
            <div className="flex items-center gap-2 hover:text-white transition-colors mb-1">
              <MousePointer className="w-3 h-3 text-[#00d4aa]" />
              <span>拖拽平移</span>
            </div>
            <div className="flex items-center gap-2 hover:text-white transition-colors mb-1">
              <ZoomIn className="w-3 h-3 text-[#00d4aa]" />
              <span>滚轮缩放</span>
            </div>
            <div className="flex items-center gap-2 hover:text-white transition-colors">
              <Edit3 className="w-3 h-3 text-[#00d4aa]" />
              <span>双击节点编辑</span>
            </div>
          </div>
        </div>
      </div>


      {/* jsMind 样式覆盖 - 增强视觉效果 */}
      <style jsx global>{`
        /* 统一全局背景色 - 消除黑色块 */
        /* 使用纯色而非渐变，确保画布背景完全一致 */
        .jsmind-container,
        .jsmind-inner,
        .jsmind-workspace,
        .jmnode,
        jmnodes {
          background-color: #050510 !important;
          background: #050510 !important;
        }
        
        .jsmind-container {
          width: 100% !important;
          height: 100% !important;
          overflow: auto !important;
          position: relative !important;
        }
        
        /* 隐藏 jsMind 默认的展开/收起图标 */
        jmexpander {
          display: none !important;
        }
        .jsmind-inner {
          width: 100% !important;
          height: 100% !important;
          overflow: visible !important;
          position: relative !important;
          background-color: #050510 !important;
        }
        
        /* 确保 jsMind workspace 覆盖整个容器 */
        .jsmind-workspace {
          position: absolute !important;
          inset: 0 !important;
          background-color: #050510 !important;
        }
        
        /* 确保所有节点画布使用透明背景 */
        jmnode,
        jmnode .jmnode-canvas,
        jmnode canvas {
          background: transparent !important;
        }
        
        /* Canvas 元素背景 */
        .jsmind-canvas {
          background-color: #050510 !important;
        }
        .jsmind-ovcanvas {
          background-color: transparent !important;
        }
        
        /* jsMind 所有可能元素统一背景 */
        [class*="jsmind"] {
          background-color: #050510 !important;
        }
        
        /* 节点画布容器背景 */
        .jmnode {
          background: transparent !important;
        }
        
        /* jsMind 覆盖层 - 消除黑色块 */
        .jsmind-overlay {
          background: transparent !important;
        }
        
        /* ===== 连接线样式 - 渲染节点间关系 ===== */
        /* jsMind DOM模式下连接线通过伪元素或额外元素实现 */
        .jsmind-lines {
          position: absolute !important;
          pointer-events: none !important;
          z-index: 0 !important;
        }
        
        /* 连接线 SVG 容器 */
        .jsmind-lines svg,
        .jsmind-canvas svg {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          width: 100% !important;
          height: 100% !important;
        }
        
        /* 连接线基础样式 */
        .jsmind-lines path,
        .jsmind-lines line,
        .jsmind-lines polyline,
        .jsmind-lines .line {
          stroke: rgba(0, 212, 170, 0.5) !important;
          stroke-width: 2px !important;
          fill: none !important;
          stroke-linecap: round !important;
          stroke-linejoin: round !important;
        }
        
        /* 一级分支连接线 - 更粗更亮 */
        jmnodes > jmnode > .jsmind-lines path,
        jmnodes > jmnode > .jsmind-lines line {
          stroke: rgba(0, 212, 170, 0.6) !important;
          stroke-width: 2.5px !important;
        }
        
        /* 二级分支连接线 */
        jmnodes jmnode > .jsmind-lines path,
        jmnodes jmnode > .jsmind-lines line {
          stroke: rgba(0, 212, 170, 0.4) !important;
          stroke-width: 1.8px !important;
        }
        
        /* 三级及更深连接线 */
        jmnodes jmnode jmnode > .jsmind-lines path,
        jmnodes jmnode jmnode > .jsmind-lines line {
          stroke: rgba(0, 212, 170, 0.25) !important;
          stroke-width: 1.5px !important;
        }
        
        /* 使用伪元素绘制连接线 - DOM模式补充 */
        jmnode::before,
        jmnode::after {
          content: '' !important;
          position: absolute !important;
          background: rgba(0, 212, 170, 0.4) !important;
          z-index: -1 !important;
        }
        
        /* 节点连接线 - 使用边框模拟 */
        jmnodes {
          position: relative !important;
        }
        
        /* 确保节点相对于画布正确定位 */
        jmnode {
          position: absolute !important;
          z-index: 1 !important;
        }
        
        /* ===== 全局统一节点样式 - 消除色彩隔离 ===== */
        /* 核心原则：所有节点使用统一纯色背景，与画布完全一致 */
        
        /* 节点基础样式 - 使用与画布完全一致的纯色背景 */
        jmnode {
          /* 统一纯色背景 - 与画布背景 #050510 完全一致 */
          background-color: rgba(5, 5, 16, 0.85) !important;
          border: 1px solid rgba(0, 212, 170, 0.25) !important;
          border-radius: 10px !important;
          color: rgba(232, 232, 232, 0.95) !important;
          font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif !important;
          font-size: 13px !important;
          padding: 10px 18px !important;
          min-width: 120px !important;
          max-width: 280px !important;
          white-space: normal !important;
          word-break: break-word !important;
          overflow: visible !important;
          box-shadow: 
            0 4px 12px rgba(0, 0, 0, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.03),
            0 0 1px rgba(0, 212, 170, 0.15) !important;
          line-height: 1.6 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          text-align: center !important;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
          cursor: pointer !important;
        }
        
        /* 节点内部元素 - 确保透明背景 */
        jmnode .jsmind-icon,
        jmnode .jsmind-text,
        jmnode span,
        jmnode div {
          color: rgba(232, 232, 232, 0.95) !important;
          background: transparent !important;
        }
        
        /* 节点名称/主题 */
        jmnode .topic {
          color: rgba(232, 232, 232, 0.95) !important;
          font-size: inherit !important;
          background: transparent !important;
        }
        
        /* 悬停效果 */
        jmnode:hover {
          border-color: rgba(0, 212, 170, 0.5) !important;
          box-shadow: 
            0 8px 24px rgba(0, 0, 0, 0.5),
            inset 0 1px 0 rgba(255, 255, 255, 0.05),
            0 0 16px rgba(0, 212, 170, 0.2) !important;
          transform: translateY(-2px) !important;
        }
        
        /* 选中节点 */
        jmnode.selected {
          background: linear-gradient(135deg, var(--brand-start, #00d4aa), var(--brand-end, #00a884)) !important;
          border: none !important;
          color: var(--foreground) !important;
          font-weight: bold !important;
          box-shadow: 0 6px 24px rgba(0, 212, 170, 0.5) !important;
        }
        jmnode.selected .topic {
          color: var(--foreground) !important;
        }
        
        /* 根节点样式 */
        jmnode.root {
          background: linear-gradient(135deg, var(--brand-start, #00d4aa), var(--brand-end, #00a884)) !important;
          border: none !important;
          color: var(--foreground) !important;
          font-weight: bold !important;
          font-size: 18px !important;
          padding: 16px 32px !important;
          min-width: 180px !important;
          max-width: 400px !important;
          box-shadow: 0 8px 32px rgba(0, 212, 170, 0.5), 0 0 20px rgba(0, 212, 170, 0.3) !important;
          border-radius: 16px !important;
        }
        jmnode.root .topic {
          color: var(--foreground) !important;
        }
        
        /* ===== 层级样式 - 仅边框和阴影区分 ===== */
        /* 一级子节点 */
        jmnode.level-1 {
          border-width: 1.5px !important;
          border-color: rgba(0, 212, 170, 0.35) !important;
          box-shadow: 
            0 6px 20px rgba(0, 0, 0, 0.5),
            inset 0 1px 0 rgba(255, 255, 255, 0.04),
            0 0 12px rgba(0, 212, 170, 0.12) !important;
        }
        
        /* 二级子节点 */
        jmnode.level-2 {
          border-color: rgba(0, 212, 170, 0.28) !important;
        }
        
        /* 三级及更深节点 - 边框淡化 */
        jmnode.level-3,
        jmnode.level-4,
        jmnode.level-5 {
          border-color: rgba(0, 212, 170, 0.20) !important;
          box-shadow: 0 3px 10px rgba(0, 0, 0, 0.35) !important;
        }
        
        /* 模板类型特定样式 - 保持统一的背景和边框基础 */
        
        /* 流程图样式 - 左侧强调线 */
        jmnode.template-flowchart {
          border-left-width: 3px !important;
          border-left-color: rgba(139, 92, 246, 0.7) !important;
        }
        
        /* 时间线样式 - 左侧强调线 */
        jmnode.template-timeline {
          border-left-width: 3px !important;
          border-left-color: rgba(249, 115, 22, 0.6) !important;
        }
        
        /* 树状图样式 - 左侧强调线 */
        jmnode.template-tree {
          border-left-width: 3px !important;
          border-left-color: rgba(34, 197, 94, 0.7) !important;
        }
        
        /* 鱼骨图样式 - 左侧强调线 */
        jmnode.template-fishbone {
          border-left-width: 3px !important;
          border-left-color: rgba(239, 68, 68, 0.6) !important;
        }
        
        /* 括号图样式 - 左侧强调线 */
        jmnode.template-bracket {
          border-left-width: 3px !important;
          border-left-color: rgba(6, 182, 212, 0.6) !important;
        }
        
        /* 多重流程图样式 - 左侧强调线 */
        jmnode.template-multi-flow {
          border-left-width: 3px !important;
          border-left-color: rgba(249, 115, 22, 0.6) !important;
        }
        
        /* 桥状图样式 - 左侧强调线 */
        jmnode.template-bridge {
          border-left-width: 3px !important;
          border-left-color: rgba(168, 85, 247, 0.55) !important;
        }
        
        /* 经典放射图样式 - 根节点特殊效果 */
        jmnode.template-radial.root .topic {
          text-shadow: 0 0 20px rgba(0, 212, 170, 0.5) !important;
        }
        
        /* 模板切换动画 */
        @keyframes template-switch {
          0% { opacity: 0; transform: scale(0.95); }
          100% { opacity: 1; transform: scale(1); }
        }
        jmnode {
          animation: template-switch 0.3s ease-out;
        }

        /* 确保容器可以滚动 */
        .jsmind-container::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }
        .jsmind-container::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.03);
          border-radius: 5px;
        }
        .jsmind-container::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, var(--brand-start, #00d4aa), var(--brand-end, #00a884));
          border-radius: 5px;
        }
        .jsmind-container::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, var(--brand-start, #00d4aa), var(--brand-end, #00a884));
          opacity: 0.8;
        }

        /* 响应式样式 */
        @media (max-width: 768px) {
          jmnode {
            font-size: 12px !important;
            padding: 6px 12px !important;
            min-width: 80px !important;
            max-width: 200px !important;
          }
          jmnode.root {
            font-size: 14px !important;
            padding: 10px 18px !important;
            min-width: 120px !important;
          }
        }

        /* 触摸设备优化 */
        @media (pointer: coarse) {
          jmnode {
            min-width: 90px !important;
            padding: 10px 14px !important;
          }
        }
      `}</style>
    </div>
  );
}
