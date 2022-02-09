const fs = require("fs");

fs.writeFileSync(
  "./app/idl.json",
  fs.readFileSync("./target/idl/dexloan.json")
);

fs.writeFileSync(
  "./app/dexloan.ts",
  fs.readFileSync("./target/types/dexloan.ts")
);
