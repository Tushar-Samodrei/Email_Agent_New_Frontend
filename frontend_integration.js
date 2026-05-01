const API_BASE_URL =
  window.API_BASE_URL ||
  window.API_BASE ||
  (window.env && window.env.API_BASE_URL); // fallback relative path if same origin

// current logged-in user (saved by login.html)
// helper (near top of file) — ensure this exists once
const currentUser = (() => {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
})();
function authHeaders(extra = {}) {
  const h = { Accept: "application/json", ...extra };
  if (currentUser && currentUser.id)
    h["Authorization"] = `Bearer ${currentUser.id}`;
  return h;
}

function getFriendlyUserError(err) {
  let msg = "An unexpected error occurred. Please try again.";

  if (!err) {
    return msg;
  }
  if (typeof err === "string") {
    msg = err;
  } else if (err instanceof Error && err.message) {
    msg = err.message;
  } else if (typeof err === "object") {
    if (err.detail) msg = err.detail;
    else if (err.message) msg = err.message;
    else msg = JSON.stringify(err);
  }

  if (msg.includes("Please select a RAG Collection or provide Custom Content")) {
    return "⚠️ Please select a RAG document (collection) or provide Custom Content before generating.";
  }
  if (msg.includes("Please select at least one Target Specialty")) {
    return "⚠️ Please select at least one Target Specialty.";
  }
  if (msg.includes("Please enter a Product/Drug Name")) {
    return "⚠️ Please enter a Product/Drug Name.";
  }
  if (msg.includes("Please select a Campaign Tone")) {
    return "⚠️ Please select a Campaign Tone.";
  }
  if (msg.includes("Please select your Target Specialty")) {
    return "⚠️ Please select your Target Specialty.";
  }
  if (msg.includes("Please provide instructions for the AI")) {
    return "⚠️ Please provide instructions for AI mode before generating.";
  }
  if (msg.includes("No RAG content found")) {
    return "⚠️ No relevant RAG content found for the chosen collection/drug. Please try another RAG file or drug name.";
  }
  if (msg.includes("RAG content mode requires")) {
    return "⚠️ RAG content mode requires selecting a valid RAG document/collection before generating.";
  }
  if (msg.includes("News mode requires")) {
    return "⚠️ News mode requires a valid news RAG configuration or category selections.";
  }
  if (msg.includes("Not authenticated")) {
    return "⚠️ You are not logged in. Please log in again to continue.";
  }

  return msg;
}

/**
 * Generic function to save a draft to the backend.
 * @param {object} payload - The draft object (subject, html_body, metadata, etc.)
 * @param {HTMLElement} buttonEl - The button that was clicked, for spinner.
 */
async function saveDraftToAPI(payload, buttonEl) {
  if (!currentUser || !currentUser.id) {
    showNotification("Please log in to save a draft.", "error");
    return;
  }

  if (!payload.subject || !payload.html_body) {
    showNotification(
      "Please generate content (subject and body) before saving.",
      "error",
    );
    return;
  }

  const originalBtnHTML = buttonEl ? buttonEl.innerHTML : "";
  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.innerHTML =
      '<div class="loading-spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;margin-right:5px;vertical-align:middle;"></div> Saving...';
  }

  try {
    const res = await fetch(`${API_BASE_URL}/drafts`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "Failed to save draft.");
    }

    const data = await res.json();
    showNotification(`Draft saved successfully (ID: ${data.id})!`, "success");
  } catch (err) {
    console.error("saveDraftToAPI error:", err);
    showNotification(`Save failed: ${err.message}`, "error");
  } finally {
    if (buttonEl) {
      buttonEl.disabled = false;
      buttonEl.innerHTML = originalBtnHTML;
    }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadRagFiles();
  if (typeof loadWellnessDropdowns === "function") {
    loadWellnessDropdowns();
  }

  // toggle visibility between news/content options (healthcare)
  const healthcareRagDocGroup = document.getElementById(
    "healthcare-rag-doc-group",
  );
  const updateHealthcareRagModeUI = () => {
    const value =
      document.querySelector('input[name="rag_usage"]:checked')?.value ||
      "content";

    const contentOptions = document.getElementById("content-options");
    const newsOptions = document.getElementById("news-options");
    const targetSpecialtyGroup = document.getElementById("target-specialty-group");
    const addSpecialtyGroup = document.getElementById("add-specialty-group");

    if (contentOptions)
      contentOptions.style.display = value === "content" ? "block" : "none";
    if (newsOptions)
      newsOptions.style.display = value === "news" ? "block" : "none";
    
    // Initialize news blocks when news mode is selected
    if (value === "news") {
      initializeNewsBlocks();
    }
    // Target Specialty and Add Specialty are only relevant for Content/RAG mode
    if (targetSpecialtyGroup)
      targetSpecialtyGroup.style.display = value === "news" ? "none" : "block";
    if (addSpecialtyGroup)
      addSpecialtyGroup.style.display = value === "news" ? "none" : "block";

    // User requirement: in News mode, RAG document selection is not needed
    if (healthcareRagDocGroup) {
      healthcareRagDocGroup.style.display = value === "news" ? "none" : "block";
    }

    // Geography filter is only needed for News mode (not content/AI RAG)
    const geographyGroup = document.getElementById("target-geography-group");
    if (geographyGroup) {
      geographyGroup.style.display = value === "news" ? "block" : "none";
    }
  };

  document.querySelectorAll('input[name="rag_usage"]').forEach((r) => {
    r.addEventListener("change", updateHealthcareRagModeUI);
  });

  // initialize once on load
  updateHealthcareRagModeUI();
});

