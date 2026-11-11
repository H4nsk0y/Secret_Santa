"use strict";

const scene = document.querySelector("#scene");
const reveal = document.querySelector("#reveal");
const recipient = document.querySelector("#recipient");
const addressee = document.querySelector("#addressee");
const intro = document.querySelector("#intro");
const note = document.querySelector("#note");
const letter = document.querySelector("#letter");
const sparks = document.querySelector("#sparks");
const song = document.querySelector("#song");
const sound = document.querySelector("#sound");
const sampleInvitation = {"recipient":"Найка","addressee":"Шихсакит младший"};

function decodeBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Invalid invitation encoding");
  }
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

async function readInvitation(fragment) {
  const match = /^#santa=([12])\.([^.]+)\.([^.]+)\.([^.]+)$/.exec(fragment);
  if (!match) throw new Error("Invalid invitation format");

  const [, version, encodedKey, encodedIv, encodedCiphertext] = match;
  const iv = decodeBase64Url(encodedIv);
  const ciphertext = decodeBase64Url(encodedCiphertext);
  const key = await crypto.subtle.importKey(
    "raw", decodeBase64Url(encodedKey), "AES-GCM", false, ["decrypt"]
  );
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
  const invitation = version === "1" ? { recipient: decoded } : JSON.parse(decoded);
  if (!isValidName(invitation.recipient) || (version === "2" && !isValidName(invitation.addressee))) {
    throw new Error("Invalid invitation names");
  }
  return invitation;
}

function isValidName(name) {
  return typeof name === "string" && name.trim().length > 0 && name.length <= 100;
}

function addSparks() {
  const colors = ["#b08445", "#b04a4d", "#537d64"];
  for (let index = 0; index < 16; index += 1) {
    const spark = document.createElement("span");
    const angle = (index / 16) * Math.PI * 2;
    const distance = 78 + (index % 4) * 19;
    spark.className = "spark";
    spark.textContent = index % 2 ? "✦" : "✧";
    spark.style.setProperty("--spark-x", Math.round(Math.cos(angle) * distance) + "px");
    spark.style.setProperty("--spark-y", Math.round(Math.sin(angle) * distance) + "px");
    spark.style.setProperty("--spark-color", colors[index % colors.length]);
    spark.style.setProperty("--spark-size", (11 + (index % 4) * 3) + "px");
    spark.style.setProperty("--spark-delay", (420 + (index % 4) * 38) + "ms");
    sparks.append(spark);
  }
}

function updateSound() {
  sound.textContent = song.paused ? "Включить музыку" : "Выключить музыку";
}

async function playSong() {
  try {
    await song.play();
    sound.hidden = false;
    updateSound();
  } catch (error) {
    if (error.name === "NotAllowedError") {
      sound.hidden = false;
      updateSound();
    }
  }
}

song.volume = 0.35;
song.addEventListener("play", updateSound);
song.addEventListener("pause", updateSound);
sound.addEventListener("click", () => {
  if (song.paused) {
    void playSong();
  } else {
    song.pause();
  }
});

async function prepareEnvelope() {
  reveal.disabled = true;
  const fragment = window.location.hash;
  let invitation;
  try {
    invitation = fragment === "" || fragment === "#demo" ? sampleInvitation : await readInvitation(fragment);
  } catch {
    intro.textContent = "Похоже, приглашение не открывается.";
    note.textContent = "Проверь, что скопировал ссылку целиком, или попроси её у организатора.";
    return;
  }

  if (invitation.addressee) {
    addressee.textContent = invitation.addressee + ", это твоё приглашение";
    addressee.hidden = false;
  }
  reveal.disabled = false;
  reveal.addEventListener("click", () => {
    void playSong();
    recipient.textContent = invitation.recipient;
    letter.hidden = false;
    addSparks();
    letter.addEventListener("animationend", () => recipient.focus({ preventScroll: true }), { once: true });
    scene.classList.add("open");
    reveal.hidden = true;
    intro.textContent = "Конверт открыт. Теперь можно готовить подарок!";
  }, { once: true });
}

void prepareEnvelope();

window.addEventListener("hashchange", () => window.location.reload());
