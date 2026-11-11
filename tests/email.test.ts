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
process.env.FRONTEND_URL = "https://srilankatoursdriver.com";
const { BrandSetting } = await import("../src/models/BrandSetting.js");
const { buildEmailSignature } = await import("../src/services/email/email-signature.js");
const { Booking } = await import("../src/models/Booking.js");
const { SiteSetting } = await import("../src/models/SiteSetting.js");
const { Tour } = await import("../src/models/Tour.js");
const { parseEnv } = await import("../src/config/env.js");
const email = await import("../src/services/email/email.service.js");
const { createBooking } = await import("../src/services/crm.service.js");
mock.method(SiteSetting, "findOne", () => ({ select: () => ({ lean: async () => ({ businessName: "Sri Lanka Tours Driver", social: { facebook: "https://www.facebook.com/srilankatoursdriver" }, tripadvisor: { profileUrl: "https://www.tripadvisor.com/Attraction_Review-g293962-d23985020-Reviews.html", awards: [{ year: 2024, name: "Travellers' Choice", sourceUrl: "https://www.tripadvisor.com/Attraction_Review-g293962-d23985020-Reviews.html" }] } }) }) }));
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
  assert.doesNotMatch(messages[0].html, /Your selected tour|View Tour Details/);
  assert.deepEqual(messages[1].to, ["guest@example.com"]);
  assert.match(messages[1].text, /B-TEST-1/);
  assert.ok(!messages[1].text.includes("<script>"));
  assert.doesNotMatch(messages[1].html, /Your selected tour|View Tour Details/);
  for (const mail of messages) assert.equal(mail.from, "Sri Lanka Tours Driver <info@srilankatoursdriver.com>");
});