async function loadRagFiles() {
  const select = document.getElementById("rag-file-select");
  if (!select) return;
  select.innerHTML = "<option>Loading RAG collections...</option>";
  select.disabled = true;

  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    if (!user || !user.id) {
      select.innerHTML = "<option value=''>Please log in first</option>";
      return;
    }

    // ✅ RAG metadata API — grouped by collection
    const RAG_META_BASE =
      window.RAG_META_BASE || (window.env && window.env.RAG_META_BASE);
    const res = await fetch(`${RAG_META_BASE}/rag-documents`, {
      headers: {
        Authorization: `Bearer ${user.id}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();

    // ✅ Extract only collection names (unique)
    const collections = Array.isArray(data)
      ? data.map((group) => group.collection_name)
      : [];

    if (!collections.length) {
      select.innerHTML = "<option value=''>No RAG collections found</option>";
      return;
    }

    // ✅ Populate dropdown with only collection names
    select.innerHTML = "<option value=''>-- Select RAG Collection --</option>";
    collections.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Failed to load RAG collections:", err);
    select.innerHTML =
      "<option value=''>Failed to load RAG collections</option>";
  } finally {
    select.disabled = false;
  }
}

// Canonical element IDs used across AI screen and schedule flow
const CANONICAL_HTML_ID = "ai-email-preview"; // canonical preview container (dash)
const CANONICAL_SUBJECT_ID = "subject-line-content"; // canonical subject container

// --- helper: safely convert template-select value to a request-friendly template_id ---
// Returns a Number if the value is all digits, otherwise returns the original string.
// Returns null if no value provided.
function resolveTemplateId(value) {
  if (value == null) return null;
  const v = String(value).trim();
  if (!v) return null;
  // if purely digits, send number
  if (/^\d+$/.test(v)) return parseInt(v, 10);
  // otherwise send raw string (UUID/slug)
  return v;
}

// --- helper: safely read selected template value from greenery's template-select ---
// tries .value first, then selected option's data-meta JSON (if present)
function getSelectedTemplateRawValue() {
  const sel = document.getElementById("template-select");
  if (!sel) return null;
  // prefer value if present
  if (sel.value && sel.value.trim() !== "") return sel.value.trim();

  // fallback: try dataset.meta on selected option (greenery sets opt.dataset.meta = JSON.stringify(t))
  try {
    const opt = sel.options[sel.selectedIndex];
    if (opt && opt.dataset && opt.dataset.meta) {
      const meta = JSON.parse(opt.dataset.meta);
      // prefer canonical ids if present
      return meta.id ?? meta.template_id ?? meta.name ?? null;
    }
  } catch (e) {
    console.warn("Could not parse template-select option meta:", e);
  }
  return null;
}

// --- helper: safely convert template-select value to a request-friendly template_id ---
// Returns a Number if the value is all digits, otherwise returns the original string.
// Returns null if no value provided.
// function resolveTemplateId(value) {
//   if (value == null) return null;
//   const v = String(value).trim();
//   if (!v) return null;
//   // if purely digits, send number
//   if (/^\d+$/.test(v)) return parseInt(v, 10);
//   // otherwise send raw string (UUID/slug)
//   return v;
// }

// Replace loadTemplates with this:
// async function loadTemplates() {
//   const select = document.getElementById("template-select");
//   if (!select) return;
//   try {
//     select.disabled = true;
//     select.innerHTML = '<option value="">Loading templates...</option>';

//     if (!currentUser || !currentUser.id) {
//       console.warn("No logged-in user found in localStorage");
//       select.innerHTML =
//         '<option value="">Please log in to see your templates</option>';
//       return;
//     }

//     const res = await fetch(`${API_BASE_URL}/templates`, {
//       headers: authHeaders({ "Content-Type": "application/json" }),
//       // you can also add credentials: "include" if you later switch to cookies
//     });

//     if (!res.ok) {
//       // log full response for debugging
//       const txt = await res.text().catch(() => "<no body>");
//       console.warn("GET /api/templates failed", res.status, txt);
//       if (res.status === 401 || res.status === 403) {
//         select.innerHTML =
//           '<option value="">Unauthorized. Please login again.</option>';
//       } else {
//         select.innerHTML = '<option value="">Failed to load templates</option>';
//       }
//       return;
//     }

//     const data = await res.json().catch(() => ({}));
//     const templates = Array.isArray(data) ? data : data.templates || [];
//     select.innerHTML = '<option value="">-- Select Template --</option>';
//     templates.forEach((t) => {
//       const opt = document.createElement("option");
//       opt.value = t.id;
//       opt.textContent = t.name + (t.is_default ? " (default)" : "");
//       select.appendChild(opt);
//     });

//     // auto-select default if provided
//     const defaultTpl = templates.find((x) => x.is_default);
//     if (defaultTpl) select.value = defaultTpl.id;
//   } catch (err) {
//     console.error("Failed to load templates:", err);
//     select.innerHTML = '<option value="">Failed to load templates</option>';
//   } finally {
//     select.disabled = false;
//   }
// }

async function loadDropdowns() {
  try {
    // Load Campaign Objectives
    // const objRes = await fetch(`${API_BASE_URL}/campaign-objectives`);
    // const objectives = await objRes.json();
    // const objectiveSelect = document.querySelector("#objective-select");
    // objectiveSelect.innerHTML = "";
    // objectives.forEach((obj) => {
    //   const opt = document.createElement("option");
    //   opt.value = obj.id;
    //   opt.textContent = obj.name;
    //   objectiveSelect.appendChild(opt);
    // });

    // Load Specialties (Healthcare)
    const specialtySelect = document.querySelector("#specialty-select");
    specialtySelect.innerHTML = "";

    try {
      const specRes = await fetch(`${API_BASE_URL}/specialties`);
      const systemSpecialties = await specRes.json();

      systemSpecialties.forEach((spec) => {
        const opt = document.createElement("option");
        opt.value = spec.id;
        opt.textContent = spec.name;
        specialtySelect.appendChild(opt);
      });
    } catch (e) {
      console.error("Failed to load healthcare specialties", e);
    }

    // Load Geographies
    const geoSelect = document.querySelector("#geography-select");
    if (geoSelect) {
      geoSelect.innerHTML = "";
      try {
        const geoRes = await fetch(`${API_BASE_URL}/geographies`);
        const geographies = await geoRes.json();
        geographies.forEach((geo) => {
          const opt = document.createElement("option");
          opt.value = geo.id;
          opt.textContent = `${geo.name} (${geo.country_code.toUpperCase()})`;
          geoSelect.appendChild(opt);
        });
      } catch (e) {
        console.error("Failed to load geographies", e);
      }
    }

    // Load Tones
    const toneRes = await fetch(`${API_BASE_URL}/tones`);
    const tones = await toneRes.json();
    const toneSelect = document.querySelector("#tone-select");
    toneSelect.innerHTML = "";
    tones.forEach((tone) => {
      const opt = document.createElement("option");
      opt.value = tone.id;
      opt.textContent = tone.name;
      toneSelect.appendChild(opt);
    });

    // Load News Categories
    await loadNewsCategories();
  } catch (err) {
    console.error("Error loading dropdowns:", err);
  }
}

// ---------------------- News Categories & Subcategories ----------------------
// Cache of categories with their subcategories
let _newsCategoriesCache = [];
let _newsCategoryBlocks = []; // Array to track dynamic blocks

async function loadNewsCategories() {
  try {
    const res = await fetch(`${API_BASE_URL}/news-categories`, {
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error("Failed to load news categories");
    const data = await res.json();
    _newsCategoriesCache = Array.isArray(data) ? data : (data.categories || []);
  } catch (e) {
    console.error("Failed to load news categories", e);
  }
}

function createNewsCategoryBlock(blockIndex = 0) {
  const block = document.createElement("div");
  block.className = "news-category-block";
  block.dataset.index = blockIndex;
  block.style.cssText = "border: 1px solid #ddd; padding: 10px; margin-bottom: 10px; border-radius: 5px; background: #f9f9f9;";

  block.innerHTML = `
    <div style="display: flex; align-items: center; margin-bottom: 8px;">
      <strong>Category ${blockIndex + 1}</strong>
      <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeNewsCategoryBlock(${blockIndex})" style="margin-left: auto;">
        🗑️ Remove
      </button>
    </div>
    <div style="margin-bottom: 8px;">
      <label style="display: block; font-weight: normal;">News Category:</label>
      <select class="form-control news-category-select" onchange="onNewsCategoryBlockChange(${blockIndex})">
        <option value="">-- Select Category --</option>
        ${_newsCategoriesCache.map(cat => `<option value="${cat.api_value}" data-category-id="${cat.id}">${cat.name}</option>`).join('')}
      </select>
    </div>
    <div style="margin-bottom: 8px;">
      <label style="display: block; font-weight: normal;">Subcategory (optional):</label>
      <select class="form-control news-subcategory-select">
        <option value="">-- Auto-select diverse subcategories --</option>
      </select>
    </div>
    <div>
      <label style="display: block; font-weight: normal;">Number of Articles:</label>
      <input type="number" class="form-control news-limit-input" placeholder="e.g., 3" min="1" max="10" value="3" />
    </div>
  `;

  return block;
}

function addNewsCategoryBlock() {
  const container = document.getElementById("news-categories-container");
  if (!container) return;

  const blockIndex = _newsCategoryBlocks.length;
  const block = createNewsCategoryBlock(blockIndex);
  container.appendChild(block);
  _newsCategoryBlocks.push({ index: blockIndex, element: block });
}

function removeNewsCategoryBlock(blockIndex) {
  const container = document.getElementById("news-categories-container");
  if (!container) return;

  const blockElement = container.querySelector(`[data-index="${blockIndex}"]`);
  if (blockElement) {
    container.removeChild(blockElement);
    _newsCategoryBlocks = _newsCategoryBlocks.filter(b => b.index !== blockIndex);
    // Re-index remaining blocks
    _newsCategoryBlocks.forEach((block, idx) => {
      block.index = idx;
      block.element.dataset.index = idx;
      block.element.querySelector('strong').textContent = `Category ${idx + 1}`;
      block.element.querySelector('.news-category-select').onchange = () => onNewsCategoryBlockChange(idx);
      block.element.querySelector('button').onclick = () => removeNewsCategoryBlock(idx);
    });
  }
}

function onNewsCategoryBlockChange(blockIndex) {
  const block = _newsCategoryBlocks.find(b => b.index === blockIndex);
  if (!block) return;

  const catSelect = block.element.querySelector('.news-category-select');
  const subSelect = block.element.querySelector('.news-subcategory-select');

  if (!catSelect || !subSelect) return;

  const selectedApiValue = catSelect.value;
  subSelect.innerHTML = '<option value="">-- Auto-select diverse subcategories --</option>';

  if (!selectedApiValue) return;

  const category = _newsCategoriesCache.find(c => c.api_value === selectedApiValue);
  if (category && category.subcategories) {
    category.subcategories.forEach(sub => {
      const opt = document.createElement("option");
      opt.value = sub.name;
      opt.textContent = sub.name;
      subSelect.appendChild(opt);
    });
  }
}

// Initialize with one block when news mode is selected
function initializeNewsBlocks() {
  const container = document.getElementById("news-categories-container");
  if (!container) return;

  // Clear existing blocks
  container.innerHTML = "";
  _newsCategoryBlocks = [];

  // Add first block
  addNewsCategoryBlock();
}

function onNewsCategoryChange() {
  // Legacy function - kept for backward compatibility
  // The new dynamic blocks handle their own changes
}

// ---------------------- load Mailchimp Audiences ----------------------
async function loadAudiences() {
  const audienceSelect = document.querySelector("#audience-select");
  if (!audienceSelect) return;

  try {
    audienceSelect.innerHTML = '<option value="">Loading...</option>';
    const res = await fetch(`${API_BASE_URL}/providers/mailchimp/audiences`);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();

    audienceSelect.innerHTML =
      '<option value="">-- Select Audience / List --</option>';
    (data.audiences || []).forEach((aud) => {
      const opt = document.createElement("option");
      opt.value = aud.id;
      opt.textContent = `${aud.name} (${aud.member_count || 0})`;
      audienceSelect.appendChild(opt);
    });
  } catch (err) {
    console.error("Error loading Mailchimp audiences:", err);
    audienceSelect.innerHTML =
      '<option value="">Failed to load audiences</option>';
  }
}
async function generateFollowUpEmail() {
  const drugName = document.querySelector("#drug-input").value.trim();
  const toneSelect = document.querySelector("#tone-select");
  const tone = toneSelect.options[toneSelect.selectedIndex]?.text || "";
  const specialtySelect = document.querySelector("#specialty-select");
  const specialty = specialtySelect.selectedOptions[0]?.text || "";
  // canonical elements
  const canonicalPreview = document.getElementById(CANONICAL_HTML_ID);
  const canonicalSubject = document.getElementById(CANONICAL_SUBJECT_ID);
  // visible UI bits (if present)
  const subjectLineDisplay = document.getElementById("subject-line-display");
  const visiblePreview = document.getElementById("ai-email-preview"); // optional visible panel
  const visibleSubject = document.getElementById("ai_subject_preview_text");

  const selectedTemplateRaw = getSelectedTemplateRawValue();
  const template_id = resolveTemplateId(selectedTemplateRaw);
  const savedSignature = JSON.parse(
    localStorage.getItem("userSignature") || "{}",
  );

  // fallback to default template id
  const defaultTemplateSelect = document.getElementById("template-select");
  let finalTemplateId = template_id;
  if (
    !finalTemplateId &&
    defaultTemplateSelect &&
    defaultTemplateSelect.value
  ) {
    finalTemplateId = resolveTemplateId(defaultTemplateSelect.value);
  }

  const currentDoctor = window.currentDoctor || null;

  // Ensure canonical preview exists
  let previewEl = canonicalPreview;
  if (!previewEl) {
    previewEl = document.createElement("div");
    previewEl.id = CANONICAL_HTML_ID;
    previewEl.style.display = "none";
    document.body.appendChild(previewEl);
  }

  previewEl.innerHTML =
    '<div class="loading-spinner"></div> Generating follow-up...';
  if (subjectLineDisplay) subjectLineDisplay.style.display = "none";

  const requestBody = {
    drug_name: drugName,
    tone: tone,
    category: specialty,
    doctor_name: currentDoctor ? currentDoctor.Doctor_Name || "" : "",
    npi: currentDoctor ? currentDoctor.NPI || "" : "",
    template_id: finalTemplateId,
    sender_name: savedSignature.name || "",
    sender_title: savedSignature.title || "",
    sender_contact: savedSignature.contact || "",
  };

  try {
    const res = await fetch(`${API_BASE_URL}/generate-followup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    
    // Read response body only once
    const responseText = await res.text();
    let data;
    
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      // If not JSON, treat as plain text error
      if (!res.ok) {
        throw new Error(responseText || "Unable to generate content at the moment. Please try again.");
      }
      data = { email_html: responseText, subject_line: "(Generated content)" };
    }
    
    if (!res.ok) {
      const errorMsg = data.detail || data.message || responseText || "Unable to generate content at the moment. Please try again.";
      throw new Error(errorMsg);
    }

    // write canonical HTML + subject
    const html = data.email_html || "<em>No content returned</em>";
    const subj = data.subject_line || "(No subject)";

    previewEl.innerHTML = html;
    previewEl.dataset.rawHtml = html; // <-- ADD THIS

    let subjEl = canonicalSubject;
    if (!subjEl) {
      subjEl = document.createElement("div");
      subjEl.id = CANONICAL_SUBJECT_ID;
      subjEl.style.display = "none";
      document.body.appendChild(subjEl);
    }
    subjEl.textContent = subj;
    subjEl.dataset.rawSubject = subj; // <-- ADD THIS

    // update visible UI if present
    if (visiblePreview) {
      visiblePreview.innerHTML = html;
      visiblePreview.dataset.rawHtml = html; // <-- ADD THIS
    }
    if (visibleSubject) {
      visibleSubject.textContent = subj;
      visibleSubject.dataset.rawSubject = subj; // <-- ADD THIS
    }
    if (subjectLineDisplay) subjectLineDisplay.style.display = "block";
  } catch (err) {
    const friendly = getFriendlyUserError(err);
    previewEl.innerHTML = `<span style="color:red;">Failed to generate follow-up. ${friendly}</span>`;
    if (subjectLineDisplay) subjectLineDisplay.style.display = "none";
  }
}

// ---------------------- load Mailjet Audiences ----------------------
async function loadMailjetAudiences() {
  const select = document.querySelector("#mailjet-list-select");
  if (!select) return;
  try {
    select.innerHTML = "<option>Loading...</option>";
    const res = await fetch(`${API_BASE_URL}/providers/mailjet/audiences`);
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    select.innerHTML = "<option value=''>-- Select Mailjet List --</option>";
    (data.audiences || []).forEach((lst) => {
      const opt = document.createElement("option");
      opt.value = lst.id;
      opt.textContent = `${lst.name} (${lst.subscriber_count || 0})`;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Error loading Mailjet audiences:", err);
    select.innerHTML = "<option value=''>Failed to load Mailjet lists</option>";
  }
}

async function submitCampaign() {
  const objectiveId = document.querySelector("#objective-select").value;
  const toneId = document.querySelector("#tone-select").value;
  const drugName = document.querySelector("#drug-input").value;
  const specialtySelect = document.querySelector("#specialty-select");
  const specialties = Array.from(specialtySelect.selectedOptions).map((opt) =>
    parseInt(opt.value),
  );

  const payload = {
    objective_id: parseInt(objectiveId),
    tone_id: parseInt(toneId),
    drug_name: drugName,
    specialties: specialties,
  };

  try {
    const res = await fetch(`${API_BASE_URL}/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    let errorMessage = "Failed to create campaign.";
    if (!res.ok) {
      try {
        errorMessage = await res.text();
      } catch (e) {
        errorMessage = `HTTP ${res.status}: ${res.statusText}`;
      }
      throw new Error(errorMessage);
    }
    const data = await res.json();
    alert("Campaign created with ID: " + data.id);
  } catch (err) {
    console.error("Error creating campaign:", err);
    alert("Failed to create campaign. Check console.");
  }
}
// for Campaign Builder screen
/**
 * Main "Generate" button click handler.
 * This function now acts as a router. It checks which workflow is active
 * ("healthcare" or "wellness") and calls the real handler function
 * with the correct set of element IDs.
 */
async function generateEmailWithAI() {
  const wellnessRadio = document.getElementById("campaign-type-wellness");
  const promptRadio = document.getElementById("campaign-type-prompt");
  let workflowIds;

  if (promptRadio && promptRadio.checked) {
    // --- PROMPT MODE WORKFLOW is active ---
    workflowIds = {
      campaignType: "prompt",
      isPromptMode: true,
      promptInput: "prompt-mode-input",
      toneSelect: "prompt-mode-tone-select",
      templateSelect: "prompt-mode-template-select",
      collectionsSelect: "prompt-mode-collections",
      contentWordCount: "prompt-mode-word-count",
      contentFormatName: "prompt_mode_content_format",
      // Fields not used in prompt mode but kept for compatibility
      productInput: null,
      specialtySelect: null,
      specialtyType: null,
      npiInput: null,
      ragUsageName: null,
      ragFileSelect: null,
      newsLimit: null,
      aiInstructions: null,
      customSubject: null,
      customContent: null,
    };
  } else if (wellnessRadio && wellnessRadio.checked) {
    // --- WELLNESS WORKFLOW is active ---
    workflowIds = {
      campaignType: "wellness",
      productInput: "wellness-product-input",
      toneSelect: "wellness-tone-select",
      specialtySelect: "wellness-specialty-select", // This is the <select>
      specialtyType: "custom", // Flag to tell handler to read <select> value
      npiInput: null, // No NPI in wellness
      templateSelect: "wellness-template-select",
      ragUsageName: "wellness_rag_usage",
      ragFileSelect: "wellness-rag-file-select",
      contentWordCount: "wellness-content-word-count",
      contentFormatName: "wellness_content_format",
      newsLimit: "wellness-news-limit",
      aiInstructions: "wellness-ai-instructions", // New field for "Use AI"
      customSubject: "wellness-custom-subject",
      customContent: "wellness-custom-content",
    };
  } else {
    // --- HEALTHCARE WORKFLOW is active (default) ---
    workflowIds = {
      campaignType: "healthcare",
      productInput: "drug-input",
      toneSelect: "tone-select",
      specialtySelect: "specialty-select", // This is the <select multiple>
      specialtyType: "healthcare", // Flag to tell handler to read <select multiple>
      npiInput: "npi-input", // NPI is part of healthcare
      templateSelect: "template-select",
      ragUsageName: "rag_usage",
      ragFileSelect: "rag-file-select",
      contentWordCount: "content-word-count",
      contentFormatName: "content-format",
      newsLimit: "news-limit",
      aiInstructions: null, // "Use AI" mode is not in healthcare
      customSubject: "custom_subject_input",
      customContent: "custom_content_textarea",
    };
  }

  // Call the single, unified handler function with the correct IDs
  await _generateEmailHandler(workflowIds);
}

/**
 * THE REAL GENERATION LOGIC
 * This new handler function does all the work. It is called by generateEmailWithAI
 * and receives a map of element IDs to read from.
 */
async function _generateEmailHandler(ids) {
  const previewDiv = document.getElementById("ai-email-preview");
  const subjectLineDisplay = document.getElementById("subject-line-display");
  const subjectLineContent = document.getElementById("subject-line-content");

  // --- Spinner setup ---
  const generateBtn = document.getElementById("generate-email-btn");
  const originalBtnHTML = generateBtn ? generateBtn.innerHTML : "";
  if (generateBtn) {
    generateBtn.disabled = true;
    generateBtn.innerHTML =
      '<div class="loading-spinner" style="display:inline-block;width:14px;height:14px;border:2px solid #ccc;border-top:2px solid #333;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:6px;vertical-align:middle;"></div> Generating...';
  }

  try {
    // --- PROMPT MODE: separate flow ---
    if (ids.isPromptMode) {
      const userPrompt = document.getElementById(ids.promptInput)?.value.trim() || "";
      const toneId = parseInt(document.getElementById(ids.toneSelect)?.value) || null;
      const templateSelectEl = document.getElementById(ids.templateSelect);
      const selectedTemplateRaw = templateSelectEl ? templateSelectEl.value : null;
      const template_id = resolveTemplateId(selectedTemplateRaw);

      // Read RAG collections (supports checkbox list or multi-select)
      const collectionsEl = document.getElementById(ids.collectionsSelect);
      let collections = [];
      if (collectionsEl) {
        const checked = collectionsEl.querySelectorAll('input[type="checkbox"]:checked');
        if (checked && checked.length) {
          collections = Array.from(checked).map((cb) => cb.value);
        } else if ((collectionsEl.tagName || '').toLowerCase() === 'select') {
          collections = Array.from(collectionsEl.selectedOptions).map((opt) => opt.value);
        }
      }

      const contentWordCount = parseInt(
        document.getElementById(ids.contentWordCount)?.value || "200"
      );
      const contentFormat = document.querySelector(
        `input[name="${ids.contentFormatName}"]:checked`
      )?.value || "paragraph";

      // Prompt Mode: system instruction and specialty
      const systemInstruction = document.getElementById("prompt-mode-system-instruction")?.value || "";
      const specSel = document.getElementById("prompt-mode-specialty-select");
      const specOther = document.getElementById("prompt-mode-specialty-other");
      const promptSpecialty = specSel ? (specSel.value === "Other" ? (specOther?.value || "Other").trim() : specSel.value) : "General";
      // Predefined prompt name (for picking EMAIL_EXAMPLES few-shot)
      const promptNameSel = document.getElementById("prompt-mode-predefined-select");
      const promptName = promptNameSel ? (promptNameSel.value || null) : null;

      // Validation
      if (!userPrompt) {
        throw new Error("Please enter your prompt or query.");
      }
      if (!collections.length) {
        throw new Error("Please select at least one RAG collection.");
      }
      if (!toneId) {
        throw new Error("Please select a Campaign Tone.");
      }

      const requestBody = {
        campaign_type: "prompt",
        prompt_mode: true,
        user_prompt: userPrompt,
        collections: collections,
        tone_id: toneId,
        template_id: template_id,
        content_word_count: contentWordCount,
        content_format: contentFormat,
        system_instruction: systemInstruction,
        prompt_specialty: promptSpecialty,
        prompt_name: promptName,
        drug_name: "", // not used in prompt mode
        specialty_ids: [],
        rag_usage: "content", // backend treats prompt mode content via RAG
      };

      if (previewDiv)
        previewDiv.innerHTML =
          '<div style="padding:20px;text-align:center;color:#666;"><div class="loading-spinner" style="display:inline-block;width:20px;height:20px;border:2px solid #ccc;border-top:2px solid #333;border-radius:50%;animation:spin 1s linear infinite;margin-right:10px;vertical-align:middle;"></div> Generating content from prompt...</div>';
      if (subjectLineDisplay) subjectLineDisplay.style.display = "none";

      let data;
      try {
        const res = await fetch(`${API_BASE_URL}/generate-email`, {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(requestBody),
        });

        const responseText = await res.text();
        let responseData;
        try {
          responseData = JSON.parse(responseText);
        } catch (e) {
          responseData = { detail: responseText };
        }

        if (!res.ok) {
          const errorMsg = responseData.detail || responseData.message || responseText || "Unable to generate content at the moment. Please try again.";
          throw new Error(errorMsg);
        }
        data = responseData;
      } catch (networkErr) {
        console.error("API call error:", networkErr);
        throw networkErr;
      }

      // Render response (same as existing)
      if (!data || (!data.email_html && !data.subject_line)) {
        if (previewDiv) {
          previewDiv.innerHTML = `
            <div style="padding:20px;text-align:center;color:#666;border:1px solid #ddd;border-radius:8px;background:#f9f9f9;">
              <div style="font-size:16px;margin-bottom:10px;">📭 No Content Generated</div>
              <div>No relevant content found for the selected collections. Please try a different prompt or collection.</div>
            </div>`;
        }
        if (subjectLineDisplay) subjectLineDisplay.style.display = "none";
        if (generateBtn) { generateBtn.disabled = false; generateBtn.innerHTML = originalBtnHTML || "🤖 Generate Campaign with AI"; }
        return;
      }

      if (previewDiv) {
        const html = data.email_html || "<em>No content returned</em>";
        previewDiv.innerHTML = html;
        previewDiv.dataset.rawHtml = html;
      }
      const subj = data.subject_line || "(No subject)";
      if (subjectLineContent) {
        subjectLineContent.textContent = subj;
        subjectLineContent.dataset.rawSubject = subj;
      }
      if (subjectLineDisplay) subjectLineDisplay.style.display = "block";
      const variantBtns = document.getElementById("variant-buttons");
      if (variantBtns) variantBtns.style.display = "flex";

      if (generateBtn) { generateBtn.disabled = false; generateBtn.innerHTML = originalBtnHTML || "🤖 Generate Campaign with AI"; }
      return; // Early return — prompt mode done
    }

    // --- 1. Read common values using the provided IDs ---
    const drugName =
      document.getElementById(ids.productInput)?.value.trim() || "";
    const toneId =
      parseInt(document.getElementById(ids.toneSelect)?.value) || null;

    // --- 2. Read specialty based on workflow type ---
    let specialtyIds = [];
    let customSpecialtyName = null;

    if (ids.specialtyType === "healthcare") {
      const specialtySelect = document.getElementById(ids.specialtySelect);
      if (specialtySelect) {
        specialtyIds = Array.from(specialtySelect.selectedOptions).map((opt) =>
          parseInt(opt.value),
        );
      }
    } else {
      // For "wellness", we read the single selected value (which is a string name)
      const customSpecialtySelect = document.getElementById(
        ids.specialtySelect,
      );
      if (customSpecialtySelect) {
        customSpecialtyName = customSpecialtySelect.value || null;
      }
    }

    // --- 2b. Read geography selections ---
    let geographyIds = [];
    const geoSelect = document.getElementById("geography-select");
    if (geoSelect) {
      geographyIds = Array.from(geoSelect.selectedOptions).map((opt) =>
        parseInt(opt.value),
      );
    }

    // --- 3. Read NPI (only for healthcare) ---
    const currentDoctor =
      ids.npiInput && window.currentDoctor ? window.currentDoctor : null;

    // --- 4. Read Template ---
    const templateSelectEl = document.getElementById(ids.templateSelect);
    const selectedTemplateRaw = templateSelectEl
      ? templateSelectEl.value
      : null;
    const template_id = resolveTemplateId(selectedTemplateRaw);

    // --- 5. Read RAG/News/AI settings ---
    const ragUsage =
      document.querySelector(`input[name="${ids.ragUsageName}"]:checked`)
        ?.value || "content";
    const ragCollectionName =
      ragUsage === "news"
        ? null
        : document.getElementById(ids.ragFileSelect)?.value || null;

    const contentFormat =
      ragUsage === "content"
        ? document.querySelector(
            `input[name="${ids.contentFormatName}"]:checked`,
          )?.value || "paragraph"
        : null;

    const contentWordCount =
      ragUsage === "content"
        ? parseInt(
            document.getElementById(ids.contentWordCount)?.value || "150",
          )
        : null;

    const newsCount =
      ragUsage === "news"
        ? parseInt(document.getElementById(ids.newsLimit)?.value || "3")
        : 3;

    // --- Read news configurations for news mode ---
    let newsConfigs = null;
    if (ragUsage === "news") {
      newsConfigs = [];
      _newsCategoryBlocks.forEach(block => {
        const catSelect = block.element.querySelector('.news-category-select');
        const subSelect = block.element.querySelector('.news-subcategory-select');
        const limitInput = block.element.querySelector('.news-limit-input');

        if (catSelect && catSelect.value) {
          newsConfigs.push({
            category: catSelect.value,
            subcategory: subSelect && subSelect.value ? subSelect.value : null,
            limit: parseInt(limitInput ? limitInput.value : "3") || 3
          });
        }
      });

      // If no valid configs, add a default one
      if (newsConfigs.length === 0) {
        newsConfigs.push({
          category: "health",
          subcategory: null,
          limit: 3
        });
      }
    }

    // --- NEW: Read "Use AI" instructions ---
    const aiInstructions =
      ragUsage === "ai" && ids.aiInstructions
        ? document.getElementById(ids.aiInstructions)?.value || null
        : null;

    // --- 6. Read Manual Overrides ---
    const customSubject =
      document.getElementById(ids.customSubject)?.value || null;
    const customContent =
      document.getElementById(ids.customContent)?.value || null;

    // --- 7. Validation ---
    if (!drugName) {
      throw new Error("Please enter a Product/Drug Name.");
    }
    if (!toneId) {
      throw new Error("Please select a Campaign Tone.");
    }
    if (ids.specialtyType === "healthcare" && specialtyIds.length === 0 && ragUsage !== "news") {
      throw new Error("Please select at least one Target Specialty.");
    }
    if (ids.specialtyType === "custom" && !customSpecialtyName) {
      throw new Error("Please select your Target Specialty.");
    }
    if (ragUsage === "ai" && !aiInstructions) {
      throw new Error("Please provide instructions for the AI.");
    }
    if (ragUsage === "content" && !ragCollectionName && !customContent) {
      throw new Error(
        "Please select a RAG Collection or provide Custom Content for 'Content' mode.",
      );
    }

    // --- 8. Build Request Body ---
    const requestBody = {
      // --- NEW: Add campaign_type and custom_specialty_name
      campaign_type: ids.campaignType, // "healthcare" or "wellness"
      custom_specialty_name: customSpecialtyName, // e.g., "Weightloss"

      drug_name: drugName,
      tone_id: toneId,
      specialty_ids: specialtyIds, // e.g., [1, 5] (empty for wellness)

      doctor_name: currentDoctor ? currentDoctor.Doctor_Name || "" : "",
      npi: currentDoctor ? currentDoctor.NPI || "" : "",

      template_id: template_id,

      rag_usage: ragUsage, // "content", "news", or "ai"
      collection_name: ragCollectionName,

      content_format: contentFormat,
      content_word_count: contentWordCount,
      news_count: newsCount,
      ai_instructions: aiInstructions, // NEW

      custom_subject: customSubject,
      custom_content: customContent,
      geography_ids: geographyIds, // Geography IDs for news country filtering
      news_configs: newsConfigs, // Array of news category configurations
    };

    if (previewDiv)
      previewDiv.innerHTML =
        '<div style="padding:20px;text-align:center;color:#666;"><div class="loading-spinner" style="display:inline-block;width:20px;height:20px;border:2px solid #ccc;border-top:2px solid #333;border-radius:50%;animation:spin 1s linear infinite;margin-right:10px;vertical-align:middle;"></div> Generating content...</div>';
    if (subjectLineDisplay) subjectLineDisplay.style.display = "none";

    // --- 9. Make API Call ---
    let data;
    try {
      const res = await fetch(`${API_BASE_URL}/generate-email`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(requestBody),
      });

      // Read response body only once
      const responseText = await res.text();
      let responseData;

      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        // If not JSON, treat as plain text
        responseData = { detail: responseText };
      }

      if (!res.ok) {
        // Handle API/server errors
        const errorMsg = responseData.detail || responseData.message || responseText || "Unable to generate content at the moment. Please try again.";
        throw new Error(errorMsg);
      }

      data = responseData;

    } catch (networkErr) {
      // Handle network errors, parsing errors, etc.
      console.error("API call error:", networkErr);
      throw networkErr;
    }

    // --- 10. Render Response ---
    if (!data || (!data.email_html && !data.subject_line)) {
      // Case 2: No data / empty response
      if (previewDiv) {
        previewDiv.innerHTML = `
          <div style="padding:20px;text-align:center;color:#666;border:1px solid #ddd;border-radius:8px;background:#f9f9f9;">
            <div style="font-size:16px;margin-bottom:10px;">📭 No Content Generated</div>
            <div>No relevant news found for the selected filters. Please try a different geography or category.</div>
          </div>`;
      }
      if (subjectLineDisplay) subjectLineDisplay.style.display = "none";
      return;
    }

    // Case 1: Success - Show generated email subject and body
    if (previewDiv) {
      const html = data.email_html || "<em>No content returned</em>";
      previewDiv.innerHTML = html;
      previewDiv.dataset.rawHtml = html;
    }

    const subj = data.subject_line || "(No subject)";
    if (subjectLineContent) {
      subjectLineContent.textContent = subj;
      subjectLineContent.dataset.rawSubject = subj;
    }
    if (subjectLineDisplay) subjectLineDisplay.style.display = "block";

    const variantBtns = document.getElementById("variant-buttons");
    if (variantBtns) variantBtns.style.display = "flex";
  } catch (err) {
    console.error("Email generation error:", err);

    const friendly = getFriendlyUserError(err);

    const errHtml = `
      <div style="padding:20px;text-align:center;color:#c00;border:1px solid #ffb3b3;border-radius:8px;background:#fff5f5;">
        <div style="font-size:16px;margin-bottom:10px;">⚠️ Generation Failed</div>
        <div>${friendly}</div>
      </div>`;

    if (previewDiv) previewDiv.innerHTML = errHtml;
    if (subjectLineDisplay) subjectLineDisplay.style.display = "none";
  }

  // --- 11. Restore button ---
  if (generateBtn) {
    generateBtn.disabled = false;
    generateBtn.innerHTML = originalBtnHTML || "🤖 Generate Campaign with AI";
  }
}
// async function generateEmailWithAI() {
//   const drugName = document.querySelector("#drug-input").value.trim();
//   const toneSelect = document.querySelector("#tone-select");
//   const toneId = parseInt(toneSelect.value) || null;
//   const specialtySelect = document.querySelector("#specialty-select");
//   const specialtyIds = Array.from(specialtySelect.selectedOptions).map((opt) =>
//     parseInt(opt.value)
//   );
//   const previewDiv = document.getElementById("ai-email-preview");
//   const subjectLineDisplay = document.getElementById("subject-line-display");
//   const subjectLineContent = document.getElementById("subject-line-content");

//   const selectedTemplateRaw = getSelectedTemplateRawValue();
//   const template_id = resolveTemplateId(selectedTemplateRaw);
//   const currentDoctor = window.currentDoctor || null;
//   // --- Spinner setup ---
//   const generateBtn = document.getElementById("generate-email-btn");
//   const originalBtnHTML = generateBtn ? generateBtn.innerHTML : "";
//   if (generateBtn) {
//     generateBtn.disabled = true;
//     generateBtn.innerHTML =
//       '<div class="loading-spinner" style="display:inline-block;width:14px;height:14px;border:2px solid #ccc;border-top:2px solid #333;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:6px;vertical-align:middle;"></div> Generating...';
//   }

//   if (!drugName || !toneId || !specialtyIds.length) {
//     alert("Please fill in Drug Name, Tone, and at least one Specialty.");
//     return;
//   }

//   if (previewDiv)
//     previewDiv.innerHTML =
//       '<div class="loading-spinner"></div> Generating email...';
//   if (subjectLineDisplay) subjectLineDisplay.style.display = "none";

//   try {
//     // --- collect RAG-related inputs ---
//     const ragUsage =
//       document.querySelector('input[name="rag_usage"]:checked')?.value ||
//       "content";
//     const ragCollectionName =
//       document.getElementById("rag-file-select")?.value || null;

//     // content options (only relevant if content mode)
//     const contentFormat =
//       ragUsage === "content"
//         ? document.querySelector('input[name="content-format"]:checked')
//             ?.value || "points"
//         : null;
//     const contentWordCount =
//       ragUsage === "content"
//         ? parseInt(
//             document.getElementById("content-word-count")?.value || "150"
//           )
//         : null;

//     // news options (only relevant if news mode)
//     // news options (only relevant if news mode)
//     let newsCount = null;
//     if (ragUsage === "news") {
//       const newsEl = document.getElementById("news-limit");
//       const raw = newsEl ? String(newsEl.value || "").trim() : "";
//       if (raw !== "") {
//         const n = parseInt(raw, 10);
//         newsCount = Number.isFinite(n) ? n : null;
//       } else {
//         // user left input empty -> let backend decide (send null)
//         newsCount = null;
//       }
//     }

//     const customSubject =
//       document.getElementById("custom_subject_input")?.value || null;
//     const customContent =
//       document.getElementById("custom_content_textarea")?.value || null;

//     // ✅ Backend expects tone_id and specialty_ids array
//     const requestBody = {
//       drug_name: drugName,
//       tone_id: toneId,
//       specialty_ids: specialtyIds,
//       doctor_name: currentDoctor ? currentDoctor.Doctor_Name || "" : "",
//       npi: currentDoctor ? currentDoctor.NPI || "" : "",
//       template_id: template_id,
//       rag_usage: ragUsage,
//       collection_name: ragCollectionName,
//       content_format: contentFormat,
//       content_word_count: contentWordCount,
//       news_count: newsCount,
//       custom_subject: customSubject,
//       custom_content: customContent,
//     };

//     const res = await fetch(`${API_BASE_URL}/generate-email`, {
//       method: "POST",
//       headers: authHeaders({ "Content-Type": "application/json" }),
//       body: JSON.stringify(requestBody),
//     });

//     if (!res.ok) throw new Error(await res.text());
//     const data = await res.json();

//     // ✅ Update preview and subject line
//     if (previewDiv) {
//       previewDiv.innerHTML = data.email_html || "<em>No content returned</em>";
//       previewDiv.dataset.rawHtml = data.email_html || ""; // <-- ADD THIS
//     }

//     const subj = data.subject_line || "(No subject)";
//     if (subjectLineContent) {
//       subjectLineContent.textContent = subj;
//       subjectLineContent.dataset.rawSubject = subj; // <-- ADD THIS
//     }
//     if (subjectLineDisplay) subjectLineDisplay.style.display = "block";

//     // ✅ Show Variant Buttons after successful email generation
//     const variantBtns = document.getElementById("variant-buttons");
//     if (variantBtns) variantBtns.style.display = "flex";
//   } catch (err) {
//     let msg = "";
//     try {
//       // Try to extract backend error message cleanly
//       if (err instanceof Error && err.message) {
//         msg = err.message;
//       } else if (typeof err === "string") {
//         msg = err;
//       } else if (err?.response) {
//         const data = await err.response.json();
//         msg = data.detail || JSON.stringify(data);
//       } else {
//         msg = err.toString();
//       }
//     } catch (e) {
//       msg = err.toString();
//     }

//     // 🧠 Custom friendly messages for specific backend errors
//     if (msg.includes("No RAG content found")) {
//       msg =
//         "⚠️ No relevant RAG content found for this drug or collection. Try another RAG file or drug name.";
//     } else if (msg.includes("RAG content mode requires")) {
//       msg = "⚠️ Please select a RAG document or collection before generating.";
//     } else if (msg.includes("News mode requires")) {
//       msg =
//         "⚠️ News mode also requires a valid RAG document to generate a subject.";
//     } else if (msg.includes("Not authenticated")) {
//       msg = "⚠️ You are not logged in. Please log in again to continue.";
//     }

//     const errHtml = `
//   <div style="padding:12px;border:1px solid #ffb3b3;background:#fff5f5;color:#c00;border-radius:8px;">
//     ${msg}
//   </div>`;
//     if (previewDiv) previewDiv.innerHTML = errHtml;
//     if (subjectLineDisplay) subjectLineDisplay.style.display = "none";
//   }
//   // --- Restore button after completion ---
//   if (generateBtn) {
//     generateBtn.disabled = false;
//     generateBtn.innerHTML = originalBtnHTML || "🤖 Generate Campaign with AI";
//   }
// }

// ==========================================
// 🔁 Generate Variants A/B/C with word count
// ==========================================
async function generateVariantWithWordCount(wordCount, buttonEl) {
  const previewDiv = document.getElementById("ai-email-preview");
  const subjectLineDisplay = document.getElementById("subject-line-display");
  const subjectLineContent = document.getElementById("subject-line-content");

  // disable all variant buttons during generation
  const allBtns = document.querySelectorAll("#variant-buttons button");
  allBtns.forEach((b) => (b.disabled = true));
  const oldText = buttonEl.textContent;
  buttonEl.innerHTML = '<div class="loading-spinner"></div> Generating...';

  try {
    // read same fields user chose before
    const drugName = document.querySelector("#drug-input").value.trim();
    const toneId =
      parseInt(document.querySelector("#tone-select").value) || null;
    const specialtyIds = Array.from(
      document.querySelector("#specialty-select").selectedOptions,
    ).map((opt) => parseInt(opt.value));

    const selectedTemplateRaw = getSelectedTemplateRawValue();
    const template_id = resolveTemplateId(selectedTemplateRaw);
    const currentDoctor = window.currentDoctor || null;

    const ragUsage =
      document.querySelector('input[name="rag_usage"]:checked')?.value ||
      "content";
    const ragCollectionName =
      document.getElementById("rag-file-select")?.value || null;
    const contentFormat =
      ragUsage === "content"
        ? document.querySelector('input[name="content-format"]:checked')
            ?.value || "points"
        : null;

    // build requestBody same as main generation, but override word count
    const requestBody = {
      drug_name: drugName,
      tone_id: toneId,
      specialty_ids: specialtyIds,
      template_id,
      rag_usage: ragUsage,
      collection_name: ragCollectionName,
      content_format: contentFormat,
      content_word_count: wordCount, // 👈 override word count only
      doctor_name: currentDoctor ? currentDoctor.Doctor_Name || "" : "",
      npi: currentDoctor ? currentDoctor.NPI || "" : "",
    };

    if (previewDiv)
      previewDiv.innerHTML =
        '<div class="loading-spinner"></div> Generating variant...';
    if (subjectLineDisplay) subjectLineDisplay.style.display = "none";

    const res = await fetch(`${API_BASE_URL}/generate-email`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(requestBody),
    });
    let errorMessage = "Failed to generate variant.";
    if (!res.ok) {
      try {
        errorMessage = await res.text();
      } catch (e) {
        errorMessage = `HTTP ${res.status}: ${res.statusText}`;
      }
      throw new Error(errorMessage);
    }
    const data = await res.json();

    // update preview and subject line
    const html = data.email_html || "<em>No content returned</em>";
    const subj = data.subject_line || "(No subject)";

    if (previewDiv) {
      previewDiv.innerHTML = html;
      previewDiv.dataset.rawHtml = html; // <-- ADD THIS
    }
    if (subjectLineContent) {
      subjectLineContent.textContent = subj;
      subjectLineContent.dataset.rawSubject = subj; // <-- ADD THIS
    }
    if (subjectLineDisplay) subjectLineDisplay.style.display = "block";
  } catch (err) {
    const friendly = getFriendlyUserError(err);
    const errHtml =
      '<span style="color:red;">Failed to generate variant. ' + friendly + "</span>";
    if (previewDiv) previewDiv.innerHTML = errHtml;
    if (subjectLineDisplay) subjectLineDisplay.style.display = "none";
  } finally {
    // re-enable buttons
    allBtns.forEach((b) => {
      b.disabled = false;
      b.innerHTML = b === buttonEl ? oldText : b.textContent;
    });
  }
}

async function generateVariant(variant) {
  const drugName = document.querySelector("#drug-input").value.trim();
  const toneSelect = document.querySelector("#tone-select");
  const tone = toneSelect.options[toneSelect.selectedIndex]?.text || "";
  const specialtySelect = document.querySelector("#specialty-select");
  const specialty = specialtySelect.selectedOptions[0]?.text || "";
  const currentDoctor = window.currentDoctor || null;

  if (!drugName || !tone || !specialty) {
    alert("Please fill all fields.");
    return;
  }

  // canonical elements
  let previewEl = document.getElementById(CANONICAL_HTML_ID);
  if (!previewEl) {
    previewEl = document.createElement("div");
    previewEl.id = CANONICAL_HTML_ID;
    previewEl.style.display = "none";
    document.body.appendChild(previewEl);
  }
  const canonicalSubject = document.getElementById(CANONICAL_SUBJECT_ID);

  const subjectLineDisplay = document.getElementById("subject-line-display");
  const visiblePreview = document.getElementById("ai-email-preview");
  const visibleSubject = document.getElementById("ai_subject_preview_text");

  previewEl.innerHTML =
    '<div class="loading-spinner"></div> Generating variant...';
  if (subjectLineDisplay) subjectLineDisplay.style.display = "none";

  const selectedTemplateRaw = getSelectedTemplateRawValue();
  const template_id = resolveTemplateId(selectedTemplateRaw);

  try {
    const requestBody = {
      drug_name: drugName,
      tone: tone,
      specialty: specialty,
      doctor_name: currentDoctor ? currentDoctor.Doctor_Name || "" : "",
      npi: currentDoctor ? currentDoctor.NPI || "" : "",
      variant: variant,
      template_id: template_id,
    };

    const res = await fetch(`${API_BASE_URL}/generate-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    let errorMessage = "Failed to generate variant.";
    if (!res.ok) {
      try {
        errorMessage = await res.text();
      } catch (e) {
        errorMessage = `HTTP ${res.status}: ${res.statusText}`;
      }
      throw new Error(errorMessage);
    }
    const data = await res.json();

    // write canonical HTML + subject
    previewEl.innerHTML = data.email_html || "<em>No content returned</em>";

    let subjEl = canonicalSubject;
    if (!subjEl) {
      subjEl = document.createElement("div");
      subjEl.id = CANONICAL_SUBJECT_ID;
      subjEl.style.display = "none";
      document.body.appendChild(subjEl);
    }
    subjEl.textContent = data.subject_line || "(No subject)";

    // update visible UI if present
    if (visiblePreview) visiblePreview.innerHTML = previewEl.innerHTML;
    if (visibleSubject) visibleSubject.textContent = subjEl.textContent;
    if (subjectLineDisplay) subjectLineDisplay.style.display = "block";
  } catch (err) {
    const friendly = getFriendlyUserError(err);
    previewEl.innerHTML = `<span style="color:red;">Failed to generate variant. ${friendly}</span>`;
    if (subjectLineDisplay) subjectLineDisplay.style.display = "none";
  }
}
async function generateFinalTouchEmail() {
  const drugName = document.querySelector("#drug-input").value.trim();
  const toneSelect = document.querySelector("#tone-select");
  const tone = toneSelect.options[toneSelect.selectedIndex]?.text || "";
  const specialtySelect = document.querySelector("#specialty-select");
  const specialty = specialtySelect.selectedOptions[0]?.text || "";
  const savedSignature = JSON.parse(
    localStorage.getItem("userSignature") || "{}",
  );
  const currentDoctor = window.currentDoctor || null;

  if (!drugName || !tone || !specialty) {
    alert("Please fill all fields.");
    return;
  }

  // canonical elements
  let previewEl = document.getElementById(CANONICAL_HTML_ID);
  if (!previewEl) {
    previewEl = document.createElement("div");
    previewEl.id = CANONICAL_HTML_ID;
    previewEl.style.display = "none";
    document.body.appendChild(previewEl);
  }
  let subjEl = document.getElementById(CANONICAL_SUBJECT_ID);

  const subjectLineDisplay = document.getElementById("subject-line-display");
  const visiblePreview = document.getElementById("ai-email-preview");
  const visibleSubject = document.getElementById("ai_subject_preview_text");

  previewEl.innerHTML =
    '<div class="loading-spinner"></div> Generating final touch email...';
  if (subjectLineDisplay) subjectLineDisplay.style.display = "none";

  const selectedTemplateRaw = getSelectedTemplateRawValue();
  const template_id = resolveTemplateId(selectedTemplateRaw);

  try {
    const requestBody = {
      drug_name: drugName,
      tone: tone,
      category: specialty,
      doctor_name: currentDoctor ? currentDoctor.Doctor_Name || "" : "",
      npi: currentDoctor ? currentDoctor.NPI || "" : "",
      template_id: template_id,
      sender_name: savedSignature.name || "",
      sender_title: savedSignature.title || "",
      sender_contact: savedSignature.contact || "",
    };

    const res = await fetch(`${API_BASE_URL}/generate-final-touch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    let errorMessage = "Failed to generate final touch email.";
    if (!res.ok) {
      try {
        errorMessage = await res.text();
      } catch (e) {
        errorMessage = `HTTP ${res.status}: ${res.statusText}`;
      }
      throw new Error(errorMessage);
    }
    const data = await res.json();

    // write canonical HTML + subject
    const html = data.email_html || "<em>No content returned</em>";
    const subj = data.subject_line || "(No subject)";

    previewEl.innerHTML = html;
    previewEl.dataset.rawHtml = html; // <-- ADD THIS

    if (!subjEl) {
      subjEl = document.createElement("div");
      subjEl.id = CANONICAL_SUBJECT_ID;
      subjEl.style.display = "none";
      document.body.appendChild(subjEl);
    }
    subjEl.textContent = subj;
    subjEl.dataset.rawSubject = subj; // <-- ADD THIS

    // update visible UI if present
    if (visiblePreview) {
      visiblePreview.innerHTML = html;
      visiblePreview.dataset.rawHtml = html; // <-- ADD THIS
    }
    if (visibleSubject) {
      visibleSubject.textContent = subj;
      visibleSubject.dataset.rawSubject = subj; // <-- ADD THIS
    }
    if (subjectLineDisplay) subjectLineDisplay.style.display = "block";
  } catch (err) {
    const friendly = getFriendlyUserError(err);
    previewEl.innerHTML = `<span style="color:red;">Failed to generate final touch email. ${friendly}</span>`;
    if (subjectLineDisplay) subjectLineDisplay.style.display = "none";
  }
}

// --- NEW: Functions for Wellness & Aesthetics Workflow ---

/**
 * Loads custom user-created specialties into the 'wellness-specialty-select' dropdown.
 */
async function loadUserSpecialties() {
  const select = document.getElementById("wellness-specialty-select");
  if (!select) return;

  select.disabled = true;
  select.innerHTML = "<option value=''>Loading your specialties...</option>";

  try {
    const res = await fetch(`${API_BASE_URL}/user-specialties`, {
      headers: authHeaders(),
    });

    if (res.status === 401) {
      select.innerHTML = "<option value=''>Please log in</option>";
      return;
    }
    if (!res.ok) throw new Error(await res.text());

    const specialties = await res.json();

    select.innerHTML = "<option value=''>-- Select Your Specialty --</option>";
    if (!specialties || specialties.length === 0) {
      select.innerHTML = "<option value=''>-- No specialties saved --</option>";
    }

    specialties.forEach((spec) => {
      const opt = document.createElement("option");
      opt.value = spec.name; // Use name as the value
      opt.textContent = spec.name;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Failed to load user specialties:", err);
    select.innerHTML = "<option value=''>Error loading specialties</option>";
  } finally {
    select.disabled = false;
  }
}

/**
 * Saves a new custom specialty and reloads the dropdown on success.
 */
async function saveUserSpecialty() {
  const input = document.getElementById("wellness-specialty-add");
  const saveBtn = document.getElementById("wellness-specialty-save-btn");
  if (!input || !saveBtn) return;

  const name = input.value.trim();
  if (!name) {
    showNotification("Please enter a specialty name.", "error");
    return;
  }

  const originalBtnText = saveBtn.textContent;
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  try {
    const res = await fetch(`${API_BASE_URL}/user-specialties`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ name: name }),
    });

    if (!res.ok) {
      const err = await res.json();
      if (res.status === 409) {
        // 409 Conflict (duplicate)
        showNotification(err.detail || "Specialty already exists.", "info");
      } else {
        throw new Error(err.detail || "Failed to save specialty");
      }
    } else {
      await res.json();
      showNotification(`Specialty "${name}" saved!`, "success");
      input.value = ""; // Clear input
      await loadUserSpecialties(); // Refresh the dropdown
    }
  } catch (err) {
    console.error("Error saving user specialty:", err);
    showNotification(err.message, "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = originalBtnText;
  }
}

/**
 * Clones options from the main (healthcare) dropdowns
 * into the new wellness dropdowns (Tone, RAG, Template).
 */
function loadWellnessDropdowns() {
  // 1. Clone Tones
  const healthcareTone = document.getElementById("tone-select");
  const wellnessTone = document.getElementById("wellness-tone-select");
  if (healthcareTone && wellnessTone && wellnessTone.options.length <= 1) {
    wellnessTone.innerHTML = healthcareTone.innerHTML;
  }

  // 2. Clone RAG Files
  const healthcareRAG = document.getElementById("rag-file-select");
  const wellnessRAG = document.getElementById("wellness-rag-file-select");
  if (healthcareRAG && wellnessRAG && wellnessRAG.options.length <= 1) {
    wellnessRAG.innerHTML = healthcareRAG.innerHTML;
  }

  // 3. Clone Templates
  const healthcareTemplate = document.getElementById("template-select");
  const wellnessTemplate = document.getElementById("wellness-template-select");
  if (
    healthcareTemplate &&
    wellnessTemplate &&
    wellnessTemplate.options.length <= 1
  ) {
    wellnessTemplate.innerHTML = healthcareTemplate.innerHTML;
  }
}

/**
 * Clones options from the main (healthcare) dropdowns
 * into the Prompt Mode dropdowns (Tone, Template, RAG Collections).
 */
function loadPromptModeDropdowns() {
  // 1. Clone Tones
  const healthcareTone = document.getElementById("tone-select");
  const promptTone = document.getElementById("prompt-mode-tone-select");
  if (healthcareTone && promptTone && promptTone.options.length <= 1) {
    promptTone.innerHTML = healthcareTone.innerHTML;
  }

  // 2. Populate Prompt Mode RAG collections as checkboxes — fetch directly from API
  const promptCollections = document.getElementById("prompt-mode-collections");
  if (promptCollections) {
    promptCollections.innerHTML = '<div class="field-hint">Loading collections...</div>';
    const RAG_META_BASE = window.RAG_META_BASE || (window.env && window.env.RAG_META_BASE);
    const user = (() => { try { return JSON.parse(localStorage.getItem("user") || "null"); } catch (e) { return null; } })();
    fetch(`${RAG_META_BASE}/rag-documents`, {
      headers: user && user.id ? { Authorization: `Bearer ${user.id}` } : {},
    })
      .then((res) => { if (!res.ok) throw new Error(`Status ${res.status}`); return res.json(); })
      .then((data) => {
        const collections = Array.isArray(data) ? data.map((g) => g.collection_name).filter(Boolean) : [];
        if (!collections.length) {
          promptCollections.innerHTML = '<div class="field-hint">No RAG collections found.</div>';
          return;
        }
        promptCollections.innerHTML = "";
        collections.forEach((name) => {
          const row = document.createElement("div");
          row.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:6px;";
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.value = name;
          cb.id = `pmc-${name}`;
          const label = document.createElement("label");
          label.setAttribute("for", cb.id);
          label.textContent = name;
          row.appendChild(cb);
          row.appendChild(label);
          promptCollections.appendChild(row);
        });
      })
      .catch((err) => {
        console.error("Failed to load prompt mode RAG collections:", err);
        promptCollections.innerHTML = '<div class="field-hint" style="color:red;">Failed to load collections.</div>';
      });
  }

  // 3. Clone Templates
  const healthcareTemplate = document.getElementById("template-select");
  const promptTemplate = document.getElementById("prompt-mode-template-select");
  if (healthcareTemplate && promptTemplate && promptTemplate.options.length <= 1) {
    promptTemplate.innerHTML = healthcareTemplate.innerHTML;
  }

  // 4. Load System Instruction (Prompt Mode only)
  const sysText = document.getElementById("prompt-mode-system-instruction");
  const sysSaveBtn = document.getElementById("prompt-mode-system-instruction-save");
  if (sysText) {
    fetch(`${API_BASE_URL}/prompt-mode/system-instruction`, {
      method: "GET",
      headers: authHeaders({ "Content-Type": "application/json" }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data && typeof data.content === "string") {
          sysText.value = data.content;
        }
      })
      .catch((e) => console.error("Failed to load system instruction", e));
  }
  if (sysSaveBtn && sysText) {
    sysSaveBtn.addEventListener("click", async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/prompt-mode/system-instruction`, {
          method: "PUT",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ content: sysText.value || "" }),
        });
        if (!res.ok) {
          const tx = await res.text();
          throw new Error(tx || "Save failed");
        }
        alert("System instruction saved.");
      } catch (err) {
        console.error("Save system instruction error", err);
        alert("Could not save system instruction.");
      }
    });
  }

  // 5. Load predefined prompts
  const promptSelect = document.getElementById("prompt-mode-predefined-select");
  async function refreshPredefinedPrompts() {
    if (!promptSelect) return;
    try {
      const res = await fetch(`${API_BASE_URL}/prompt-mode/prompts`, {
        method: "GET",
        headers: authHeaders({ "Content-Type": "application/json" }),
      });
      const data = await res.json();
      promptSelect.innerHTML = '<option value="">-- Select a saved prompt --</option>';
      if (Array.isArray(data)) {
        data.forEach((p) => {
          const opt = document.createElement("option");
          opt.value = p.prompt_name; // name maps to EMAIL_EXAMPLES key
          opt.textContent = p.prompt_name;
          opt.dataset.promptId = p.id;
          opt.dataset.promptContent = p.prompt_content;
          promptSelect.appendChild(opt);
        });
      }
    } catch (err) {
      console.error("Failed to load predefined prompts", err);
    }
  }
  // Run asynchronously without blocking other initializers
  refreshPredefinedPrompts();

  // Prompt actions
  const saveBtn = document.getElementById("prompt-mode-predefined-save");
  const updateBtn = document.getElementById("prompt-mode-predefined-update");
  const deleteBtn = document.getElementById("prompt-mode-predefined-delete");
  const toggleBtn = document.getElementById("prompt-mode-predefined-toggle");
  const promptNameInput = document.getElementById("prompt-mode-predefined-name");
  const promptTextArea = document.getElementById("prompt-mode-input");
  const promptContentArea = document.getElementById("prompt-mode-predefined-content");
  const promptEditor = document.getElementById("prompt-mode-predefined-editor");
  // Auto-load selected prompt into "Your Prompt / Query" on change
  if (promptSelect && promptTextArea) {
    promptSelect.addEventListener("change", () => {
      const sel = promptSelect.options[promptSelect.selectedIndex];
      if (!sel || !sel.value) return; // ignore placeholder
      const content = sel.dataset.promptContent || "";
      // Fill query area only (avoid duplicate display)
      promptTextArea.value = content;
      // Also stage editor fields for potential updates
      if (promptNameInput) promptNameInput.value = sel.value;
      if (promptContentArea) promptContentArea.value = content;
    });
  }

  // Toggle Add / Update editor panel
  if (toggleBtn && promptEditor) {
    toggleBtn.addEventListener("click", () => {
      const showing = promptEditor.style.display !== "none";
      if (showing) {
        promptEditor.style.display = "none";
        return;
      }
      // Prepare defaults: use selected prompt if available, else current query text
      const sel = promptSelect?.options[promptSelect.selectedIndex];
      const stagedName = sel && sel.value ? sel.value : (promptNameInput?.value || "");
      const stagedContent = sel && sel.value
        ? (sel.dataset.promptContent || "")
        : (promptTextArea?.value || "");
      if (promptNameInput) promptNameInput.value = stagedName;
      if (promptContentArea) promptContentArea.value = stagedContent;
      promptEditor.style.display = "block";
    });
  }

  if (saveBtn && promptNameInput) {
    saveBtn.addEventListener("click", async () => {
      const name = (promptNameInput.value || "").trim();
      const content = (promptContentArea?.value || "").trim();
      if (!name) return alert("Enter a Prompt Name.");
      if (!content) return alert("Enter prompt content in the Prompt Content box.");
      try {
        const res = await fetch(`${API_BASE_URL}/prompt-mode/prompts`, {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          // UI requirement: send full_prompt_content
          body: JSON.stringify({ prompt_name: name, full_prompt_content: content }),
        });
        if (!res.ok) {
          const tx = await res.text();
          throw new Error(tx || "Save failed");
        }
        await refreshPredefinedPrompts();
        alert("Prompt saved.");
      } catch (err) {
        console.error("Save prompt error", err);
        alert("Could not save prompt.");
      }
    });
  }

  if (updateBtn && promptSelect) {
    updateBtn.addEventListener("click", async () => {
      const sel = promptSelect.options[promptSelect.selectedIndex];
      if (!sel || !sel.value) return alert("Select a saved prompt first.");
      const id = sel.dataset.promptId;
      const newContent = (promptContentArea?.value || "").trim();
      const newName = (promptNameInput?.value || "").trim();
      if (!id) return alert("Missing prompt id");
      try {
        const res = await fetch(`${API_BASE_URL}/prompt-mode/prompts/${id}`, {
          method: "PUT",
          headers: authHeaders({ "Content-Type": "application/json" }),
          // Allow updating both fields
          body: JSON.stringify({
            ...(newName ? { prompt_name: newName } : {}),
            full_prompt_content: newContent,
          }),
        });
        if (!res.ok) {
          const tx = await res.text();
          throw new Error(tx || "Update failed");
        }
        await refreshPredefinedPrompts();
        alert("Prompt updated.");
      } catch (err) {
        console.error("Update prompt error", err);
        alert("Could not update prompt.");
      }
    });
  }

  if (deleteBtn && promptSelect) {
    deleteBtn.addEventListener("click", async () => {
      const sel = promptSelect.options[promptSelect.selectedIndex];
      if (!sel || !sel.value) return alert("Select a saved prompt first.");
      const id = sel.dataset.promptId;
      if (!id) return alert("Missing prompt id");
      if (!confirm(`Delete prompt "${sel.value}"?`)) return;
      try {
        const res = await fetch(`${API_BASE_URL}/prompt-mode/prompts/${id}`, {
          method: "DELETE",
          headers: authHeaders({ "Content-Type": "application/json" }),
        });
        if (!res.ok) {
          const tx = await res.text();
          throw new Error(tx || "Delete failed");
        }
        await refreshPredefinedPrompts();
        alert("Prompt deleted.");
      } catch (err) {
        console.error("Delete prompt error", err);
        alert("Could not delete prompt.");
      }
    });
  }

  // 6. Specialty other toggle
  const specSel = document.getElementById("prompt-mode-specialty-select");
  const specOther = document.getElementById("prompt-mode-specialty-other");
  if (specSel && specOther) {
    const onChange = () => {
      if (specSel.value === "Other") {
        specOther.style.display = "block";
      } else {
        specOther.style.display = "none";
        specOther.value = "";
      }
    };
    specSel.addEventListener("change", onChange);
    onChange();
  }
}

// --- END OF NEW FUNCTIONS ---
// Load data on page load
document.addEventListener("DOMContentLoaded", loadDropdowns);

// Additional DOM wiring
document.addEventListener("DOMContentLoaded", function () {
  const wellnessSaveBtn = document.getElementById(
    "wellness-specialty-save-btn",
  );
  if (wellnessSaveBtn) {
    wellnessSaveBtn.addEventListener("click", saveUserSpecialty);
  }
  // --- END NEW ---

  const btn = document.getElementById("final-touch-btn");
  if (btn) {
    btn.addEventListener("click", generateFinalTouchEmail);
  }
  const followUpBtn = document.getElementById("follow-up-btn");
  if (followUpBtn) {
    followUpBtn.addEventListener("click", generateFollowUpEmail);
  }

  // Clear inputs
  const clearBtn = document.getElementById("clear-ai-inputs-btn");
  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      [
        "ai_template_type",
        "ai_subject_instructions",
        "ai_body_instructions",
        "ai_additional_context",
        "ai_sender_name",
        "ai_sender_title",
        "ai_sender_contact",
      ].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });
      const subjWrap = document.getElementById("ai_subject_preview");
      if (subjWrap) subjWrap.style.display = "none";
      const preview = document.getElementById("ai-email-preview");
      if (preview)
        preview.innerHTML =
          "<em>AI-generated email content will appear here after generation.</em>";
    });
  }

  // Save draft stub (frontend-only)
  const saveDraft =
    document.getElementById("save-ai-draft-btn") ||
    document.getElementById("ai_save_draft_btn2");
  if (saveDraft) {
    saveDraft.addEventListener("click", function () {
      showNotification &&
        showNotification("Draft saved locally (frontend).", "success");
      // TODO: wire to backend save-draft endpoint when ready
    });
  }

  // When Mailchimp provider button is clicked, load audiences
  const selectMailchimpBtn = document.getElementById("select-mailchimp");
  if (selectMailchimpBtn) {
    selectMailchimpBtn.addEventListener("click", () => {
      // Keep existing behavior (some other code may call setProvider)
      try {
        loadAudiences();
      } catch (e) {
        console.error(e);
      }
    });
  }
  const selectMailjetBtn = document.getElementById("select-mailjet");
  if (selectMailjetBtn) {
    selectMailjetBtn.addEventListener("click", () => {
      try {
        loadMailjetAudiences();
      } catch (e) {
        console.error(e);
      }
    });
  }

  // Sync audience select to mailchimp-list-id input
  const audienceSelect = document.getElementById("audience-select");
  const mailchimpListInput = document.getElementById("mailchimp-list-id");
  if (audienceSelect && mailchimpListInput) {
    audienceSelect.addEventListener("change", () => {
      mailchimpListInput.value = audienceSelect.value || "";
    });
  }

  // If the modal is opened via a different button (schedule btn), optionally pre-load audiences
  const scheduleBtn = document.getElementById("schedule-send-btn");
  if (scheduleBtn) {
    scheduleBtn.addEventListener("click", () => {
      // Optionally pre-load audiences so user sees options when modal opens
      try {
        loadAudiences();
      } catch (e) {
        /* ignore */
      }
    });
  }

  const manageBtn = document.getElementById("manage-templates-btn");
  if (manageBtn) {
    manageBtn.addEventListener("click", function () {
      // navigate to a templates management screen.
      // Implement templates.html (WYSIWYG + upload) there.
      window.location.href = "templates.html";
    });
  }

  // Optional: view selected template in new tab (preview)
  const templateSelect = document.getElementById("template-select");
  templateSelect?.addEventListener("change", function () {
    // optionally auto-preview; leave commented if not desired
    // const tid = this.value;
    // if (tid) window.open(`${API_BASE_URL}/templates/${tid}/preview`, "_blank");
  });
});

// =========================================
// NEW: Generate Campaign Using AI Functions
// =========================================
function htmlHasSignature(html) {
  if (!html) return false;
  // basic heuristics for a signature block
  return (
    /(?:Regards|Warm regards|Sincerely|Best regards|Kind regards|Thanks|Regards,)/i.test(
      html,
    ) || /<address|<footer|<div[^>]*class=["'].*signature.*["']>/i.test(html)
  );
}

function insertImagesIntoHtml(html, images = [], placement = "banner") {
  if (!images || images.length === 0) return html || "";
  const first = (images[0] && (images[0].url || images[0])) || "";
  const imgTag = `<img src="${escapeHtml(
    first,
  )}" style="max-width:100%;display:block;margin:12px 0;" alt="Image"/>`;
  if ((html || "").includes(first)) return html; // already present

  if (placement === "banner" || placement === "inline_top") {
    const insertTarget = /(<h1[\s\S]*?>|<h2[\s\S]*?>|<p[\s\S]*?>)/i;
    if (insertTarget.test(html)) {
      return html.replace(insertTarget, (m) => imgTag + m);
    }
    return imgTag + (html || "");
  } else if (placement === "inline_middle") {
    if ((html || "").includes("</p>"))
      return html.replace("</p>", "</p>" + imgTag);
    const mid = Math.floor((html || "").length / 2);
    return (html || "").slice(0, mid) + imgTag + (html || "").slice(mid);
  } else if (placement === "inline_bottom" || placement === "footer") {
    return (html || "") + imgTag;
  } else if (placement === "none") {
    return html || "";
  } else {
    return imgTag + (html || "");
  }
}

// Live thumbnail preview for image URLs into #image-preview
function renderImagePreviewFromTextarea() {
  const previewContainer = document.getElementById("image-preview");
  if (!previewContainer) return;
  const txtEl =
    document.getElementById("ai_image_urls") ||
    document.getElementById("image_urls");
  const raw = txtEl?.value?.trim() || "";
  const urls = raw
    ? raw
        .split(/[\n,]+/)
        .map((u) => u.trim())
        .filter(Boolean)
    : [];
  previewContainer.innerHTML = "";
  urls.slice(0, 6).forEach((u) => {
    const img = document.createElement("img");
    img.src = u;
    img.alt = "preview";
    img.style.maxWidth = "120px";
    img.style.maxHeight = "80px";
    img.style.objectFit = "cover";
    img.style.border = "1px solid #ddd";
    img.style.borderRadius = "4px";
    img.style.padding = "2px";
    img.style.background = "#fff";
    img.onerror = () => img.remove(); // remove broken images
    previewContainer.appendChild(img);
  });
}
// Utility: safely escape HTML special chars (for user-entered fields)
function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
// for Generate Campaign using AI screen
async function generateEmailWithAICampaign() {
  // Use visible AI-screen preview area
  const previewDiv =
    document.getElementById("ai_gen_email_preview") ||
    document.getElementById("ai-email-preview");
  const subjectWrap =
    document.getElementById("ai_gen_subject_preview") ||
    document.getElementById("ai_subject_preview");
  const subjectTextEl =
    document.getElementById("ai_gen_subject_preview_text") ||
    document.getElementById("ai_subject_preview_text");

  if (!previewDiv) {
    console.error("Preview area (#ai-email-preview) not found");
    alert("Preview area missing on this page.");
    return;
  }

  // Get the Generate Template button and store its original HTML
  const generateBtn = document.getElementById("generate-ai-template-btn");
  const originalBtnHTML = generateBtn ? generateBtn.innerHTML : "";
  const originalBtnDisabled = generateBtn ? generateBtn.disabled : false;

  // --- Read AI inputs ---
  const templateType = document.getElementById("ai_template_type")?.value || "";
  const subjectInstructions =
    document.getElementById("ai_subject_instructions")?.value || "";
  const bodyInstructions =
    document.getElementById("ai_body_instructions")?.value || "";
  const additionalContext =
    document.getElementById("ai_additional_context")?.value || "";

  // --- Read signature from visible inputs ---
  const senderName =
    document.getElementById("ai_sender_name")?.value?.trim() ||
    document.getElementById("sender-name")?.value?.trim() ||
    "";
  const senderTitle =
    document.getElementById("ai_sender_title")?.value?.trim() ||
    document.getElementById("sender-title")?.value?.trim() ||
    "";
  const senderContact =
    document.getElementById("ai_sender_contact")?.value?.trim() ||
    document.getElementById("sender-contact")?.value?.trim() ||
    "";

  // --- Parse image URLs ---
  const imageTxtEl =
    document.getElementById("ai_image_urls") ||
    document.getElementById("image_urls");
  const imageUrlsRaw = imageTxtEl?.value?.trim() || "";
  const allImageUrls = imageUrlsRaw
    ? imageUrlsRaw
        .split(/[\n,]+/)
        .map((u) => u.trim())
        .filter(Boolean)
    : [];

  // --- Check image usage mode (reference vs place) ---
  const imageUsageRadio = document.querySelector('input[name="ai_image_usage"]:checked');
  const imageUsageMode = imageUsageRadio?.value || "reference";
  const embedImages = imageUsageMode === "place";

  
  // ALWAYS include image URLs if they exist - backend will handle whether to embed or just analyze
  const imageUrls = allImageUrls;

  // --- Get user-selected image placement (only if placing images) ---
  const imagePlacement =
    imageUsageMode === "place" 
      ? (document.getElementById("ai_image_placement")?.value?.trim() || "banner")
      : undefined;

  // --- Template + doctor info ---
  const selectedTemplateRaw = getSelectedTemplateRawValue();
  const template_id = resolveTemplateId(selectedTemplateRaw);
  const currentDoctor = window.currentDoctor || null;

  // --- Show loading spinner ---
  previewDiv.innerHTML =
    '<div class="loading-spinner"></div> Generating email with AI...';
  if (subjectWrap) subjectWrap.style.display = "none";

  // Show loading state on the button
  if (generateBtn) {
    generateBtn.disabled = true;
    generateBtn.innerHTML =
      '<div class="loading-spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;margin-right:5px;vertical-align:middle;"></div> Generating...';
  }

  try {
    // --- Read new CTA and Unsubscribe fields ---
    const button_text =
      document.getElementById("ai_button_text")?.value?.trim() || null;
    const button_url =
      document.getElementById("ai_button_url")?.value?.trim() || null;
    const unsubscribe_url =
      document.getElementById("ai_unsubscribe_url")?.value?.trim() || null;

    // --- Make request to backend ---
    let res;
    // If the new AI Template UI is present (uses ai_generation_brief), call templates/generate-from-image
    const aiBriefEl = document.getElementById("ai_generation_brief") || document.getElementById("ai_body_instructions");
    if (aiBriefEl) {
      const instructions = (document.getElementById("ai_generation_brief")?.value || bodyInstructions || subjectInstructions || "").trim();
      const templateStyle = (document.getElementById("ai_template_style")?.value || "clean").trim();
      const payload = {
        instructions: instructions,
        image_urls: imageUrls.length ? imageUrls : undefined,
        embed_images: embedImages,
        template_name: (document.getElementById("ai_subject_hint")?.value || template_name || null) || undefined,
        template_style: templateStyle,
      };

      res = await fetch(`${API_BASE_URL}/templates/generate-from-image`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(currentUser?.id ? { Authorization: `Bearer ${currentUser.id}` } : {}),
        },
        body: JSON.stringify(payload),
      });
    } else {
      res = await fetch(`${API_BASE_URL}/generate-email-ai`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(currentUser?.id
            ? { Authorization: `Bearer ${currentUser.id}` }
            : {}),
        },
        body: JSON.stringify({
          template_type: templateType,
          subject_instructions: subjectInstructions,
          body_instructions: bodyInstructions,
          additional_context: additionalContext,
          sender_name: senderName,
          sender_title: senderTitle,
          sender_contact: senderContact,
          image_urls: imageUrls,
          image_placement: imagePlacement,
          template_id: template_id,
          doctor_name: currentDoctor ? currentDoctor.Doctor_Name || "" : "",
          npi: currentDoctor ? currentDoctor.NPI || "" : "",

          // Add new fields
          button_text: button_text,
          button_url: button_url,
          unsubscribe_url: unsubscribe_url,
        }),
      });
    }
    
    // Read response body only once
    const responseText = await res.text();
    let data;
    
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      // If not JSON, treat as plain text error
      if (!res.ok) {
        throw new Error(responseText || "Unable to generate content at the moment. Please try again.");
      }
      data = { email_html: responseText, subject_line: "(Generated content)" };
    }
    
    if (!res.ok) {
      const errorMsg = data.detail || data.message || responseText || "Unable to generate content at the moment. Please try again.";
      throw new Error(errorMsg);
    }

    // --- Extract backend data ---
    let html = data.email_html || data.html || data.html_body || "";
    let subject = data.subject_line || data.subject || data.subject || "(No subject)";

    // --- Handle image and signature logic ---
    const backendImages = Array.isArray(data.images)
      ? data.images.map((i) => (typeof i === "string" ? { url: i } : i))
      : [];

    const imagesToUse = backendImages.length
      ? backendImages
      : imageUrls.map((u) => ({ url: u, placement: imagePlacement }));

    // --- Insert images & avoid duplicate signature ---
    if (html) {

  // ✅ ONLY insert images if user selected "place"
  if (
    embedImages &&
    imagesToUse.length &&
    !imagesToUse.some((i) => (html || "").includes(i.url))
  ) {
    const placementToUse =
      imagePlacement ||
      (backendImages[0] && backendImages[0].placement) ||
      "inline_bottom";

    html = insertImagesIntoHtml(html, imagesToUse, placementToUse);
  }


      // Append signature only if not already included
      if (
        !htmlHasSignature(html) &&
        (senderName || senderTitle || senderContact) &&
        !(
          senderName &&
          (html || "").toLowerCase().includes(senderName.toLowerCase())
        )
      ) {
        const sigHtml = `<div style="margin-top:16px;font-size:0.9rem;">
          <strong>${escapeHtml(senderName)}</strong><br/>
          ${escapeHtml(senderTitle)}<br/>
          ${escapeHtml(senderContact)}
        </div>`;
        html += sigHtml;
      }
    } else {
      // Fallback simple email
      const bodyText =
        data.plain_text ||
        data.generated_text ||
        bodyInstructions ||
        "Hello, please find details below.";
      html = `<div><p>${escapeHtml(bodyText)}</p></div>`;

      if (embedImages && imagesToUse.length)
  html = insertImagesIntoHtml(html, imagesToUse, imagePlacement);


      if (senderName || senderTitle || senderContact) {
        html += `<div style="margin-top:16px;font-size:0.9rem;">
          <strong>${escapeHtml(senderName)}</strong><br/>
          ${escapeHtml(senderTitle)}<br/>
          ${escapeHtml(senderContact)}
        </div>`;
      }
    }

    // --- Update AI preview screen ---
    previewDiv.innerHTML = html || "<em>No email generated</em>"; // For visual preview
    previewDiv.dataset.rawHtml = html; // <-- Store the raw, full HTML string
    if (subjectTextEl) {
      subjectTextEl.textContent = subject;
      subjectTextEl.dataset.rawSubject = subject; // <-- Store the raw subject
    }
    if (subjectWrap) subjectWrap.style.display = "block";

    // --- Show action buttons after successful generation ---
    const editBtn = document.getElementById("ai_edit_in_editor_btn");
    const saveDraftBtn = document.getElementById("ai_save_preview_draft_btn");
    const scheduleBtn = document.getElementById("ai_schedule_btn");
    if (editBtn) editBtn.style.display = "inline-block";
    if (saveDraftBtn) saveDraftBtn.style.display = "inline-block";
    if (scheduleBtn) scheduleBtn.style.display = "inline-block";

    // --- Sync canonical subject (for reusing in Campaign Builder) ---
    let canonicalSubject =
      document.getElementById(CANONICAL_SUBJECT_ID) ||
      (function () {
        const el = document.createElement("div");
        el.id = CANONICAL_SUBJECT_ID;
        el.style.display = "none";
        document.body.appendChild(el);
        return el;
      })();
    canonicalSubject.textContent = subject;
  } catch (err) {
    console.error("generateEmailWithAICampaign error:", err);
    
    // Show user-friendly error message
    previewDiv.innerHTML = `
      <div style="padding:20px;text-align:center;color:#c00;border:1px solid #ffb3b3;border-radius:8px;background:#fff5f5;">
        <div style="font-size:16px;margin-bottom:10px;">⚠️ Generation Failed</div>
        <div>Unable to generate content at the moment. Please try again.</div>
      </div>`;
    
    if (subjectWrap) subjectWrap.style.display = "none";

    // Hide action buttons on error
    const editBtn = document.getElementById("ai_edit_in_editor_btn");
    const saveDraftBtn = document.getElementById("ai_save_preview_draft_btn");
    const scheduleBtn = document.getElementById("ai_schedule_btn");
    if (editBtn) editBtn.style.display = "none";
    if (saveDraftBtn) saveDraftBtn.style.display = "none";
    if (scheduleBtn) scheduleBtn.style.display = "none";
  } finally {
    // Always restore button to original state, whether generation succeeded or failed
    if (generateBtn) {
      generateBtn.disabled = originalBtnDisabled;
      generateBtn.innerHTML = originalBtnHTML;
    }
  }
}

// --- Save as Draft for AI Campaigns ---
/**
 * Gathers all data from the AI Generator (Screen 4) into a payload object.
 * Does NOT include the subject, as that comes from the modal.
 */
function gatherAIGeneratorPayload() {
  const htmlEl = document.getElementById("ai_gen_email_preview");
  const htmlBody = htmlEl?.dataset.rawHtml || htmlEl?.innerHTML || "";

  // Gather metadata from Screen 4 inputs
  const metadata = {
    source: "AI_Generator_Screen_4",
    template_type: document.getElementById("ai_template_type")?.value || null,
    subject_instructions:
      document.getElementById("ai_subject_instructions")?.value || null,
    body_instructions:
      document.getElementById("ai_body_instructions")?.value || null,
    additional_context:
      document.getElementById("ai_additional_context")?.value || null,
    sender_name: document.getElementById("ai_sender_name")?.value || null,
    sender_title: document.getElementById("ai_sender_title")?.value || null,
  };

  const payload = {
    // subject is missing (will be added from modal)
    html_body: htmlBody,
    text_body: "", // Can be auto-generated on backend if needed
    template_id: null, // AI Gen screen doesn't use a base template
    template_name: "AI Generated",
    metadata: metadata,
  };

  return payload;
}

// --- Add AI Campaign Event Listeners ---
document.addEventListener("DOMContentLoaded", function () {
  const aiGenBtn = document.getElementById("generate-ai-btn");
  aiGenBtn?.addEventListener("click", generateEmailWithAICampaign);

  // NOTE: generate-ai-template-btn is already wired via onclick="generateTemplateFromAI()" in HTML
  // Do not add duplicate event listener here to avoid double-triggering

  const aiSaveDraft = document.getElementById("save-ai-draft-btn");
  aiSaveDraft?.addEventListener("click", () =>
    openSaveDraftModal("aiGenerator"),
  );

  const cbSaveDraft = document.getElementById("save-campaign-draft-btn");
  if (cbSaveDraft) {
    cbSaveDraft?.addEventListener("click", () =>
      openSaveDraftModal("campaignBuilder"),
    );
  }
  // --- NEW: wire live preview for image URLs (supports both ai_image_urls and image_urls) ---
  const imgTxt =
    document.getElementById("ai_image_urls") ||
    document.getElementById("image_urls");
  if (imgTxt) {
    imgTxt.addEventListener("input", renderImagePreviewFromTextarea);
    // initial render if textarea already has value
    renderImagePreviewFromTextarea();
  }
});

// ----------------- New AI Template UI helpers -----------------
async function generateTemplateFromAI() {
  // Convenience wrapper for the new UI button
  return await generateEmailWithAICampaign();
}

function clearAITemplateInputs() {
  // Clear these fields, but NOT template_style (user's preference should be preserved)
  const ids = [
    "ai_image_file_input",
    "ai-uploaded-images-preview",
    "ai_image_urls",
    "ai_generation_brief",
    "ai_subject_hint",
    "ai_image_placement",
  ];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") el.value = "";
    else el.innerHTML = "";
  });
  const preview = document.getElementById("ai_gen_email_preview");
  if (preview) {
    preview.innerHTML = '<em>Generated email will appear here after you click "Generate Template".</em>';
    delete preview.dataset.rawHtml;
  }
  const subjWrap = document.getElementById("ai_gen_subject_preview");
  if (subjWrap) subjWrap.style.display = "none";

  // Hide action buttons when clearing
  const saveDraftBtn = document.getElementById("ai_save_preview_draft_btn");
  const scheduleBtn = document.getElementById("ai_schedule_btn");
  if (saveDraftBtn) saveDraftBtn.style.display = "none";
  if (scheduleBtn) scheduleBtn.style.display = "none";
}

