import express, { Request, Response } from "express";
import { middleware, Client, messagingApi, WebhookEvent, MessageEvent, TextEventMessage } from "@line/bot-sdk";
import cron from "node-cron";
import { config } from "./config";
import { isValidDateText, formatDisplayDate } from "./date-utils";
import { sendReminderToGroup } from "./reminder";
import { SubscriptionStore } from "./store";

const lineConfig = {
  channelAccessToken: config.channelAccessToken,
  channelSecret: config.channelSecret
};

const app = express();
const client = new Client(lineConfig);
const reminderClient = new messagingApi.MessagingApiClient({ channelAccessToken: config.channelAccessToken });
const store = new SubscriptionStore();

interface MentionMessage {
  mention?: {
    mentionees?: Array<{
      type?: string;
      userId?: string;
    }>;
  };
}

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

app.post("/webhook", middleware(lineConfig), async (req: Request, res: Response) => {
  const events = req.body.events as WebhookEvent[];

  await Promise.all(events.map(handleEvent));
  res.status(200).end();
});

async function handleEvent(event: WebhookEvent): Promise<void> {
  if (event.type !== "message") {
    return;
  }

  const messageEvent = event as MessageEvent;
  if (messageEvent.message.type !== "text") {
    return;
  }

  const text = ((messageEvent.message as TextEventMessage).text || "").trim();
  if (!text) {
    return;
  }

  const groupId = messageEvent.source.type === "group" ? messageEvent.source.groupId : undefined;
  const userId = messageEvent.source.userId;

  console.log("LINE message source:", messageEvent.source);
  console.log("Detected userId:", userId);
  console.log("Detected groupId:", groupId);

  const command = text.split(/\s+/)[0]?.toLowerCase();
  const isCommandMessage = text.startsWith("!") || text.startsWith("/");

  if (!isCommandMessage) {
    return;
  }

  if (text === "!help" || text === "/help") {
    await replyHelp(messageEvent.replyToken);
    return;
  }

  if (!groupId || !userId) {
    await client.replyMessage(messageEvent.replyToken, {
      type: "text",
      text: "請在群組中使用此機器人，且需允許成員資訊供 bot 取用。"
    });
    return;
  }

  const isOwner = userId === config.ownerUserId;

  const readableCommands = ["!my", "/my", "!help", "/help", "!list", "/list"];
  if (!isOwner && !readableCommands.includes(command ?? "")) {
    await client.replyMessage(messageEvent.replyToken, {
      type: "text",
      text: "你目前僅可使用 !my、!help 或 !list。"
    });
    return;
  }

  if (command === "!unsub" || command === "/unsub") {
    if (!isOwner) {
      await client.replyMessage(messageEvent.replyToken, {
        type: "text",
        text: "你目前無法使用 !unsub；僅管理者可刪除紀錄。"
      });
      return;
    }

    await handleRemoveSubscription(messageEvent, groupId, userId, text);
    return;
  }

  switch (command) {
    case "!sub":
    case "/sub":
      await handleSetSubscription(messageEvent, groupId, userId, text);
      return;
    case "!set":
    case "/set":
      await handleSetSubscriptionForMention(messageEvent, groupId, text);
      return;
    case "!list":
    case "/list":
      await handleList(messageEvent.replyToken, groupId);
      return;
    case "!remind":
    case "/remind":
      await handleManualRemind(messageEvent.replyToken, groupId);
      return;
    case "!my":
    case "/my":
      await handleMySubscription(messageEvent.replyToken, groupId, userId);
      return;
    default:
      return;
  }
}

async function replyHelp(replyToken: string): Promise<void> {
  await client.replyMessage(replyToken, {
    type: "text",
    text: [
      "可用指令：",
      "!sub YYYY-MM-DD [方案名稱]  設定自己的下次繳費日",
      "!set @某人 YYYY-MM-DD [方案名稱]  設定指定成員的下次繳費日",
      "!unsub @某人  僅管理者可刪除指定成員紀錄",
      "!list  查看本群組訂閱清單",
      `!remind  立即檢查並提醒「${config.remindBeforeDays} 天後要繳費」的人`,
      "!my  查詢自己的下次繳費日",
      "!help  顯示說明"
    ].join("\n")
  });
}

async function handleMySubscription(replyToken: string, groupId: string, userId: string): Promise<void> {
  const subscription = await store.getByGroupAndUser(groupId, userId);
  if (!subscription) {
    await client.replyMessage(replyToken, {
      type: "text",
      text: "你目前沒有訂閱紀錄，請聯絡管理者幫你設定。"
    });
    return;
  }

  await client.replyMessage(replyToken, {
    type: "text",
    text: `你的下次繳費日：${formatDisplayDate(subscription.expiryDate)}${subscription.planName ? `（${subscription.planName}）` : ""}`
  });
}

async function handleSetSubscription(
  event: MessageEvent,
  groupId: string,
  userId: string,
  text: string
): Promise<void> {
  const parts = text.split(/\s+/);
  if (parts.length < 2) {
    await client.replyMessage(event.replyToken, {
      type: "text",
      text: "格式錯誤。用法：!sub YYYY-MM-DD [方案名稱]（YYYY-MM-DD 為下次繳費日）"
    });
    return;
  }

  const expiryDate = parts[1];
  if (!isValidDateText(expiryDate)) {
    await client.replyMessage(event.replyToken, {
      type: "text",
      text: "日期格式錯誤，請使用 YYYY-MM-DD，例如：2026-12-31（下次繳費日）"
    });
    return;
  }

  const planName = parts.slice(2).join(" ") || undefined;
  const profile = await client.getGroupMemberProfile(groupId, userId);

  const saved = await store.upsert({
    groupId,
    userId,
    userName: profile.displayName,
    expiryDate,
    planName
  });

  await client.replyMessage(event.replyToken, {
    type: "text",
    text: `已設定 ${saved.userName} 的下次繳費日為 ${formatDisplayDate(saved.expiryDate)}${saved.planName ? `（${saved.planName}）` : ""}`
  });
}

