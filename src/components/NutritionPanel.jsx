import { useMemo, useState } from "react";
import { Icon } from "./Icons.jsx";
import { MEAL_TAGS, todayKey, shiftDay } from "../lib/model.js";
import { fuelSuggestion } from "../lib/nutrition.js";

/* NutritionPanel — the "Fuel" side of the Workout tab.

   Deliberately gentle by design: meals are logged by NAME and simple balance
   tags — no calories, no macros by default, no good-food/bad-food morality,
   no restriction tools. Suggestions are additive ("a fruit or veg with your
   next meal") and never tell anyone to eat less. Detailed tracking apps
   exist; this is the low-friction "did I actually eat, and roughly how
   balanced was it?" layer that pairs with training. */

const TAG_LABEL = {
  protein: "Protein",
  veg: "Veg",
  fruit: "Fruit",
  grain: "Grains",
  dairy: "Dairy",
  treat: "Treat",
};

const WATER_GOAL = 8; // glasses — a visual anchor, not a rule

export default function NutritionPanel({
  meals = [],
  waterLog = {},
  addMeal,
  removeMeal,
  addWater,
  trainedToday = false,
}) {
  const today = todayKey();
  const [name, setName] = useState("");
  const [tags, setTags] = useState([]);

  const todaysMeals = useMemo(
    () =>
      meals
        .filter((m) => m.date === today)
        .sort((a, b) => (a.time || "").localeCompare(b.time || "")),
    [meals, today]
  );
  const water = waterLog[today] || 0;

  const suggestion = fuelSuggestion({
    meals: todaysMeals,
    water,
    hour: new Date().getHours(),
    trainedToday,
  });

  const toggleTag = (t) =>
    setTags((list) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]));

  const save = () => {
    const n = name.trim();
    if (!n) return;
    addMeal?.({ name: n.slice(0, 80), tags });
    setName("");
    setTags([]);
  };

  // Last 7 days at a glance: meals logged + water per day.
  const week = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const key = shiftDay(today, i - 6);
      return {
        key,
        label: new Date(key + "T00:00:00").toLocaleDateString(undefined, { weekday: "narrow" }),
        meals: meals.filter((m) => m.date === key).length,
        water: waterLog[key] || 0,
      };
    });
  }, [meals, waterLog, today]);

  return (
    <div className="fuel">
      {/* Water first: the single easiest daily win. */}
      <div className="card fuel-water">
        <div className="card-head">
          <div className="card-title"><Icon.Cloud /> Water</div>
          <span className="fuel-water-count">{water} / {WATER_GOAL}</span>
        </div>
        <div className="fuel-water-row">
          <button
            className="btn ghost fuel-water-btn"
            onClick={() => addWater?.(today, -1)}
            disabled={water <= 0}
            aria-label="Remove a glass"
          >
            −
          </button>
          <div className="fuel-cups" role="img" aria-label={`${water} of ${WATER_GOAL} glasses`}>
            {Array.from({ length: WATER_GOAL }, (_, i) => (
              <span key={i} className={"fuel-cup" + (i < water ? " full" : "")} />
            ))}
            {water > WATER_GOAL && <span className="fuel-cup-extra">+{water - WATER_GOAL}</span>}
          </div>
          <button
            className="btn primary fuel-water-btn"
            onClick={() => addWater?.(today, 1)}
            aria-label="Add a glass"
          >
            +
          </button>
        </div>
      </div>

      {/* Meal log */}
      <div className="card">
        <div className="card-head">
          <div className="card-title"><Icon.Heart /> Today's meals</div>
        </div>

        {suggestion && <p className="fuel-suggestion">{suggestion}</p>}

        {todaysMeals.length > 0 && (
          <div className="fuel-meals">
            {todaysMeals.map((m) => (
              <div key={m.id} className="fuel-meal">
                <span className="fuel-meal-time">{m.time}</span>
                <span className="fuel-meal-name">{m.name}</span>
                <span className="fuel-meal-tags">
                  {(m.tags || []).map((t) => (
                    <span key={t} className={"fuel-tag on sm " + t}>{TAG_LABEL[t]}</span>
                  ))}
                </span>
                <button
                  className="iconbtn sm"
                  title="Remove meal"
                  onClick={() => removeMeal?.(m.id)}
                >
                  <Icon.Close width={12} height={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="fuel-add">
          <input
            className="input"
            placeholder='e.g. "chicken wrap and an apple"'
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
          <div className="fuel-tag-row" role="group" aria-label="What was in it?">
            {MEAL_TAGS.map((t) => (
              <button
                key={t}
                className={"fuel-tag" + (tags.includes(t) ? " on" : "") + " " + t}
                onClick={() => toggleTag(t)}
                aria-pressed={tags.includes(t)}
              >
                {TAG_LABEL[t]}
              </button>
            ))}
          </div>
          <button
            className="btn primary fuel-save"
            onClick={save}
            disabled={!name.trim()}
            style={{ opacity: name.trim() ? 1 : 0.5 }}
          >
            <Icon.Plus width={14} height={14} /> Log meal
          </button>
        </div>
      </div>

      {/* 7-day glance */}
      <div className="card">
        <div className="card-head">
          <div className="card-title"><Icon.Calendar /> This week</div>
        </div>
        <div className="fuel-week">
          {week.map((d) => (
            <div key={d.key} className={"fuel-day" + (d.key === today ? " today" : "")}>
              <span className="fuel-day-label">{d.label}</span>
              <span className="fuel-day-meals" title={`${d.meals} meals`}>
                {d.meals > 0 ? d.meals : "·"}
              </span>
              <span className="fuel-day-water" title={`${d.water} glasses`}>
                {d.water > 0 ? "💧" : ""}
              </span>
            </div>
          ))}
        </div>
        <p className="fuel-note">
          Meals logged and water per day. No calories, no scores — just a
          gentle record. For personal dietary needs, talk to a qualified
          professional.
        </p>
      </div>
    </div>
  );
}