function openTemplateEditor() {
  const preview = document.getElementById("ai_gen_email_preview");
  const subjEl = document.getElementById("ai_gen_subject_preview_text");
  const html = preview?.dataset?.rawHtml || preview?.innerHTML || "";
  const subj = subjEl?.dataset?.rawSubject || subjEl?.textContent || "";
  try {
    localStorage.setItem("ai_generated_html", html);
    localStorage.setItem("ai_generated_subject", subj);
  } catch (e) {
    console.warn("Failed to persist AI generated html to localStorage", e);
  }
  window.location.href = "templates.html";
}

function saveDraftFromPreview() {
  openSaveDraftModal("aiGenerator");
}

async function approveAndScheduleFromPreview() {
  // Copy AI preview into campaign builder canonical fields and open schedule modal
  const has = copyAIPreviewToCampaignBuilder();
  if (!has) {
    showNotification("Please generate an AI email first before approving.", "error");
    return;
  }
  if (typeof window.openScheduleModal === "function") {
    try {
      window.openScheduleModal();
      return;
    } catch (err) {
      console.warn("openScheduleModal threw:", err);
    }
  }
  const modal = document.getElementById("schedule-modal");
  if (modal) modal.style.display = "flex";
}

// ----------------- Image usage radio button toggle -----------------
document.addEventListener("DOMContentLoaded", function () {
  const radioButtons = document.querySelectorAll('input[name="ai_image_usage"]');
  const placementWrapper = document.getElementById("ai_image_placement_wrapper");

  if (!radioButtons.length || !placementWrapper) return;

  function updatePlacementVisibility() {
    const checkedRadio = document.querySelector('input[name="ai_image_usage"]:checked');
    const mode = checkedRadio?.value || "reference";
    // Show placement dropdown only if "place" is selected
    placementWrapper.style.display = mode === "place" ? "block" : "none";
  }

  // Wire toggle handlers
  radioButtons.forEach((radio) => {
    radio.addEventListener("change", updatePlacementVisibility);
  });

  // Initial state
  updatePlacementVisibility();
});

