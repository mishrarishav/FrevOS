import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parseWafEnvironment } from "./waf-config.mjs";

const example = await readFile(
  new URL("../deployment/waf/waf.env.example", import.meta.url),
  "utf8",
);
test("starts in observation mode with a pinned dependency and loopback-only publishing", () => {
  const env = parseWafEnvironment(example);
  assert.equal(env.FREVOS_WAF_MODE, "DetectionOnly");
  assert.equal(env.FREVOS_WAF_BIND, "127.0.0.1");
  assert.match(env.FREVOS_WAF_IMAGE, /@sha256:[a-f0-9]{64}$/);
  assert.ok(+env.FREVOS_WAF_NOFILES_LIMIT >= 23_000_000);
});
test("accepts a different configured gateway, prefix and enforcement mode", () => {
  const env = parseWafEnvironment(
    example
      .replace("http://frevos:10000", "http://gateway.internal:8080")
      .replace("FREVOS_WAF_BASE_PATH=", "FREVOS_WAF_BASE_PATH=/devsetu")
      .replace("FREVOS_WAF_MODE=DetectionOnly", "FREVOS_WAF_MODE=On"),
  );
  assert.equal(env.FREVOS_WAF_BASE_PATH, "/devsetu");
  assert.equal(env.FREVOS_WAF_MODE, "On");
});
test("rejects configuration injection, unpinned dependencies and conflicting limits", () => {
  for (const [before, after] of [
    [/FREVOS_WAF_IMAGE=.*/, "FREVOS_WAF_IMAGE=ghcr.io/coreruleset/coraza-crs:latest"],
    ["FREVOS_WAF_MODE=DetectionOnly", "FREVOS_WAF_MODE=On ` SecRuleEngine Off"],
    ["FREVOS_WAF_BASE_PATH=", "FREVOS_WAF_BASE_PATH=/devsetu/../other"],
    [
      "FREVOS_WAF_UPSTREAM=http://frevos:10000",
      "FREVOS_WAF_UPSTREAM=http://user:password@host:8080",
    ],
    ["FREVOS_WAF_TRUSTED_PROXIES=127.0.0.1/32 ::1/128", "FREVOS_WAF_TRUSTED_PROXIES=0.0.0.0/0"],
    ["FREVOS_WAF_BODY_LIMIT=67108864", "FREVOS_WAF_BODY_LIMIT=1024"],
    ["FREVOS_WAF_TRANSPORT_LIMIT=536870912", "FREVOS_WAF_TRANSPORT_LIMIT=1048576"],
  ])
    assert.throws(() => parseWafEnvironment(example.replace(before, after)));
  assert.throws(() => parseWafEnvironment(`${example}\nFREVOS_WAF_MODE=Off`));
  assert.throws(() => parseWafEnvironment(`${example}\nFREVOS_WAF_COMMAND=shell`));
});
