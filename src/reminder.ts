import { Client } from "@line/bot-sdk";
import { daysUntilDate } from "./date-utils";
import { SubscriptionStore } from "./store";
import { ReminderItem, Subscription } from "./types";

export function collectReminderItems(
  subscriptions: Subscription[],
  remindBeforeDays: number
): ReminderItem[] {
  const items = subscriptions
    .map((subscription) => ({
      subscription,
      daysUntil: daysUntilDate(subscription.expiryDate)
    }))
    .sort((a, b) => a.daysUntil - b.daysUntil);

  const matched = items.filter((item) => item.daysUntil === remindBeforeDays);

  for (const item of items) {
    console.log("Reminder debug:", {
      userName: item.subscription.userName,
      expiryDate: item.subscription.expiryDate,
      daysUntil: item.daysUntil,
      remindBeforeDays
    });
  }

  return matched;
}

export function buildMentionMessage(items: ReminderItem[]): { text: string; mentionees: Array<{ index: number; length: number; userId: string }> } {
  let text = "訂閱提醒：\n";
  const mentionees: Array<{ index: number; length: number; userId: string }> = [];
  let cursor = text.length;

  for (const item of items) {
    const name = item.subscription.userName || "用戶";
    const mentionText = `@${name}`;
    const line = `${mentionText} ${item.subscription.planName ? `[${item.subscription.planName}] ` : ""}距離下次繳費日還有 ${item.daysUntil} 天，請記得繳費。\n`;

    mentionees.push({
      index: cursor,
      length: mentionText.length,
      userId: item.subscription.userId
    });

    text += line;
    cursor = text.length;
  }

  text = text.trimEnd();
  return { text, mentionees };
}

export async function sendReminderToGroup(
  client: Client,
  store: SubscriptionStore,
  groupId: string,
  remindBeforeDays: number,
  forceSendNoData = false
): Promise<number> {
  const subscriptions = await store.listByGroup(groupId);
  const items = collectReminderItems(subscriptions, remindBeforeDays);

  if (items.length === 0 && !forceSendNoData) {
    return 0;
  }

  if (items.length === 0) {
    await client.pushMessage(groupId, {
      type: "text",
      text: `目前沒有「${remindBeforeDays} 天後需提醒」的訂閱。`
    });
    return 0;
  }

  const { text, mentionees } = buildMentionMessage(items);
  await client.pushMessage(groupId, {
    type: "text",
    text,
    mention: { mentionees }
  } as any);

  return items.length;
}