// ----------------- Image upload wiring for AI UI -----------------
document.addEventListener("DOMContentLoaded", function () {
  const dropArea = document.getElementById("ai-image-upload-area");
  const fileInput = document.getElementById("ai_image_file_input");
  const previewList = document.getElementById("ai-uploaded-images-preview");

  if (!dropArea || !fileInput) return;

  dropArea.addEventListener("click", () => fileInput.click());

  dropArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropArea.style.opacity = "0.85";
  });
  dropArea.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dropArea.style.opacity = "1";
  });
  dropArea.addEventListener("drop", async (e) => {
    e.preventDefault();
    dropArea.style.opacity = "1";
    const files = Array.from(e.dataTransfer.files || []);
    if (!files.length) return;
    await uploadAiFiles(files);
  });

  fileInput.addEventListener("change", async (e) => {
    const files = Array.from(fileInput.files || []);
    if (!files.length) return;
    await uploadAiFiles(files);
  });

  async function uploadAiFiles(files) {
    for (const f of files) {
      if (!f) continue;
      // simple validation
      if (!f.type.startsWith("image/")) {
        showNotification("Only image files are accepted.", "error");
        continue;
      }
      const fd = new FormData();
      fd.append("file", f);
      try {
        const res = await fetch(`${API_BASE_URL}/images/upload`, {
          method: "POST",
          headers: authHeaders(),
          body: fd,
        });
        let errorMessage = "Failed to upload image.";
        if (!res.ok) {
          try {
            errorMessage = await res.text();
          } catch (e) {
            errorMessage = `HTTP ${res.status}: ${res.statusText}`;
          }
          throw new Error(errorMessage);
        }
        const data = await res.json();
        const url = data.public_url || data.publicUrl || data.publicUrl;
        // add thumbnail preview
        if (previewList) {
          const img = document.createElement("img");
          img.src = url + "/thumb";
          img.alt = data.filename || "uploaded";
          img.style.maxWidth = "120px";
          img.style.maxHeight = "80px";
          img.style.objectFit = "cover";
          img.style.border = "1px solid #ddd";
          img.style.borderRadius = "4px";
          img.style.padding = "2px";
          previewList.appendChild(img);
        }
        // append to ai_image_urls textarea
        const txt = document.getElementById("ai_image_urls");
        if (txt) {
          const existing = (txt.value || "").trim();
          txt.value = existing ? existing + "\n" + url : url;
          renderImagePreviewFromTextarea();
        }
        showNotification("Image uploaded", "success");
      } catch (err) {
        console.error("AI image upload failed", err);
        showNotification("Image upload failed", "error");
      }
    }
  }
});

