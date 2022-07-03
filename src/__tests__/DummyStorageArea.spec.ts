import { describe, it, expect } from "vitest";

import { DummyStorageArea } from "../DummyStorageArea";

describe("Dummy storage", () => {
  const storage = new DummyStorageArea(true);

  it("set does something", async () => {
    await storage.clear();
    await storage.set({ foo: "bar" });
  });

  it("basic get works", async () => {
    await storage.clear();
    await storage.set({ foo: "bar" });
    const value = await storage.get("foo");
    expect(value).toStrictEqual({ foo: "bar" });
  });

  it("keyed get works", async () => {
    await storage.set({ foo: "bar" });
    const value = await storage.get(["foo"]);
    expect(value).toStrictEqual({ foo: "bar" });
  });

  it("keyed multiple get works", async () => {
    await storage.clear();
    const json = {
      key1: "val1",
      key2: "val2",
      key3: "val3",
    };
    await storage.set(json);

    const value = await storage.get(["key1", "key3"]);
    expect(value).toStrictEqual({
      key1: "val1",
      key3: "val3",
    });

    const value2 = await storage.get("key2");
    expect(value2).toStrictEqual({ key2: "val2" });
  });

  it("get all works", async () => {
    await storage.clear();
    const json = {
      key1: "val1",
      key2: "val2",
      key3: "val3",
    };
    await storage.set(json);

    const value = await storage.get();
    expect(value).toStrictEqual(json);
  });

  it("removing works", async () => {
    await storage.clear();
    const json = {
      key1: "val1",
      key2: "val2",
      key3: "val3",
      key4: "val4",
    };
    await storage.set(json);

    await storage.remove("key2");
    const value1 = await storage.get();
    expect(value1).toStrictEqual({
      key1: "val1",
      key3: "val3",
      key4: "val4",
    });

    await storage.remove(["key3", "key4"]);
    const value2 = await storage.get();
    expect(value2).toStrictEqual({
      key1: "val1",
    });
  });

  it("clear works", async () => {
    await storage.clear();

    const value = await storage.get(["key1", "key3"]);
    expect(value).toStrictEqual({
      key1: undefined,
      key3: undefined,
    });
  });

  it("keyed get nested works", async () => {
    await storage.clear();
    const json = {
      foo: {
        bar: "baz",
        lol: { lel: "kek" },
      },
    };
    await storage.set(json);

    const value = await storage.get("foo");
    expect(value).toStrictEqual({
      foo: {
        bar: "baz",
        lol: { lel: "kek" },
      },
    });

    const value2 = await storage.get(["foo"]);
    expect(value2).toStrictEqual({
      foo: {
        bar: "baz",
        lol: { lel: "kek" },
      },
    });
  });
});
