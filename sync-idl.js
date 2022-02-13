const fs = require("fs");

fs.writeFileSync(
  "./app/idl.json",
  fs.readFileSync("./target/idl/dexloan_listings.json")
);

fs.writeFileSync(
  "./app/dexloan.ts",
  fs.readFileSync("./target/types/dexloan_listings.ts")
);