// --- Signature toggle and localStorage save ---
document.addEventListener("DOMContentLoaded", function () {
  const toggleBtn = document.getElementById("toggle-signature-btn");
  const fieldsDiv = document.getElementById("signature-fields");

  const nameInput = document.getElementById("sender-name");
  const titleInput = document.getElementById("sender-title");
  const contactInput = document.getElementById("sender-contact");

  // Restore saved signature from localStorage
  const savedSignature = JSON.parse(
    localStorage.getItem("userSignature") || "{}",
  );
  if (savedSignature.name) nameInput.value = savedSignature.name;
  if (savedSignature.title) titleInput.value = savedSignature.title;
  if (savedSignature.contact) contactInput.value = savedSignature.contact;

  // Toggle visibility
  toggleBtn?.addEventListener("click", () => {
    const isVisible = fieldsDiv.style.display === "block";
    fieldsDiv.style.display = isVisible ? "none" : "block";
    toggleBtn.textContent = isVisible ? "Add Signature" : "Hide Signature";
  });

  // Save signature values automatically
  [nameInput, titleInput, contactInput].forEach((input) => {
    input?.addEventListener("input", () => {
      const sig = {
        name: nameInput.value.trim(),
        title: titleInput.value.trim(),
        contact: contactInput.value.trim(),
      };
      localStorage.setItem("userSignature", JSON.stringify(sig));
    });
  });
});

