import { promises as fs } from "fs";
import path from "path";
import { Subscription } from "./types";

interface DataFile {
  subscriptions: Subscription[];
}

const EMPTY_DATA: DataFile = { subscriptions: [] };

export class SubscriptionStore {
  private readonly filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? path.resolve(process.cwd(), "data", "subscriptions.json");
  }

  private async ensureFile(): Promise<void> {
    const folder = path.dirname(this.filePath);
    await fs.mkdir(folder, { recursive: true });

    try {
      await fs.access(this.filePath);
    } catch {
      await fs.writeFile(this.filePath, JSON.stringify(EMPTY_DATA, null, 2), "utf8");
    }
  }

  private async readData(): Promise<DataFile> {
    await this.ensureFile();
    const raw = await fs.readFile(this.filePath, "utf8");
    try {
      const data = JSON.parse(raw) as DataFile;
      if (!Array.isArray(data.subscriptions)) {
        return EMPTY_DATA;
      }
      return data;
    } catch {
      return EMPTY_DATA;
    }
  }

  private async writeData(data: DataFile): Promise<void> {
    await this.ensureFile();
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), "utf8");
  }

  async upsert(input: Omit<Subscription, "createdAt" | "updatedAt">): Promise<Subscription> {
    const data = await this.readData();
    const now = new Date().toISOString();

    const index = data.subscriptions.findIndex(
      (item) => item.groupId === input.groupId && item.userId === input.userId
    );

    if (index >= 0) {
      const updated: Subscription = {
        ...data.subscriptions[index],
        ...input,
        updatedAt: now
      };
      data.subscriptions[index] = updated;
      await this.writeData(data);
      return updated;
    }

    const created: Subscription = {
      ...input,
      createdAt: now,
      updatedAt: now
    };

    data.subscriptions.push(created);
    await this.writeData(data);
    return created;
  }

  async remove(groupId: string, userId: string): Promise<boolean> {
    const data = await this.readData();
    const before = data.subscriptions.length;
    data.subscriptions = data.subscriptions.filter(
      (item) => !(item.groupId === groupId && item.userId === userId)
    );

    if (data.subscriptions.length === before) {
      return false;
    }

    await this.writeData(data);
    return true;
  }

  async listByGroup(groupId: string): Promise<Subscription[]> {
    const data = await this.readData();
    return data.subscriptions.filter((item) => item.groupId === groupId);
  }

  async getByGroupAndUser(groupId: string, userId: string): Promise<Subscription | undefined> {
    const data = await this.readData();
    return data.subscriptions.find((item) => item.groupId === groupId && item.userId === userId);
  }

  async listGroupIds(): Promise<string[]> {
    const data = await this.readData();
    const ids = new Set<string>();

    for (const item of data.subscriptions) {
      ids.add(item.groupId);
    }

    return Array.from(ids);
  }
}
