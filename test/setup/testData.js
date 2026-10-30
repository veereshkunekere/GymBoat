
import request from "supertest";
import { randomUUID } from "node:crypto";
import app from "../../src/app.js";

export const createTestOwner = async (overrides = {}) => {
  const agent = request.agent(app);

  const credentials = {
    name: "Test Owner",
    email: `owner-${randomUUID()}@example.com`,
    password: "TestPassword@123",
    gymName: "Test Gym",
    phone: "9876543210",
    ...overrides,
  };

  const response = await agent
    .post("/api/v1/auth/register")
    .send(credentials);

  if (response.status !== 201) {
    throw new Error(
      `Owner registration failed (${response.status}): ${
        JSON.stringify(response.body)
      }`
    );
  }

  return {
    agent,
    owner: response.body.owner,
    credentials,
  };
};

export const createTestMember = async (agent, overrides = {}) => {
  const memberData = {
    name: "Test Member",
    phone: String(Math.floor(1000000000 + Math.random() * 9000000000)),
    email: "member@example.com",
    gender: "MALE",
    address: "Hyderabad",
    dateOfBirth: "2003-05-15",
    ...overrides,
  };

  const response = await agent
    .post("/api/v1/members")
    .send(memberData);

  if (response.status !== 201) {
    throw new Error(
      `Member creation failed (${response.status}): ${
        JSON.stringify(response.body)
      }`
    );
  }

  return {
    member: response.body.data,
    response,
  };
};

export const createTestPlan = async (agent, overrides = {}) => {
  const planData = {
    name: "Monthly Plan",
    durationDays: 30,
    price: 1500,
    description: "Automated integration test plan",
    ...overrides,
  };

  const response = await agent
    .post("/api/v1/plans")
    .send(planData);

  if (response.status !== 201) {
    throw new Error(
      `Plan creation failed (${response.status}): ${
        JSON.stringify(response.body)
      }`
    );
  }

  return {
    plan: response.body.data,
    response,
  };
};


export const createTestMembership = async (
  agent,
  memberId,
  planId,
  overrides = {}
) => {
  const membershipData = {
    memberId,
    planId,
    startDate: new Date().toISOString().slice(0, 10),
    discount: 0,
    ...overrides,
  };

  const response = await agent
    .post("/api/v1/memberships")
    .send(membershipData);

  if (response.status !== 201) {
    throw new Error(
      `Membership creation failed (${response.status}): ${
        JSON.stringify(response.body)
      }`
    );
  }

  return {
    membership: response.body.data,
    response,
  };
};
