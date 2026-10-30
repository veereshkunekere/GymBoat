import {
  test,
  before,
  after,
  beforeEach,
} from "node:test";

import assert from "node:assert/strict";

import {
  startTestDatabase,
  clearTestDatabase,
  stopTestDatabase,
} from "../setup/database.js";

import {
  createTestOwner,
  createTestMember,
  createTestPlan,
} from "../setup/testData.js";

before(async () => {
  await startTestDatabase();
});

beforeEach(async () => {
  await clearTestDatabase();
});

after(async () => {
  await stopTestDatabase();
});

// -------------------------
// MEMBER TESTS
// -------------------------

test("should create and retrieve a member", async () => {
  const { agent } = await createTestOwner();

  const { member } = await createTestMember(agent);

  assert.ok(member._id);
  assert.equal(member.name, "Test Member");

  const response = await agent.get(
    `/api/v1/members/${member._id}`
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.data._id, member._id);

  console.log("[PASS] Member creation and retrieval");
});

test("should list and search members", async () => {
  const { agent } = await createTestOwner();

  await createTestMember(agent, {
    name: "Rahul Sharma",
  });

  await createTestMember(agent, {
    name: "Amit Kumar",
  });

  const listResponse = await agent.get(
    "/api/v1/members?page=1&limit=10"
  );

  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.body.members.length, 2);

  const searchResponse = await agent.get(
    "/api/v1/members?search=Rahul"
  );

  assert.equal(searchResponse.status, 200);
  assert.equal(searchResponse.body.members.length, 1);
  assert.equal(
    searchResponse.body.members[0].name,
    "Rahul Sharma"
  );

  console.log("[PASS] Member listing and search");
});

test("should update a member", async () => {
  const { agent } = await createTestOwner();

  const { member } = await createTestMember(agent);

  const response = await agent
    .patch(`/api/v1/members/${member._id}`)
    .send({
      name: "Updated Member",
      address: "Secunderabad",
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.data.name, "Updated Member");

  console.log("[PASS] Member update");
});

test("should reject duplicate phone numbers in the same gym", async () => {
  const { agent } = await createTestOwner();

  await createTestMember(agent, {
    phone: "9876543210",
  });

  const response = await agent
    .post("/api/v1/members")
    .send({
      name: "Duplicate Member",
      phone: "9876543210",
    });

  assert.equal(response.status, 409);

  console.log("[PASS] Duplicate member phone rejected");
});

test("should archive and restore a member", async () => {
  const { agent } = await createTestOwner();

  const { member } = await createTestMember(agent);

  const archiveResponse = await agent.patch(
    `/api/v1/members/${member._id}/archive`
  );

  assert.equal(archiveResponse.status, 200);
  assert.equal(archiveResponse.body.data.isArchived, true);

  const restoreResponse = await agent.patch(
    `/api/v1/members/${member._id}/restore`
  );

  assert.equal(restoreResponse.status, 200);
  assert.equal(restoreResponse.body.data.isArchived, false);

  console.log("[PASS] Member archive and restore");
});

test("should prevent another gym from accessing a member", async () => {
  const firstOwner = await createTestOwner();
  const secondOwner = await createTestOwner();

  const { member } = await createTestMember(firstOwner.agent);

  const response = await secondOwner.agent.get(
    `/api/v1/members/${member._id}`
  );

  assert.equal(response.status, 404);

  console.log("[PASS] Cross-gym member isolation");
});

// -------------------------
// PLAN TESTS
// -------------------------

test("should create and retrieve a plan", async () => {
  const { agent } = await createTestOwner();

  const { plan } = await createTestPlan(agent);

  assert.ok(plan._id);
  assert.equal(plan.name, "Monthly Plan");
  assert.equal(plan.price, 1500);

  const response = await agent.get(
    `/api/v1/plans/${plan._id}`
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.data._id, plan._id);

  console.log("[PASS] Plan creation and retrieval");
});

test("should update a plan", async () => {
  const { agent } = await createTestOwner();

  const { plan } = await createTestPlan(agent);

  const response = await agent
    .patch(`/api/v1/plans/${plan._id}`)
    .send({
      name: "Quarterly Plan",
      durationDays: 90,
      price: 3500,
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.data.name, "Quarterly Plan");
  assert.equal(response.body.data.durationDays, 90);
  assert.equal(response.body.data.price, 3500);

  console.log("[PASS] Plan update");
});

test("should deactivate and reactivate a plan", async () => {
  const { agent } = await createTestOwner();

  const { plan } = await createTestPlan(agent);

  const deactivateResponse = await agent
    .patch(`/api/v1/plans/${plan._id}/status`)
    .send({ isActive: false });

  assert.equal(deactivateResponse.status, 200);
  assert.equal(deactivateResponse.body.data.isActive, false);

  const reactivateResponse = await agent
    .patch(`/api/v1/plans/${plan._id}/status`)
    .send({ isActive: true });

  assert.equal(reactivateResponse.status, 200);
  assert.equal(reactivateResponse.body.data.isActive, true);

  console.log("[PASS] Plan deactivate and reactivate");
});

test("should prevent another gym from accessing a plan", async () => {
  const firstOwner = await createTestOwner();
  const secondOwner = await createTestOwner();

  const { plan } = await createTestPlan(firstOwner.agent);

  const response = await secondOwner.agent.get(
    `/api/v1/plans/${plan._id}`
  );

  assert.equal(response.status, 404);

  console.log("[PASS] Cross-gym plan isolation");
});