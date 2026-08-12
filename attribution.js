(function () {
  "use strict";

  var STORAGE_KEY = "sc_attribution_v1";
  var RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
  var TRACKING_KEYS = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "utm_id",
    "gclid",
    "gbraid",
    "wbraid",
    "msclkid",
    "campaignid",
    "adgroupid",
    "keyword",
    "matchtype",
    "device",
    "creative",
    "network"
  ];

  function safeParse(value) {
    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  }

  function readStore() {
    try {
      var stored = safeParse(window.localStorage.getItem(STORAGE_KEY));
      if (!stored || !stored.updatedAt || Date.now() - stored.updatedAt > RETENTION_MS) {
        window.localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return stored;
    } catch (error) {
      return null;
    }
  }

  function writeStore(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch (error) {
      /* Attribution should never interfere with the form if storage is blocked. */
    }
  }

  function cleanPageUrl() {
    return window.location.origin + window.location.pathname;
  }

  function trackingParams() {
    var params = new URLSearchParams(window.location.search);
    var values = {};

    TRACKING_KEYS.forEach(function (key) {
      var value = params.get(key);
      if (value) values[key] = value.slice(0, 500);
    });

    return values;
  }

  function externalReferrer() {
    if (!document.referrer) return "";
    try {
      var referrer = new URL(document.referrer);
      return referrer.hostname === window.location.hostname ? "" : referrer.href.slice(0, 1000);
    } catch (error) {
      return "";
    }
  }

  function inferredChannel(referrer) {
    if (!referrer) return { source: "direct", medium: "none" };

    try {
      var hostname = new URL(referrer).hostname.replace(/^www\./, "");
      var searchEngines = ["google.", "bing.com", "yahoo.", "duckduckgo.com"];
      var isOrganic = searchEngines.some(function (domain) {
        return hostname.indexOf(domain) !== -1;
      });
      return { source: hostname, medium: isOrganic ? "organic" : "referral" };
    } catch (error) {
      return { source: "unknown", medium: "referral" };
    }
  }

  function buildTouch(params, referrer) {
    var inferred = inferredChannel(referrer);
    return {
      captured_at: new Date().toISOString(),
      landing_page: cleanPageUrl(),
      referrer: referrer,
      source: params.utm_source || inferred.source,
      medium: params.utm_medium || inferred.medium,
      campaign: params.utm_campaign || "",
      term: params.utm_term || params.keyword || "",
      content: params.utm_content || "",
      ids: params
    };
  }

  function hasCampaignSignal(params, referrer) {
    return Object.keys(params).length > 0 || Boolean(referrer);
  }

  function captureAttribution() {
    var params = trackingParams();
    var referrer = externalReferrer();
    var stored = readStore();
    var touch = buildTouch(params, referrer);

    if (!stored) {
      stored = {
        first: touch,
        last: touch,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
    } else {
      /* Keep the last meaningful marketing touch instead of replacing it with direct traffic. */
      if (hasCampaignSignal(params, referrer)) stored.last = touch;
      stored.updatedAt = Date.now();
    }

    writeStore(stored);
    return stored;
  }

  function addHidden(form, name, value) {
    if (value === undefined || value === null || value === "") return;

    var input = form.querySelector('input[name="' + name + '"]');
    if (!input) {
      input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.setAttribute("data-attribution-field", "true");
      form.appendChild(input);
    }
    input.value = String(value);
  }

  function fillForm(form, attribution) {
    var first = attribution.first || {};
    var last = attribution.last || {};
    var firstIds = first.ids || {};
    var lastIds = last.ids || {};

    addHidden(form, "attribution_first_landing_page", first.landing_page);
    addHidden(form, "attribution_form_page", cleanPageUrl());
    addHidden(form, "attribution_first_captured_at", first.captured_at);
    addHidden(form, "attribution_first_source", first.source);
    addHidden(form, "attribution_first_medium", first.medium);
    addHidden(form, "attribution_first_campaign", first.campaign);
    addHidden(form, "attribution_first_term", first.term);
    addHidden(form, "attribution_first_content", first.content);
    addHidden(form, "attribution_first_referrer", first.referrer);

    addHidden(form, "attribution_last_landing_page", last.landing_page);
    addHidden(form, "attribution_last_captured_at", last.captured_at);
    addHidden(form, "attribution_last_source", last.source);
    addHidden(form, "attribution_last_medium", last.medium);
    addHidden(form, "attribution_last_campaign", last.campaign);
    addHidden(form, "attribution_last_term", last.term);
    addHidden(form, "attribution_last_content", last.content);
    addHidden(form, "attribution_last_referrer", last.referrer);

    ["gclid", "gbraid", "wbraid", "msclkid", "utm_id", "campaignid", "adgroupid", "matchtype", "device", "creative", "network"].forEach(function (key) {
      addHidden(form, "attribution_first_" + key, firstIds[key]);
      addHidden(form, "attribution_last_" + key, lastIds[key]);
    });
  }

  function initialize() {
    var attribution = captureAttribution();
    var forms = document.querySelectorAll('form[action*="formspree.io"]');

    forms.forEach(function (form) {
      fillForm(form, attribution);
      form.addEventListener("submit", function () {
        fillForm(form, readStore() || attribution);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
