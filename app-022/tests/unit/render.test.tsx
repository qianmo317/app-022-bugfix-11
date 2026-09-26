/**
 * 渲染回归测试：字形变换（翻转+居中+不出格）、描红颜色、笔顺分解配色、回退字号。
 * 使用真实 strokes.json（stub fetch 从磁盘读取），端到端渲染 RowContent。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const strokesJson = readFileSync(resolve(__dirname, '../../public/data/strokes.json'), 'utf-8');
vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => JSON.parse(strokesJson) }));

import { GlyphAt, RowContent, glyphTransform, INFO_H } from '../../src/components/paint';
import { initData } from '../../src/lib/data';
import { defaultLayout } from '../../src/lib/layout';
import type { Row } from '../../src/types';

beforeAll(async () => {
  await initData();
});

/** 手算 glyphTransform 的复合矩阵，把数据坐标 (x, y) 映射到单元格坐标 */
function mapPoint(cx: number, cy: number, x: number, y: number): [number, number] {
  // translate(cx cy) scale(0.092) translate(-512 -512) scale(1 -1) translate(0 -900)
  const k = 0.092;
  return [cx + (x - 512) * k, cy + (900 - y - 512) * k];
}

describe('glyphTransform 字形变换', () => {
  it('包含 y 轴翻转（hanzi-writer 数据 y 向上）', () => {
    expect(glyphTransform(50, 70)).toBe('translate(50 70) scale(0.092) translate(-512 -512) scale(1 -1) translate(0 -900)');
  });

  it('em 盒中心 (512, 388) 映射到格中心', () => {
    expect(mapPoint(50, 70, 512, 388)).toEqual([50, 70]);
  });

  it('em 盒四角映射后都在格内（含半笔宽）', () => {
    const halfStroke = (58 * 0.092) / 2;
    for (const [x, y] of [[0, 900], [1024, 900], [0, -124], [1024, -124]]) {
      const [sx, sy] = mapPoint(50, 70, x, y);
      expect(Math.abs(sx - 50) + halfStroke).toBeLessThan(50);
      expect(Math.abs(sy - 70) + halfStroke).toBeLessThan(50);
    }
  });

  it('字帖数据全部落在 em 盒内（任何字渲染后都不会出格）', () => {
    const { chars } = JSON.parse(strokesJson) as { chars: Record<string, { strokes: string[] }> };
    let lo = Infinity;
    let hi = -Infinity;
    for (const entry of Object.values(chars)) {
      for (const d of entry.strokes) {
        const nums = d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
        for (let i = 1; i < nums.length; i += 2) {
          if (nums[i] < lo) lo = nums[i];
          if (nums[i] > hi) hi = nums[i];
        }
      }
    }
    expect(lo).toBeGreaterThanOrEqual(-124);
    expect(hi).toBeLessThanOrEqual(900);
  });
});

describe('RowContent 渲染（真实笔顺数据）', () => {
  const row: Row = [
    {
      char: '春',
      cells: [
        { kind: 'model' },
        { kind: 'step', stepK: 1 },
        { kind: 'step', stepK: 2 },
        { kind: 'trace' },
        { kind: 'blank' },
      ],
    },
  ];
  let cells: string[] = [];
  beforeAll(() => {
    const html = renderToStaticMarkup(
      <svg>
        <RowContent row={row} layout={defaultLayout} />
      </svg>,
    );
    // 按格拆分：每格一个 data-grid 起头
    cells = html.split('<g data-grid=').slice(1);
  });

  it('例字格：全部笔画深色 #222', () => {
    const strokes = [...cells[0].matchAll(/<path[^>]*?stroke="(#[0-9a-f]{6})"/g)].map((m) => m[1]);
    expect(strokes.length).toBe(9); // 春 9 画
    expect(new Set(strokes)).toEqual(new Set(['#222222']));
  });

  it('笔顺分解格：已写完的笔浅灰 #bfbfbf，当前笔深色 #222', () => {
    const step1 = [...cells[1].matchAll(/<path[^>]*?stroke="(#[0-9a-f]{6})"/g)].map((m) => m[1]);
    expect(step1).toEqual(['#222222']); // 第 1 笔：只有当前笔
    const step2 = [...cells[2].matchAll(/<path[^>]*?stroke="(#[0-9a-f]{6})"/g)].map((m) => m[1]);
    expect(step2).toEqual(['#bfbfbf', '#222222']); // 第 2 笔：已写灰 + 当前深
  });

  it('描红格：使用版式描红色（默认 #cccccc），不是深色', () => {
    const strokes = [...cells[3].matchAll(/<path[^>]*?stroke="(#[0-9a-f]{6})"/g)].map((m) => m[1]);
    expect(strokes.length).toBe(9);
    expect(new Set(strokes)).toEqual(new Set(['#cccccc']));
  });

  it('描红格：跟随 traceColor 切换（深 #b3b3b3）', () => {
    const dark = renderToStaticMarkup(
      <svg>
        <RowContent row={row} layout={{ ...defaultLayout, traceColor: '#b3b3b3' }} />
      </svg>,
    );
    const traceCell = dark.split('<g data-grid=').slice(1)[3];
    const strokes = [...traceCell.matchAll(/<path[^>]*?stroke="(#[0-9a-f]{6})"/g)].map((m) => m[1]);
    expect(new Set(strokes)).toEqual(new Set(['#b3b3b3']));
  });
});

describe('字体回退（无笔顺数据）', () => {
  it('汉字 82、字母数字 64', () => {
    const han = renderToStaticMarkup(<GlyphAt ch="㐀" cx={50} cy={INFO_H + 50} />);
    expect(han).toContain('font-size="82"');
    const latin = renderToStaticMarkup(<GlyphAt ch="A" cx={50} cy={INFO_H + 50} />);
    expect(latin).toContain('font-size="64"');
    const digit = renderToStaticMarkup(<GlyphAt ch="3" cx={50} cy={INFO_H + 50} />);
    expect(digit).toContain('font-size="64"');
  });

  it('回退字形垂直居中于格中心', () => {
    const latin = renderToStaticMarkup(<GlyphAt ch="A" cx={50} cy={70} />);
    expect(latin).toContain('y="70"');
    expect(latin).toContain('dominant-baseline="central"');
  });
});
