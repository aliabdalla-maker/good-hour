import { test } from "node:test";
import assert from "node:assert/strict";
import { isPrivateIp } from "./ip";

test("flags loopback, link-local and private ranges", () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.2.3",
    "192.168.0.5",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "0.0.0.0",
    "::1",
    "fe80::1",
    "fd00::1",
  ]) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
});

test("allows public addresses", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1", "2606:4700:4700::1111"]) {
    assert.equal(isPrivateIp(ip), false, ip);
  }
});
