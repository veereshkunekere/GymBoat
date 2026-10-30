
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
  createTestMembership,
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

test("should assign a membership with the correct initial balance", async () => {
  const { agent } = await createTestOwner();

  const { member } = await createTestMember(agent);

  const { plan } = await createTestPlan(agent, {
    price: 1500,
    durationDays: 30,
  });

  const { membership } = await createTestMembership(
    agent,
    member._id,
    plan._id
  );

  assert.ok(membership._id);
  assert.equal(String(membership.memberId), String(member._id));
  assert.equal(String(membership.planId), String(plan._id));

  assert.equal(membership.originalPrice, 1500);
  assert.equal(membership.finalPrice, 1500);
  assert.equal(membership.paidAmount, 0);
  assert.equal(membership.dueAmount, 1500);
  assert.equal(membership.paymentStatus, "UNPAID");

  console.log("[PASS] Membership assignment and initial balance");
});

test("should apply discount correctly", async () => {
  const { agent } = await createTestOwner();

  const { member } = await createTestMember(agent);

  const { plan } = await createTestPlan(agent, {
    price: 2000,
  });

  const { membership } = await createTestMembership(
    agent,
    member._id,
    plan._id,
    { discount: 200 }
  );

  assert.equal(membership.originalPrice, 2000);
  assert.equal(membership.discount, 200);
  assert.equal(membership.finalPrice, 1800);
  assert.equal(membership.paidAmount, 0);
  assert.equal(membership.dueAmount, 1800);

  console.log("[PASS] Membership discount calculation");
});

test("should retrieve an assigned membership", async () => {
  const { agent } = await createTestOwner();

  const { member } = await createTestMember(agent);
  const { plan } = await createTestPlan(agent);

  const { membership } = await createTestMembership(
    agent,
    member._id,
    plan._id
  );

  const response = await agent.get(
    `/api/v1/memberships/${membership._id}`
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(
    String(response.body.data._id),
    String(membership._id)
  );

  console.log("[PASS] Membership retrieval");
});

test("should prevent another gym from accessing a membership", async () => {
  const firstOwner = await createTestOwner();
  const secondOwner = await createTestOwner();

  const { member } = await createTestMember(firstOwner.agent);
  const { plan } = await createTestPlan(firstOwner.agent);

  const { membership } = await createTestMembership(
    firstOwner.agent,
    member._id,
    plan._id
  );

  const response = await secondOwner.agent.get(
    `/api/v1/memberships/${membership._id}`
  );

  assert.equal(response.status, 404);

  console.log("[PASS] Cross-gym membership isolation");
});


test("should renew an active membership and link the previous membership", async () => {
  const { agent } = await createTestOwner();
  const { member } = await createTestMember(agent);
  const { plan } = await createTestPlan(agent, {
    price: 1500,
    durationDays: 30,
  });

  const { membership: previous } = await createTestMembership(
    agent,
    member._id,
    plan._id
  );

  const response = await agent
    .post(`/api/v1/memberships/${previous._id}/renew`)
    .send({});

  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);

  const renewed = response.body.data;

  assert.ok(renewed._id);
  assert.equal(
    String(renewed.previousMembershipId),
    String(previous._id)
  );
  assert.equal(String(renewed.memberId), String(member._id));
  assert.equal(renewed.originalPrice, 1500);
  assert.equal(renewed.paidAmount, 0);
  assert.equal(renewed.dueAmount, 1500);

  const expectedStartDate = new Date(previous.endDate);
  expectedStartDate.setUTCDate(expectedStartDate.getUTCDate() + 1);

  assert.equal(
    new Date(renewed.startDate).toISOString(),
    expectedStartDate.toISOString()
  );

  console.log("[PASS] Membership renewal");
});


