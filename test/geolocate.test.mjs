import { test } from "node:test";
import assert from "node:assert/strict";
import { placeNameFromResult } from "../src/lib/geolocate.js";

/* Journal entries used to record only a city. These cover naming the place
   you're actually standing in, without dragging a whole address behind it. */

test("a named venue leads, with its settlement after it", () => {
  assert.equal(
    placeNameFromResult({
      name: "Costco Wholesale",
      address: { shop: "supermarket", city: "Brooklyn", state: "New York" },
    }),
    "Costco Wholesale, Brooklyn"
  );
});

test("the brand in the address is used when the POI has no name", () => {
  assert.equal(
    placeNameFromResult({ address: { amenity: "Blue Bottle Coffee", city: "Oakland" } }),
    "Blue Bottle Coffee, Oakland"
  );
});

test("no venue falls back to the old city, region behaviour", () => {
  assert.equal(
    placeNameFromResult({ address: { city: "Brooklyn", state: "New York" } }),
    "Brooklyn, New York"
  );
});

test("a street is not a venue", () => {
  // Nominatim often echoes the road; naming it "Main Street, Springfield"
  // would be worse than just the town.
  assert.equal(
    placeNameFromResult({
      name: "Main Street",
      address: { road: "Main Street", city: "Springfield" },
    }),
    "Springfield"
  );
});

test("a venue does not drag the region along too", () => {
  // "Costco, Brooklyn" is the useful line; the state adds nothing.
  assert.equal(
    placeNameFromResult({
      name: "Costco",
      address: { city: "Brooklyn", state: "New York", country: "United States" },
    }),
    "Costco, Brooklyn"
  );
});

test("names are never repeated", () => {
  assert.equal(
    placeNameFromResult({ name: "Brooklyn", address: { city: "Brooklyn" } }),
    "Brooklyn"
  );
});

test("nothing usable yields null rather than an empty string", () => {
  assert.equal(placeNameFromResult({}), null);
  assert.equal(placeNameFromResult({ address: {} }), null);
});

test("only a country still gives something", () => {
  assert.equal(placeNameFromResult({ address: { country: "Japan" } }), "Japan");
});
