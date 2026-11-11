import { expect, it } from "vitest";
import { addBasePath, removeBasePath, resolveRoute } from "../src/routing.js";

it("opens the real Reviews route and keeps saved legacy links working below a configured prefix", () => {
  expect(resolveRoute("/reviews")?.id).toBe("reviews");
  expect(resolveRoute("/reviews/")?.id).toBe("reviews");
  expect(resolveRoute("/reviews/pr-12")?.path).toBe("/reviews");
  expect(resolveRoute(removeBasePath(addBasePath("/reviews", "/devsetu"), "/devsetu"))?.id).toBe(
    "reviews",
  );
  expect(resolveRoute("/reviews/unknown")).toBeUndefined();
});
