/* Executa a bateria de testes no Node: node tests/run.js */
const suite = require('./suite.js');
const res = suite.run();
let group = '';
for (const r of res) {
  if (r.group !== group) { group = r.group; console.log(`\n${group}`); }
  console.log(`  ${r.ok ? '✅' : '❌'} ${r.name}${r.ok ? '' : '\n     → ' + r.error}`);
}
const fail = res.filter(r => !r.ok).length;
console.log(`\n${res.length - fail}/${res.length} testes passaram.`);
process.exit(fail ? 1 : 0);
