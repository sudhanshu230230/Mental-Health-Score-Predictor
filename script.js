/* =========================================================
   Student Mental Health Score Predictor: frontend logic
   Sections: 1) Config  2) API  3) UI  4) App wiring
   ========================================================= */

/* ---------- 1) Config (edit these to match your backend) ---------- */
const CONFIG = {
  API_BASE_URL: "http://127.0.0.1:8000",
  PREDICT_ENDPOINT: "/predict", // change to match your FastAPI route
  REQUEST_TIMEOUT_MS: 10000,

  MAX_SCORE: 10,
  // Checked top to bottom; adjust to how your target is defined.
  SCORE_BANDS: [
    { min: 7, label: "Good", tone: "good", note: "Indicates a healthy mental well-being profile." },
    { min: 5, label: "Moderate", tone: "warn", note: "Some risk factors may be worth keeping an eye on." },
    { min: 0, label: "Needs attention", tone: "bad", note: "Consider support and healthier daily habits." },
  ],

  // Dropdown values (taken from the trained pipeline in rf_best.pkl)
  OPTIONS: {
    Gender: ["Female", "Male"],
    Academic_Level: ["High School", "Undergraduate", "Graduate"],
    Most_Used_Platform: [
      "Facebook", "Instagram", "KakaoTalk", "LINE", "LinkedIn", "Snapchat",
      "TikTok", "Twitter", "VKontakte", "WeChat", "WhatsApp", "YouTube",
    ],
    Purpose_Of_Use: ["Education", "Entertainment", "Networking", "News"],
    Grouped_Country: [
      "Australia", "Canada", "France", "Germany", "India",
      "Mexico", "Turkey", "UK", "USA", "Other",
    ],
    Stress_Level: ["Low", "Medium", "High", "Very High"],
  },

  // Form field name -> field name your FastAPI schema expects.
  // Note: "physcial_activity_hours" is spelled exactly as in your backend.
  FIELD_MAP: {
    Age: "age",
    Gender: "gender",
    Grouped_Country: "country",
    Academic_Level: "academic_level",
    Most_Used_Platform: "most_used_platform",
    Purpose_Of_Use: "purpose_of_use",
    Avg_Daily_Usage_Hours: "avg_daily_usage_hours",
    Daily_Unlocks: "daily_unlocks",
    Study_Hours: "study_hours",
    Physical_Activity_Hours: "physcial_activity_hours",
    Sleep_Hours_Per_Night: "sleep_hours_per_night",
    Stress_Level: "stress_level",
  },

  // Sent to the API as numbers; all other fields are sent as strings.
  NUMERIC_FIELDS: [
    "Age", "Avg_Daily_Usage_Hours", "Daily_Unlocks",
    "Study_Hours", "Sleep_Hours_Per_Night", "Physical_Activity_Hours",
  ],
};

/* ---------- 2) API ---------- */
const Api = {
  /** Turns FastAPI error shapes (string or 422 validation list) into readable text. */
  formatError(data, status) {
    const detail = data && data.detail;
    if (Array.isArray(detail)) {
      return detail.map((d) => `${(d.loc || []).slice(1).join(".")}: ${d.msg}`).join("; ");
    }
    return typeof detail === "string" ? detail : `Request failed (HTTP ${status}).`;
  },

  /** Pulls the numeric score out of whatever shape the backend returns. */
  extractScore(data) {
    if (typeof data === "number") return data;
    if (Array.isArray(data)) return Api.extractScore(data[0]);
    if (data && typeof data === "object") {
      const keys = ["prediction", "predicted_score", "mental_health_score", "score", "result"];
      for (const key of keys) if (key in data) return Api.extractScore(data[key]);
      const firstNumber = Object.values(data).find((v) => typeof v === "number");
      if (firstNumber !== undefined) return firstNumber;
    }
    throw new Error("Unexpected response format from the API.");
  },

  async predict(payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(CONFIG.API_BASE_URL + CONFIG.PREDICT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(Api.formatError(data, res.status));
      return Api.extractScore(data);
    } catch (err) {
      if (err.name === "AbortError") throw new Error("The request timed out. Is the server running?");
      if (err instanceof TypeError) {
        throw new Error("Cannot reach the API. Check that FastAPI is running and CORS is enabled.");
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  },

  /** True if the server answers at all (opaque response is fine, so CORS can't block this check). */
  async isOnline() {
    try {
      await fetch(CONFIG.API_BASE_URL + "/docs", { mode: "no-cors" });
      return true;
    } catch {
      return false;
    }
  },
};

/* ---------- 3) UI ---------- */
const UI = {
  $: (selector) => document.querySelector(selector),

  populateSelects() {
    for (const [name, values] of Object.entries(CONFIG.OPTIONS)) {
      const select = document.querySelector(`select[name="${name}"]`);
      if (!select) continue;
      select.innerHTML =
        `<option value="" disabled selected>Select…</option>` +
        values.map((v) => `<option value="${v}">${v}</option>`).join("");
    }
  },

  setLoading(isLoading) {
    const btn = UI.$("#submit-btn");
    btn.disabled = isLoading;
    btn.textContent = isLoading ? "Predicting…" : "Predict score";
  },

  showError(message) {
    const box = UI.$("#error");
    box.textContent = message;
    box.hidden = !message;
  },

  showResult(score) {
    const clamped = Math.min(Math.max(score, 0), CONFIG.MAX_SCORE);
    const band = CONFIG.SCORE_BANDS.find((b) => clamped >= b.min);
    const percent = (clamped / CONFIG.MAX_SCORE) * 100;

    const panel = UI.$("#result");
    panel.innerHTML = `
      <div class="tone-${band.tone}">
        <p class="score-label">Predicted score</p>
        <p class="score-value">${score.toFixed(2)}<span class="score-max"> / ${CONFIG.MAX_SCORE}</span></p>
        <div class="meter"><div class="meter-fill"></div></div>
        <span class="badge">${band.label}</span>
        <p class="result-note">${band.note}</p>
      </div>`;
    // Set the width on the next frame so the CSS transition animates.
    requestAnimationFrame(() => {
      panel.querySelector(".meter-fill").style.width = `${percent}%`;
    });
  },

  resetResult() {
    UI.$("#result").innerHTML =
      `<div class="placeholder"><p>Your prediction will appear here.</p></div>`;
    UI.showError("");
  },

  setApiStatus(online) {
    const el = UI.$("#api-status");
    el.className = `status ${online ? "online" : "offline"}`;
    el.textContent = online
      ? `Connected to ${CONFIG.API_BASE_URL}`
      : `API offline (${CONFIG.API_BASE_URL})`;
  },
};

/* ---------- 4) App wiring ---------- */
(() => {
  const form = document.querySelector("#predict-form");

  function buildPayload() {
    const payload = {};
    for (const [key, value] of new FormData(form).entries()) {
      const apiKey = CONFIG.FIELD_MAP[key] || key;
      payload[apiKey] = CONFIG.NUMERIC_FIELDS.includes(key) ? Number(value) : value;
    }
    return payload;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    UI.showError("");

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    UI.setLoading(true);
    try {
      UI.showResult(await Api.predict(buildPayload()));
    } catch (err) {
      UI.showError(err.message);
    } finally {
      UI.setLoading(false);
    }
  });

  form.addEventListener("reset", UI.resetResult);

  UI.populateSelects();
  Api.isOnline().then(UI.setApiStatus);
})();