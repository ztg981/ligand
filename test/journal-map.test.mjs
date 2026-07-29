import { test } from "node:test";
import assert from "node:assert/strict";
import {
  entriesWithGeo,
  cellSizeDeg,
  clusterPoints,
  placeStats,
  boundsOf,
} from "../src/lib/journalMap.js";

const at = (id, lat, lon, name = "Place") => ({ id, lat, lon, name });

test("only entries with real coordinates are mappable", () => {
  const journal = [
    { id: "a", location: "Brooklyn", geo: { lat: 40.7, lon: -73.9 } },
    { id: "b", location: "No coords" },
    { id: "c", location: "Bad", geo: { lat: null, lon: -73.9 } },
    { id: "d", location: "NaN", geo: { lat: NaN, lon: 1 } },
    null,
  ];
  const points = entriesWithGeo(journal);
  assert.deepEqual(points.map((p) => p.id), ["a"]);
  assert.equal(points[0].name, "Brooklyn");
});

test("an entry with coordinates but no name still maps", () => {
  const [p] = entriesWithGeo([{ id: "x", geo: { lat: 1, lon: 2 } }]);
  assert.equal(p.name, "Somewhere");
});

test("cells shrink as you zoom in", () => {
  assert.ok(cellSizeDeg(0) > cellSizeDeg(5));
  assert.ok(cellSizeDeg(5) > cellSizeDeg(12));
  // Each zoom level halves the cell — that's what keeps bubbles a constant
  // size on screen.
  assert.ok(Math.abs(cellSizeDeg(4) / cellSizeDeg(5) - 2) < 1e-9);
});

test("zooming out merges nearby entries; zooming in splits them", () => {
  // Two points ~0.5 degrees apart.
  const points = [at("a", 40.0, -74.0), at("b", 40.5, -74.0)];
  const wide = clusterPoints(points, 2);
  const close = clusterPoints(points, 12);
  assert.equal(wide.length, 1, "one bubble when zoomed out");
  assert.equal(wide[0].count, 2, "and it counts both");
  assert.equal(close.length, 2, "two bubbles when zoomed in");
  assert.deepEqual(close.map((c) => c.count), [1, 1]);
});

test("a cluster sits at the mean of its members, not a grid corner", () => {
  const [cluster] = clusterPoints([at("a", 10, 20), at("b", 12, 24)], 1);
  assert.equal(cluster.count, 2);
  assert.equal(cluster.lat, 11);
  assert.equal(cluster.lon, 22);
});

test("a cluster is named after its most common place", () => {
  const points = [
    at("a", 40.0, -74.0, "Costco"),
    at("b", 40.01, -74.01, "Costco"),
    at("c", 40.02, -74.02, "Library"),
  ];
  const [cluster] = clusterPoints(points, 3);
  assert.equal(cluster.count, 3);
  assert.equal(cluster.label, "Costco");
  assert.equal(cluster.places, 2, "and reports how many distinct places it holds");
});

test("clusters come back busiest first so the biggest draws on top", () => {
  const points = [
    at("a", 0, 0),
    at("b", 0.01, 0.01),
    at("c", 50, 50),
  ];
  const clusters = clusterPoints(points, 8);
  assert.deepEqual(clusters.map((c) => c.count), [2, 1]);
});

test("every entry survives clustering exactly once", () => {
  const points = Array.from({ length: 25 }, (_, i) =>
    at(`p${i}`, 40 + (i % 5) * 0.3, -74 + Math.floor(i / 5) * 0.3)
  );
  for (const zoom of [0, 3, 6, 9, 14]) {
    const clusters = clusterPoints(points, zoom);
    const ids = clusters.flatMap((c) => c.ids);
    assert.equal(ids.length, 25, `no entry lost or duplicated at zoom ${zoom}`);
    assert.equal(new Set(ids).size, 25);
    assert.equal(
      clusters.reduce((n, c) => n + c.count, 0),
      25,
      `counts still total 25 at zoom ${zoom}`
    );
  }
});

test("stats count entries and distinct places, ranked", () => {
  const points = [
    at("a", 1, 1, "Costco"),
    at("b", 1, 1, "Costco"),
    at("c", 2, 2, "Library"),
    at("d", 3, 3, "Park"),
  ];
  const stats = placeStats(points);
  assert.equal(stats.total, 4);
  assert.equal(stats.distinct, 3);
  assert.deepEqual(stats.top[0], { name: "Costco", count: 2 });
  assert.equal(stats.top.length, 3);
});

test("bounds cover every point, and are null when there are none", () => {
  assert.equal(boundsOf([]), null);
  assert.deepEqual(boundsOf([at("a", 10, -5), at("b", -2, 30)]), [
    [-2, -5],
    [10, 30],
  ]);
});

test("empty input never throws", () => {
  assert.deepEqual(clusterPoints([], 5), []);
  assert.deepEqual(entriesWithGeo(), []);
  assert.deepEqual(placeStats([]), { total: 0, distinct: 0, top: [] });
});