test("should pause an active membership", async () => {
  const { agent } = await createTestOwner();
  const { member } = await createTestMember(agent);
  const { plan } = await createTestPlan(agent);

  const { membership } = await createTestMembership(
    agent,
    member._id,
    plan._id
  );

  const response = await agent.post(
    `/api/v1/memberships/${membership._id}/pause`
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.status, "PAUSED");
  assert.ok(response.body.data.pausedAt);
  assert.equal(response.body.data.pauseHistory.length, 1);
  assert.equal(response.body.data.pauseHistory[0].days, 0);

  console.log("[PASS] Membership pause");
});


test("should resume a paused membership", async () => {
  const { agent } = await createTestOwner();
  const { member } = await createTestMember(agent);
  const { plan } = await createTestPlan(agent);

  const { membership } = await createTestMembership(
    agent,
    member._id,
    plan._id
  );

  const pauseResponse = await agent.post(
    `/api/v1/memberships/${membership._id}/pause`
  );

  assert.equal(pauseResponse.status, 200);

  const response = await agent.post(
    `/api/v1/memberships/${membership._id}/resume`
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.status, "ACTIVE");
  assert.equal(response.body.data.pausedAt, null);
  assert.ok(response.body.data.resumedAt);
  assert.equal(response.body.data.pauseHistory.length, 1);
  assert.ok(response.body.data.pauseHistory[0].resumedAt);

  console.log("[PASS] Membership resume");
});


test("should cancel an active membership", async () => {
  const { agent } = await createTestOwner();
  const { member } = await createTestMember(agent);
  const { plan } = await createTestPlan(agent);

  const { membership } = await createTestMembership(
    agent,
    member._id,
    plan._id
  );

  const response = await agent.post(
    `/api/v1/memberships/${membership._id}/cancel`
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.status, "CANCELLED");

  console.log("[PASS] Membership cancellation");
});


test("should prevent invalid membership lifecycle transitions", async () => {
  const { agent } = await createTestOwner();
  const { member } = await createTestMember(agent);
  const { plan } = await createTestPlan(agent);

  const { membership } = await createTestMembership(
    agent,
    member._id,
    plan._id
  );

  // Cannot resume an active membership.
  const resumeActive = await agent.post(
    `/api/v1/memberships/${membership._id}/resume`
  );
  assert.equal(resumeActive.status, 400);

  // First pause should succeed.
  const pause = await agent.post(
    `/api/v1/memberships/${membership._id}/pause`
  );
  assert.equal(pause.status, 200);

  // Cannot pause an already paused membership.
  const pauseAgain = await agent.post(
    `/api/v1/memberships/${membership._id}/pause`
  );
  assert.equal(pauseAgain.status, 400);

  // First resume should succeed.
  const resume = await agent.post(
    `/api/v1/memberships/${membership._id}/resume`
  );
  assert.equal(resume.status, 200);

  // Cannot resume an already resumed membership.
  const resumeAgain = await agent.post(
    `/api/v1/memberships/${membership._id}/resume`
  );
  assert.equal(resumeAgain.status, 400);

  // First cancellation should succeed.
  const cancel = await agent.post(
    `/api/v1/memberships/${membership._id}/cancel`
  );
  assert.equal(cancel.status, 200);

  // Cannot cancel an already cancelled membership.
  const cancelAgain = await agent.post(
    `/api/v1/memberships/${membership._id}/cancel`
  );
  assert.equal(cancelAgain.status, 400);

  console.log("[PASS] Invalid membership lifecycle transitions");
});


test("should prevent overlapping memberships for the same member", async () => {
  const { agent } = await createTestOwner();
  const { member } = await createTestMember(agent);
  const { plan } = await createTestPlan(agent);

  const { membership } = await createTestMembership(
    agent,
    member._id,
    plan._id
  );

  const response = await agent
    .post("/api/v1/memberships")
    .send({
      memberId: member._id,
      planId: plan._id,
      startDate: new Date(membership.startDate)
        .toISOString()
        .slice(0, 10),
      discount: 0,
    });

  assert.equal(response.status, 409);
  assert.equal(response.body.success, false);

  console.log("[PASS] Overlapping membership prevention");
});
