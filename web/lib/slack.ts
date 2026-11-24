// Slack: "Sign in with Slack"-style OAuth v2 (user token, scope chat:write),
// so updates are posted AS the employee. No Slack passwords anywhere.

export function appUrl() {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function slackAuthorizeUrl(state: string) {
  const p = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID || "",
    user_scope: "chat:write",
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
  account_inactive: "Slack account inactive. Click 'Connect Slack' again.",
};

/** Posts as the employee. Channel: "general", "#general" or an ID like C123. */
export async function slackPost(token: string, channel: string, text: string) {
  const ch = channel.trim().replace(/^#/, "");
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ channel: ch, text }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(FRIENDLY[data.error] || `Slack error: ${data.error}`);
  return data;
}
