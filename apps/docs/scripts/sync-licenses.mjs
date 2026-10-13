import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildThirdPartyLicenses, renderThirdPartyNotices } from "../lib/third-party-licenses.ts";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const data = buildThirdPartyLicenses(appDir);

writeFileSync(resolve(appDir, "lib/licenses.generated.json"), `${JSON.stringify(data, null, 2)}\n`);
writeFileSync(resolve(appDir, "../../THIRD_PARTY_NOTICES.md"), renderThirdPartyNotices(data));

console.log(
  `sync-licenses: ${data.packageCount} packages in ${data.groups.length} license groups, ${data.texts.length} distinct license texts.`,
);
