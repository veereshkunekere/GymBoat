
import {
  test,
  before,
  after,
  beforeEach,
} from "node:test";

import assert from "node:assert/strict";
import request from "supertest";

import app from "../../src/app.js";

import {
  startTestDatabase,
  clearTestDatabase,
  stopTestDatabase,
} from "../setup/database.js";

import { createTestOwner } from "../setup/testData.js";

before(async () => {
  await startTestDatabase();
});

beforeEach(async () => {
  await clearTestDatabase();
});

after(async () => {
  await stopTestDatabase();
});

test("should register a new owner and gym", async () => {
  const { agent, owner } = await createTestOwner();

  assert.ok(owner.id);
  assert.equal(owner.name, "Test Owner");

  const me = await agent.get("/api/v1/auth/me");

  assert.equal(me.status, 200);
  assert.equal(me.body.success, true);

  console.log("[PASS] Owner registration and authentication");
});

test("should login with valid credentials", async () => {
  const { credentials } = await createTestOwner();

  const agent = request.agent(app);

  const response = await agent
    .post("/api/v1/auth/login")
    .send({
      email: credentials.email,
      password: credentials.password,
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);

  const me = await agent.get("/api/v1/auth/me");

  assert.equal(me.status, 200);

  console.log("[PASS] Owner login");
});

test("should reject invalid login credentials", async () => {
  const response = await request(app)
    .post("/api/v1/auth/login")
    .send({
      email: "wrong@example.com",
      password: "WrongPassword123",
    });

  assert.equal(response.status, 401);

  console.log("[PASS] Invalid login rejected");
});

test("should reject unauthenticated access", async () => {
  const response = await request(app)
    .get("/api/v1/auth/me");

  assert.equal(response.status, 401);

  console.log("[PASS] Unauthenticated request rejected");
});
