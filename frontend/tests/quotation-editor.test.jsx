import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import QuotationEditor from '../src/features/quotations/QuotationEditor.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const existing = {
  id: 'accepted', name: 'Presupuesto aceptado', status: 'ACCEPTED', total: 500,
  createdAt: '2026-11-16T12:00:00Z', observations: '',
  items: [{ id: 'locked-item', name: 'Limpieza', qty: 1, unitPrice: 500 }],
};
const records = [existing];
let reads = 0;
globalThis.budgetApi = {
  async listBudgets() { reads++; return { items: structuredClone(records) }; },
  async createBudget(patientId, payload) {
    const id = `budget-${records.length}`;
    const data = { ...structuredClone(payload), id, patientId, status: 'DRAFT', createdAt: '2026-11-16T13:00:00Z',
      total: payload.items.reduce((n, i) => n + i.qty * i.unitPrice, 0),
      items: payload.items.map((i, n) => ({ ...i, id: `${id}-item-${n}` })) };
    records.unshift(data);
    return { data: structuredClone(data) };
  },
  async updateBudget(patientId, id, payload) {
    const index = records.findIndex(b => b.id === id);
    const data = { ...records[index], ...structuredClone(payload) };
    records[index] = data;
    return { data: structuredClone(data) };
  },
};
let rendered;
let saved = 0;
const render = () => <QuotationEditor patientId={99} onSaved={() => saved++} />;
const byId = id => rendered.root.findAll(n => typeof n.type === 'string' && n.props['data-testid'] === id)[0];
const prefix = value => rendered.root.findAll(n => typeof n.type === 'string' && n.props['data-testid']?.startsWith(value));
const click = async id => { await act(async () => { await byId(id).props.onClick(); }); };
const fill = async (id, value) => { await act(async () => byId(id).props.onChange({ target: { value } })); };

await act(async () => { rendered = create(render()); });
assert.equal(byId('budgets-new').props.disabled, false, 'Accepted budget must not block creation');
assert.ok(byId('budget-accepted-accepted'));
assert.equal(byId('budget-save-accepted'), undefined);
assert.equal(byId('budget-name-input-accepted'), undefined);
for (let n = 1; n <= 3; n++) {
  await click('budgets-new');
  await fill('budget-name-input-__new__', `Plan independiente ${n}`);
  await fill(prefix('budget-row-name-__new__-')[0].props['data-testid'], 'Resina');
  await fill(prefix('budget-row-description-__new__-')[0].props['data-testid'], 'Restauración dental');
  await fill(prefix('budget-row-tooth-__new__-')[0].props['data-testid'], '16');
  await fill(prefix('budget-row-price-__new__-')[0].props['data-testid'], 800 + n);
  await click('budget-save-__new__');
  assert.ok(byId(`budget-card-budget-${n}`), 'Saved budget appears without remount or tab navigation');
  assert.ok(byId(`budget-name-input-budget-${n}`), 'Saved budget remains expanded');
  assert.equal(byId('budgets-new').props.disabled, false);
  assert.equal(reads, 1, 'Save updates from response, not a remount/refetch');
  if (n === 1) {
    await fill('budget-name-input-budget-1', 'Cambio local todavía sin guardar');
    await click('budget-toggle-budget-1');
  }
}
assert.equal(prefix('budget-card-').length, 4);
assert.equal(byId('budget-name-input-budget-1'), undefined, 'Other card stays collapsed');
await click('budget-toggle-budget-1');
assert.equal(byId('budget-name-input-budget-1').props.value, 'Cambio local todavía sin guardar');
assert.deepEqual(records.find(b => b.id === 'accepted'), existing);
assert.equal(saved, 3);
await act(async () => rendered.unmount());
await act(async () => { rendered = create(render()); });
assert.equal(prefix('budget-card-').length, 4, 'History persists after remount');
await act(async () => rendered.unmount());
console.log('PASS: three saves without tab navigation, independent expansion/drafts, readonly accepted budget, reload persistence');
