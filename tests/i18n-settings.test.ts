/** Languages (default language) and website UI text overrides: validation only, no database needed. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { languageUpdate } from "../src/validations/settings.js";
import { uiLocaleParams, uiMessagesUpdate } from "../src/validations/ui-messages.js";
import { UiMessage } from "../src/models/UiMessage.js";

test("languages: an optional supported default language", () => {
  const languages = [{ code: "en", enabled: true }];
  assert.equal(languageUpdate.parse({ languages, defaultLanguage: "si" }).defaultLanguage, "si");
  assert.equal(languageUpdate.parse({ languages }).defaultLanguage, undefined);
  assert.equal(languageUpdate.safeParse({ languages, defaultLanguage: "xx" }).success, false);
});

test("UI texts: dotted message keys with text up to 2000 characters; empty text means 'remove'", () => {
  const ok = uiMessagesUpdate.parse({ messages: { "nav.tours": "චාරිකා", "common.bookNow": "" } });
  assert.deepEqual(ok.messages, { "nav.tours": "චාරිකා", "common.bookNow": "" });
  for (const messages of [{ "nav tours": "x" }, { "$where": "x" }, { "a..b": "x" }, { "nav.tours": "x".repeat(2001) }]) {
    assert.equal(uiMessagesUpdate.safeParse({ messages }).success, false, JSON.stringify(messages).slice(0, 40));
  }
  assert.equal(uiLocaleParams.safeParse({ locale: "si" }).success, true);
  assert.equal(uiLocaleParams.safeParse({ locale: "../en" }).success, false);
});

test("UI texts: one override per language and key", async () => {
  const doc = new UiMessage({ locale: "SI", key: "nav.tours", value: "චාරිකා" });
  await doc.validate();
  assert.equal(doc.locale, "si");
  assert.ok(UiMessage.schema.indexes().some(([fields, opts]) => fields.locale === 1 && fields.key === 1 && opts?.unique));
});
