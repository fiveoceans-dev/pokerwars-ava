import { GovernanceRole } from "@hyper-poker/engine";
import { getServerEnv } from "./env";
import { Session } from "./sessionManager";

const env = getServerEnv();

export function getGovernanceRoles(wallet?: string): GovernanceRole[] {
  if (!wallet) return [];
  const normalized = wallet.toLowerCase().trim();
  const roles: GovernanceRole[] = [];
  
  if (env.adminWallets.includes(normalized)) {
    roles.push("admin");
  }
  
  // Future: Load other roles from DB
  
  return roles;
}

export function applyGovernanceRoles(session: Session) {
  if (session.userId) {
    session.roles = getGovernanceRoles(session.userId);
  }
}
