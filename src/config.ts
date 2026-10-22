import dotenv from "dotenv";

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  channelAccessToken: requireEnv("CHANNEL_ACCESS_TOKEN"),
  channelSecret: requireEnv("CHANNEL_SECRET"),
  ownerUserId: requireEnv("OWNER_USER_ID"),
  port: Number(process.env.PORT ?? 3000),
  timezone: process.env.TZ ?? "Asia/Taipei",
  remindBeforeDays: Number(process.env.REMIND_BEFORE_DAYS ?? 14),
  remindHour: Number(process.env.REMIND_HOUR ?? 9),
  remindMinute: Number(process.env.REMIND_MINUTE ?? 0),
  defaultGroupId: process.env.DEFAULT_GROUP_ID?.trim() || undefined
};
