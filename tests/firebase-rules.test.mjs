import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

const projectId = "demo-mina-teach";
const hasEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
let environment;

before(async () => {
  if (!hasEmulator) return;
  const emulatorAddress = process.env.FIRESTORE_EMULATOR_HOST || "";
  assert.match(emulatorAddress, /^(?:127\.0\.0\.1|localhost):\d+$/, "Run this suite through the Firestore emulator.");
  const [host, port] = emulatorAddress.split(":");
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
    },
  });
});

after(async () => {
  await environment?.cleanup();
});

test("a signed-in student can save and read only their own backup", { skip: !hasEmulator }, async () => {
  const database = environment.authenticatedContext("student-a").firestore();
  const reference = doc(database, "users", "student-a", "accountData", "backup");
  await assertSucceeds(setDoc(reference, {
    schemaVersion: 1,
    records: { learning: { completed: ["lesson-1"] } },
    updatedAt: serverTimestamp(),
  }));
  assert.equal((await assertSucceeds(getDoc(reference))).exists(), true);
  await assertSucceeds(deleteDoc(reference));
});

test("unauthenticated and cross-account reads or writes are denied", { skip: !hasEmulator }, async () => {
  const anonymous = environment.unauthenticatedContext().firestore();
  const studentA = environment.authenticatedContext("student-a").firestore();
  const studentB = environment.authenticatedContext("student-b").firestore();
  const ownerRecord = doc(studentA, "users", "student-a", "accountData", "backup");
  const otherRecord = doc(studentA, "users", "student-b", "accountData", "backup");
  const anonymousRecord = doc(anonymous, "users", "student-a", "accountData", "backup");

  await assertFails(getDoc(anonymousRecord));
  await assertFails(setDoc(anonymousRecord, {
    schemaVersion: 1,
    records: {},
    updatedAt: serverTimestamp(),
  }));
  await assertFails(getDoc(doc(studentB, "users", "student-a", "accountData", "backup")));
  await assertFails(setDoc(otherRecord, {
    schemaVersion: 1,
    records: {},
    updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(setDoc(ownerRecord, {
    schemaVersion: 1,
    records: {},
    updatedAt: serverTimestamp(),
  }));
});

test("only the expected private backup shape and path are writable", { skip: !hasEmulator }, async () => {
  const database = environment.authenticatedContext("student-a").firestore();
  await assertFails(setDoc(doc(database, "users", "student-a", "accountData", "backup"), {
    schemaVersion: 1,
    records: { roles: { admin: true } },
    updatedAt: serverTimestamp(),
  }));
  await assertFails(setDoc(doc(database, "users", "student-a", "accountData", "another"), {
    schemaVersion: 1,
    records: {},
    updatedAt: serverTimestamp(),
  }));
  await assertFails(setDoc(doc(database, "admin", "roles"), { role: "admin" }));
});
