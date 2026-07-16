import { describe, it, expect } from "vitest";
import { encrypt, decrypt, isEncrypted } from "./index";

const TEST_KEY =
  "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
const SHORT_KEY = "abcdef0123456789";

describe("encrypt/decrypt", () => {
  it("round-trips a value", () => {
    const original = "my-sensitive-value";
    const encrypted = encrypt(original, TEST_KEY);
    expect(encrypted).not.toBe(original);
    expect(isEncrypted(encrypted)).toBe(true);
    expect(encrypted.startsWith("enc:")).toBe(true);

    const decrypted = decrypt(encrypted, TEST_KEY);
    expect(decrypted).toBe(original);
  });

  it("round-trips an SSH private key value", () => {
    const pemKey = `-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----`;
    const encrypted = encrypt(pemKey, TEST_KEY);
    const decrypted = decrypt(encrypted, TEST_KEY);
    expect(decrypted).toBe(pemKey);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const value = "test-value";
    const a = encrypt(value, TEST_KEY);
    const b = encrypt(value, TEST_KEY);
    expect(a).not.toBe(b);
  });

  it("returns original value when not encrypted (legacy plaintext)", () => {
    const result = decrypt("plaintext-value", TEST_KEY);
    expect(result).toBe("plaintext-value");
  });

  it("throws on wrong key", () => {
    const encrypted = encrypt("secret", TEST_KEY);
    const wrongKey =
      "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    expect(() => decrypt(encrypted, wrongKey)).toThrow();
  });

  it("throws on tampered ciphertext", () => {
    const encrypted = encrypt("secret", TEST_KEY);
    const tampered = encrypted.slice(0, -4) + "dead";
    expect(() => decrypt(tampered, TEST_KEY)).toThrow();
  });

  it("throws on invalid key length", () => {
    expect(() => encrypt("value", SHORT_KEY)).toThrow(
      "ENCRYPTION_KEY must be 64 hex characters",
    );
    expect(() => decrypt("enc:abc:def:ghi", SHORT_KEY)).toThrow(
      "ENCRYPTION_KEY must be 64 hex characters",
    );
  });

  it("throws on invalid hex in key", () => {
    const badKey =
      "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz";
    expect(() => encrypt("value", badKey)).toThrow();
  });

  it("throws on badly formatted encrypted value", () => {
    expect(() => decrypt("enc:tooshort", TEST_KEY)).toThrow(
      "Invalid encrypted value format",
    );
  });

  it("throws on invalid IV length", () => {
    // Create a value with wrong-length IV
    const badIv = Buffer.from("0000", "hex");
    const enc = `enc:${badIv.toString("hex")}:00112233445566778899aabbccddeeff:aaaa`;
    expect(() => decrypt(enc, TEST_KEY)).toThrow("Invalid IV length");
  });

  it("throws on invalid auth tag length", () => {
    const iv = "00112233445566778899aabbccddeeff";
    const badTag = "0011";
    const enc = `enc:${iv}:${badTag}:aaaa`;
    expect(() => decrypt(enc, TEST_KEY)).toThrow("Invalid auth tag length");
  });

  it("isEncrypted detects encrypted values", () => {
    expect(isEncrypted("enc:abc:def:ghi")).toBe(true);
    expect(isEncrypted("enc:abc")).toBe(true);
    expect(isEncrypted("plaintext")).toBe(false);
    expect(isEncrypted("")).toBe(false);
  });

  it("handles empty string", () => {
    const encrypted = encrypt("", TEST_KEY);
    const decrypted = decrypt(encrypted, TEST_KEY);
    expect(decrypted).toBe("");
  });

  it("handles special characters", () => {
    const value = "!@#$%^&*()_+-=[]{}|;':\",./<>?~`你好";
    const encrypted = encrypt(value, TEST_KEY);
    const decrypted = decrypt(encrypted, TEST_KEY);
    expect(decrypted).toBe(value);
  });
});
