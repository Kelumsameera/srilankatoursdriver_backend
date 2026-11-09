import assert from "node:assert/strict";
import { after, test, mock } from "node:test";

// Never load real credentials or contact SMTP/DB in tests.
process.env.DOTENV_CONFIG_PATH = "tests/.env-not-used";
process.env.NODE_ENV = "test";
process.env.MONGODB_URI = "mongodb://127.0.0.1/email-test";
process.env.JWT_ACCESS_SECRET = "a".repeat(40);
process.env.JWT_REFRESH_SECRET = "b".repeat(40);
process.env.SMTP_HOST = "smtp.titan.email";
process.env.SMTP_PORT = "465";
process.env.SMTP_USER = "info@srilankatoursdriver.com";
process.env.SMTP_FROM = "Sri Lanka Tours Driver <info@srilankatoursdriver.com>";
process.env.SMTP_PASSWORD = "";
process.env.NOTIFY_EMAIL = "info@srilankatoursdriver.com; srilankatoursdriver@gmail.com";
const { BrandSetting } = await import("../src/models/BrandSetting.js");
const { buildEmailSignature } = await import("../src/services/email/email-signature.js");
const { SiteSetting } = await import("../src/models/SiteSetting.js");
const { parseEnv } = await import("../src/config/env.js");
const email = await import("../src/services/email/email.service.js");
mock.method(SiteSetting, "findOne", () => ({ select: () => ({ lean: async () => ({ businessName: "Sri Lanka Tours Driver", tripadvisor: { awards: [{ year: 2024, name: "Travellers' Choice", sourceUrl: "https://www.tripadvisor.com/Attraction_Review-g293962-d23985020-Reviews.html" }] } }) }) }));
mock.method(BrandSetting, "findOne", () => ({ select: () => ({ lean: async () => ({ logoIcon: { url: "https://example.com/logo.png" } }) }) }));
after(() => {
  email.setMailTransport(null);
  mock.restoreAll();
});
type Mail = Parameters<import("../src/services/email/email.service.js").MailTransport["sendMail"]>[0];
const admins = ["info@srilankatoursdriver.com", "srilankatoursdriver@gmail.com"];

function capture(partial = false) {
  const messages: Mail[] = [];
  email.setMailTransport({
    verify: async () => true,
    sendMail: async (mail) => {
      messages.push(mail);
      const to = Array.isArray(mail.to) ? mail.to : [mail.to];
      return partial && to.length > 1 ? { accepted: [to[0]], rejected: [to[1]] } : { accepted: to, rejected: [] };
    },
  });
  email.resetAcknowledgementLimits();
  return messages;
}

test("Titan is the only provider and official sender", () => {
  assert.equal(parseEnv(process.env).success, true);
  for (const overrides of [{ SMTP_HOST: "smtp.gmail.com" }, { SMTP_PORT: "587" }, { SMTP_USER: "other@gmail.com" }, { SMTP_FROM: "other@gmail.com" }]) {
    assert.equal(parseEnv({ ...process.env, ...overrides }).success, false);
  }
});

test("admin details, official sender, reply-to and separate customer acknowledgement", async () => {
  const messages = capture();
  await email.notifyNewSubmission("booking request", "B-TEST-1", "guest@example.com", "Guest", [
    ["Name", "Guest"],
    ["Booking for", "Kandy"],
    ["Start date", "2026-12-01"],
    ["Adults", 2],
    ["Message", "<script>test</script>"],
  ]);
  assert.equal(messages.length, 2);
  assert.deepEqual(messages[0].to, admins);
  assert.equal(messages[0].replyTo, "guest@example.com");
  assert.match(messages[0].text, /B-TEST-1/);
  assert.match(messages[0].text, /Kandy/);
  assert.match(messages[0].text, /2026-12-01/);
  assert.match(messages[0].text, /Adults: 2/);
  assert.ok(!messages[0].html.includes("<script>"));
  assert.deepEqual(messages[1].to, ["guest@example.com"]);
  assert.match(messages[1].text, /B-TEST-1/);
  assert.ok(!messages[1].text.includes("<script>"));
  for (const mail of messages) assert.equal(mail.from, "Sri Lanka Tours Driver <info@srilankatoursdriver.com>");
});

