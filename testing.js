import request from "supertest";
import { app } from "../../src/app.js";

describe("Payment Integration Tests", () => {
  let token;
  let paymentId;

  test("should record a payment", async () => {
    const response = await request(app)
      .post("/api/v1/payments")
      .set("Authorization", `Bearer ${token}`)
      .send({
        memberId: "MEMBER_ID",
        membershipId: "MEMBERSHIP_ID",
        amount: 1000,
        method: "UPI"
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe("PENDING");

    paymentId = response.body.data._id;
  });

  test("should verify payment", async () => {
    const response = await request(app)
      .patch(`/api/v1/payments/${paymentId}/verify`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("PAID");
  });
});