// ---------------------- AI -> Reuse Campaign Builder Schedule Flow ----------------------
// Helper: return first existing element from a list of possible IDs
function firstEl(...ids) {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) return el;
  }
  return null;
}

// Copy AI preview HTML + subject into the campaign-builder preview elements (canonical-safe)
function copyAIPreviewToCampaignBuilder() {
  const aiPreview = firstEl(
    "ai_gen_email_preview", // Read from the AI Gen tab
  );
  const aiSubjectText = firstEl(
    "ai_gen_subject_preview_text", // Read from the AI Gen tab
  );

  let campaignPreview = firstEl(CANONICAL_HTML_ID);
  let campaignSubject = document.getElementById(CANONICAL_SUBJECT_ID);

  // ensure campaign placeholders exist
  if (!campaignPreview) {
    campaignPreview = document.createElement("div");
    campaignPreview.id = CANONICAL_HTML_ID;
    campaignPreview.style.display = "none";
    document.body.appendChild(campaignPreview);
  }
  if (!campaignSubject) {
    campaignSubject = document.createElement("div");
    campaignSubject.id = CANONICAL_SUBJECT_ID;
    campaignSubject.style.display = "none";
    document.body.appendChild(campaignSubject);
  }

  // Copy raw HTML and subject from dataset
  const html = aiPreview
    ? aiPreview.dataset.rawHtml || aiPreview.innerHTML || ""
    : "";
  const subj =
    (aiSubjectText &&
      (
        aiSubjectText.dataset.rawSubject ||
        aiSubjectText.textContent ||
        aiSubjectText.innerText ||
        ""
      ).trim()) ||
    (
      campaignSubject.dataset.rawSubject ||
      campaignSubject.textContent ||
      ""
    ).trim();

  // Write to canonical elements (for visual AND dataset)
  campaignPreview.innerHTML = html; // For visual
  campaignPreview.dataset.rawHtml = html; // <-- Store raw string on canonical element
  campaignSubject.textContent = subj || "(No subject)";
  campaignSubject.dataset.rawSubject = subj || "(No subject)"; // <-- Store raw string here too

  return !!html;
}

