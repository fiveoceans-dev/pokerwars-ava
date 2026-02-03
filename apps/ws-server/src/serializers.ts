export const toNumber = (value: unknown): number => {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  return 0;
};

export const serializeAccount = (account: any) => {
  if (!account) return account;
  return {
    ...account,
    coins: toNumber(account.coins),
    ticket_x: toNumber(account.ticket_x),
    ticket_y: toNumber(account.ticket_y),
    ticket_z: toNumber(account.ticket_z),
  };
};
