import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEmbeddedSignupMessage } from "./embedded-signup-session";

test("parses nested WA_EMBEDDED_SIGNUP session payload", () => {
  const assets = parseEmbeddedSignupMessage({
    type: "WA_EMBEDDED_SIGNUP",
    data: {
      phone_number_id: "111",
      waba_id: "222",
    },
  });
  assert.deepEqual(assets, { phone_number_id: "111", waba_id: "222" });
});

test("parses stringified Facebook postMessage", () => {
  const assets = parseEmbeddedSignupMessage(
    JSON.stringify({
      type: "WA_EMBEDDED_SIGNUP",
      data: { phone_number_id: "333", waba_id: "444" },
    })
  );
  assert.deepEqual(assets, { phone_number_id: "333", waba_id: "444" });
});

test("ignores other event types and incomplete payloads", () => {
  assert.equal(parseEmbeddedSignupMessage({ type: "OTHER" }), null);
  assert.equal(
    parseEmbeddedSignupMessage({
      type: "WA_EMBEDDED_SIGNUP",
      data: { waba_id: "222" },
    }),
    null
  );
});
