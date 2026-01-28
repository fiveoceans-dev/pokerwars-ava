export type UserId = string;

export interface User {
  /** Canonical identifier, e.g. wallet address */
  id: UserId;
  nickname?: string;
}

/** Simple in-memory user registry */
export class InMemoryUserStore {
  private users = new Map<UserId, User>();

  get(id: UserId): User | undefined {
    return this.users.get(id);
  }

  upsert(user: User): void {
    this.users.set(user.id, user);
  }
}
