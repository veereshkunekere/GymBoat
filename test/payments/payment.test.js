
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

// Reusable payment fixture
const createPaymentFixture = async (price = 1500) => {
  const { agent, owner } = await createTestOwner();

  const { member } = await createTestMember(agent);

  const { plan } = await createTestPlan(agent, {
    price,
    durationDays: 30,
  });

  const { membership } = await createTestMembership(
    agent,
    member._id,
    plan._id
  );

  return {
    agent,
    owner,
    member,
    plan,
    membership,
  };
};

// Reusable record payment request
const recordPayment = (agent, memberId, membershipId, amount) => {
  return agent
    .post("/api/v1/payments")
    .send({
      memberId,
      membershipId,
      amount,
      method: "UPI",
      transactionReference: `TEST-${Date.now()}`,
      notes: "Payment integration test",
    });
};


// --------------------------------------------------
// TEST 1: RECORD PAYMENT
// --------------------------------------------------

test("should record payment as PENDING without updating membership balance", async () => {
  const { agent, member, membership } =
    await createPaymentFixture(1500);

  const response = await recordPayment(
    agent,
    member._id,
    membership._id,
    1000
  );

  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);

  assert.equal(response.body.data.payment.status, "PENDING");
  assert.equal(response.body.data.payment.amount, 1000);
  assert.ok(response.body.data.payment.receiptNumber);

  assert.equal(
    response.body.data.membershipBalance.paidAmount,
    0
  );

  assert.equal(
    response.body.data.membershipBalance.dueAmount,
    1500
  );

  console.log("[PASS] Payment recorded as pending");
});


// --------------------------------------------------
// TEST 2: VERIFY PARTIAL PAYMENT
// --------------------------------------------------

test("should verify payment and update partial membership balance", async () => {
  const { agent, member, membership } =
    await createPaymentFixture(1500);

  const recordResponse = await recordPayment(
    agent,
    member._id,
    membership._id,
    1000
  );

  const paymentId =
    recordResponse.body.data.payment._id;

  const response = await agent.patch(
    `/api/v1/payments/${paymentId}/verify`
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);

  assert.equal(response.body.data.payment.status, "PAID");

  assert.ok(response.body.data.payment.verifiedAt);

  assert.equal(
    response.body.data.membershipBalance.paidAmount,
    1000
  );

  assert.equal(
    response.body.data.membershipBalance.dueAmount,
    500
  );

  assert.equal(
    response.body.data.membershipBalance.paymentStatus,
    "PARTIALLY_PAID"
  );

  console.log("[PASS] Partial payment verification");
});


// --------------------------------------------------
// TEST 3: VERIFY FULL PAYMENT
// --------------------------------------------------

test("should mark membership PAID after full payment verification", async () => {
  const { agent, member, membership } =
    await createPaymentFixture(1500);

  const recordResponse = await recordPayment(
    agent,
    member._id,
    membership._id,
    1500
  );

  const paymentId =
    recordResponse.body.data.payment._id;

  const response = await agent.patch(
    `/api/v1/payments/${paymentId}/verify`
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.data.payment.status, "PAID");

  assert.equal(
    response.body.data.membershipBalance.paidAmount,
    1500
  );

  assert.equal(
    response.body.data.membershipBalance.dueAmount,
    0
  );

  assert.equal(
    response.body.data.membershipBalance.paymentStatus,
    "PAID"
  );

  console.log("[PASS] Full payment verification");
});


// --------------------------------------------------
// TEST 4: REJECT PAYMENT
// --------------------------------------------------

