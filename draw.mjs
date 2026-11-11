import { createCipheriv, randomBytes, randomInt } from "node:crypto";
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

async function main() {
  const [pageArgument, ...extra] = process.argv.slice(2);
  if (extra.length) throw new Error("Укажи только адрес страницы.");

  const page = pageArgument ? new URL(pageArgument) : new URL("./index.html", import.meta.url);
  if (page.protocol !== "https:" && page.protocol !== "file:") {
    throw new Error("Укажи HTTPS-адрес опубликованной страницы или используй запуск без адреса для локальной проверки.");
  }
  if (page.hash) throw new Error("Укажи адрес страницы без фрагмента после #.");

  const list = await readFile(participantsFile, "utf8");
  const names = list.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
  if (names.length < 2) throw new Error("Для жеребьёвки нужны хотя бы два участника.");
  if (names.some((name) => name.length > 100)) throw new Error("Имя должно быть не длиннее 100 символов.");
  const distinctNames = new Set(names.map((name) => name.normalize("NFC").toLocaleLowerCase("ru")));
  if (distinctNames.size !== names.length) {
    throw new Error("У участников должны быть разные подписи. Например, «Саша (старший)» и «Саша (младший)».");
  }

  const recipients = assignRecipients(names);
  const invitations = names.map((name, index) => name + "\n" + createInvitation(page, name, recipients[index]));
  await writeFile(resultsFile, invitations.join("\n\n") + "\n", { encoding: "utf8", flag: "wx" });
  console.log("Готово! Ссылки для " + names.length + " участников записаны в invitations.local.txt.");
}

main().catch((error) => {
  if (error.code === "EEXIST") {
    console.error("invitations.local.txt уже существует. Перемести его в другое место перед новой жеребьёвкой.");
  } else if (error.code === "ENOENT") {
    console.error("Создай participants.local.txt рядом с draw.mjs и запиши по одному имени на строку в UTF-8.");
  } else {
    console.error(error.message);
  }
  process.exitCode = 1;
});
