window.LitLab.requireAuth();

const accountMessageEl = document.getElementById("account-message");
const accountFormEl = document.getElementById("account-form");
const accountEmailEl = document.getElementById("account-email");
const accountUserIdEl = document.getElementById("account-user-id");
const accountNicknameEl = document.getElementById("account-nickname");
const accountSchoolEl = document.getElementById("account-school");

function setMessage(text, tone = "info") {
  accountMessageEl.textContent = text;
  accountMessageEl.className = `message ${tone}`;
}

async function loadAccountProfile() {
  setMessage("Loading account information...");
  try {
    const response = await window.LitLab.apiFetch("/account/profile");
    const profile = response.profile || {};
    const email = profile.email || localStorage.getItem("litlab_user_email") || "";
    const userId = profile.user_id || "";
    const nickname = profile.nickname || "";
    const school = profile.school || "";

    accountEmailEl.value = email;
    accountUserIdEl.value = userId;
    accountNicknameEl.value = nickname;
    accountSchoolEl.value = school;
    setMessage("Account information loaded.", "success");
  } catch (error) {
    setMessage(error.message || "Could not load account information.", "error");
  }
}

accountFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const nickname = accountNicknameEl.value.trim();
  const school = accountSchoolEl.value.trim();

  setMessage("Saving settings...");
  try {
    const response = await window.LitLab.apiFetch("/account/profile", {
      method: "PUT",
      body: JSON.stringify({ nickname, school }),
    });
    const profile = response.profile || {};
    accountSchoolEl.value = profile.school || school;
    accountNicknameEl.value = profile.nickname || nickname;
    setMessage("Account settings saved.", "success");
  } catch (error) {
    setMessage(error.message || "Could not save account settings.", "error");
  }
});

loadAccountProfile();
