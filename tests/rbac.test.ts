import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, stopTestDb } from "./helpers/db.js";
import { createUserWithRole, loginAs, seed } from "./helpers/app.js";
import { Role } from "../src/models/index.js";

beforeAll(async () => {
  await startTestDb();
  await seed();
});
afterAll(stopTestDb);

describe("role-based access control", () => {
  it("Editor can create and update tours but not delete them", async () => {
    const u = await createUserWithRole("Editor", "editor@test.local");
    const agent = await loginAs(u.email, u.password);
    const created = await agent.post("/api/admin/tours").send({ title: "Editor tour" });
    expect(created.status).toBe(201);
    const id = created.body.data._id;
    expect((await agent.put(`/api/admin/tours/${id}`).send({ shortDescription: "x" })).status).toBe(200);
    expect((await agent.delete(`/api/admin/tours/${id}`)).status).toBe(403);
  });

  it("Booking Manager can manage bookings but not edit content, settings or users", async () => {
    const u = await createUserWithRole("Booking Manager", "bm@test.local");
    const agent = await loginAs(u.email, u.password);
    expect((await agent.get("/api/admin/bookings")).status).toBe(200);
    expect((await agent.get("/api/admin/tours")).status).toBe(200); // read-only
    expect((await agent.post("/api/admin/tours").send({ title: "Nope" })).status).toBe(403);
    expect((await agent.put("/api/admin/site-settings").send({ siteName: "x" })).status).toBe(403);
    expect((await agent.post("/api/admin/users").send({})).status).toBe(403);
  });

  it("Content Manager cannot manage users or roles", async () => {
    const u = await createUserWithRole("Content Manager", "cm@test.local");
    const agent = await loginAs(u.email, u.password);
    expect((await agent.get("/api/admin/users")).status).toBe(403);
    expect((await agent.get("/api/admin/roles")).status).toBe(403);
    expect((await agent.put("/api/admin/branding").send({ logoAlt: "ok" })).status).toBe(200);
  });

  it("Admin cannot grant Super Admin or edit roles", async () => {
    const u = await createUserWithRole("Admin", "admin2@test.local");
    const agent = await loginAs(u.email, u.password);
    const superRole = await Role.findOne({ name: "Super Admin" });
    const res = await agent.post("/api/admin/users").send({ name: "Xavier", email: "x@test.local", password: "GoodPassw0rd", role: String(superRole!._id) });
    expect(res.status).toBe(403);
    expect((await agent.post("/api/admin/roles").send({ name: "Custom", permissions: [] })).status).toBe(403);
  });

  it("Super Admin can create custom roles and they are enforced", async () => {
    const admin = await loginAs();
    const role = await admin.post("/api/admin/roles").send({ name: "FAQ Editor", permissions: ["faqs:read", "faqs:create", "faqs:update"] });
    expect(role.status).toBe(201);
    const user = await admin
      .post("/api/admin/users")
      .send({ name: "Faq Person", email: "faq@test.local", password: "GoodPassw0rd", role: role.body.data._id });
    expect(user.status).toBe(201);
    const agent = await loginAs("faq@test.local", "GoodPassw0rd");
    expect((await agent.post("/api/admin/faqs").send({ question: "Is it hot?", answer: "Yes" })).status).toBe(201);
    expect((await agent.get("/api/admin/tours")).status).toBe(403);
    // Role edits apply on the next request (permissions are loaded per request).
    await admin.put(`/api/admin/roles/${role.body.data._id}`).send({ permissions: ["faqs:read"] });
    expect((await agent.post("/api/admin/faqs").send({ question: "Again?", answer: "No" })).status).toBe(403);
  });

  it("refuses wildcard permissions on custom roles and protects the last Super Admin", async () => {
    const admin = await loginAs();
    expect((await admin.post("/api/admin/roles").send({ name: "Sneaky", permissions: ["*"] })).status).toBe(400);
    const me = await admin.get("/api/auth/me");
    expect((await admin.delete(`/api/admin/users/${me.body.data.user.id}`)).status).toBe(400);
  });
});
