import {
  test,
  before,
  after,
} from "node:test";

import assert from "node:assert/strict";
import request from "supertest";

import app from "../../src/app.js";

import {
  startTestDatabase,
  clearTestDatabase,
  stopTestDatabase,
} from "../setup/database.js";

before(async () => {
  await startTestDatabase();
});

after(async () => {
  await stopTestDatabase();
});

test("GET /api should return API information", async () => {
  const response = await request(app)
    .get("/api");

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.version, "v1");

  console.log("[PASS] API health endpoint");
});

test("Unknown endpoint should return 404", async () => {
  const response = await request(app)
    .get("/api/v1/unknown-endpoint");

  assert.equal(response.status, 404);

  console.log("[PASS] Unknown endpoint returns 404");
});