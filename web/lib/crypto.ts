// AES-256-GCM for stored secrets (HRMS passwords, Slack tokens).
// ENCRYPTION_KEY = 32 random bytes, base64 (generate: openssl rand -base64 32)
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key(): Buffer {
  const k = Buffer.from(process.env.ENCRYPTION_KEY || "", "base64");
  if (k.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64 encoded");
  return k;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}

export function decrypt(blob: string): string {
  const [v, iv, tag, data] = blob.split(".");
  if (v !== "v1") throw new Error("Unknown secret format");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}
