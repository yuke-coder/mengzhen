"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Download, Edit2, Check, X
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MindMapData, MindMapTemplate, FishboneStructure, TimelineStructure, 
  VennStructure, FlowchartStructure, MultiFlowStructure, DoubleBubbleStructure,
  BridgeStructure, OrgChartStructure, CircleStructure, BubbleStructure,
  ConceptStructure } from "@/lib/mindmap-types";
import { useTheme } from "@/lib/theme-context";

// ==================== 通用工具函数 ====================

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split('');
  const lines: string[] = [];
  let currentLine = '';
  
  for (const char of words) {
    const testLine = currentLine + char;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = char;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function getTextWidth(ctx: CanvasRenderingContext2D, text: string): number {
  return ctx.measureText(text).width;
}

// ==================== 统一节点样式（与 jsMind 经典放射图一致） ====================

interface NodeStyle {
  bgColor: string;
  textColor: string;
  borderColor: string;
  shadowColor: string;
  fontSize: number;
  isRoot: boolean;
}

function getNodeStyle(isRoot: boolean, isSelected: boolean, isHovered: boolean): NodeStyle {
  if (isSelected) {
    return {
      bgColor: '#00d4aa',
      textColor: '#ffffff',
      borderColor: '#00a888',
      shadowColor: 'rgba(0, 212, 170, 0.4)',
      fontSize: isRoot ? 18 : 13,
      isRoot
    };
  }
  if (isHovered) {
    return {
      bgColor: '#1a1a2e',
      textColor: '#ffffff',
      borderColor: '#00d4aa',
      shadowColor: 'rgba(0, 212, 170, 0.3)',
      fontSize: isRoot ? 18 : 13,
      isRoot
    };
  }
  return {
    bgColor: isRoot ? '#1a1a2e' : '#ffffff',
    textColor: isRoot ? '#ffffff' : '#333333',
    borderColor: isRoot ? '#00d4aa' : '#e0e0e0',
    shadowColor: isRoot ? 'rgba(0, 212, 170, 0.3)' : 'rgba(0, 0, 0, 0.15)',
    fontSize: isRoot ? 18 : 13,
    isRoot
  };
}

// 绘制统一风格的节点（与 jsMind 经典放射图一致）
function drawNode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  isRoot: boolean,
  isSelected: boolean = false,
  isHovered: boolean = false,
  padding: number = 12
) {
  const style = getNodeStyle(isRoot, isSelected, isHovered);
  
  ctx.font = `${style.fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  const lines = wrapText(ctx, text, 200);
  const lineHeight = style.fontSize * 1.3;
  const textHeight = lines.length * lineHeight;
  const textWidth = Math.max(...lines.map(l => getTextWidth(ctx, l)));
  
  const width = textWidth + padding * 2;
  const height = textHeight + padding * 2;
  
  // 圆角
  const radius = isRoot ? 10 : 6;
  
  // 阴影
  ctx.shadowColor = style.shadowColor;
  ctx.shadowBlur = isSelected ? 15 : (isHovered ? 12 : 6);
  ctx.shadowOffsetX = isSelected ? 2 : 1;
  ctx.shadowOffsetY = isSelected ? 2 : 1;
  
  // 绘制圆角矩形
  ctx.beginPath();
  ctx.roundRect(x - width / 2, y - height / 2, width, height, radius);
  ctx.fillStyle = style.bgColor;
  ctx.fill();
  
  // 边框
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = style.borderColor;
  ctx.lineWidth = isRoot ? 2 : 1;
  ctx.stroke();
  
  // 文字
  ctx.fillStyle = style.textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, idx) => {
    ctx.fillText(line, x, y + (idx - (lines.length - 1) / 2) * lineHeight);
  });
  
  return { x, y, width, height, text };
}

// 绘制连接线
function drawConnection(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string = '#00d4aa'
) {
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  
  // 使用曲线连接，使线条更流畅
  const midX = (fromX + toX) / 2;
  ctx.quadraticCurveTo(midX, fromY, midX, (fromY + toY) / 2);
  ctx.quadraticCurveTo(midX, toY, toX, toY);
  
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
}

// ==================== 经典放射图树形布局渲染器 ====================

interface TreeNode {
  id: string;
  text: string;
  children?: TreeNode[];
}

function renderRadialTree(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  root: TreeNode | undefined,
  scale: number,
  offsetX: number,
  offsetY: number
) {
  if (!root) {
    console.error('[renderRadialTree] root is undefined');
    return;
  }
  
  try {
    const centerX = width / 2;
    const centerY = height / 2;
    
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    
    // 节点间距
    const levelGapX = 150;  // 水平方向间距
    const levelGapY = 60;    // 垂直方向间距
    
    // 递归布局节点
    const layoutNode = (
      node: TreeNode,
      x: number,
      y: number,
      depth: number,
      availableWidth: number
    ): Array<{ node: TreeNode; x: number; y: number; width: number }> => {
      const result: Array<{ node: TreeNode; x: number; y: number; width: number }> = [];
      
      // 计算当前节点宽度
      ctx.font = depth === 0 ? '18px sans-serif' : '13px sans-serif';
      const lines = wrapText(ctx, node.text || '', 200);
      const textWidth = Math.max(...lines.map(l => getTextWidth(ctx, l)));
      const nodeWidth = Math.max(textWidth + 24, 80);
      
      result.push({ node, x, y, width: nodeWidth });
      
      if (node.children && node.children.length > 0) {
        const childY = y + levelGapY;
        
        // 计算每个子节点的位置
        const childCount = node.children.length;
        const totalChildWidth = childCount * levelGapX;
        const startX = x - totalChildWidth / 2 + levelGapX / 2;
        
        node.children.forEach((child, i) => {
          const childX = startX + i * levelGapX;
          const childResults = layoutNode(child, childX, childY, depth + 1, availableWidth);
          result.push(...childResults);
          
          // 绘制从当前节点到子节点的连线
          ctx.beginPath();
          ctx.moveTo(x, y + 15);
          ctx.lineTo(childX, childY - 15);
          ctx.strokeStyle = depth === 0 ? '#00d4aa' : 'rgba(0, 212, 170, 0.6)';
          ctx.lineWidth = depth === 0 ? 2 : 1.5;
          ctx.stroke();
        });
      }
      
      return result;
    };
    
    // 布局并绘制所有节点
    const nodePositions = layoutNode(root, centerX, centerY, 0, width);
    
    // 绘制所有节点
    nodePositions.forEach(({ node, x, y }) => {
      const isRoot = node === root;
      
      // 绘制节点
      ctx.font = isRoot ? '18px sans-serif' : '13px sans-serif';
      const lines = wrapText(ctx, node.text || '', 200);
      const lineHeight = (isRoot ? 18 : 13) * 1.3;
      const textHeight = lines.length * lineHeight;
      const textWidth = Math.max(...lines.map(l => getTextWidth(ctx, l)));
      
      const padding = 12;
      const nodeWidth = textWidth + padding * 2;
      const nodeHeight = textHeight + padding * 2;
      
      // 阴影
      ctx.shadowColor = isRoot ? 'rgba(0, 212, 170, 0.3)' : 'rgba(0, 0, 0, 0.15)';
      ctx.shadowBlur = isRoot ? 10 : 6;
      
      // 绘制背景
      ctx.beginPath();
      ctx.roundRect(x - nodeWidth / 2, y - nodeHeight / 2, nodeWidth, nodeHeight, isRoot ? 10 : 6);
      ctx.fillStyle = isRoot ? '#1a1a2e' : '#ffffff';
      ctx.fill();
      
      // 边框
      ctx.shadowBlur = 0;
      ctx.strokeStyle = isRoot ? '#00d4aa' : '#e0e0e0';
      ctx.lineWidth = isRoot ? 2 : 1;
      ctx.stroke();
      
      // 文字
      ctx.fillStyle = isRoot ? '#ffffff' : '#333333';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      lines.forEach((line, idx) => {
        ctx.fillText(line, x, y + (idx - (lines.length - 1) / 2) * lineHeight);
      });
    });
    
    ctx.restore();
  } catch (error) {
    console.error('[renderRadialTree] error:', error);
  }
}

// ==================== 鱼骨图渲染器（使用统一样式） ====================

function renderFishbone(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  structure: FishboneStructure,
  scale: number,
  offsetX: number,
  offsetY: number
) {
  const spineY = height / 2;
  const spineStartX = 100 * scale;
  const spineEndX = width - 100 * scale;
  
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  
  // 绘制主骨
  ctx.beginPath();
  ctx.moveTo(spineStartX, spineY);
  ctx.lineTo(spineEndX, spineY);
  ctx.strokeStyle = '#00d4aa';
  ctx.lineWidth = 4;
  ctx.stroke();
  
  // 绘制主骨箭头
  ctx.beginPath();
  ctx.moveTo(spineEndX - 20, spineY - 10);
  ctx.lineTo(spineEndX, spineY);
  ctx.lineTo(spineEndX - 20, spineY + 10);
  ctx.strokeStyle = '#00d4aa';
  ctx.lineWidth = 4;
  ctx.stroke();
  
  // 主骨标题（使用统一样式）
  const spineText = structure.spine.text;
  const spineTextWidth = getTextWidth(ctx, spineText);
  drawNode(ctx, spineEndX + spineTextWidth / 2 + 60, spineY, spineText, true);
  
  // 绘制原因分支
  const causes = structure.causes || [];
  const causeSpacing = (spineEndX - spineStartX - 100) / Math.max(causes.length, 1);
  
  causes.forEach((cause, idx) => {
    const isTop = idx % 2 === 0;
    const angle = isTop ? -Math.PI / 4 : Math.PI / 4;
    const causeX = spineStartX + 80 + idx * causeSpacing;
    const causeLength = 80;
    const causeEndX = causeX + Math.cos(angle) * causeLength;
    const causeEndY = spineY + Math.sin(angle) * causeLength;
    
    // 大骨
    ctx.beginPath();
    ctx.moveTo(causeX, spineY);
    ctx.lineTo(causeEndX, causeEndY);
    ctx.strokeStyle = isTop ? '#ff6b6b' : '#4ecdc4';
    ctx.lineWidth = 3;
    ctx.stroke();
    
    // 原因标签（使用统一样式）
    const labelX = causeEndX + 40;
    const labelY = causeEndY + (isTop ? -15 : 20);
    drawNode(ctx, labelX, labelY, cause.text, false);
    
    // 小骨（子原因）
    if (cause.children && cause.children.length > 0) {
      const subAngle = isTop ? -Math.PI / 6 : Math.PI / 6;
      cause.children.forEach((subCause, subIdx) => {
        const subX = causeEndX + 30 + subIdx * 60;
        const subEndX = subX + Math.cos(subAngle) * 50;
        const subEndY = spineY + Math.sin(subAngle) * (isTop ? -1 : 1) * (60 + subIdx * 25);
        
        ctx.beginPath();
        ctx.moveTo(subX, causeEndY);
        ctx.lineTo(subEndX, subEndY);
        ctx.strokeStyle = isTop ? '#ff8787' : '#6ee7de';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // 子原因节点（使用统一样式）
        const subText = typeof subCause === 'string' ? subCause : subCause.text || '';
        if (subText) {
          drawNode(ctx, subEndX, subEndY + (isTop ? -12 : 15), subText, false);
        }
      });
    }
  });
  
  // 绘制头部（问题）- 使用统一样式
  drawNode(ctx, spineStartX, spineY, '问题', true);
  
  ctx.restore();
}

// ==================== 时间线图渲染器 ====================

function renderTimeline(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  structure: TimelineStructure,
  scale: number,
  offsetX: number,
  offsetY: number
) {
  const padding = 80 * scale;
  const axisY = height / 2;
  const axisStartX = padding;
  const axisEndX = width - padding;
  
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  
  // 主轴线
  ctx.beginPath();
  ctx.moveTo(axisStartX, axisY);
  ctx.lineTo(axisEndX, axisY);
  ctx.strokeStyle = '#00d4aa';
  ctx.lineWidth = 3;
  ctx.stroke();
  
  // 轴线箭头
  ctx.beginPath();
  ctx.moveTo(axisEndX - 15, axisY - 8);
  ctx.lineTo(axisEndX, axisY);
  ctx.lineTo(axisEndX - 15, axisY + 8);
  ctx.stroke();
  
  const events = structure.events || [];
  const nodeSpacing = (axisEndX - axisStartX - 60) / Math.max(events.length - 1, 1);
  
  events.forEach((event, idx) => {
    const nodeX = axisStartX + 30 + idx * nodeSpacing;
    const isTop = idx % 2 === 0;
    const nodeY = isTop ? axisY - 70 : axisY + 70;
    
    // 连接线
    ctx.beginPath();
    ctx.moveTo(nodeX, axisY);
    ctx.lineTo(nodeX, nodeY);
    ctx.strokeStyle = '#00d4aa';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // 节点圆
    ctx.beginPath();
    ctx.arc(nodeX, nodeY, 25, 0, Math.PI * 2);
    const gradient = ctx.createRadialGradient(nodeX, nodeY, 0, nodeX, nodeY, 25);
    gradient.addColorStop(0, event.importance === 'high' ? '#00d4aa' : '#4a9eff');
    gradient.addColorStop(1, event.importance === 'high' ? '#00a080' : '#2a7edf');
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // 序号
    ctx.font = `bold ${14}px sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(String(idx + 1), nodeX, nodeY + 5);
    
    // 时间标签
    ctx.font = `${12}px sans-serif`;
    ctx.fillStyle = '#00d4aa';
    ctx.fillText(event.year || '', nodeX, axisY + 25);
    
    // 事件标题（使用统一样式）
    const eventTitle = event.text;
    const descY = isTop ? nodeY + 55 : nodeY - 55;
    drawNode(ctx, nodeX, descY, eventTitle, false);
    
    // 描述（使用统一样式）
    if (event.description) {
      const descTextY = isTop ? nodeY + 100 : nodeY - 100;
      drawNode(ctx, nodeX, descTextY, event.description, false);
    }
  });
  
  ctx.restore();
}

