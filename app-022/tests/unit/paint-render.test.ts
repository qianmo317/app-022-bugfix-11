/**
 * 渲染层回归测试（对应用户反馈的四个问题）：
 * 1. 字形在格内居中（glyphTransform 不偏移、不出格）
 * 2. 描红格使用 traceColor（浅/中/深三档生效）
 * 3. 笔顺分解格：已完成笔浅灰、当前笔深色，且只画到第 k 笔
 * 4. 字体回退：汉字 82、字母数字 64（与需求文档一致）
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { RowContent, GlyphAt, glyphTransform } from '../../src/components/paint';
import { initData } from '../../src/lib/data';
import { defaultLayout, buildBlock } from '../../src/lib/layout';
import type { Row } from '../../src/types';

beforeAll(async () => {
  // 单测环境无服务器，直接读文件注入
  const { readFileSync } = await import('node:fs');
  const json = JSON.parse(readFileSync('public/data/strokes.json', 'utf8'));
  globalThis.fetch = (async () => ({ ok: true, json: async () => json })) as never;
  await initData();
});

function rowOf(char: string): Row {
  return [{ char, cells: buildBlock(char, defaultLayout, 5).cells }];
}

describe('glyphTransform 字形居中', () => {
  it('em box 垂直居中于格中心（不向下偏移）', () => {
    // 必须包含 y 翻转（scale(1 -1)），且 em box 关于格中心对称
    const t = glyphTransform(50, 70);
    expect(t).toContain('scale(1 -1)');
    const m = t.match(/translate\((-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)\) scale\(1 -1\)/);
    expect(m).toBeTruthy();
    const B = Number(m![2]);
    // y_screen = cy + k*(900 + B - y_glyph)；em box 中心 y=388 应映射到 cy
    // 即 900 + B - 388 = 0 → B = -512
    expect(B).toBe(-512);
  });
});

describe('描红格颜色', () => {
  it('描红格路径使用 traceColor，例字格用深色', () => {
    const html = renderToStaticMarkup(
      createElement(RowContent, { row: rowOf('春'), layout: { ...defaultLayout, traceColor: '#d9d9d9' } }),
    );
    // 描红格（trace）应出现 traceColor 路径
    expect(html).toContain('stroke="#d9d9d9"');
  });

  it('三档描红色互不相同地落到路径上', () => {
    for (const c of ['#d9d9d9', '#cccccc', '#b3b3b3']) {
      const html = renderToStaticMarkup(
        createElement(RowContent, { row: rowOf('春'), layout: { ...defaultLayout, traceColor: c } }),
      );
      expect(html).toContain(`stroke="${c}"`);
    }
  });
});

describe('笔顺分解格', () => {
  it('第 k 格只画前 k 笔，已完成笔浅灰、当前笔深色', () => {
    const block = buildBlock('永', defaultLayout, 5);
    const stepCells = block.cells.filter((c) => c.kind === 'step');
    expect(stepCells.length).toBe(3);
    const html = renderToStaticMarkup(createElement(RowContent, { row: [{ char: '永', cells: block.cells }], layout: defaultLayout }));
    // 已完成笔 #bfbfbf 与当前笔 #222222 都应出现
    expect(html).toContain('stroke="#bfbfbf"');
    // 第 1 格只有 1 笔（无已完成笔），第 3 格有 2 灰 1 深
    const step1 = renderToStaticMarkup(createElement(GlyphAt, { ch: '永', cx: 50, cy: 70, upto: 1 }));
    expect(step1.match(/<path/g)!.length).toBe(1);
    const step3 = renderToStaticMarkup(createElement(GlyphAt, { ch: '永', cx: 50, cy: 70, upto: 3 }));
    expect(step3.match(/<path/g)!.length).toBe(3);
    expect(step3.match(/stroke="#bfbfbf"/g)!.length).toBe(2);
    expect(step3.match(/stroke="#222222"/g)!.length).toBe(1);
  });
});

describe('字体回退字号', () => {
  it('无笔顺数据的汉字 82、字母数字 64', () => {
    const han = renderToStaticMarkup(createElement(GlyphAt, { ch: '㐀', cx: 50, cy: 70 }));
    expect(han).toContain('font-size="82"');
    const abc = renderToStaticMarkup(createElement(GlyphAt, { ch: 'A', cx: 50, cy: 70 }));
    expect(abc).toContain('font-size="64"');
    const num = renderToStaticMarkup(createElement(GlyphAt, { ch: '8', cx: 50, cy: 70 }));
    expect(num).toContain('font-size="64"');
  });
});
