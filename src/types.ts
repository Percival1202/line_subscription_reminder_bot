export interface Subscription {
  groupId: string;
  userId: string;
  userName: string;
  expiryDate: string; // YYYY-MM-DD
  planName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReminderItem {
  subscription: Subscription;
  daysUntil: number;
}