// ==================== 韦恩图渲染器 ====================

function renderVenn(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  structure: VennStructure,
  scale: number,
  offsetX: number,
  offsetY: number
) {
  const centerX = width / 2;
  const centerY = height / 2;
  const sets = structure.sets || [];
  
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  
  // 绘制交集区域（先画，在底层）
  if (structure.intersections && structure.intersections.length > 0) {
    const intersection = structure.intersections[0];
    const interX = sets.length === 2 ? centerX : centerX;
    const interY = centerY;
    
    // 交集椭圆
    ctx.beginPath();
    ctx.ellipse(interX, interY, 50, 40, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // 交集标签
    ctx.font = `${12}px sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(intersection.text, interX, interY + 4);
  }
  
  // 绘制各个集合圆
  const radius = Math.min(width, height) * 0.25;
  const defaultColors = ['#00d4aa', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4'];
  sets.forEach((set, idx) => {
    const angle = (idx / sets.length) * Math.PI * 2 - Math.PI / 2;
    const offset = sets.length === 2 ? 40 : 0;
    const circleX = centerX + Math.cos(angle) * offset;
    const circleY = centerY + Math.sin(angle) * offset;
    const setColor = set.color || defaultColors[idx % defaultColors.length];
    
    // 圆形
    ctx.beginPath();
    ctx.arc(circleX, circleY, radius, 0, Math.PI * 2);
    const gradient = ctx.createRadialGradient(circleX, circleY, 0, circleX, circleY, radius);
    gradient.addColorStop(0, setColor + '80');
    gradient.addColorStop(1, setColor + '40');
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = setColor;
    ctx.lineWidth = 3;
    ctx.stroke();
    
    // 集合标签
    ctx.font = `bold ${14}px sans-serif`;
    ctx.fillStyle = setColor;
    ctx.textAlign = 'center';
    ctx.fillText(set.text, circleX, circleY - 10);
    
    // 特征列表
    ctx.font = `${12}px sans-serif`;
    ctx.fillStyle = '#e0e0e0';
    set.features.forEach((feature, fIdx) => {
      ctx.fillText('• ' + feature, circleX, circleY + 15 + fIdx * 18);
    });
  });
  
  ctx.restore();
}

// ==================== 流程图渲染器 ====================

function renderFlowchart(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  structure: FlowchartStructure,
  scale: number,
  offsetX: number,
  offsetY: number
) {
  const padding = 60 * scale;
  const nodeWidth = 140;
  const nodeHeight = 50;
  const hGap = 40;
  const vGap = 30;
  
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  
  const steps = structure.steps || [];
  let currentX = padding;
  let currentY = height / 2 - nodeHeight / 2;
  
  steps.forEach((step, idx) => {
    const isLast = idx === steps.length - 1;
    
    // 绘制连接线
    if (idx > 0) {
      ctx.beginPath();
      ctx.moveTo(currentX - hGap, currentY + nodeHeight / 2);
      ctx.lineTo(currentX, currentY + nodeHeight / 2);
      ctx.strokeStyle = '#00d4aa';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // 箭头
      ctx.beginPath();
      ctx.moveTo(currentX - 10, currentY + nodeHeight / 2 - 6);
      ctx.lineTo(currentX, currentY + nodeHeight / 2);
      ctx.lineTo(currentX - 10, currentY + nodeHeight / 2 + 6);
      ctx.stroke();
    }
    
    // 绘制节点（使用统一样式：圆角矩形）
    const isTerminal = step.type === 'terminal';
    const isStart = step.text === '开始';
    const isEnd = step.text === '结束';
    const isDecision = step.type === 'decision';
    
    // 根据类型设置颜色
    let bgColor = '#1a1a2e';
    if (isStart) bgColor = '#00d4aa';
    else if (isEnd) bgColor = '#ff6b6b';
    else if (isDecision) bgColor = '#ffa500';
    
    // 绘制圆角矩形节点
    ctx.shadowColor = isStart || isEnd ? 'rgba(0, 212, 170, 0.3)' : 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.roundRect(currentX, currentY, nodeWidth, nodeHeight, 8);
    ctx.fillStyle = bgColor;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#00d4aa';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // 节点文本
    ctx.font = `${12}px sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = wrapText(ctx, step.text, nodeWidth - 20);
    lines.forEach((line, lineIdx) => {
      ctx.fillText(line, currentX + nodeWidth / 2, currentY + nodeHeight / 2 + (lineIdx - (lines.length - 1) / 2) * 14);
    });
    
    // 分支标签
    if (step.yes || step.no) {
      ctx.font = `${10}px sans-serif`;
      ctx.fillStyle = '#00d4aa';
      if (step.yes) {
        ctx.fillText('是', currentX + nodeWidth + 15, currentY - 10);
        // 绘制分支连接线
        ctx.beginPath();
        ctx.moveTo(currentX + nodeWidth, currentY);
        ctx.lineTo(currentX + nodeWidth + 40, currentY - 25);
        ctx.strokeStyle = '#00d4aa';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (step.no) {
        ctx.fillText('否', currentX + nodeWidth + 15, currentY + nodeHeight + 10);
        // 绘制分支连接线
        ctx.beginPath();
        ctx.moveTo(currentX + nodeWidth, currentY + nodeHeight);
        ctx.lineTo(currentX + nodeWidth + 40, currentY + nodeHeight + 25);
        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    
    currentX += nodeWidth + hGap;
  });
  
  ctx.restore();
}

// ==================== 多重流程图渲染器 ====================

function renderMultiFlow(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  structure: MultiFlowStructure,
  scale: number,
  offsetX: number,
  offsetY: number
) {
  const centerX = width / 2;
  const centerY = height / 2;
  
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  
  // 中心事件（使用统一样式）
  drawNode(ctx, centerX, centerY, structure.center?.text || '中心事件', true);
  
  // 绘制原因（左侧）
  const causes = structure.causes || [];
  const causeStartY = centerY - (causes.length * 70) / 2;
  
  causes.forEach((cause, idx) => {
    const y = causeStartY + idx * 80;
    
    // 连接线
    ctx.beginPath();
    ctx.moveTo(centerX - 60, centerY);
    ctx.quadraticCurveTo(centerX - 120, centerY, centerX - 150, y);
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // 原因节点（使用统一样式）
    drawNode(ctx, centerX - 220, y, cause.text, false);
    
    // 子原因
    if (cause.children && cause.children.length > 0) {
      cause.children.forEach((child, childIdx) => {
        const childText = typeof child === 'string' ? child : child.text || '';
        if (childText) {
          drawNode(ctx, centerX - 350, y - 25 + childIdx * 45, childText, false);
        }
      });
    }
  });
  
  // 绘制结果（右侧）
  const effects = structure.effects || [];
  const effectStartY = centerY - (effects.length * 70) / 2;
  
  effects.forEach((effect, idx) => {
    const y = effectStartY + idx * 80;
    
    // 连接线
    ctx.beginPath();
    ctx.moveTo(centerX + 60, centerY);
    ctx.quadraticCurveTo(centerX + 120, centerY, centerX + 150, y);
    ctx.strokeStyle = '#4ecdc4';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // 结果节点（使用统一样式）
    drawNode(ctx, centerX + 220, y, effect.text, false);
    
    // 子结果
    if (effect.children && effect.children.length > 0) {
      effect.children.forEach((child, childIdx) => {
        const childText = typeof child === 'string' ? child : child.text || '';
        if (childText) {
          drawNode(ctx, centerX + 350, y - 25 + childIdx * 45, childText, false);
        }
      });
    }
  });
  
  ctx.font = `bold ${14}px sans-serif`;
  ctx.fillStyle = '#ff6b6b';
  ctx.textAlign = 'center';
  ctx.fillText('原因', 80, 50);
  ctx.fillStyle = '#4ecdc4';
  ctx.fillText('结果', width - 80, 50);
  
  ctx.restore();
}

// ==================== 双重气泡图渲染器 ====================

function renderDoubleBubble(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  structure: DoubleBubbleStructure,
  scale: number,
  offsetX: number,
  offsetY: number
) {
  const centerX = width / 2;
  const centerY = height / 2;
  const bubbleRadius = 120;
  
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  
  // 左侧主题（使用统一样式）
  const leftText = structure.left?.text || '主题A';
  const leftFeatures = structure.left?.features || [];
  drawNode(ctx, centerX - 180, centerY, leftText, true);
  leftFeatures.forEach((f, idx) => {
    const text = typeof f === 'string' ? f : f.text || '';
    if (text) {
      drawNode(ctx, centerX - 180, centerY + 80 + idx * 50, text, false);
    }
  });
  
  // 右侧主题（使用统一样式）
  const rightText = structure.right?.text || '主题B';
  const rightFeatures = structure.right?.features || [];
  drawNode(ctx, centerX + 180, centerY, rightText, true);
  rightFeatures.forEach((f, idx) => {
    const text = typeof f === 'string' ? f : f.text || '';
    if (text) {
      drawNode(ctx, centerX + 180, centerY + 80 + idx * 50, text, false);
    }
  });
  
  // 右侧气泡
  ctx.beginPath();
  ctx.arc(centerX + 140, centerY, bubbleRadius, 0, Math.PI * 2);
  const rightGrad = ctx.createRadialGradient(centerX + 140, centerY, 0, centerX + 140, centerY, bubbleRadius);
  rightGrad.addColorStop(0, '#4ecdc480');
  rightGrad.addColorStop(1, '#4ecdc440');
  ctx.fillStyle = rightGrad;
  ctx.fill();
  ctx.strokeStyle = '#4ecdc4';
  ctx.lineWidth = 3;
  ctx.stroke();
  
  ctx.font = `bold ${16}px sans-serif`;
  ctx.fillStyle = '#4ecdc4';
  ctx.textAlign = 'center';
  ctx.fillText(structure.right?.text || '', centerX + 140, centerY - 50);
  
  ctx.font = `${12}px sans-serif`;
  ctx.fillStyle = '#ffffff';
  (structure.right?.features || []).forEach((f, idx) => {
    ctx.fillText('• ' + f, centerX + 140, centerY - 20 + idx * 22);
  });
  
  // 交集气泡（使用统一样式）
  const similarities = structure.similarities || [];
  drawNode(ctx, centerX, centerY, '共同点', false);
  similarities.forEach((s, idx) => {
    const text = typeof s === 'string' ? s : s.text || '';
    if (text) {
      drawNode(ctx, centerX, centerY + 60 + idx * 50, text, false);
    }
  });
  
  ctx.restore();
}

// ==================== 桥状图渲染器 ====================

function renderBridge(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  structure: BridgeStructure,
  scale: number,
  offsetX: number,
  offsetY: number
) {
  const centerX = width / 2;
  const centerY = height / 2;
  const bridgeWidth = 200;
  const bridgeHeight = 40;
  
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  
  // 桥面
  ctx.beginPath();
  ctx.moveTo(centerX - bridgeWidth / 2, centerY);
  ctx.lineTo(centerX + bridgeWidth / 2, centerY);
  ctx.strokeStyle = '#00d4aa';
  ctx.lineWidth = 4;
  ctx.stroke();
  
  // 桥栏杆
  ctx.beginPath();
  ctx.moveTo(centerX - bridgeWidth / 2, centerY - 15);
  ctx.lineTo(centerX + bridgeWidth / 2, centerY - 15);
  ctx.moveTo(centerX - bridgeWidth / 2, centerY + 15);
  ctx.lineTo(centerX + bridgeWidth / 2, centerY + 15);
  ctx.strokeStyle = '#00d4aa80';
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // 桥拱
  ctx.beginPath();
  ctx.arc(centerX, centerY, bridgeHeight, Math.PI, 0);
  ctx.strokeStyle = '#00d4aa';
  ctx.lineWidth = 3;
  ctx.stroke();
  
  // 桥上标签
  ctx.font = `bold ${14}px sans-serif`;
  ctx.fillStyle = '#00d4aa';
  ctx.textAlign = 'center';
  ctx.fillText(structure.bridge?.text || '', centerX, centerY + 5);
  
  // 左侧项目
  const leftItems = structure.left || [];
  leftItems.forEach((item, idx) => {
    const y = centerY - (leftItems.length * 30) / 2 + idx * 35;
    
    // 连接线
    ctx.beginPath();
    ctx.moveTo(centerX - bridgeWidth / 2 - 30, y);
    ctx.lineTo(centerX - bridgeWidth / 2, centerY - 15);
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // 项目标签
    ctx.beginPath();
    ctx.ellipse(centerX - bridgeWidth / 2 - 60, y, 50, 15, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ff6b6b40';
    ctx.fill();
    ctx.strokeStyle = '#ff6b6b';
    ctx.stroke();
    
    ctx.font = `${11}px sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(item.text.substring(0, 8), centerX - bridgeWidth / 2 - 60, y + 4);
  });
  
  // 右侧项目
  const rightItems = structure.right || [];
  rightItems.forEach((item, idx) => {
    const y = centerY - (rightItems.length * 30) / 2 + idx * 35;
    
    // 连接线
    ctx.beginPath();
    ctx.moveTo(centerX + bridgeWidth / 2 + 30, y);
    ctx.lineTo(centerX + bridgeWidth / 2, centerY - 15);
    ctx.strokeStyle = '#4ecdc4';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // 项目标签
    ctx.beginPath();
    ctx.ellipse(centerX + bridgeWidth / 2 + 60, y, 50, 15, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#4ecdc440';
    ctx.fill();
    ctx.strokeStyle = '#4ecdc4';
    ctx.stroke();
    
    ctx.font = `${11}px sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(item.text.substring(0, 8), centerX + bridgeWidth / 2 + 60, y + 4);
  });
  
  ctx.restore();
}

// ==================== 组织结构图渲染器 ====================

function renderOrgChart(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  structure: OrgChartStructure,
  scale: number,
  offsetX: number,
  offsetY: number
) {
  const nodeWidth = 120;
  const nodeHeight = 50;
  const hGap = 30;
  const vGap = 60;
  
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  
  function drawNode(node: any, x: number, y: number, level: number) {
    if (!node) return;
    
    // 节点框
    ctx.beginPath();
    ctx.roundRect(x - nodeWidth / 2, y, nodeWidth, nodeHeight, 6);
    const gradient = ctx.createLinearGradient(x - nodeWidth / 2, y, x - nodeWidth / 2, y + nodeHeight);
    gradient.addColorStop(0, level === 0 ? '#00d4aa' : level === 1 ? '#4a9eff' : '#6366f1');
    gradient.addColorStop(1, level === 0 ? '#008866' : level === 1 ? '#2a6edf' : '#4a4ae0');
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = '#ffffff40';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // 节点文本
    ctx.font = level === 0 ? `bold ${13}px sans-serif` : `${12}px sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = wrapText(ctx, node.text || '', nodeWidth - 20);
    lines.forEach((line, idx) => {
      ctx.fillText(line, x, y + nodeHeight / 2 + (idx - (lines.length - 1) / 2) * 14);
    });
    
    // 绘制子节点
    if (node.children && node.children.length > 0) {
      const childCount = node.children.length;
      const totalWidth = childCount * nodeWidth + (childCount - 1) * hGap;
      const startX = x - totalWidth / 2 + nodeWidth / 2;
      
      // 垂直连接线
      ctx.beginPath();
      ctx.moveTo(x, y + nodeHeight);
      ctx.lineTo(x, y + nodeHeight + vGap / 2);
      ctx.strokeStyle = '#ffffff40';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      node.children.forEach((child: any, idx: number) => {
        const childX = startX + idx * (nodeWidth + hGap);
        const childY = y + nodeHeight + vGap;
        
        // 水平连接线
        ctx.beginPath();
        ctx.moveTo(x, y + nodeHeight + vGap / 2);
        ctx.lineTo(childX, y + nodeHeight + vGap / 2);
        ctx.lineTo(childX, childY);
        ctx.strokeStyle = '#ffffff40';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // 递归绘制子节点
        drawNode(child, childX, childY, level + 1);
      });
    }
  }
  
  drawNode(structure.root, width / 2, 40, 0);
  ctx.restore();
}

// ==================== 圆圈图渲染器 ====================

function renderCircle(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  structure: CircleStructure,
  scale: number,
  offsetX: number,
  offsetY: number
) {
  const centerX = width / 2;
  const centerY = height / 2;
  
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  
  // 中心圆
  const centerRadius = 60;
  ctx.beginPath();
  ctx.arc(centerX, centerY, centerRadius, 0, Math.PI * 2);
  const centerGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, centerRadius);
  centerGrad.addColorStop(0, '#00d4aa');
  centerGrad.addColorStop(1, '#008866');
  ctx.fillStyle = centerGrad;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.stroke();
  
  ctx.font = `bold ${14}px sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(structure.center?.text || '', centerX, centerY);
  
  // 绘制各层圆环 - API返回结构: rings: [{ ring, nodes: [{ id, text }] }]
  const rings = structure.rings || [];
  rings.forEach((ring, ringIdx) => {
    const ringRadius = centerRadius + 80 + ringIdx * 70;
    const nodes = ring.nodes || [];
    const nodeCount = nodes.length;
    
    nodes.forEach((node, nodeIdx) => {
      const angle = (nodeIdx / Math.max(nodeCount, 1)) * Math.PI * 2 - Math.PI / 2;
      const nodeX = centerX + Math.cos(angle) * ringRadius;
      const nodeY = centerY + Math.sin(angle) * ringRadius;
      
      // 节点圆
      ctx.beginPath();
      ctx.arc(nodeX, nodeY, 35 - ringIdx * 5, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${160 + ringIdx * 30}, 70%, 50%, ${0.6 - ringIdx * 0.1})`;
      ctx.fill();
      ctx.strokeStyle = '#00d4aa';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // 连接线
      const innerRadius = ringRadius - 40;
      const innerX = centerX + Math.cos(angle) * innerRadius;
      const innerY = centerY + Math.sin(angle) * innerRadius;
      ctx.beginPath();
      ctx.moveTo(innerX, innerY);
      ctx.lineTo(nodeX, nodeY);
      ctx.strokeStyle = '#00d4aa40';
      ctx.lineWidth = 1;
      ctx.stroke();
      
      // 节点文本 - API返回: nodes: [{ id, text }]
      ctx.font = `${10}px sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const nodeText = typeof node === 'string' ? node : ((node as { text?: string }).text || '');
      const lines = wrapText(ctx, nodeText, 60);
      lines.forEach((line, idx) => {
        ctx.fillText(line, nodeX, nodeY + (idx - (lines.length - 1) / 2) * 12);
      });
    });
  });
  
  ctx.restore();
}

// ==================== 气泡图渲染器 ====================

function renderBubble(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  structure: BubbleStructure,
  scale: number,
  offsetX: number,
  offsetY: number
) {
  const centerX = width / 2;
  const centerY = height / 2;
  
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  
  // 中心大气泡
  const centerRadius = 70;
  ctx.beginPath();
  ctx.arc(centerX, centerY, centerRadius, 0, Math.PI * 2);
  const centerGrad = ctx.createRadialGradient(centerX - 20, centerY - 20, 0, centerX, centerY, centerRadius);
  centerGrad.addColorStop(0, '#ff6b6b');
  centerGrad.addColorStop(1, '#cc4444');
  ctx.fillStyle = centerGrad;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.stroke();
  
  ctx.font = `bold ${14}px sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(structure.center?.text || '', centerX, centerY);
  
  // 周围气泡 - API返回: features: [{ id, text, importance }]
  const features = structure.features || [];
  const bubbleCount = features.length;
  features.forEach((feature, idx) => {
    const angle = (idx / Math.max(bubbleCount, 1)) * Math.PI * 2 - Math.PI / 2 + (Math.random() - 0.5) * 0.3;
    const distance = 150 + Math.random() * 50;
    const bubbleX = centerX + Math.cos(angle) * distance;
    const bubbleY = centerY + Math.sin(angle) * distance;
    
    let radius = 40;
    const importance = typeof feature === 'string' ? undefined : (feature as { importance?: string }).importance;
    if (importance === 'high') radius = 50;
    else if (importance === 'low') radius = 30;
    
    ctx.beginPath();
    ctx.arc(bubbleX, bubbleY, radius, 0, Math.PI * 2);
    const colors = ['#4ecdc4', '#ffa500', '#9b59b6', '#3498db', '#e74c3c', '#2ecc71'];
    ctx.fillStyle = colors[idx % colors.length] + '80';
    ctx.fill();
    ctx.strokeStyle = colors[idx % colors.length];
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.font = `${10}px sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const featureText = typeof feature === 'string' ? feature : ((feature as { text?: string }).text || '');
    const lines = wrapText(ctx, featureText, radius * 1.6);
    lines.forEach((line, lineIdx) => {
      ctx.fillText(line, bubbleX, bubbleY + (lineIdx - (lines.length - 1) / 2) * 12);
    });
  });
  
  ctx.restore();
}

// ==================== 概念图渲染器 ====================

function renderConcept(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  structure: ConceptStructure,
  scale: number,
  offsetX: number,
  offsetY: number
) {
  const centerX = width / 2;
  const centerY = height / 2;
  
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  
  const nodes = structure.nodes || [];
  const links = structure.links || [];
  
  // 计算节点位置（如果没提供的话）
  const positions = nodes.map((node, idx) => ({
    id: node.id,
    x: node.x !== undefined ? node.x * width : centerX + Math.cos(idx * 2 * Math.PI / nodes.length) * 150,
    y: node.y !== undefined ? node.y * height : centerY + Math.sin(idx * 2 * Math.PI / nodes.length) * 120,
    text: node.text
  }));
  
  // 绘制连接线
  links.forEach(link => {
    const fromNode = positions.find(n => n.id === link.from);
    const toNode = positions.find(n => n.id === link.to);
    
    if (fromNode && toNode) {
      ctx.beginPath();
      ctx.moveTo(fromNode.x, fromNode.y);
      ctx.lineTo(toNode.x, toNode.y);
      ctx.strokeStyle = '#00d4aa60';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // 关系标签
      const midX = (fromNode.x + toNode.x) / 2;
      const midY = (fromNode.y + toNode.y) / 2;
      ctx.font = `${9}px sans-serif`;
      ctx.fillStyle = '#00d4aa';
      ctx.textAlign = 'center';
      ctx.fillText(link.relation, midX, midY - 5);
    }
  });
  
  // 绘制节点
  positions.forEach((node, idx) => {
    const nodeRadius = 35;
    
    ctx.beginPath();
    ctx.arc(node.x, node.y, nodeRadius, 0, Math.PI * 2);
    const gradient = ctx.createRadialGradient(node.x - 10, node.y - 10, 0, node.x, node.y, nodeRadius);
    gradient.addColorStop(0, '#6366f1');
    gradient.addColorStop(1, '#4a4ae0');
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.font = `${11}px sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = wrapText(ctx, node.text, nodeRadius * 1.6);
    lines.forEach((line, lineIdx) => {
      ctx.fillText(line, node.x, node.y + (lineIdx - (lines.length - 1) / 2) * 12);
    });
  });
  
  ctx.restore();
}

// ==================== 主渲染组件 ====================

interface CustomMindMapViewerProps {
  mindmap: MindMapData;
  className?: string;
}

export function CustomMindMapViewer({ mindmap, className }: CustomMindMapViewerProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [editingNode, setEditingNode] = useState<{ x: number; y: number; text: string; nodeId: string } | null>(null);
  const [editText, setEditText] = useState('');
  const isDraggingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const nodePositionsRef = useRef<Array<{ x: number; y: number; width: number; height: number; text: string; nodeId: string }>>([]);
  
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // 清空画布
    ctx.clearRect(0, 0, dimensions.width, dimensions.height);
    
    // 绘制背景 - 脑图始终使用深色模式
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);
    
    // 根据模板类型渲染
    const structure = mindmap.structure as Record<string, unknown>;
    
    switch (mindmap.template) {
    case 'radial':
      case 'tree':
        // 经典放射图和树状图使用树形布局
        {
          const structure = (mindmap.structure || {}) as Record<string, unknown>;
          const rootNode = structure.root as TreeNode | undefined;
          console.log(`[render] ${mindmap.template}: structure=`, structure, 'rootNode=', rootNode);
          renderRadialTree(ctx, dimensions.width, dimensions.height, rootNode, scale, offset.x, offset.y);
        }
        break;
      case 'fishbone':
        renderFishbone(ctx, dimensions.width, dimensions.height, structure as unknown as FishboneStructure, scale, offset.x, offset.y);
        break;
      case 'timeline':
        renderTimeline(ctx, dimensions.width, dimensions.height, structure as unknown as TimelineStructure, scale, offset.x, offset.y);
        break;
      case 'venn':
        renderVenn(ctx, dimensions.width, dimensions.height, structure as unknown as VennStructure, scale, offset.x, offset.y);
        break;
      case 'flowchart':
        renderFlowchart(ctx, dimensions.width, dimensions.height, structure as unknown as FlowchartStructure, scale, offset.x, offset.y);
        break;
      case 'multi-flow':
        renderMultiFlow(ctx, dimensions.width, dimensions.height, structure as unknown as MultiFlowStructure, scale, offset.x, offset.y);
        break;
      case 'double-bubble':
        renderDoubleBubble(ctx, dimensions.width, dimensions.height, structure as unknown as DoubleBubbleStructure, scale, offset.x, offset.y);
        break;
      case 'bridge':
        renderBridge(ctx, dimensions.width, dimensions.height, structure as unknown as BridgeStructure, scale, offset.x, offset.y);
        break;
      case 'org-chart':
        renderOrgChart(ctx, dimensions.width, dimensions.height, structure as unknown as OrgChartStructure, scale, offset.x, offset.y);
        break;
      case 'circle':
        renderCircle(ctx, dimensions.width, dimensions.height, structure as unknown as CircleStructure, scale, offset.x, offset.y);
        break;
      case 'bubble':
        renderBubble(ctx, dimensions.width, dimensions.height, structure as unknown as BubbleStructure, scale, offset.x, offset.y);
        break;
      case 'concept':
        renderConcept(ctx, dimensions.width, dimensions.height, structure as unknown as ConceptStructure, scale, offset.x, offset.y);
        break;
      default:
        // 基础渲染
        ctx.font = '24px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(`模板: ${mindmap.template}`, dimensions.width / 2, dimensions.height / 2);
    }
  }, [mindmap, scale, offset, dimensions]);
  
  // 监听尺寸变化
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };
    
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);
  
  // 渲染
  useEffect(() => {
    render();
  }, [render]);
  
  // 鼠标拖拽平移
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    isDraggingRef.current = true;
    lastPosRef.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).style.cursor = 'grabbing';
  };
  
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - lastPosRef.current.x;
    const dy = e.clientY - lastPosRef.current.y;
    lastPosRef.current = { x: e.clientX, y: e.clientY };
    setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
  };
  
  const handleMouseUp = (e: React.MouseEvent) => {
    isDraggingRef.current = false;
    (e.currentTarget as HTMLElement).style.cursor = 'grab';
  };
  
  // 滚轮缩放
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale(s => Math.min(2, Math.max(0.5, s + delta)));
  };
  
  // 双击编辑
  const handleDoubleClick = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // 遍历结构中的文本，找到点击位置最近的节点
    const structure = mindmap.structure as Record<string, unknown>;
    const nodeTexts: Array<{ text: string; nodeId: string; x: number; y: number }> = [];
    const addNode = (text: string, x: number, y: number, id: string = text) => {
      if (text) nodeTexts.push({ text, nodeId: id, x, y });
    };
    
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    
    // 根据模板提取节点
    switch (mindmap.template) {
      case 'fishbone': {
        const fb = mindmap.structure as Record<string, unknown>;
        const spine = fb.spine as { text?: string } | undefined;
        addNode(spine?.text || '中心', centerX, centerY, spine?.text || 'center');
        const causes = fb.causes as Array<{ text?: string }> | undefined;
        if (causes) {
          causes.forEach((c, i) => {
            addNode(c.text || '', centerX - 200 + i * 80, centerY - 100 + (i % 2) * 200, c.text || '');
          });
        }
        break;
      }
      case 'timeline': {
        const tl = mindmap.structure as Record<string, unknown>;
        const tlTitle = (tl.title as string) || '时间线';
        addNode(tlTitle, centerX, centerY, 'title');
        const events = tl.events as Array<{ text?: string }> | undefined;
        if (events) {
          events.forEach((e, i) => {
            const eventText = typeof e === 'string' ? e : (e as { text?: string }).text || '';
            addNode(eventText, centerX - 300 + i * 100, centerY + (i % 2) * 100 - 50, eventText);
          });
        }
        break;
      }
      case 'flowchart': {
        const fc = structure as unknown as FlowchartStructure;
        if (fc.steps) {
          fc.steps.forEach((s, i) => {
            const stepText = typeof s === 'string' ? s : (s as { text?: string }).text || '';
            addNode(stepText, 150 + i * 150, centerY, stepText);
          });
        }
        break;
      }
      case 'venn': {
        const vn = structure as unknown as VennStructure;
        if (vn.sets) {
          vn.sets.forEach((s, i) => {
            const labelText = typeof s === 'string' ? s : (s as { label?: string }).label || '';
            addNode(labelText, centerX - 100 + i * 100, centerY - 50, labelText);
          });
        }
        break;
      }
      case 'circle': {
        const cr = mindmap.structure as Record<string, unknown>;
        // API 返回: { template, center: { id, text }, rings: [{ ring, nodes: [{ id, text }] }] }
        const center = cr.center as { text?: string } | undefined;
        addNode(center?.text || '主题', centerX, centerY, 'center');
        const rings = cr.rings as Array<{ ring?: number; nodes?: Array<{ text?: string }> }> | undefined;
        if (rings) {
          rings.forEach((ring, i) => {
            const nodes = ring.nodes || [];
            nodes.forEach((node, j) => {
              const angle = (j / Math.max(nodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
              const radius = 150 + i * 70;
              addNode(node.text || '', centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius, node.text || '');
            });
          });
        }
        break;
      }
      case 'bubble': {
        const bb = mindmap.structure as Record<string, unknown>;
        // API 返回: { template, center: { id, text }, features: [{ id, text, importance }] }
        const bubbleCenter = bb.center as { text?: string } | undefined;
        addNode(bubbleCenter?.text || '主题', centerX, centerY, 'center');
        const features = bb.features as Array<{ text?: string }> | undefined;
        if (features) {
          features.forEach((f, i) => {
            const angle = (i / features.length) * Math.PI * 2 - Math.PI / 2;
            addNode(f.text || '', centerX + Math.cos(angle) * 150, centerY + Math.sin(angle) * 100, f.text || '');
          });
        }
        break;
      }
      case 'radial':
      case 'tree': {
        // 树形布局节点提取 - 与 renderRadialTree 保持一致
        const levelGapX = 150;
        const levelGapY = 60;
        
        const extractTreeNodes = (
          node: Record<string, unknown>,
          x: number,
          y: number,
          depth: number
        ) => {
          if (node.text || node.topic) {
            addNode(String(node.text || node.topic), x, y, String(node.id || node.text || node.topic));
          }
          if (Array.isArray(node.children)) {
            const childY = y + levelGapY;
            const childCount = node.children.length;
            const totalChildWidth = childCount * levelGapX;
            const startX = x - totalChildWidth / 2 + levelGapX / 2;
            
            node.children.forEach((child: Record<string, unknown>, i: number) => {
              const childX = startX + i * levelGapX;
              extractTreeNodes(child, childX, childY, depth + 1);
            });
          }
        };
        
        if (structure && typeof structure === 'object') {
          const root = (structure as Record<string, unknown>).root as Record<string, unknown> | undefined;
          if (root) extractTreeNodes(root, centerX, centerY, 0);
        }
        break;
      }
      default: {
        // 通用提取：从 root 开始遍历
        const extractNodes = (node: Record<string, unknown>, depth = 0) => {
          if (node.text || node.topic) {
            const x = centerX + (Math.random() - 0.5) * 200 * depth;
            const y = centerY + depth * 60;
            addNode(String(node.text || node.topic), x, y, String(node.id || node.text || node.topic));
          }
          if (Array.isArray(node.children)) {
            node.children.forEach((child: Record<string, unknown>) => extractNodes(child, depth + 1));
          }
        };
        if (structure && typeof structure === 'object') {
          const root = (structure as Record<string, unknown>).root as Record<string, unknown> | undefined;
          if (root) extractNodes(root);
        }
      }
    }
    
    // 找到最近的节点
    let nearestNode: typeof nodeTexts[0] | null = null;
    let nearestDist = Infinity;
    const hitRadius = 60;
    
    for (const node of nodeTexts) {
      const dist = Math.sqrt(Math.pow(mouseX - node.x, 2) + Math.pow(mouseY - node.y, 2));
      if (dist < nearestDist && dist < hitRadius) {
        nearestDist = dist;
        nearestNode = node;
      }
    }
    
    if (nearestNode) {
      setEditingNode({ ...nearestNode, x: nearestNode.x, y: nearestNode.y });
      setEditText(nearestNode.text);
    }
  };
  
  const handleSaveEdit = () => {
    if (editingNode && editText.trim()) {
      // 这里可以调用回调函数通知父组件更新
      // 由于是只读渲染，直接关闭编辑框即可
      console.log('Updated node:', editingNode.nodeId, 'to:', editText);
    }
    setEditingNode(null);
    setEditText('');
  };
  
  const handleCancelEdit = () => {
    setEditingNode(null);
    setEditText('');
  };
  
  return (
    <div ref={containerRef} className={cn("relative w-full h-full overflow-hidden bg-[#050510]", isDark ? "dark" : "")}>
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full h-full cursor-grab"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
      />
      
      {/* 编辑弹窗 */}
      {editingNode && (
        <div 
          className="absolute z-50 bg-card border border-border rounded-xl shadow-2xl p-4 min-w-[200px]"
          style={{
            left: Math.min(editingNode.x, dimensions.width - 220),
            top: Math.min(editingNode.y - 60, dimensions.height - 120),
            transform: 'translateY(-50%)'
          }}
        >
          <p className="text-sm text-muted-foreground mb-2">编辑节点</p>
          <Input
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveEdit();
              if (e.key === 'Escape') handleCancelEdit();
            }}
            className="mb-3"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
              <X className="w-4 h-4" />
            </Button>
            <Button size="sm" onClick={handleSaveEdit}>
              <Check className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
      
    </div>
  );
}

export default CustomMindMapViewer;