// Wire Approve button on AI screen to reuse campaign-builder schedule flow
document.addEventListener("DOMContentLoaded", function () {
  const aiApproveBtn =
    document.getElementById("ai_approve_schedule_btn") ||
    document.getElementById("ai-approve-schedule-btn");

  if (!aiApproveBtn) return;

  aiApproveBtn.addEventListener("click", function (e) {
    e.preventDefault();

    // Copy AI preview -> campaign builder preview elements
    const hasHtml = copyAIPreviewToCampaignBuilder();
    if (!hasHtml) {
      // friendly inline message if preview not yet generated
      if (typeof showModalInlineMessage === "function") {
        showModalInlineMessage(
          "Please generate an AI email first before approving.",
          "error",
        );
      } else {
        alert("Please generate an AI email first before approving.");
      }
      return;
    }

    // Open the existing campaign-builder schedule modal (re-uses its send/schedule handlers)
    if (typeof window.openScheduleModal === "function") {
      try {
        window.openScheduleModal();
        return;
      } catch (err) {
        console.warn("openScheduleModal threw:", err);
      }
    }

    // Fallback — directly show the modal element
    const modal = firstEl("schedule-modal");
    if (modal) {
      modal.style.display = "flex";
    } else {
      console.error("Schedule modal not found. Ensure #schedule-modal exists.");
      alert("Schedule flow not available — schedule modal missing.");
    }
  });
});

/**
 * Gathers all data from the Campaign Builder (Screen 3) into a payload object.
 * Does NOT include the subject, as that comes from the modal.
 */
function gatherCampaignBuilderPayload() {
  const htmlEl = document.getElementById("ai-email-preview");
  const htmlBody = htmlEl?.dataset.rawHtml || htmlEl?.innerHTML || "";

  // --- Determine active workflow (healthcare or wellness) ---
  const wellnessRadio = document.getElementById("campaign-type-wellness");
  const isWellness = wellnessRadio && wellnessRadio.checked;

  let metadata = {};
  let templateSelectEl;

  if (isWellness) {
    templateSelectEl = document.getElementById("wellness-template-select");
    metadata = {
      source: "Campaign_Builder_Wellness",
      campaign_type: "wellness",
      specialty:
        document.getElementById("wellness-specialty-select")?.value || null,
      product: document.getElementById("wellness-product-input")?.value || null,
      tone: document.getElementById("wellness-tone-select")?.selectedOptions[0]
        ?.text,
      rag_usage:
        document.querySelector('input[name="wellness_rag_usage"]:checked')
          ?.value || null,
      rag_collection:
        document.getElementById("wellness-rag-file-select")?.value || null,
      ai_instructions:
        document.getElementById("wellness-ai-instructions")?.value || null,
    };
  } else {
    templateSelectEl = document.getElementById("template-select");
    metadata = {
      source: "Campaign_Builder_Healthcare",
      campaign_type: "healthcare",
      specialties: Array.from(
        document.getElementById("specialty-select")?.selectedOptions || [],
      ).map((opt) => opt.text),
      product: document.getElementById("drug-input")?.value || null,
      tone: document.getElementById("tone-select")?.selectedOptions[0]?.text,
      npi: document.getElementById("npi-input")?.value || null,
      doctor: document.getElementById("doctorName")?.textContent || null,
      rag_usage:
        document.querySelector('input[name="rag_usage"]:checked')?.value ||
        null,
      rag_collection: document.getElementById("rag-file-select")?.value || null,
      geography:
        (document.querySelector('input[name="rag_usage"]:checked')?.value === "news")
          ? Array.from(document.getElementById("geography-select")?.selectedOptions || []).map((opt) => opt.text)
          : null,
    };
  }

  const template_id = templateSelectEl?.value
    ? resolveTemplateId(templateSelectEl.value)
    : null;
  const template_name =
    templateSelectEl && templateSelectEl.selectedIndex > 0
      ? templateSelectEl.options[templateSelectEl.selectedIndex].text
      : null;

  const payload = {
    // subject is missing (will be added from modal)
    html_body: htmlBody,
    text_body: "",
    template_id: typeof template_id === "number" ? template_id : null,
    template_name: template_name,
    metadata: metadata,
  };

  return payload;
}
/**
 * Loads a draft's content into the Campaign Builder UI.
 * @param {object} draft - The draft object from the API.
 */
function loadDraftIntoBuilder(draft) {
  if (!draft) return;

  const subjectEl = document.getElementById("subject-line-content");
  const htmlEl = document.getElementById("ai-email-preview");

  if (subjectEl) {
    subjectEl.textContent = draft.subject;
    subjectEl.dataset.rawSubject = draft.subject;
    document.getElementById("subject-line-display").style.display = "block";
  }

  if (htmlEl) {
    htmlEl.innerHTML = draft.html_body;
    htmlEl.dataset.rawHtml = draft.html_body;
  }

  // --- FUTURE STEP ---
  // We can now also load all the dropdowns
  // if (draft.metadata) {
  //   try {
  //     const meta = JSON.parse(draft.metadata);
  //     console.log("Loading metadata:", meta);
  //     // ... logic to set dropdowns would go here ...
  //   } catch(e) { console.warn('Could not parse draft metadata', e); }
  // }

  showNotification(
    `Draft "${draft.subject.substring(0, 20)}..." loaded!`,
    "success",
  );
}

/**
 * Opens the "Save As..." modal and pre-fills the subject.
 * @param {string} sourceScreen - 'campaignBuilder' or 'aiGenerator'
 */
function openSaveDraftModal(sourceScreen) {
  const modal = document.getElementById("save-draft-modal");
  const nameInput = document.getElementById("draft-name-input");
  const msgEl = document.getElementById("save-draft-modal-message");

  let currentSubject = "";
  if (sourceScreen === "campaignBuilder") {
    const subjectEl = document.getElementById("subject-line-content");
    currentSubject =
      subjectEl?.dataset.rawSubject || subjectEl?.textContent || "";
  } else if (sourceScreen === "aiGenerator") {
    const subjectEl = document.getElementById("ai_gen_subject_preview_text");
    currentSubject =
      subjectEl?.dataset.rawSubject || subjectEl?.textContent || "";
  }

  nameInput.value = currentSubject.trim();
  msgEl.style.display = "none";
  modal.style.display = "flex";
  modal.dataset.source = sourceScreen; // Store which screen triggered it
  nameInput.focus();
}

/**
 * Handles the final click on the modal's "Save Draft" button.
 */
async function handleConfirmSaveDraft() {
  const modal = document.getElementById("save-draft-modal");
  const nameInput = document.getElementById("draft-name-input");
  const msgEl = document.getElementById("save-draft-modal-message");
  const saveBtn = document.getElementById("confirm-save-draft-btn");

  const sourceScreen = modal.dataset.source;
  const newSubject = nameInput.value.trim();

  if (!newSubject) {
    msgEl.textContent = "Please enter a subject name for the draft.";
    msgEl.style.display = "block";
    return;
  }

  let payload;
  try {
    if (sourceScreen === "campaignBuilder") {
      payload = gatherCampaignBuilderPayload();
    } else if (sourceScreen === "aiGenerator") {
      payload = gatherAIGeneratorPayload();
    } else {
      throw new Error("Invalid draft source.");
    }

    // Add the new subject from the modal
    payload.subject = newSubject;

    // Call the generic save function
    await saveDraftToAPI(payload, saveBtn);

    // Success! Hide modal and refresh the Step 3 drafts list
    modal.style.display = "none";
    if (typeof loadSavedDrafts === "function") {
      loadSavedDrafts(); // Refresh the list in the campaign builder
    }
  } catch (err) {
    msgEl.textContent = `Error: ${err.message}`;
    msgEl.style.display = "block";
  }
}

// Wire up the new modal's buttons
document.addEventListener("DOMContentLoaded", () => {
  document
    .getElementById("cancel-save-draft-btn")
    ?.addEventListener("click", () => {
      document.getElementById("save-draft-modal").style.display = "none";
    });

  document
    .getElementById("confirm-save-draft-btn")
    ?.addEventListener("click", handleConfirmSaveDraft);
});

// --- AFTER: Add logic for new "View Drafts" Page (Step 7) ---

/**
 * Fetches all drafts and populates the new "View Drafts" page.
 */