test("partial acceptance is failure; customer still receives separate mail; concurrent replay is suppressed", async () => {
  const messages = capture(true);
  const args = ["booking request", "B-TEST-2", "guest@example.com", "Guest", []] as const;
  await Promise.all([email.notifyNewSubmission(...args), email.notifyNewSubmission(...args)]);
  await email.notifyNewSubmission(...args);
  assert.equal(messages.length, 2);
  assert.deepEqual(messages[1].to, ["guest@example.com"]);
  assert.equal(await email.sendMail({ to: admins, subject: "test", html: "test", text: "test" }), false);
});

test("SMTP acceptance must include every recipient; invalid addresses never sent", async () => {
  const messages = capture();
  assert.equal(await email.sendMail({ to: "invalid", subject: "test", html: "test", text: "test" }), false);
  assert.equal(messages.length, 0);
  email.setMailTransport({ verify: async () => true, sendMail: async () => ({ accepted: [], rejected: [] }) });
  assert.equal(await email.sendMail({ to: admins, subject: "test", html: "test", text: "test" }), false);
});

test("535 EAUTH, network errors and rejection fail safely without retries", async () => {
  for (const failure of [{ code: "EAUTH", responseCode: 535 }, { code: "ETIMEDOUT" }, { code: "EENVELOPE", responseCode: 550 }]) {
    let attempts = 0;
    email.setMailTransport({
      verify: async () => {
        throw failure;
      },
      sendMail: async () => {
        attempts++;
        throw failure;
      },
    });
    assert.equal(await email.verifyEmailConnection(), false);
    assert.equal(await email.sendMail({ to: admins, subject: "test", html: "test", text: "test" }), false);
    assert.equal(attempts, 1);
  }
});

test("connection verification and missing password report correctly", async () => {
  capture();
  assert.equal(await email.verifyEmailConnection(), true);
  email.setMailTransport(null);
  assert.equal(await email.verifyEmailConnection(), false);
});

test("admin, customer and password reset messages include a logo signature", async () => {
  const messages = capture();
  await email.notifyNewSubmission("booking request", "B-SIGNATURE", "guest@example.com", "Guest", []);
  await email.sendPasswordResetEmail("guest@example.com", "Guest", "https://example.com/reset?token=test", false);
  assert.equal(messages.length, 3);
  for (const mail of messages) {
    assert.match(mail.text, /Best regards,\nSri Lanka Tours Driver/);
    assert.match(mail.html, /src="https:\/\/example.com\/logo.png"/);
    assert.match(mail.html, /mailto:info@srilankatoursdriver.com/);
    assert.match(mail.html, /tripadvisor-choice-2024.png/);
  }
});
test("signature escapes branding and rejects unsafe image and website URLs", () => {
  const signature = buildEmailSignature('<script>bad</script>', 'javascript:alert(1)', 'https://user:password@example.com');
  assert.ok(!signature.html.includes('<script>'));
  assert.ok(!signature.html.includes('javascript:'));
  assert.ok(!signature.html.includes('password'));
  assert.match(signature.html, /sri-lanka-emblem-512.png/);
  assert.match(signature.text, /https:\/\/srilankatoursdriver.com/);
});

test("signature shows only recorded award years with matching green badge images", () => {
  const awards = [2025, 2024].map((year) => ({ year, name: "Travellers' Choice", sourceUrl: "https://www.tripadvisor.com/Attraction_Review-g293962-d23985020-Reviews.html" }));
  const signature = buildEmailSignature("Sri Lanka Tours Driver", undefined, undefined, awards);
  assert.match(signature.html, /tripadvisor-choice-2024.png/);
  assert.match(signature.html, /tripadvisor-choice-2025.png/);
  assert.ok(!signature.html.includes("tripadvisor-choice-2026.png"));
  assert.match(signature.text, /2024 \| 2025/);
  assert.ok(!buildEmailSignature("Sri Lanka Tours Driver").html.includes("Choice winner"));
});
