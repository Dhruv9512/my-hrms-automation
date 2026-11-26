// Slack: "Sign in with Slack"-style OAuth v2 (user token, scope chat:write),
// so updates are posted AS the employee. No Slack passwords anywhere.

// chat:write posts as the employee; the read scopes power the channel/person picker;
// im:write opens a DM when the update goes to a person.
export const SLACK_USER_SCOPES = "chat:write,channels:read,groups:read,users:read,im:write";

export function appUrl() {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function slackAuthorizeUrl(state: string) {
  const p = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID || "",
    user_scope: SLACK_USER_SCOPES,
    redirect_uri: `${appUrl()}/api/slack/callback`,
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${p}`;
}

export async function slackExchangeCode(code: string) {
  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.SLACK_CLIENT_ID || "",
      client_secret: process.env.SLACK_CLIENT_SECRET || "",
      code,
      redirect_uri: `${appUrl()}/api/slack/callback`,
    }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack: ${data.error}`);
  const token = data.authed_user?.access_token;
  if (!token) throw new Error("Slack did not return a user token");
  return { token: token as string, userId: data.authed_user.id as string, teamId: data.team?.id as string };
}

const FRIENDLY: Record<string, string> = {
  channel_not_found: "Channel not found. Check the name (public channels only, or use the channel ID).",
  not_in_channel: "You are not a member of that channel. Join it in Slack first.",
  is_archived: "That channel is archived.",
  invalid_auth: "Slack connection expired. Click 'Connect Slack' again.",
  token_revoked: "Slack connection was revoked. Click 'Connect Slack' again.",
  user_not_found: "That person was not found in Slack.",
  cannot_dm_bot: "You cannot send a direct message to a bot.",
  account_inactive: "Slack account inactive. Click 'Connect Slack' again.",
};

export const isUserId = (id: string) => /^[UW][A-Z0-9]{6,}$/.test(id);

async function slackApi(token: string, method: string, params: Record<string, string>) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Bearer ${token}` },
    body: new URLSearchParams(params),
  });
  return res.json();
}

/**
 * Posts as the employee. Destination: a channel name ("general", "#general"),
 * a channel ID (C123/G123), or a person's user ID (U123) -> direct message.
 */
export async function slackPost(token: string, destination: string, text: string) {
  let ch = destination.trim().replace(/^[#@]/, "");
  if (isUserId(ch)) {
    // Open (or reuse) the DM with that person; for your own ID this is your self-DM.
    const dm = await slackApi(token, "conversations.open", { users: ch, return_im: "false" });
    if (dm.ok && dm.channel?.id) ch = dm.channel.id;
    else if (dm.error && dm.error !== "missing_scope") throw new Error(FRIENDLY[dm.error] || `Slack error: ${dm.error}`);
    // missing_scope (old connection): fall back to posting to the user ID directly.
  }
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ channel: ch, text }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(FRIENDLY[data.error] || `Slack error: ${data.error}`);
  return data;
}

export class SlackScopeError extends Error {}

async function pages(token: string, method: string, params: Record<string, string>, key: string) {
  const out: any[] = [];
  let cursor = "";
  for (let i = 0; i < 10; i++) {
    const d = await slackApi(token, method, { ...params, limit: "200", ...(cursor ? { cursor } : {}) });
    if (!d.ok) {
      if (d.error === "missing_scope") throw new SlackScopeError("missing_scope");
      throw new Error(FRIENDLY[d.error] || `Slack error: ${d.error}`);
    }
    out.push(...(d[key] || []));
    cursor = d.response_metadata?.next_cursor || "";
    if (!cursor) break;
  }
  return out;
}

export type SlackTarget = { id: string; label: string; kind: "me" | "channel" | "private" | "person"; sub?: string };

/** Channels the employee is a member of (so posting works) + everyone in the workspace. */
export async function slackTargets(token: string, selfId: string | null): Promise<SlackTarget[]> {
  const [chans, users] = await Promise.all([
    pages(token, "users.conversations", { types: "public_channel,private_channel", exclude_archived: "true" }, "channels"),
    pages(token, "users.list", {}, "members"),
  ]);
  const channels: SlackTarget[] = chans
    .map((c) => ({ id: c.id, label: `#${c.name}`, kind: (c.is_private ? "private" : "channel") as SlackTarget["kind"] }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const people: SlackTarget[] = users
    .filter((u) => !u.deleted && !u.is_bot && !u.is_app_user && u.id !== "USLACKBOT" && u.id !== selfId)
    .map((u) => {
      const real = u.profile?.real_name || u.real_name || u.name;
      const display = u.profile?.display_name;
      return { id: u.id, label: `@${real}`, kind: "person" as const, sub: display && display !== real ? display : undefined };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
  const me: SlackTarget[] = selfId ? [{ id: selfId, label: "Me (direct message to myself)", kind: "me" }] : [];
  return [...me, ...channels, ...people];
}
