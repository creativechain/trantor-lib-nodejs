# Trantor-lib

##### Installation

```
npm install https://github.com/EntropyFactory/creativechain-media.git
```

##### IMPORTANT
You need to have creativechain core running to use this library.
You can download the binaries for your platform from [here](https://binaries.creativechain.net/)


##### Usage
###### command-line
  * `node ./lib/trantor-lib.js <command> [args]`

  * Commands
    * `explore`: explore creativechain blockchain and indexes transactions and content.
    * `getdatafromref <txid>`: returns data from transaction
    * `listunspent <address>`: returns list of unspent transactions

###### from node
  * Require **trantor** into your project.
  ```js
    const trantor = require('./lib/trantor-lib.js');
  ```
  * Methods
      * `trantor.explore()`: explore creativechain blockchain and indexes transactions and content.
      * `trantor.getdatafromref(txid, cback)`: returns data from transaction
      * `trantor.listunspent(addr, cback)`: returns list of unspent transactions
      * `trantor.findWord(word, page, cback)`: returns list of unspent transactions
      * `trantor.smartdeal(datos)`: not tested
      * `trantor.creadeal(data, datos, cb)`: not tested
      * `trantor.findaddr(addr)`: finds entries for address in db
      * `trantor.getcontracts(type, ref, cback)`: gets contracts for type and reference
      * `trantor.findOp(find, cb)`: not tested
      * `trantor.spend(addr, redeem, amount, sendto, cback)`: not tested
      * `trantor.pushTx(rawtx, cb)`: pushes rawtx to creativechain blockchain

###### Authors
Vicent Nos Ripolles, Manolo Edge
