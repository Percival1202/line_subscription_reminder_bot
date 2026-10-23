import { messagingApi } from "@line/bot-sdk";
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

export function buildMentionMessage(
  items: ReminderItem[]
): messagingApi.TextMessageV2 {
  let text = "訂閱提醒：\n";
  const substitution: NonNullable<messagingApi.TextMessageV2["substitution"]> = {};

  for (const [index, item] of items.entries()) {
    const key = `user${index}`;
    // textV2 reserves braces for substitutions; escape literal user-entered text.
    const planName = item.subscription.planName?.replace(/[{}]/g, (brace) => brace + brace);
    text += `{${key}} ${planName ? `[${planName}] ` : ""}距離下次繳費日還有 ${item.daysUntil} 天，請記得繳費。\n`;
    substitution[key] = {
      type: "mention",
      mentionee: { type: "user", userId: item.subscription.userId }
    };
  }

  return { type: "textV2", text: text.trimEnd(), substitution };
}

export async function sendReminderToGroup(
  client: Pick<messagingApi.MessagingApiClient, "pushMessage">,
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
    await client.pushMessage({
      to: groupId,
      messages: [{
        type: "text",
        text: `目前沒有「${remindBeforeDays} 天後需提醒」的訂閱。`
      }]
    });
    return 0;
  }

  // LINE permits at most 20 mentions in one textV2 message.
  for (let offset = 0; offset < items.length; offset += 20) {
    await client.pushMessage({
      to: groupId,
      messages: [buildMentionMessage(items.slice(offset, offset + 20))]
    });
  }

  return items.length;
}