test("published tour fields produce the same safe, locale-aware tour card in both booking emails", async () => {
  const messages = capture();
  const selected: string[] = [];
  const tour = {
    title: "<script>alert(1)</script> Tea Country",
    slug: "sigiriya & ella",
    shortDescription: "A <b>private</b> journey through the hills.",
    heroMedia: { url: "https://images.example.com/tour.jpg", resourceType: "image" },
    gallery: [],
    durationDays: 5,
    durationNights: 4,
    groupPrices: [],
    currency: "USD",
  };
  const tourFind = mock.method(Tour, "findOne", () => ({
    select(fields: string) {
      selected.push(fields);
      return { lean: async () => tour };
    },
  }) as never);
  const bookingFind = mock.method(Booking, "findOne", () => ({ select: () => ({ lean: async () => null }) }) as never);
  const bookingCreate = mock.method(Booking, "create", async (input) => {
    const data = input as unknown as Record<string, unknown>;
    const customer = data.customer as { name: string; email: string };
    return {
      _id: "booking-test-id",
      reference: data.reference,
      customer,
      startDate: data.startDate,
      endDate: data.endDate,
      adults: data.adults,
      children: data.children,
      childrenAges: [],
      pickupLocation: "",
      message: "",
    } as never;
  });

  try {
    const result = await createBooking({
      type: "tour",
      tour: "published-tour-id",
      title: "<img src=x onerror=alert(1)>",
      slug: "attacker-tour",
      image: "javascript:alert(1)",
      itemTitle: "Attacker supplied title",
      customer: { name: "Guest", email: "guest@example.com" },
      startDate: new Date("2026-12-01T00:00:00.000Z"),
      endDate: new Date("2026-12-05T00:00:00.000Z"),
      adults: 2,
      children: 1,
      locale: "si",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(selected[0], "title slug shortDescription heroMedia.url heroMedia.resourceType gallery.url gallery.resourceType durationDays durationNights groupPrices currency");
    assert.equal(messages.length, 2);
    const tourUrl = "https://srilankatoursdriver.com/si/tours/sigiriya%20%26%20ella";
    for (const mail of messages) {
      assert.match(mail.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; Tea Country/);
      assert.match(mail.html, /src="https:\/\/images\.example\.com\/tour\.jpg"/);
      assert.match(mail.html, new RegExp(tourUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(mail.html, /View Tour Details/);
      assert.match(mail.text, new RegExp(tourUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(mail.text, new RegExp(result.reference));
    }
    assert.match(messages[0].html, /&lt;b&gt;private&lt;\/b&gt;/);
    assert.match(messages[1].html, /Hello Guest,/);
    assert.match(messages[1].html, /This email confirms receipt of your request only\. Your booking is not confirmed yet\./);
    assert.match(messages[1].text, /2 adults, 1 child/);
    assert.match(messages[1].text, /2026-12-01 – 2026-12-05/);
    assert.ok(!messages[0].html.includes("Attacker supplied title"));
    assert.ok(!messages[0].html.includes("javascript:"));
  } finally {
    tourFind.mock.restore();
    bookingFind.mock.restore();
    bookingCreate.mock.restore();
  }
});

test("missing and unsafe tour images leave a readable, linked card", async () => {
  const { renderTourCard } = await import("../src/services/email/tour-card.js");
  const card = renderTourCard({
    tour: {
      title: "Video Tour",
      slug: "video-tour",
      shortDescription: "Explore the island.",
      heroMedia: { url: "javascript:alert(1)", resourceType: "video" },
      gallery: [{ url: "https://user:pass@images.example.com/private.png", resourceType: "image" }],
    },
    locale: "not-a-locale",
  }, "https://srilankatoursdriver.com");
  assert.ok(card);
  assert.doesNotMatch(card.html, /<img src=/);
  assert.match(card.html, /Video Tour/);
  assert.match(card.html, /View Tour Details/);
  assert.match(card.text, /https:\/\/srilankatoursdriver\.com\/en\/tours\/video-tour/);
  assert.doesNotMatch(card.html, /javascript:|user:pass|private\.png/);

  const galleryCard = renderTourCard({
    tour: {
      title: "Video Tour",
      slug: "video-tour",
      heroMedia: { url: "https://videos.example.com/tour.mp4", resourceType: "video" },
      gallery: [{ url: "https://images.example.com/gallery.jpg", resourceType: "image" }],
    },
  }, "https://srilankatoursdriver.com");
  assert.ok(galleryCard);
  assert.match(galleryCard.html, /src="https:\/\/images\.example\.com\/gallery\.jpg"/);
  assert.doesNotMatch(galleryCard.html, /tour\.mp4/);
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
    assert.match(mail.text, /Best regards,\nThanuja Dinushanka/);
    assert.match(mail.html, /src="https:\/\/example.com\/logo.png"/);
    assert.match(mail.html, /mailto:info@srilankatoursdriver.com/);
    assert.match(mail.html, /tripadvisor-choice-2024[^"]*\.png/);
    assert.match(mail.text, /Thanuja Dinushanka\nFounder & CEO \(Sri Lanka Tours Driver\)/);
    assert.match(mail.html, /Bandaragama, Sri Lanka/);
    assert.match(mail.html, /href="tel:\+94769300334"/);
    assert.match(mail.html, /href="https:\/\/wa\.me\/94769300334"/);
    assert.match(mail.html, /href="https:\/\/www\.facebook\.com\/srilankatoursdriver"/);
    assert.match(mail.text, /Facebook: https:\/\/www\.facebook\.com\/srilankatoursdriver/);
    assert.match(mail.text, /WhatsApp: https:\/\/wa\.me\/94769300334/);
  }
});

test("contact and tailor-made notifications do not receive a tour card", async () => {
  const messages = capture();
  await email.notifyNewSubmission("message", "C-TEST-1", "guest@example.com", "Guest", [["Message", "Hello"]]);
  await email.notifyNewSubmission("tailor-made tour enquiry", "T-TEST-1", "guest@example.com", "Guest", [["Requirements", "A custom trip"]]);
  assert.equal(messages.length, 4);
  for (const mail of messages) {
    assert.doesNotMatch(mail.html, /Your selected tour|View Tour Details/);
    assert.doesNotMatch(mail.text, /Your selected tour|View Tour Details/);
  }
});

test("signature escapes branding and rejects unsafe image and website URLs", () => {
  const signature = buildEmailSignature('<script>bad</script>', 'javascript:alert(1)', 'https://user:password@example.com');
  assert.ok(!signature.html.includes('<script>'));
  assert.ok(!signature.html.includes('javascript:'));
  assert.ok(!signature.html.includes('password'));
  assert.match(signature.html, /sri-lanka-emblem-512.png/);
  assert.match(signature.text, /https:\/\/srilankatoursdriver.com/);
  assert.match(signature.html, /Founder &amp; CEO \(Sri Lanka Tours Driver\)/);
});

test("signature links only valid configured social profiles and uses Cloudinary-hosted PNG icons", () => {
  const signature = buildEmailSignature("Sri Lanka Tours Driver", undefined, "https://srilankatoursdriver.com", [], {
    facebook: "https://www.facebook.com/srilankatoursdriver",
    instagram: "javascript:alert(1)",
    youtube: "http://youtube.com/srilankatoursdriver",
    tiktok: "https://user:pass@www.tiktok.com/@srilankatoursdriver",
    twitter: "https://x.com/srilankatoursdriver",
  });
  assert.match(signature.html, /Follow us/);
  assert.match(signature.html, /alt="Follow us on Facebook"/);
  assert.match(signature.html, /src="https:\/\/res\.cloudinary\.com\/m3vlxnsr\/image\/upload\/v\d+\/srilankatoursdriver\/branding\/email-social-facebook\.png"/);
  assert.match(signature.html, /href="https:\/\/www\.facebook\.com\/srilankatoursdriver"/);
  assert.match(signature.html, /src="https:\/\/res\.cloudinary\.com\/m3vlxnsr\/image\/upload\/v\d+\/srilankatoursdriver\/branding\/email-social-twitter\.png"/);
  assert.match(signature.text, /Facebook: https:\/\/www\.facebook\.com\/srilankatoursdriver/);
  assert.match(signature.text, /X: https:\/\/x\.com\/srilankatoursdriver/);
  assert.doesNotMatch(signature.html, /srilankatoursdriver\.com\/images\/email-social/);
  assert.doesNotMatch(signature.html, /javascript:|youtube\.com|tiktok\.com/);
  assert.doesNotMatch(signature.text, /instagram:|YouTube:|TikTok:/);
});

test("signature shows only recorded award years with original year-specific badge images", () => {
  const awards = [2025, 2024].map((year) => ({ year, name: "Travellers' Choice", sourceUrl: "https://www.tripadvisor.com/Attraction_Review-g293962-d23985020-Reviews.html" }));
  const signature = buildEmailSignature("Sri Lanka Tours Driver", undefined, undefined, awards);
  assert.match(signature.html, /tripadvisor-choice-2024[^"]*\.png/);
  assert.match(signature.html, /tripadvisor-choice-2025[^"]*\.png/);
  assert.match(signature.html, /We are Travelers&#39; Choice on Tripadvisor \(2024 \| 2025\)/);
  assert.match(signature.text, /We are Travelers' Choice on Tripadvisor \(2024 \| 2025\)/);
  assert.doesNotMatch(signature.html, /tripadvisor-choice-2026/);
  assert.match(signature.text, /2024 \| 2025/);
  assert.ok(!buildEmailSignature("Sri Lanka Tours Driver").html.includes("Choice winner"));
});

test("original award artwork keeps its own aspect ratio in email", () => {
  const make = (year: number) => buildEmailSignature("Sri Lanka Tours Driver", undefined, undefined, [{ year, name: "Travellers' Choice", sourceUrl: "https://www.tripadvisor.com/" }]);
  assert.match(make(2024).html, /width="72" height="72"/);
  assert.match(make(2025).html, /width="72" height="76"/);
  assert.match(make(2026).html, /width="72" height="84"/);
  assert.match(make(2026).html, /width:72px;height:auto/);
});