async function loadFullDraftsPage() {
  const container = document.getElementById("full-drafts-list-container");
  if (!container) return;

  container.innerHTML = `<div class="loading-spinner" style="margin: 40px auto;"></div>`;

  try {
    const res = await fetch(`${API_BASE_URL}/drafts`, {
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error("Failed to fetch drafts");

    const data = await res.json();
    container.innerHTML = ""; // Clear loader

    if (!data.drafts || data.drafts.length === 0) {
      container.innerHTML = `<p style="color: #6b7280; text-align: center; padding: 40px 20px;">No drafts saved yet.</p>`;
      return;
    }

    // data.drafts.forEach((draft) => {
    //   const draftEl = document.createElement("div");
    //   draftEl.className = "draft-item";
    //   draftEl.style =
    //     "display: flex; justify-content: space-between; align-items: center; padding: 15px; border-bottom: 1px solid #f0f0f0;";
    //   draftEl.innerHTML = `
    //     <div style="flex: 1; min-width: 0; margin-right: 15px;">
    //       <strong style="display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 1.05rem;" title="${escapeHtml(
    //         draft.subject
    //       )}">
    //         ${escapeHtml(draft.subject)}
    //       </strong>
    //       <small style="color: #6b7280;">
    //         Source: ${escapeHtml(
    //           draft.metadata?.source || "Unknown"
    //         )} | Updated: ${new Date(draft.updated_at).toLocaleString()}
    //       </small>
    //     </div>
    //     <div style="display: flex; gap: 10px; flex-shrink: 0;">
    //       <button class="btn btn-outline btn-small draft-preview-btn" data-draft-id="${
    //         draft.id
    //       }">
    //         Preview
    //       </button>
    //       <button class="btn btn-small draft-use-btn" data-draft-id="${
    //         draft.id
    //       }">
    //         Use this
    //       </button>
    //     </div>
    //   `;
    //   container.appendChild(draftEl);
    // });

    data.drafts.forEach((draft) => {
      const draftEl = document.createElement("div");
      draftEl.className = "draft-item";
      draftEl.style =
        "display: flex; justify-content: space-between; align-items: center; padding: 15px; border-bottom: 1px solid #f0f0f0;";

      // We create two containers: one for Viewing (text) and one for Editing (input)
      draftEl.innerHTML = `
        <div style="flex: 1; min-width: 0; margin-right: 15px;">
          
          <div id="draft-subject-view-${draft.id}" style="display: flex; align-items: center; gap: 8px;">
            <strong style="display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 1.05rem;" title="${escapeHtml(draft.subject)}">
              ${escapeHtml(draft.subject)}
            </strong>
            <button onclick="toggleDraftEdit(${draft.id}, true)" style="border:none; background:none; cursor:pointer; color:#9ca3af; transition: color 0.2s;" title="Edit Subject" onmouseover="this.style.color='#4b5563'" onmouseout="this.style.color='#9ca3af'">
              ✏️
            </button>
          </div>

          <div id="draft-subject-edit-${draft.id}" style="display: none; align-items: center; gap: 6px; margin-bottom: 4px;">
            <input type="text" id="draft-subject-input-${draft.id}" class="form-control" value="${escapeHtml(draft.subject)}" style="padding: 4px 8px; font-size: 0.9rem; height: auto; width: auto; flex:1; max-width: 400px;">
            <button onclick="saveDraftSubject(${draft.id}, this)" class="btn btn-primary btn-small" style="padding: 4px 10px; font-size: 0.8rem;">Save</button>
            <button onclick="toggleDraftEdit(${draft.id}, false)" class="btn btn-outline btn-small" style="padding: 4px 10px; font-size: 0.8rem; border-color: #d1d5db; color: #6b7280;">Cancel</button>
          </div>

          <small style="color: #6b7280;">
            Source: ${escapeHtml(draft.metadata?.source || "Unknown")} | Updated: ${new Date(draft.updated_at).toLocaleString()}
          </small>
        </div>

        <div style="display: flex; gap: 10px; flex-shrink: 0;">
          <button class="btn btn-outline btn-small draft-preview-btn" data-draft-id="${draft.id}">
            Preview
          </button>
          <button class="btn btn-small draft-use-btn" data-draft-id="${draft.id}">
            Use this
          </button>
          <button
            class="btn btn-outline btn-small draft-delete-btn"
            data-draft-id="${draft.id}"
            style="border-color: #ef4444; color: #ef4444;"
          >
            Delete
          </button>
        </div>
      `;
      container.appendChild(draftEl);
    });
  } catch (err) {
    console.error("Error loading full drafts page:", err);
    container.innerHTML = `<p style="color: var(--danger-red); text-align: center; padding: 40px 20px;">Failed to load drafts list.</p>`;
  }
}


/**
 * Deletes a draft by ID.
 * @param {number|string} draftId - The ID of the draft to delete.
 * @param {HTMLElement} buttonEl - Button element for spinner/disable.
 */
async function deleteDraftById(draftId, buttonEl) {
  const originalBtnHTML = buttonEl ? buttonEl.innerHTML : "";
  if (buttonEl) {
    buttonEl.innerHTML =
      '<div class="loading-spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;"></div>';
    buttonEl.disabled = true;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/drafts/${draftId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to delete draft");
    }
    showNotification("Draft deleted successfully.", "success");
  } catch (err) {
    console.error("Error deleting draft:", err);
    showNotification(`Delete failed: ${err.message}`, "error");
  } finally {
    if (buttonEl) {
      buttonEl.innerHTML = originalBtnHTML;
      buttonEl.disabled = false;
    }
  }
}
/**
 * Handles clicks on the new "View Drafts" page.
 */
document
    .getElementById("full-drafts-list-container")
  ?.addEventListener("click", async (e) => {
    const previewBtn = e.target.closest(".draft-preview-btn");
    const useBtn = e.target.closest(".draft-use-btn");
    const deleteBtn = e.target.closest(".draft-delete-btn");

    if (previewBtn) {
      const draftId = previewBtn.dataset.draftId;
      await previewDraftInNewTab(draftId, previewBtn);
    }

    if (useBtn) {
      const draftId = useBtn.dataset.draftId;
      const originalBtnHTML = useBtn.innerHTML;
      useBtn.innerHTML =
        '<div class="loading-spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;"></div>';
      useBtn.disabled = true;

      try {
        const res = await fetch(`${API_BASE_URL}/drafts/${draftId}`, {
          headers: authHeaders(),
        });
        if (!res.ok) throw new Error("Draft not found or unauthorized");
        const data = await res.json();

        if (data.draft) {
          loadDraftIntoBuilder(data.draft); // Load content
          showStep("campaign"); // Switch to Campaign Builder
        }
      } catch (err) {
        showNotification(`Error loading draft: ${err.message}`, "error");
      } finally {
        useBtn.innerHTML = originalBtnHTML;
        useBtn.disabled = false;
      }
    }

    if (deleteBtn) {
      const draftId = deleteBtn.dataset.draftId;
      const confirmDelete = window.confirm(
        "Delete this draft? This cannot be undone."
      );
      if (!confirmDelete) return;

      await deleteDraftById(draftId, deleteBtn);
      await loadFullDraftsPage(); // Refresh list
    }
  });

/**
 * Fetches a single draft and opens its HTML in a new tab.
 */
async function previewDraftInNewTab(draftId, buttonEl) {
  const originalBtnHTML = buttonEl ? buttonEl.innerHTML : "";
  if (buttonEl) {
    buttonEl.innerHTML =
      '<div class="loading-spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;"></div>';
    buttonEl.disabled = true;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/drafts/${draftId}`, {
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error("Draft not found or unauthorized");
    const data = await res.json();

    if (data.draft && data.draft.html_body) {
      const newTab = window.open();
      newTab.document.open();
      newTab.document.write(data.draft.html_body);
      newTab.document.close();
    } else {
      throw new Error("Draft contains no HTML content.");
    }
  } catch (err) {
    showNotification(`Error: ${err.message}`, "error");
  } finally {
    if (buttonEl) {
      buttonEl.innerHTML = originalBtnHTML;
      buttonEl.disabled = false;
    }
  }
}

/**
 * Saves a new custom specialty for the Healthcare workflow
 */
async function saveHealthcareSpecialty() {
  const input = document.getElementById("healthcare-specialty-add");
  const saveBtn = document.getElementById("healthcare-specialty-save-btn");
  if (!input || !saveBtn) return;

  const name = input.value.trim();
  if (!name) {
    showNotification("Please enter a specialty name.", "error");
    return;
  }

  const originalBtnText = saveBtn.textContent;
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  try {
    // Save to the global specialties table (Healthcare)
    const res = await fetch(`${API_BASE_URL}/specialties`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ name: name }),
    });

    if (!res.ok) {
      const err = await res.json();
      if (res.status === 409) {
        showNotification(err.detail || "Specialty already exists.", "info");
      } else {
        throw new Error(err.detail || "Failed to save specialty");
      }
    } else {
      await res.json();
      showNotification(`Specialty "${name}" saved!`, "success");
      input.value = ""; // Clear input

      // Reload the healthcare dropdown
      await loadDropdowns();
    }
  } catch (err) {
    console.error("Error saving healthcare specialty:", err);
    showNotification(err.message, "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = originalBtnText;
  }
}

// Wire the button
document.addEventListener("DOMContentLoaded", function () {
  const hcSaveBtn = document.getElementById("healthcare-specialty-save-btn");
  if (hcSaveBtn) {
    hcSaveBtn.addEventListener("click", saveHealthcareSpecialty);
  }
});

/**
 * Removes selected specialties from the backend and reloads the dropdown.
 */
async function removeSelectedSpecialties() {
  const select = document.getElementById("specialty-select");
  if (!select) return;
  const selectedIds = Array.from(select.selectedOptions).map((opt) => parseInt(opt.value));
  if (selectedIds.length === 0) {
    showNotification("Please select at least one specialty to remove.", "error");
    return;
  }
  if (!confirm(`Remove ${selectedIds.length} selected specialt${selectedIds.length === 1 ? 'y' : 'ies'}?`)) return;

  let removed = 0;
  for (const id of selectedIds) {
    try {
      const res = await fetch(`${API_BASE_URL}/specialties/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (res.ok) removed++;
    } catch (err) {
      console.error(`Error deleting specialty ${id}:`, err);
    }
  }
  showNotification(`${removed} specialt${removed === 1 ? 'y' : 'ies'} removed.`, "success");
  await loadDropdowns();
}

/**
 * Removes selected geographies from the backend and reloads the dropdown.
 */
async function removeSelectedGeographies() {
  const select = document.getElementById("geography-select");
  if (!select) return;
  const selectedIds = Array.from(select.selectedOptions).map((opt) => parseInt(opt.value));
  if (selectedIds.length === 0) {
    showNotification("Please select at least one geography to remove.", "error");
    return;
  }
  if (!confirm(`Remove ${selectedIds.length} selected geograph${selectedIds.length === 1 ? 'y' : 'ies'}?`)) return;

  let removed = 0;
  for (const id of selectedIds) {
    try {
      const res = await fetch(`${API_BASE_URL}/geographies/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (res.ok) removed++;
    } catch (err) {
      console.error(`Error deleting geography ${id}:`, err);
    }
  }
  showNotification(`${removed} geograph${removed === 1 ? 'y' : 'ies'} removed.`, "success");
  await loadDropdowns();
}

/**
 * Toggles the visibility of the Draft Subject Edit mode.
 * @param {number} draftId - The ID of the draft.
 * @param {boolean} showEdit - True to show input, False to show text.
 */
function toggleDraftEdit(draftId, showEdit) {
  const viewEl = document.getElementById(`draft-subject-view-${draftId}`);
  const editEl = document.getElementById(`draft-subject-edit-${draftId}`);

  if (viewEl && editEl) {
    if (showEdit) {
      viewEl.style.display = "none";
      editEl.style.display = "flex";
      // Auto-focus the input
      const input = document.getElementById(`draft-subject-input-${draftId}`);
      if (input) input.focus();
    } else {
      viewEl.style.display = "flex";
      editEl.style.display = "none";
    }
  }
}

/**
 * Saves the updated draft subject to the backend.
 * @param {number} draftId - The ID of the draft.
 * @param {HTMLElement} btn - The save button element (for spinner).
 */
async function saveDraftSubject(draftId, btn) {
  const input = document.getElementById(`draft-subject-input-${draftId}`);
  if (!input) return;

  const newSubject = input.value.trim();
  if (!newSubject) {
    showNotification("Subject cannot be empty.", "error");
    return;
  }

  const originalText = btn.textContent;
  btn.textContent = "...";
  btn.disabled = true;

  try {
    // Call PATCH endpoint to update subject
    const res = await fetch(`${API_BASE_URL}/drafts/${draftId}`, {
      method: "PATCH",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ subject: newSubject }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to update subject");
    }

    // Success: Update the View UI and toggle back
    const viewEl = document.getElementById(`draft-subject-view-${draftId}`);
    const strongTag = viewEl.querySelector("strong");
    if (strongTag) {
      strongTag.textContent = newSubject;
      strongTag.title = newSubject;
    }

    showNotification("Subject updated successfully", "success");
    toggleDraftEdit(draftId, false);
  } catch (err) {
    console.error("Error updating draft subject:", err);
    showNotification(err.message, "error");
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

/**
 * Settings page for Mailjet and Mailchimp
 */
async function loadProviderSettings() {
  console.log("[loadProviderSettings] Function called");
  try {
    const res = await fetch(`${API_BASE_URL}/email-settings`, {
      headers: authHeaders(),
    });

    if (!res.ok) {
      console.warn(`Failed to load settings: ${res.status}`);
      showNotification("Failed to load settings", "error");
      return;
    }

    const data = await res.json();
    console.log("Settings loaded:", data);
    
    // Data is a flat object matching the email_settings table columns

    // --- Mailchimp Fields ---
    const mcNameEl = document.getElementById("settings-mc-from-name");
    if (mcNameEl) {
      mcNameEl.value = data.mailchimp_from_name || "";
      console.log("[loadProviderSettings] Set settings-mc-from-name to:", mcNameEl.value);
    } else {
      console.warn("[loadProviderSettings] Element settings-mc-from-name not found!");
    }
    
    const mcEmailEl = document.getElementById("settings-mc-from-email");
    if (mcEmailEl) {
      mcEmailEl.value = data.mailchimp_from_email || "";
      console.log("[loadProviderSettings] Set settings-mc-from-email to:", mcEmailEl.value);
    } else {
      console.warn("[loadProviderSettings] Element settings-mc-from-email not found!");
    }
    
    const mcReplyEl = document.getElementById("settings-mc-reply-to");
    if (mcReplyEl) {
      mcReplyEl.value = data.mailchimp_reply_to || "";
      console.log("[loadProviderSettings] Set settings-mc-reply-to to:", mcReplyEl.value);
    } else {
      console.warn("[loadProviderSettings] Element settings-mc-reply-to not found!");
    }

    // --- Mailjet Fields ---
    const mjNameEl = document.getElementById("settings-mj-from-name");
    if (mjNameEl) {
      mjNameEl.value = data.mailjet_from_name || "";
      console.log("[loadProviderSettings] Set settings-mj-from-name to:", mjNameEl.value);
    } else {
      console.warn("[loadProviderSettings] Element settings-mj-from-name not found!");
    }
    
    const mjEmailEl = document.getElementById("settings-mj-from-email");
    if (mjEmailEl) {
      mjEmailEl.value = data.mailjet_from_email || "";
      console.log("[loadProviderSettings] Set settings-mj-from-email to:", mjEmailEl.value);
    } else {
      console.warn("[loadProviderSettings] Element settings-mj-from-email not found!");
    }

    console.log("[loadProviderSettings] Finished loading all settings");
  } catch (err) {
    console.error("Error loading provider settings:", err);
    showNotification("Error loading settings", "error");
  }
}

/**
 * Saves settings for a specific provider to the email_settings table.
 * @param {string} provider - 'mailchimp' or 'mailjet'
 * @param {HTMLElement} btn - The button element
 */
async function saveProviderSettings(provider, btn) {
  const originalText = btn.textContent;
  btn.textContent = "Saving...";
  btn.disabled = true;

  let payload = {};

  if (provider === "mailchimp") {
    payload = {
      mailchimp_from_name: document
        .getElementById("settings-mc-from-name")
        .value.trim(),
      mailchimp_from_email: document
        .getElementById("settings-mc-from-email")
        .value.trim(),
      mailchimp_reply_to: document
        .getElementById("settings-mc-reply-to")
        .value.trim(),
    };
  } else if (provider === "mailjet") {
    payload = {
      mailjet_from_name: document
        .getElementById("settings-mj-from-name")
        .value.trim(),
      mailjet_from_email: document
        .getElementById("settings-mj-from-email")
        .value.trim(),
    };
  }

  try {
    // We use a PUT request to update the user's settings row
    const res = await fetch(`${API_BASE_URL}/email-settings`, {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Failed to save settings");
    }

    showNotification(
      `${provider.charAt(0).toUpperCase() + provider.slice(1)} identity saved!`,
      "success",
    );
  } catch (err) {
    console.error("Error saving settings:", err);
    showNotification(err.message, "error");
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}
