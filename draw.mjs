import { createCipheriv, createDecipheriv, randomBytes, randomInt } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const participantsFile = new URL("./participants.local.txt", import.meta.url);
const resultsFile = new URL("./invitations.local.txt", import.meta.url);

function assignRecipients(names) {
  const recipients = [...names];
  do {
    for (let index = recipients.length - 1; index > 0; index -= 1) {
      const swap = randomInt(index + 1);
      [recipients[index], recipients[swap]] = [recipients[swap], recipients[index]];
    }
  } while (recipients.some((name, index) => name === names[index]));
  return recipients;
}

function createInvitation(page, addressee, recipient) {
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const payload = JSON.stringify({ addressee, recipient });
  const ciphertext = Buffer.concat([cipher.update(payload, "utf8"), cipher.final(), cipher.getAuthTag()]);
  const invitation = new URL(page);
  invitation.hash = "santa=2." + [key, iv, ciphertext].map((bytes) => bytes.toString("base64url")).join(".");
  return invitation.href;
}

function readInvitationRecord(record, index) {
  try {
    const lines = record.split("\n");
    if (lines.length !== 2) throw new Error("Invalid invitation record");
    const [addressee, link] = lines;
    const match = /^#santa=([12])\.([\w-]+)\.([\w-]+)\.([\w-]+)$/.exec(new URL(link).hash);
    if (!match) throw new Error("Invalid invitation format");

    const [, version, ...encoded] = match;
    const [key, iv, ciphertext] = encoded.map((part) => Buffer.from(part, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(ciphertext.subarray(-16));
    const payload = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]).toString("utf8");
    const invitation = version === "1" ? { addressee, recipient: payload } : JSON.parse(payload);
    if (invitation.addressee !== addressee) throw new Error("The name and the link do not match");
    return invitation;
  } catch {
    throw new Error("Приглашение №" + (index + 1) + " повреждено или ссылка не соответствует имени над ней.");
  }
}

function verifyInvitations(contents, names) {
  const assignments = contents.trim().replace(/\r\n/g, "\n").split("\n\n").map(readInvitationRecord);
  const givers = new Set(assignments.map(({ addressee }) => addressee));
  const recipients = new Set(assignments.map(({ recipient }) => recipient));

  if (assignments.length !== names.length || names.some((name) => !givers.has(name))) {
    throw new Error("Имена отправителей в файле приглашений не совпадают со списком участников.");
  }
  if (names.some((name) => !recipients.has(name))) {
    throw new Error("Не у каждого участника есть ровно один даритель.");
  }
  if (assignments.some(({ addressee, recipient }) => addressee === recipient)) {
    throw new Error("Как минимум один участник дарит подарок самому себе.");
  }

  return assignments;
}

async function readParticipants() {
  const list = await readFile(participantsFile, "utf8");
  const names = list.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
  if (names.length < 2) throw new Error("Для жеребьёвки нужны хотя бы два участника.");
  if (names.some((name) => name.length > 100)) throw new Error("Имя должно быть не длиннее 100 символов.");
  const distinctNames = new Set(names.map((name) => name.normalize("NFC").toLocaleLowerCase("ru")));
  if (distinctNames.size !== names.length) {
    throw new Error("У участников должны быть разные подписи. Например, «Саша (старший)» и «Саша (младший)».");
  }
  return names;
}

function printVerification(count) {
  console.log("Проверено приглашений: " + count + ". Каждый дарит и получает ровно один подарок. Никто не дарит себе.");
}

async function main() {
  const [pageArgument, ...options] = process.argv.slice(2);
  const verify = pageArgument === "--verify";
  const showPairs = verify && options[0] === "--show-pairs";
  if (options.length > (showPairs ? 1 : 0)) {
    throw new Error("Укажи адрес страницы или запусти node draw.mjs --verify [--show-pairs].");
  }

  const names = await readParticipants();
  if (verify) {
    const contents = await readFile(resultsFile, "utf8");
    const assignments = verifyInvitations(contents, names);
    printVerification(assignments.length);
    if (showPairs) {
      for (const { addressee, recipient } of assignments) {
        console.log(addressee + " → " + recipient);
      }
    }
    return;
  }

  const page = pageArgument ? new URL(pageArgument) : new URL("./index.html", import.meta.url);
  if (page.protocol !== "https:" && page.protocol !== "file:") {
    throw new Error("Укажи HTTPS-адрес опубликованной страницы или используй запуск без адреса для локальной проверки.");
  }
  if (page.hash) throw new Error("Укажи адрес страницы без фрагмента после #.");

  const recipients = assignRecipients(names);
  const invitations = names.map((name, index) => name + "\n" + createInvitation(page, name, recipients[index]));
  const contents = invitations.join("\n\n") + "\n";
  verifyInvitations(contents, names);
  await writeFile(resultsFile, contents, { encoding: "utf8", flag: "wx" });
  printVerification(names.length);
  console.log("Ссылки записаны в invitations.local.txt.");
}

main().catch((error) => {
  if (error.code === "EEXIST") {
    console.error("invitations.local.txt уже существует. Перемести его в другое место перед новой жеребьёвкой.");
  } else if (error.code === "ENOENT") {
    const message = error.path?.endsWith("invitations.local.txt")
      ? "Приглашений пока нет. Проведи жеребьёвку после утверждения списка."
      : "Создай participants.local.txt рядом с draw.mjs и запиши по одному имени на строку в UTF-8.";
    console.error(message);
  } else {
    console.error(error.message);
  }
  process.exitCode = 1;
});