function getFirstMentionedUserId(event: MessageEvent): string | undefined {
  const message = event.message as TextEventMessage & MentionMessage;
  const mentionees = message.mention?.mentionees ?? [];
  const target = mentionees.find((item) => item.type === "user" && item.userId);
  return target?.userId;
}

function parseDateAndPlanFromText(text: string): { date?: string; planName?: string } {
  const parts = text.trim().split(/\s+/);
  const dateIndex = parts.findIndex((part) => isValidDateText(part));

  if (dateIndex < 0) {
    return {};
  }

  const date = parts[dateIndex];
  const planName = parts
    .filter((part, index) => index !== 0 && index !== dateIndex && !part.startsWith("@"))
    .join(" ") || undefined;

  return { date, planName };
}

async function handleSetSubscriptionForMention(event: MessageEvent, groupId: string, text: string): Promise<void> {
  const targetUserId = getFirstMentionedUserId(event);
  if (!targetUserId) {
    await client.replyMessage(event.replyToken, {
      type: "text",
      text: "格式錯誤。用法：!set @某人 YYYY-MM-DD [方案名稱]"
    });
    return;
  }

  const { date, planName } = parseDateAndPlanFromText(text);
  if (!date) {
    await client.replyMessage(event.replyToken, {
      type: "text",
      text: "請提供正確日期，格式為 YYYY-MM-DD，例如：!set @小明 2026-12-31 Netflix"
    });
    return;
  }

  const profile = await client.getGroupMemberProfile(groupId, targetUserId);
  const saved = await store.upsert({
    groupId,
    userId: targetUserId,
    userName: profile.displayName,
    expiryDate: date,
    planName
  });

  await client.replyMessage(event.replyToken, {
    type: "text",
    text: `已設定 ${saved.userName} 的下次繳費日為 ${formatDisplayDate(saved.expiryDate)}${saved.planName ? `（${saved.planName}）` : ""}`
  });
}

async function handleRemoveSubscription(event: MessageEvent, groupId: string, userId: string, text: string): Promise<void> {
  const isOwner = userId === config.ownerUserId;
  const targetUserId = getFirstMentionedUserId(event);

  if (targetUserId && !isOwner) {
    await client.replyMessage(event.replyToken, {
      type: "text",
      text: "只有管理者才能刪除他人的訂閱紀錄。"
    });
    return;
  }

  const effectiveUserId = targetUserId ?? userId;
  const targetProfile = targetUserId ? await client.getGroupMemberProfile(groupId, targetUserId).catch(() => undefined) : undefined;
  const removed = await store.remove(groupId, effectiveUserId);

  if (targetUserId && isOwner) {
    await client.replyMessage(event.replyToken, {
      type: "text",
      text: removed
        ? `已移除 ${targetProfile?.displayName ?? "該成員"} 的訂閱提醒資料。`
        : "找不到該成員的訂閱資料。"
    });
    return;
  }

  if (!text.trim().startsWith("!unsub") && !text.trim().startsWith("/unsub")) {
    return;
  }

  await client.replyMessage(event.replyToken, {
    type: "text",
    text: removed ? "已移除你的訂閱提醒資料。" : "找不到你的訂閱資料。"
  });
}

async function handleList(replyToken: string, groupId: string): Promise<void> {
  const list = await store.listByGroup(groupId);
  if (list.length === 0) {
    await client.replyMessage(replyToken, {
      type: "text",
      text: "目前這個群組還沒有任何訂閱紀錄。"
    });
    return;
  }

  const lines = list.map(
    (item, index) => `${index + 1}. ${item.userName} - ${formatDisplayDate(item.expiryDate)}${item.planName ? ` (${item.planName})` : ""}`
  );

  await client.replyMessage(replyToken, {
    type: "text",
    text: `訂閱清單：\n${lines.join("\n")}`
  });
}

async function handleManualRemind(replyToken: string, groupId: string): Promise<void> {
  const count = await sendReminderToGroup(reminderClient, store, groupId, config.remindBeforeDays);
  await client.replyMessage(replyToken, {
    type: "text",
    text: count > 0 ? `已送出提醒，共 ${count} 筆。` : `目前沒有「${config.remindBeforeDays} 天後需提醒」的訂閱。`
  });
}

function scheduleDailyReminder(): void {
  const cronExp = `${config.remindMinute} ${config.remindHour} * * *`;
  cron.schedule(
    cronExp,
    async () => {
      try {
        const groupIds = config.defaultGroupId ? [config.defaultGroupId] : await store.listGroupIds();
        for (const groupId of groupIds) {
          await sendReminderToGroup(reminderClient, store, groupId, config.remindBeforeDays);
        }
      } catch (error) {
        console.error("Failed to send scheduled reminders:", error);
      }
    },
    {
      timezone: config.timezone
    }
  );

  console.log(`Scheduled daily reminder at ${config.remindHour}:${String(config.remindMinute).padStart(2, "0")} (${config.timezone})`);
}

async function main(): Promise<void> {
  scheduleDailyReminder();

  app.listen(config.port, () => {
    console.log(`LINE reminder bot started at http://localhost:${config.port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
