import { afterEach, describe, expect, it } from "vitest";
import { hashTelegramBotToken } from "./telegram-token-assignments";

const KEY_32 = Buffer.from("0123456789abcdef0123456789abcdef");
const VALID_KEY_B64 = KEY_32.toString("base64");

describe("hashTelegramBotToken", () => {
  afterEach(() => {
    delete process.env.DEPLOY_SESSION_SECRET_KEY;
    delete process.env.DEPLOY_JOB_SECRET_KEY;
  });

  it("falls back to DEPLOY_JOB_SECRET_KEY when DEPLOY_SESSION_SECRET_KEY is absent", () => {
    process.env.DEPLOY_JOB_SECRET_KEY = VALID_KEY_B64;

    expect(hashTelegramBotToken("1234567890:test")).toMatch(/^v1:[a-f0-9]{64}$/);
  });
});
