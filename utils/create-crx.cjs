/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs');
const path = require('path');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const crx3 = require('crx3');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const packageJson = require('../package.json');
const { name, version } = packageJson;

const rootDir = path.resolve('./');

const folderPath = path.resolve('releases');
const distDir = path.resolve('dist');
const isFolderExists = fs.existsSync(folderPath);

if (!isFolderExists) {
  fs.mkdirSync(folderPath);
  console.log('succeeded outputfile !!!');
}

crx3([`${distDir}/manifest.json`], {
  keyPath: `${distDir}.pem`,
  crxPath: `${folderPath}/${name}_v${version}.crx`,
  zipPath: `${folderPath}/${name}_v${version}.zip`,
})
  .then(() =>
    console.log(
      '\x1b[32m',
      `--------- ---------succeeded ${folderPath}/${name}_v${version}.zip --------- ---------`,
      '\n',
      `--------- ---------succeeded ${folderPath}/${name}_v${version}.crx --------- ---------`,
    ),
  )
  .catch(console.error);