test("should reject payment without updating membership balance", async () => {
  const { agent, member, membership } =
    await createPaymentFixture(1500);

  const recordResponse = await recordPayment(
    agent,
    member._id,
    membership._id,
    1000
  );

  const paymentId =
    recordResponse.body.data.payment._id;

  const response = await agent
    .patch(`/api/v1/payments/${paymentId}/reject`)
    .send({
      rejectionReason: "UPI transaction not received",
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);

  assert.equal(response.body.data.status, "REJECTED");

  assert.equal(
    response.body.data.rejectionReason,
    "UPI transaction not received"
  );

  assert.ok(response.body.data.rejectedAt);

  // Rejected payment must not update membership.
  const membershipResponse = await agent.get(
    `/api/v1/memberships/${membership._id}`
  );

  assert.equal(
    membershipResponse.body.data.paidAmount,
    0
  );

  assert.equal(
    membershipResponse.body.data.dueAmount,
    1500
  );

  console.log("[PASS] Payment rejection");
});


// --------------------------------------------------
// TEST 5: PREVENT PENDING PAYMENT OVERBOOKING
// --------------------------------------------------

test("should prevent pending payments from exceeding outstanding balance", async () => {
  const { agent, member, membership } =
    await createPaymentFixture(1500);

  const firstPayment = await recordPayment(
    agent,
    member._id,
    membership._id,
    1000
  );

  assert.equal(firstPayment.status, 201);

  // Only ₹500 remains available because ₹1000 is reserved.
  const secondPayment = await recordPayment(
    agent,
    member._id,
    membership._id,
    600
  );

  assert.equal(secondPayment.status, 400);
  assert.equal(secondPayment.body.success, false);

  console.log("[PASS] Pending payment overbooking prevention");
});


// --------------------------------------------------
// TEST 6: REJECTED PAYMENT RELEASES RESERVED BALANCE
// --------------------------------------------------

test("should allow a new payment after rejecting a pending payment", async () => {
  const { agent, member, membership } =
    await createPaymentFixture(1500);

  const firstPayment = await recordPayment(
    agent,
    member._id,
    membership._id,
    1000
  );

  const firstPaymentId =
    firstPayment.body.data.payment._id;

  const rejectResponse = await agent
    .patch(`/api/v1/payments/${firstPaymentId}/reject`)
    .send({
      rejectionReason: "Incorrect transaction",
    });

  assert.equal(rejectResponse.status, 200);

  // The rejected payment no longer reserves the balance.
  const secondPayment = await recordPayment(
    agent,
    member._id,
    membership._id,
    1500
  );

  assert.equal(secondPayment.status, 201);
  assert.equal(
    secondPayment.body.data.payment.status,
    "PENDING"
  );

  console.log("[PASS] Rejected payment releases reserved balance");
});


// --------------------------------------------------
// TEST 7: PREVENT DUPLICATE VERIFICATION
// --------------------------------------------------

test("should prevent verifying the same payment twice", async () => {
  const { agent, member, membership } =
    await createPaymentFixture(1500);

  const recordResponse = await recordPayment(
    agent,
    member._id,
    membership._id,
    500
  );

  const paymentId =
    recordResponse.body.data.payment._id;

  const firstVerification = await agent.patch(
    `/api/v1/payments/${paymentId}/verify`
  );

  assert.equal(firstVerification.status, 200);

  const secondVerification = await agent.patch(
    `/api/v1/payments/${paymentId}/verify`
  );

  assert.equal(secondVerification.status, 409);

  const membershipResponse = await agent.get(
    `/api/v1/memberships/${membership._id}`
  );

  // Must not double-count the payment.
  assert.equal(
    membershipResponse.body.data.paidAmount,
    500
  );

  console.log("[PASS] Duplicate verification prevention");
});


// --------------------------------------------------
// TEST 8: PAYMENT HISTORY
// --------------------------------------------------

test("should retrieve payment history with correct status filters", async () => {
  const { agent, member, membership } =
    await createPaymentFixture(1500);

  const recordResponse = await recordPayment(
    agent,
    member._id,
    membership._id,
    500
  );

  assert.equal(recordResponse.status, 201);

  const paymentId =
    recordResponse.body.data.payment._id;

  const historyResponse = await agent.get(
    "/api/v1/payments/history?status=PENDING"
  );

  assert.equal(historyResponse.status, 200);
  assert.equal(historyResponse.body.success, true);
  assert.equal(historyResponse.body.data.payments.length, 1);

  const detailResponse = await agent.get(
    `/api/v1/payments/${paymentId}`
  );

  assert.equal(detailResponse.status, 200);
  assert.equal(detailResponse.body.data.status, "PENDING");

  console.log("[PASS] Payment history and details");
});


// --------------------------------------------------
// TEST 9: PENDING PAYMENTS
// --------------------------------------------------

test("should return pending payment summary", async () => {
  const { agent, member, membership } =
    await createPaymentFixture(1500);

  await recordPayment(
    agent,
    member._id,
    membership._id,
    500
  );

  const response = await agent.get(
    "/api/v1/payments/pending"
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);

  assert.equal(
    response.body.data.summary.pendingAmount,
    500
  );

  assert.equal(
    response.body.data.summary.paymentCount,
    1
  );

  console.log("[PASS] Pending payment summary");
});


// --------------------------------------------------
// TEST 10: OUTSTANDING BALANCES
// --------------------------------------------------

test("should return outstanding membership balances", async () => {
  const { agent, member, membership } =
    await createPaymentFixture(1500);

  const response = await agent.get(
    "/api/v1/payments/outstanding"
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);

  assert.equal(
    response.body.data.summary.totalOutstanding,
    1500
  );

  assert.equal(
    response.body.data.summary.membershipCount,
    1
  );

  console.log("[PASS] Outstanding balance summary");
});


// --------------------------------------------------
// TEST 11: CROSS-GYM PAYMENT ISOLATION
// --------------------------------------------------

test("should prevent another gym from accessing payment details", async () => {
  const firstOwner = await createTestOwner();
  const secondOwner = await createTestOwner();

  const { member } = await createTestMember(firstOwner.agent);
  const { plan } = await createTestPlan(firstOwner.agent);

  const { membership } = await createTestMembership(
    firstOwner.agent,
    member._id,
    plan._id
  );

  const recordResponse = await recordPayment(
    firstOwner.agent,
    member._id,
    membership._id,
    500
  );

  const paymentId =
    recordResponse.body.data.payment._id;

  const response = await secondOwner.agent.get(
    `/api/v1/payments/${paymentId}`
  );

  assert.equal(response.status, 404);

  console.log("[PASS] Cross-gym payment isolation");
});


// --------------------------------------------------
// TEST 12: INVALID PAYMENT INPUT
// --------------------------------------------------

test("should reject invalid payment amount and method", async () => {
  const { agent, member, membership } =
    await createPaymentFixture(1500);

  const invalidAmount = await agent
    .post("/api/v1/payments")
    .send({
      memberId: member._id,
      membershipId: membership._id,
      amount: -100,
      method: "UPI",
    });

  assert.equal(invalidAmount.status, 400);

  const invalidMethod = await agent
    .post("/api/v1/payments")
    .send({
      memberId: member._id,
      membershipId: membership._id,
      amount: 100,
      method: "CHEQUE",
    });

  assert.equal(invalidMethod.status, 400);

  console.log("[PASS] Invalid payment input validation");
});
