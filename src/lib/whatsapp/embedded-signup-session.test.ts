import assert from "node:assert/strict";
import { test } from "node:test";
import {
  describeEmbeddedSignupError,
  parseEmbeddedSignupError,
  parseEmbeddedSignupMessage,
} from "./embedded-signup-session";

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
      data: { phone_number_id: "111" },
    }),
    null
  );
});

test("accepts WABA-only finish and numeric IDs", () => {
  assert.deepEqual(
    parseEmbeddedSignupMessage({
      type: "WA_EMBEDDED_SIGNUP",
      event: "FINISH_ONLY_WABA",
      data: { waba_id: 222, business_id: 999 },
    }),
    { waba_id: "222", business_id: "999" }
  );
  assert.deepEqual(
    parseEmbeddedSignupMessage({
      type: "WA_EMBEDDED_SIGNUP",
      data: { waba_ids: ["555"], phoneNumberId: 777 },
    }),
    { waba_id: "555", phone_number_id: "777" }
  );
});

test("parses Meta Embedded Signup query errors", () => {
  const err = parseEmbeddedSignupError({
    type: "WA_EMBEDDED_SIGNUP",
    event: "CANCEL",
    data: {
      error_code: 1675030,
      error_message: "Error performing query.",
      session_id: "abc",
    },
  });
  assert.deepEqual(err, {
    error_code: "1675030",
    error_message: "Error performing query.",
    session_id: "abc",
  });
  assert.match(describeEmbeddedSignupError(err!), /own Facebook/);
});
