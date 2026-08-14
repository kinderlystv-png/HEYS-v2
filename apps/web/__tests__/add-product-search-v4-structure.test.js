import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const addProductSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_add_product_step_v1.js'),
  'utf8',
);
const cssSource = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/600-steps-and-aps.css'),
  'utf8',
);

describe('add product search v4 canvas structure', () => {
  it('uses v4 tabs and rows instead of legacy quick filters', () => {
    expect(addProductSource).toContain("useState('frequent')");
    expect(addProductSource).toContain('aps-v4-search-tabs');
    expect(addProductSource).toContain('aps-v4-product-row');
    expect(addProductSource).toContain('renderV4ProductRow');
    expect(addProductSource).toContain("placeholder: 'Поиск продукта'");
    expect(addProductSource).toContain('searchStepTitle');
    expect(addProductSource).toContain('Замечено в истории');
    expect(addProductSource).not.toContain("useState('smart')");
    expect(addProductSource).not.toContain('aps-quick-filter');
    expect(addProductSource).not.toContain('showSharedProducts');
  });

  it('paints search shell with v4 sand roles', () => {
    expect(cssSource).toContain('.aps-v4-search-tabs');
    expect(cssSource).toContain('.aps-v4-browse-list');
    expect(cssSource).toContain('background: var(--v4-sand-surface, #f7efe2)');
    expect(cssSource).toContain("viewBox='0 0 24 24'");
    expect(cssSource).toContain('.mc-modal:has(.aps-v4-flow)');
    expect(cssSource).toContain('.aps-v4-search-footnote');
  });
});
