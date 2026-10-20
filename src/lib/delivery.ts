import "server-only";
import { APP_NAME, SITE } from "@/config/site";
import type { Brief } from "./brief/schema";
import type { Store, UserRow } from "./db/store";
import { env } from "./env";
import { postJson } from "./http";
import { refreshBalance } from "./balance";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function digestText(brief: Brief): { subject: string; text: string; telegramHtml: string; html: string } {
  const url = `${SITE.url}/brief/${brief.date}`;
  const subject = `${APP_NAME} · ${brief.date} · ${brief.headline}`;
  const lines = brief.sections.flatMap((s) => [`\n${s.title.toUpperCase()}`, ...s.items.slice(0, 3).map((i) => `• [${i.type}] ${i.headline}`)]);
  const text = [subject, ...lines, `\nRead the full brief: ${url}`, `\n${brief.disclaimer}`].join("\n");
  const telegramHtml = [
    `<b>${esc(APP_NAME)} · ${brief.date}</b>`,
    esc(brief.headline),
    ...brief.sections.flatMap((s) => [`\n<b>${esc(s.title)}</b>`, ...s.items.slice(0, 3).map((i) => `• <i>${i.type}</i> ${esc(i.headline)}`)]),
    `\n<a href="${url}">Full brief →</a>`,
    `<i>${esc(brief.disclaimer)}</i>`,
  ].join("\n");
  const html = `<div style="font-family:ui-monospace,Menlo,monospace;background:#07070c;color:#e4e4ef;padding:24px">
<h2 style="color:#8b5cf6;margin:0 0 8px">${esc(APP_NAME)} · ${brief.date}</h2><p>${esc(brief.headline)}</p>
${brief.sections
  .map((s) => `<h3 style="color:#38bdf8">${esc(s.title)}</h3><ul>${s.items.slice(0, 3).map((i) => `<li><b>${i.type}</b> ${esc(i.headline)}</li>`).join("")}</ul>`)
  .join("")}
<p><a style="color:#38bdf8" href="${url}">Read the full brief →</a></p><p style="color:#8a8aa3;font-size:12px">${esc(brief.disclaimer)}</p></div>`;
  return { subject, text, telegramHtml, html };
}

export async function sendTelegram(chatId: string, html: string): Promise<void> {
  if (!env.telegramBotToken) throw new Error("TELEGRAM_BOT_TOKEN not configured");
  const r = await postJson<{ ok: boolean; description?: string }>(
    `https://api.telegram.org/bot${env.telegramBotToken}/sendMessage`,
    { chat_id: chatId, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true } },
    { retries: 1 },
  );
  if (!r.ok) throw new Error(r.description ?? "telegram send failed");
}

export async function sendEmail(to: string, subject: string, html: string, text: string): Promise<void> {
  if (!env.resendKey || !env.emailFrom) throw new Error("RESEND_API_KEY / EMAIL_FROM not configured");
  await postJson("https://api.resend.com/emails", { from: env.emailFrom, to: [to], subject, html, text }, { headers: { authorization: `Bearer ${env.resendKey}` }, retries: 1 });
}

export async function deliverTo(user: UserRow, brief: Brief): Promise<void> {
  const d = digestText(brief);
  if (user.deliveryChannel === "telegram" && user.telegramChatId) return sendTelegram(user.telegramChatId, d.telegramHtml);
  if (user.deliveryChannel === "email" && user.email) return sendEmail(user.email, d.subject, d.html, d.text);
  throw new Error("no delivery channel configured");
}

/** Send today's digest to WHALE subscribers. Idempotent per (wallet, date, channel). */
export async function deliverDigests(store: Store, brief: Brief): Promise<{ sent: number; failed: number; skipped: number }> {
  const recipients = await store.deliveryRecipients();
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const r of recipients.slice(0, 200)) {
    const user = await refreshBalance(store, r.wallet); // tier re-verified before sending
    if (user.tier !== "WHALE" || !user.deliveryChannel) {
      skipped++;
      continue;
    }
    if (!(await store.claimDelivery(user.wallet, brief.date, user.deliveryChannel))) {
      skipped++;
      continue;
    }
    try {
      await deliverTo(user, brief);
      await store.completeDelivery(user.wallet, brief.date, user.deliveryChannel, true);
      sent++;
    } catch (err) {
      failed++;
      await store.completeDelivery(user.wallet, brief.date, user.deliveryChannel, false, err instanceof Error ? err.message : String(err));
    }
  }
  return { sent, failed, skipped };
}
