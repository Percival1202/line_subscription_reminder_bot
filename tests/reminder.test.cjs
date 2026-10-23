const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildMentionMessage, sendReminderToGroup } = require('../dist/reminder');
const { formatDisplayDate } = require('../dist/date-utils');

function item(index, planName = 'Netflix') {
  return {
    subscription: {
      groupId: 'Ctest', userId: `U${String(index).padStart(32, '0')}`,
      userName: '測試😀用戶', expiryDate: '2026-11-06', planName,
      createdAt: '', updatedAt: ''
    },
    daysUntil: 14
  };
}

test('formats user-facing dates as YYYY/MM/DD while keeping stored ISO dates', () => {
  assert.equal(formatDisplayDate('2026-11-06'), '2026/11/06');
  assert.equal(formatDisplayDate(new Date('2026-11-06T00:00:00Z')), '2026/11/06');
  assert.equal(formatDisplayDate('invalid-date'), 'invalid-date');
});

test('builds official textV2 user mentions instead of inbound mention metadata', () => {
  const items = [item(1), item(2)];
  const message = buildMentionMessage(items);
  assert.equal(message.type, 'textV2');
  assert.equal(message.mention, undefined);
  for (let i = 0; i < items.length; i++) {
    assert.ok(message.text.includes(`{user${i}}`));
    assert.deepEqual(message.substitution[`user${i}`], {
      type: 'mention', mentionee: { type: 'user', userId: items[i].subscription.userId }
    });
  }
});

test('escapes user-entered braces without creating extra substitutions', () => {
  const message = buildMentionMessage([item(1, 'Netflix {user0} 😀')]);
  assert.ok(message.text.includes('[Netflix {{user0}} 😀]'));
  assert.deepEqual(Object.keys(message.substitution), ['user0']);
});

test('pushes reminders using modern SDK request shape and batches at 20 mentions', async () => {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  const expiryDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const subscriptions = Array.from({ length: 21 }, (_, i) => ({ ...item(i).subscription, expiryDate }));
  const requests = [];
  const client = { pushMessage: async request => { requests.push(request); } };
  const store = { listByGroup: async () => subscriptions };
  assert.equal(await sendReminderToGroup(client, store, 'Ctest', 14), 21);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map(r => Object.keys(r.messages[0].substitution).length), [20, 1]);
  for (const request of requests) {
    assert.equal(request.to, 'Ctest');
    assert.equal(request.messages[0].type, 'textV2');
  }
});